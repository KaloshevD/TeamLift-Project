import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { OAuth2Client } from 'google-auth-library';
import { Repository } from 'typeorm';
import { GoogleAuth } from './google-auth.entity';

// freebusy: see *when* the host is busy (never titles or details).
// events:   create the booking on the host's calendar (and invite the booker).
const FREEBUSY_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';
const EVENTS_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const CACHE_MS = 60_000;
const MAX_RANGE_DAYS = 90;

/** A busy period as "wall-clock minutes" in the app's time zone (see toWall). */
export interface BusyWindow {
  start: number;
  end: number;
}

@Injectable()
export class GoogleCalendarService {
  private readonly log = new Logger(GoogleCalendarService.name);
  private readonly tz = process.env.APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
  private cred: GoogleAuth | null | undefined; // undefined = not loaded yet
  private cache: { key: string; at: number; windows: BusyWindow[] } | null = null;
  private readonly states = new Map<string, number>(); // OAuth CSRF state -> expiry

  constructor(@InjectRepository(GoogleAuth) private readonly repo: Repository<GoogleAuth>) {}

  get configured(): boolean {
    return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  }

  async isConnected(): Promise<boolean> {
    if (!this.configured) return false;
    if (this.cred === undefined) this.cred = await this.repo.findOneBy({ id: 'host' });
    return this.cred !== null;
  }

  // ---------- OAuth ----------

