import { ImageResponse } from 'next/og';
import { consoleChrome as t } from '@vighnaway/tokens';

export const size = { width: 64, height: 64 };
export const contentType = 'image/png';

/** App icon: the mark (a route bending around an obstacle), in signal lime on the aubergine ink, from tokens. */
export default function Icon() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', background: t.chromeBg, borderRadius: 16 }}>
        <svg viewBox="0 0 32 32" width="64" height="64" fill="none" strokeLinecap="round">
          <circle cx="16" cy="18.5" r="2.6" stroke={t.chromeAccent} strokeOpacity="0.7" strokeWidth="1.6" />
          <path d="M8 25V17a8 8 0 0 1 16 0v8" stroke={t.chromeAccent} strokeWidth="3" />
          <circle cx="8" cy="25" r="2" fill={t.chromeAccent} />
          <circle cx="24" cy="25" r="2" fill={t.chromeAccent} />
        </svg>
      </div>
    ),
    size,
  );
}
