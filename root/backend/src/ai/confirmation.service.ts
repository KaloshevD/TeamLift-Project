import { Injectable, Logger } from '@nestjs/common';

interface BookingInfo {
  name: string;
  date: string;
  startTime: string;
  endTime: string;
}

const GEMINI_TIMEOUT_MS = 30_000;

function getGeminiErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || !('error' in body)) return undefined;
  const error = body.error;
  if (typeof error !== 'object' || error === null || !('message' in error)) return undefined;
  return typeof error.message === 'string' ? error.message : undefined;
}

/**
 * Generates a short, friendly confirmation message with Gemini (free tier,
 * Google AI Studio). If no key is configured or the call fails, we fall back
 * to a fixed template so booking never fails because of the LLM.
 */
@Injectable()
export class ConfirmationService {
  private readonly logger = new Logger(ConfirmationService.name);

  async generate(b: BookingInfo): Promise<string> {
    const fallback = `Thanks ${b.name}! You're booked for ${b.date} from ${b.startTime} to ${b.endTime}. See you then!`;
    const key = process.env.GEMINI_API_KEY;
    if (!key) return fallback;

    const model = process.env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    // Only pass a short, quote-stripped name so user input can't rewrite the instructions.
    const safeName = b.name.replace(/["\n\r]/g, ' ').slice(0, 50);
    const prompt =
      `Write a short, warm booking confirmation (max 2 sentences, no emojis, plain text) ` +
      `for a person called "${safeName}" who booked a meeting on ${b.date} from ${b.startTime} to ${b.endTime}.`;

    try {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
          signal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        let details: string | undefined;
        try {
          details = getGeminiErrorMessage(await res.json());
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
        }
        const suffix = details ? `: ${details.slice(0, 300)}` : ` ${res.statusText}`;
        throw new Error(`Gemini model "${model}" responded ${res.status}${suffix}`);
      }
      const data: any = await res.json();
      const text: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
      return text || fallback;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Gemini call failed for model "${model}", using template: ${message}`);
      return fallback;
    }
  }
}