  private oauth() {
    return new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI ?? 'http://localhost:3000/api/google/callback',
    );
  }

  authUrl(): string {
    const now = Date.now();
    for (const [s, exp] of this.states) if (exp < now) this.states.delete(s);
    const state = randomUUID();
    this.states.set(state, now + 10 * 60_000);
    return this.oauth().generateAuthUrl({
      access_type: 'offline', // we need a refresh token
      prompt: 'consent', // ...and Google only returns one on a consent screen
      scope: [FREEBUSY_SCOPE, EVENTS_SCOPE],
      state,
    });
  }

  async handleCallback(code: string, state: string | undefined) {
    const exp = state ? this.states.get(state) : undefined;
    if (!state || !exp || exp < Date.now()) throw new BadRequestException('Invalid or expired OAuth state');
    this.states.delete(state);

    const { tokens } = await this.oauth().getToken(code);
    if (!tokens.refresh_token) throw new BadRequestException('Google did not return a refresh token');
    this.cred = await this.repo.save({ id: 'host', refreshToken: tokens.refresh_token, scope: tokens.scope ?? null } as GoogleAuth);
    this.cache = null;
  }

  async disconnect() {
    const cred = this.cred ?? (await this.repo.findOneBy({ id: 'host' }));
    if (cred) await this.oauth().revokeToken(cred.refreshToken).catch(() => undefined); // best effort
    await this.repo.delete({ id: 'host' });
    this.cred = null;
    this.cache = null;
  }

  private async accessToken(): Promise<string> {
    const client = this.oauth();
    client.setCredentials({ refresh_token: this.cred!.refreshToken });
    const { token } = await client.getAccessToken();
    if (!token) throw new Error('No access token');
    return token;
  }

  // ---------- Create events ----------

  /** True if the connected account granted permission to create events. */
  async canCreateEvents(): Promise<boolean> {
    if (!(await this.isConnected())) return false;
    const granted = (this.cred?.scope ?? '').split(' ');
    return granted.includes(EVENTS_SCOPE) || granted.includes('https://www.googleapis.com/auth/calendar');
  }

  /** Network call to Google. Kept separate so it's easy to stub in tests. */
  protected async postEvent(event: object): Promise<void> {
    const token = await this.accessToken();
    // sendUpdates=all makes Google email the attendee an invite, which lands on their calendar
    const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`events.insert responded ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }

  /**
   * Adds the booking to the host's calendar and invites the booker.
   * Returns whether it worked. Never throws: the booking itself already succeeded.
   */
  async createEvent(b: { name: string; email: string; date: string; startTime: string; endTime: string }): Promise<boolean> {
    try {
      if (!(await this.canCreateEvents())) return false;
      await this.postEvent({
        summary: `Meeting with ${b.name}`,
        start: { dateTime: `${b.date}T${b.startTime}:00`, timeZone: this.tz },
        end: { dateTime: `${b.date}T${b.endTime}:00`, timeZone: this.tz },
        attendees: [{ email: b.email, displayName: b.name }],
      });
      this.cache = null; // our own event now makes this time busy
      return true;
    } catch (err) {
      this.log.warn(`Could not create calendar event: ${(err as Error).message}`);
      return false;
    }
  }

  // ---------- Free / busy ----------

  /** Network call to Google. Kept separate so it's easy to stub in tests. */
  protected async fetchBusy(timeMin: string, timeMax: string): Promise<{ start: string; end: string }[]> {
    const token = await this.accessToken();

    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin, timeMax, timeZone: this.tz, items: [{ id: 'primary' }] }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`freeBusy responded ${res.status}`);
    const data: any = await res.json();
    const cal = data?.calendars?.primary;
    if (cal?.errors?.length) throw new Error(`freeBusy error: ${cal.errors[0].reason}`);
    return cal?.busy ?? [];
  }

  /**
   * Busy windows covering the upcoming dates of the given slots (max ~90 days ahead),
   * or null if no calendar is connected / Google is unreachable. Callers treat null as
   * "no information" so a Google outage never takes booking down.
   */
  async windowsFor(slots: { date: string }[], fresh = false): Promise<BusyWindow[] | null> {
    if (!(await this.isConnected())) return null;

    const today = new Intl.DateTimeFormat('en-CA', { timeZone: this.tz }).format(new Date());
    const limit = new Date(Date.parse(`${today}T00:00:00Z`) + MAX_RANGE_DAYS * 86_400_000).toISOString().slice(0, 10);
    const dates = slots.map((s) => s.date).filter((d) => d >= today && d <= limit).sort();
    if (dates.length === 0) return [];

    // Pad by a day each side; exact matching happens below in wall-clock space.
    const timeMin = new Date(Date.parse(`${dates[0]}T00:00:00Z`) - 86_400_000).toISOString();
    const timeMax = new Date(Date.parse(`${dates[dates.length - 1]}T00:00:00Z`) + 2 * 86_400_000).toISOString();
    const key = `${timeMin}|${timeMax}`;

    if (!fresh && this.cache?.key === key && Date.now() - this.cache.at < CACHE_MS) return this.cache.windows;

    try {
      const busy = await this.fetchBusy(timeMin, timeMax);
      const windows = busy.map((b) => ({ start: this.toWall(b.start), end: this.toWall(b.end) }));
      this.cache = { key, at: Date.now(), windows };
      return windows;
    } catch (err) {
      const msg = (err as Error).message;
      this.log.warn(`Calendar lookup failed, treating all slots as free: ${msg}`);
      if (/invalid_grant/.test(msg)) {
        // Access was revoked in the Google account: forget the dead credential.
        await this.repo.delete({ id: 'host' });
        this.cred = null;
      }
      return null;
    }
  }

  /**
   * Both busy periods and slots are mapped to "wall-clock minutes" (the local date/time
   * in APP_TIMEZONE read as if it were UTC). That makes overlap a plain number comparison
   * without needing a local-time -> instant conversion.
   */
  private toWall(iso: string): number {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: this.tz,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(new Date(iso));
    const n = (t: string) => Number(parts.find((p) => p.type === t)!.value);
    return Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second')) / 60_000;
  }
}

export function clashes(
  windows: BusyWindow[] | null,
  slot: { date: string; startTime: string; durationMinutes: number },
): boolean {
  if (!windows?.length) return false;
  const [y, m, d] = slot.date.split('-').map(Number);
  const [h, min] = slot.startTime.split(':').map(Number);
  const start = Date.UTC(y, m - 1, d, h, min) / 60_000;
  const end = start + slot.durationMinutes;
  return windows.some((w) => start < w.end && w.start < end);
}
