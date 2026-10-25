import { FormEvent, useMemo, useState } from 'react';
import { api, ApiError, BookingResult, Slot } from './api';
import { downloadIcs, formatDay, groupByDate, isUpcoming } from './lib';
import { useAutoRefresh } from './useAutoRefresh';

export default function BookPage() {
  const { data, error, loading, reload } = useAutoRefresh(api.listSlots);
  const [openId, setOpenId] = useState<string | null>(null);
  const [done, setDone] = useState<BookingResult | null>(null);
  const upcoming = useMemo(() => (data ?? []).filter((s) => isUpcoming(s) && !s.isUnavailable), [data]);
  const groups = useMemo(() => groupByDate(upcoming), [upcoming]);
  const free = upcoming.filter((s) => !s.isBooked).length;

  return (
    <>
      <h1>Pick a time</h1>
      <p className="muted">{loading ? ' ' : free > 0 ? `${free} open ${free === 1 ? 'slot' : 'slots'}` : 'Nothing open right now'}</p>

      {done && (
        <div className="notice" role="status">
          <p>{done.confirmationMessage}</p>
          {done.calendarInviteSent && <p className="muted">A calendar invite is on its way to your email.</p>}
          <div className="row">
            <button className="ghost" onClick={() => downloadIcs(done.slot)}>Add to calendar</button>
            <button className="ghost" onClick={() => setDone(null)}>Dismiss</button>
          </div>
        </div>
      )}
      {error && data && <p className="muted" role="alert">Can’t reach the server. Retrying…</p>}
      {error && !data && <p className="error" role="alert">{error.message}</p>}

      {loading && <div className="skeleton" aria-hidden />}
      {!loading && data && upcoming.length === 0 && <p className="empty">No slots have been published yet.</p>}

      {groups.map(([date, slots]) => (
        <section key={date} className="day">
          <h2>{formatDay(date)}</h2>
          <ul>
            {slots.map((slot) => (
              <Row
                key={slot.id}
                slot={slot}
                open={openId === slot.id}
                onToggle={() => setOpenId(openId === slot.id ? null : slot.id)}
                onBooked={(r) => {
                  setDone(r);
                  setOpenId(null);
                  reload();
                }}
                onConflict={() => {
                  setOpenId(null);
                  reload();
                }}
              />
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function Row({
  slot,
  open,
  onToggle,
  onBooked,
  onConflict,
}: {
  slot: Slot;
  open: boolean;
  onToggle: () => void;
  onBooked: (r: BookingResult) => void;
  onConflict: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      onBooked(await api.bookSlot(slot.id, { name, email }));
    } catch (err) {
      setError((err as Error).message);
      if (err instanceof ApiError && err.status === 409) setTimeout(onConflict, 1800);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={slot.isBooked ? 'slot taken' : 'slot'}>
      <div className="row between">
        <span>
          <span className="time">{slot.startTime}–{slot.endTime}</span>
          <span className="muted"> · {slot.durationMinutes} min</span>
        </span>
        {slot.isBooked ? (
          <span className="muted">Booked</span>
        ) : (
          <button className="ghost" onClick={onToggle} aria-expanded={open}>
            {open ? 'Close' : 'Book'}
          </button>
        )}
      </div>

      {open && !slot.isBooked && (
        <form onSubmit={submit} className="stack">
          <input aria-label="Your name" placeholder="Name" required maxLength={100} autoFocus autoComplete="name"
            value={name} onChange={(e) => setName(e.target.value)} />
          <input aria-label="Your email" type="email" placeholder="Email" required autoComplete="email"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <button type="submit" disabled={busy}>{busy ? 'Booking…' : 'Confirm'}</button>
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}
    </li>
  );
}
