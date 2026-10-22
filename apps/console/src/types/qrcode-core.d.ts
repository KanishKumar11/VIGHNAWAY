/** qrcode's pure core (no canvas, no Node streams): the module matrix only. */
declare module 'qrcode/lib/core/qrcode' {
  interface QrCreated {
    modules: { size: number; data: Uint8Array };
  }
  export function create(text: string, options?: { errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H' }): QrCreated;
}
