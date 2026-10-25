import { FormEvent, useMemo, useState } from 'react';
import { api } from './api';
import { formatDay, groupByDate, isUpcoming, todayLocal } from './lib';
import { useAutoRefresh } from './useAutoRefresh';

const DURATIONS = [15, 30, 45, 60, 90];

export default function HostPage() {
  const { data, error, loading, reload } = useAutoRefresh(api.listSlots);
  const upcoming = useMemo(() => (data ?? []).filter(isUpcoming), [data]);
  const groups = useMemo(() => groupByDate(upcoming), [upcoming]);

  return (
    <>
      <h1>Your slots</h1>
      <p className="muted">Publish times and remove the ones you no longer need.</p>

      <CalendarStatus onChange={reload} />

      <Publish onDone={reload} />

      {error && !data && <p className="error" role="alert">{error.message}</p>}
      {loading && <div className="skeleton" aria-hidden />}
      {!loading && data && upcoming.length === 0 && <p className="empty">Nothing published yet. Add your first slot above.</p>}

      {groups.map(([date, slots]) => (
        <section key={date} className="day">
          <h2>{formatDay(date)}</h2>
          <ul>
            {slots.map((s) => (
              <li key={s.id} className="slot">
                <div className="row between">
                  <span>
                    <span className="time">{s.startTime}–{s.endTime}</span>
                    <span className="muted"> · {s.durationMinutes} min</span>
                  </span>
                  {s.isBooked ? (
                    <span className="muted">Booked</span>
                  ) : (
                    <span className="row">
                      {s.isUnavailable && <span className="muted">Busy in calendar</span>}
                      <button
                      className="ghost danger"
                      onClick={async () => {
                        if (!window.confirm('Remove this slot?')) return;
                        try {
                          await api.deleteSlot(s.id);
                        } finally {
                          reload();
                        }
                      }}
                    >
                      Remove
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function CalendarStatus({ onChange }: { onChange: () => void }) {
  const { data, reload } = useAutoRefresh(api.googleStatus, 60_000);
  const failed = window.location.hash.includes('calendar=error');
  if (!data) return null;

  if (!data.configured) {
    return <p className="muted calendar">Google Calendar sync is off. See the README to enable it.</p>;
  }
  return (
    <div className="calendar">
      <div className="row between">
        <span className="muted">
          {!data.connected && 'Google Calendar not connected.'}
          {data.connected && data.canCreateEvents && 'Google Calendar connected. Clashing slots are hidden, and bookings are added to your calendar.'}
          {data.connected && !data.canCreateEvents && 'Connected read-only. Reconnect to also add bookings to your calendar.'}
        </span>
        <span className="row">
          {(!data.connected || !data.canCreateEvents) && (
            <a className="linkbtn" href="/api/google/connect">{data.connected ? 'Reconnect' : 'Connect'}</a>
          )}
          {data.connected && (
            <button
              className="ghost"
              onClick={async () => {
                await api.disconnectGoogle();
                reload();
                onChange();
              }}
            >
              Disconnect
            </button>
          )}
        </span>
      </div>
      {failed && !data.connected && <p className="error" role="alert">Couldn’t connect Google Calendar. Please try again.</p>}
    </div>
  );
}

function Publish({ onDone }: { onDone: () => void }) {
  const [date, setDate] = useState(todayLocal());
  const [startTime, setStartTime] = useState('09:00');
  const [durationMinutes, setDuration] = useState(30);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createSlot({ date, startTime, durationMinutes });
      onDone();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="publish">
      <div className="fields">
        <label>Date<input type="date" required min={todayLocal()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <label>Start<input type="time" required value={startTime} onChange={(e) => setStartTime(e.target.value)} /></label>
        <label>Length
          <select value={durationMinutes} onChange={(e) => setDuration(Number(e.target.value))}>
            {DURATIONS.map((d) => <option key={d} value={d}>{d} min</option>)}
          </select>
        </label>
        <button type="submit" disabled={busy}>{busy ? 'Adding…' : 'Add slot'}</button>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
    </form>
  );
}
