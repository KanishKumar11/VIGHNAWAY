import type { Scenario } from '@vighnaway/contracts';
import type { Receipt, ReceiptVerification } from '@vighnaway/engine';
import { decodeReceipt } from '@vighnaway/engine';

/**
 * The parts of decision receipts that need no road graph, so the /verify page can show its form and read a
 * pasted token before the graph (about 10 MB) has downloaded. lib/receipt.ts adds making and re-running them.
 */

/** A receipt token from a bare token, a /verify link or a query string. */
export function tokenFromText(text: string): string {
  const s = text.trim();
  const m = /[?&]r=([A-Za-z0-9_-]+)/.exec(s);
  return m ? m[1]! : s;
}

export type VerifyOutcome =
  | { kind: 'invalid' }
  | { kind: 'unknown_scenario'; receipt: Receipt }
  | { kind: 'checked'; receipt: Receipt; scenario: Scenario; verification: ReceiptVerification; incidentCount: number };

export const parseReceipt = (token: string): Receipt | null => decodeReceipt(tokenFromText(token));
