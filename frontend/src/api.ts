export interface Slot {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  isBooked: boolean;
  /** Clashes with an event in the host's Google Calendar */
  isUnavailable: boolean;
}

export interface BookingResult {
  slot: Slot;
  confirmationMessage: string;
  calendarInviteSent: boolean;
}

export interface GoogleStatus {
  configured: boolean;
  connected: boolean;
  canCreateEvents: boolean;
}

export class ApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json' } });
  } catch {
    throw new ApiError("Can't reach the server", 0);
  }
  if (!res.ok) {
    let message = `Something went wrong (${res.status})`;
    try {
      const body = await res.json();
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message ?? message;
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(message, res.status);
  }
  return res.status === 204 ? (undefined as T) : res.json();
}

export const api = {
  listSlots: () => request<Slot[]>('/slots'),
  createSlot: (body: { date: string; startTime: string; durationMinutes: number }) =>
    request<Slot>('/slots', { method: 'POST', body: JSON.stringify(body) }),
  deleteSlot: (id: string) => request<void>(`/slots/${id}`, { method: 'DELETE' }),
  googleStatus: () => request<GoogleStatus>('/google/status'),
  disconnectGoogle: () => request<void>('/google', { method: 'DELETE' }),
  bookSlot: (id: string, body: { name: string; email: string }) =>
    request<BookingResult>(`/slots/${id}/book`, { method: 'POST', body: JSON.stringify(body) }),
};
