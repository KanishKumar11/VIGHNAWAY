import { encodeRelay, type ReportInput } from '@vighnaway/contracts';
import * as Crypto from 'expo-crypto';
import { create as createQr } from 'qrcode/lib/core/qrcode';
import { useSim } from '@/stores/sim';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** A UUID made on this phone for one report (P2-2), so relaying it twice stores it once. Never evidence. */
export function newClientReportId(): string {
  try {
    const id = Crypto.randomUUID();
    if (UUID.test(id)) return id;
  } catch {
    /* native module unavailable: use the fallback */
  }
  const hex = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${'89ab'[Math.floor(Math.random() * 4)]}${hex(3)}-${hex(12)}`;
}

/**
 * Adds what an offline relay needs: the report's own id and the simulation second the phone last knew
 * (its claim of when this was seen). The server keeps its own received time and ignores neither for ordering.
 */
export function stampReport(input: ReportInput): ReportInput {
  return {
    ...input,
    clientReportId: input.clientReportId ?? newClientReportId(),
    observedAtS: input.observedAtS ?? Math.max(0, Math.floor(useSim.getState().simTimeS)),
  };
}

export interface QrMatrix {
  size: number;
  /** 1 for a dark module, row by row. */
  data: ArrayLike<number>;
}

/** The QR modules for a pending report. Error correction M: scans through a smudged or cracked screen. */
export function relayMatrix(scenarioId: string, report: ReportInput): QrMatrix {
  const qr = createQr(encodeRelay(scenarioId, report), { errorCorrectionLevel: 'M' });
  return { size: qr.modules.size, data: qr.modules.data };
}

/** One SVG path for all dark modules: each run of dark modules in a row is a single rectangle. */
export function qrPath({ size, data }: QrMatrix): string {
  const parts: string[] = [];
  for (let y = 0; y < size; y++) {
    let x = 0;
    while (x < size) {
      if (!data[y * size + x]) {
        x++;
        continue;
      }
      let run = 1;
      while (x + run < size && data[y * size + x + run]) run++;
      parts.push(`M${x} ${y}h${run}v1h-${run}z`);
      x += run;
    }
  }
  return parts.join('');
}
