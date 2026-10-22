import { decodeRelay, type RelayPayload } from '@vighnaway/contracts';
import jsQR from 'jsqr';

/** A camera frame as the browser hands it over (ImageData has the same shape). */
export interface Frame {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** The text of the first QR code in a frame, or null. Only upright dark-on-light codes: the phone draws exactly that. */
export function readQr(frame: Frame): string | null {
  return jsQR(frame.data, frame.width, frame.height, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

export type RelayCheck =
  | { ok: true; payload: RelayPayload }
  | { ok: false; reason: 'not_vighnaway' | 'too_long' | 'bad_json' | 'bad_payload' | 'other_scenario' };

/**
 * Checks scanned (or pasted) text before anything is sent: it must be a VIGHNAWAY relay code and it must
 * belong to the scenario the console shows, because a report is only ever relayed into the scenario it was made in.
 */
export function checkRelay(text: string, scenarioId: string): RelayCheck {
  const decoded = decodeRelay(text.trim());
  if (!decoded.ok) return decoded;
  if (decoded.payload.s !== scenarioId) return { ok: false, reason: 'other_scenario' };
  return decoded;
}
