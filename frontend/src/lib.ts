import type { Slot } from './api';

const pad = (n: number) => String(n).padStart(2, '0');

export const todayLocal = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export function formatDay(date: string) {
  const today = todayLocal();
  const [y, m, d] = date.split('-').map(Number);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  const label = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  if (date === today) return `Today · ${label}`;
  if (date === tomorrowStr) return `Tomorrow · ${label}`;
  return label;
}

export function groupByDate<T extends { date: string }>(slots: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  slots.forEach((s) => map.set(s.date, [...(map.get(s.date) ?? []), s]));
  return [...map.entries()];
}

/** Download a single-event .ics file so the booker can add it to any calendar app. */
export function downloadIcs(slot: Slot) {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
  const day = slot.date.replace(/-/g, '');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Slots//EN',
    'BEGIN:VEVENT',
    `UID:${slot.id}@slots`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${day}T${slot.startTime.replace(':', '')}00`, // floating local time (single time zone app)
    `DTEND:${day}T${slot.endTime.replace(':', '')}00`,
    'SUMMARY:Booked time slot',
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'booking.ics';
  a.click();
  URL.revokeObjectURL(url);
}

/** True while the slot hasn't finished yet (local time). */
export function isUpcoming(slot: Slot) {
  const [y, m, d] = slot.date.split('-').map(Number);
  const [h, min] = slot.endTime.split(':').map(Number);
  return new Date(y, m - 1, d, h, min).getTime() > Date.now();
}
