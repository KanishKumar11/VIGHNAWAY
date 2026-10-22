'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * The product as one looping picture (10 s), on a small city: traffic moves on the streets, a car
 * drives its route, a flood appears ahead (a callout says so), the road beyond it turns to a blocked
 * line, a new route draws around it (a second callout says Recommended) and the car carries on to
 * arrive. Solid colours only. Everything that tells the story shares one 10 s clock, so the loop never
 * drifts apart. With reduced motion it shows the finished picture still. It is a simulation and says so.
 */

const DUR = '10s';
const W = 560;
const H = 340;

// Planned route (blocked beyond the hazard) and the detour around it.
const A_HEAD = 'M40 270 H150 L230 190';
const A_TAIL = 'M230 190 H460 L520 110';
const A_FULL = 'M40 270 H150 L230 190 H460 L520 110';
const B_DETOUR = 'M230 190 L282 128 H460 L520 110';
const START = { x: 40, y: 270 };
const END = { x: 520, y: 110 };
const HAZARD = { x: 350, y: 190 };

const STREETS_H = [60, 130, 190, 270];
const STREETS_V = [70, 170, 270, 370, 470];
// City blocks between the streets (x, y, w, h).
const BLOCKS: [number, number, number, number][] = [
  [84, 74, 74, 44],
  [184, 74, 74, 44],
  [284, 74, 74, 44],
  [384, 74, 74, 44],
  [484, 74, 60, 44],
  [84, 144, 74, 34],
  [184, 144, 74, 34],
  [384, 144, 74, 34],
  [84, 204, 74, 54],
  [184, 204, 74, 54],
  [284, 284, 74, 44],
  [384, 204, 74, 54],
  [484, 204, 60, 54],
  [84, 284, 74, 44],
  [184, 284, 74, 44],
  [384, 284, 74, 44],
];
// Ambient traffic: a dot that travels one street for ever, at its own pace.
const TRAFFIC: { path: string; dur: number; begin: number }[] = [
  { path: 'M0 60 H560', dur: 15, begin: -3 },
  { path: 'M560 130 H0', dur: 19, begin: -9 },
  { path: 'M70 0 V340', dur: 17, begin: -5 },
  { path: 'M470 340 V0', dur: 21, begin: -12 },
  { path: 'M0 270 H40', dur: 5, begin: -1 },
  { path: 'M270 0 V340', dur: 23, begin: -16 },
];

/** One value over the shared clock: `values` at `keyTimes`, looping with everything else. */
function Over({ attr, values, keyTimes }: { attr: string; values: string; keyTimes: string }) {
  return (
    <animate
      attributeName={attr}
      values={values}
      keyTimes={keyTimes}
      dur={DUR}
      repeatCount="indefinite"
      calcMode="linear"
    />
  );
}

function Car({
  path,
  keyPoints,
  keyTimes,
  fade,
}: {
  path: string;
  keyPoints: string;
  keyTimes: string;
  fade: { values: string; keyTimes: string };
}) {
  return (
    <g>
      <Over attr="opacity" values={fade.values} keyTimes={fade.keyTimes} />
      <animateMotion
        dur={DUR}
        repeatCount="indefinite"
        path={path}
        keyPoints={keyPoints}
        keyTimes={keyTimes}
        calcMode="linear"
      />
      <circle r={16} className="fill-chrome-accent" opacity={0.2} />
      <circle r={8.5} className="fill-chrome-ink stroke-chrome-accent" strokeWidth={4} />
    </g>
  );
}

/** A white callout that rises into the picture and leaves again. */
function Callout({
  x,
  y,
  width,
  title,
  sub,
  dot,
  still,
  clock,
}: {
  x: number;
  y: number;
  width: number;
  title: string;
  sub: string;
  dot: ReactNode;
  still: boolean;
  clock: { opacity: [string, string]; lift: string };
}) {
  return (
    <g transform={`translate(${x} ${y})`}>
      <g opacity={still ? 1 : 0}>
        {still ? null : (
          <>
            <Over attr="opacity" values={clock.opacity[0]} keyTimes={clock.opacity[1]} />
            <animateTransform
              attributeName="transform"
              type="translate"
              values={clock.lift}
              keyTimes={clock.opacity[1]}
              dur={DUR}
              repeatCount="indefinite"
              calcMode="linear"
            />
          </>
        )}
        <rect
          x={0}
          y={5}
          width={width}
          height={50}
          rx={15}
          className="fill-chrome-bg"
          opacity={0.45}
        />
        <rect x={0} y={0} width={width} height={50} rx={15} className="fill-chrome-ink" />
        {dot}
        <text x={42} y={22} className="fill-chrome-bg" fontSize={14} fontWeight={800}>
          {title}
        </text>
        <text
          x={42}
          y={39}
          className="fill-chrome-bg"
          fontSize={11.5}
          fontWeight={600}
          opacity={0.62}
        >
          {sub}
        </text>
      </g>
    </g>
  );
}

export function LiveRoute({ className }: { className?: string }) {
  // Reduced motion shows the finished picture instead of the loop.
  const [still, setStill] = useState(false);
  useEffect(() => {
    const q = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!q) return;
    const sync = () => setStill(q.matches);
    sync();
    q.addEventListener('change', sync);
    return () => q.removeEventListener('change', sync);
  }, []);

  return (
    <figure className={cn('relative m-0 w-full', className)} aria-hidden>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-full w-full overflow-visible"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* The city: blocks, a river, streets. */}
        {BLOCKS.map(([x, y, w, h]) => (
          <rect
            key={`${x}-${y}`}
            x={x}
            y={y}
            width={w}
            height={h}
            rx={9}
            className="fill-chrome-fill"
          />
        ))}
        <path
          d="M0 312 C110 296 190 336 320 318 S510 290 560 304"
          className="stroke-chrome-fill-strong"
          strokeWidth={24}
        />
        {STREETS_H.map((y) => (
          <line
            key={`h${y}`}
            x1={0}
            x2={W}
            y1={y}
            y2={y}
            className="stroke-chrome-line"
            strokeWidth={1.5}
          />
        ))}
        {STREETS_V.map((x) => (
          <line
            key={`v${x}`}
            x1={x}
            x2={x}
            y1={0}
            y2={H}
            className="stroke-chrome-line"
            strokeWidth={1.5}
          />
        ))}
        <path d={A_FULL} className="stroke-chrome-fill-strong" strokeWidth={17} />
        <path d={B_DETOUR} className="stroke-chrome-fill-strong" strokeWidth={17} />

        {/* Traffic that never stops. */}
        {still
          ? null
          : TRAFFIC.map((tr) => (
              <circle key={tr.path} r={3.2} className="fill-chrome-ink" opacity={0.55}>
                <animateMotion
                  dur={`${tr.dur}s`}
                  begin={`${tr.begin}s`}
                  repeatCount="indefinite"
                  path={tr.path}
                />
              </circle>
            ))}

        {/* Planned route: the shared start, then the road ahead of the hazard. */}
        <path d={A_HEAD} className="stroke-chrome-accent" strokeWidth={7} />
        <path d={A_TAIL} className="stroke-chrome-accent" strokeWidth={7} opacity={still ? 0 : 1}>
          {still ? null : <Over attr="opacity" values="1;1;0;0;1" keyTimes="0;0.2;0.27;0.94;1" />}
        </path>
        {/* The same road once it is blocked. */}
        <path
          d={A_TAIL}
          className="stroke-[var(--vw-art-danger)]"
          strokeWidth={5.5}
          strokeDasharray="2 11"
          opacity={still ? 0.95 : 0}
        >
          {still ? null : (
            <Over attr="opacity" values="0;0;0.95;0.95;0" keyTimes="0;0.2;0.27;0.9;0.97" />
          )}
        </path>
        {/* The new route draws itself around the hazard. */}
        <path
          d={B_DETOUR}
          className="stroke-chrome-accent"
          strokeWidth={7}
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={still ? 0 : 1}
        >
          {still ? null : (
            <>
              <Over attr="stroke-dashoffset" values="1;1;0;0;0" keyTimes="0;0.34;0.47;0.94;1" />
              <Over attr="opacity" values="0;1;1;1;0;0" keyTimes="0;0.34;0.4;0.92;0.97;1" />
            </>
          )}
        </path>

        {/* The hazard: a steady dashed zone, two ripples and a badge. */}
        <g opacity={still ? 1 : 0}>
          {still ? null : (
            <Over attr="opacity" values="0;0;1;1;0;0" keyTimes="0;0.14;0.2;0.9;0.96;1" />
          )}
          <circle
            cx={HAZARD.x}
            cy={HAZARD.y}
            r={40}
            className="fill-[var(--vw-art-danger)] stroke-[var(--vw-art-danger)]"
            fillOpacity={0.14}
            strokeWidth={1.6}
            strokeDasharray="4 7"
          />
          {still
            ? null
            : [0, 1.2].map((begin) => (
                <circle
                  key={begin}
                  cx={HAZARD.x}
                  cy={HAZARD.y}
                  r={12}
                  className="stroke-[var(--vw-art-danger)]"
                  strokeWidth={2}
                >
                  <animate
                    attributeName="r"
                    values="12;52"
                    dur="2.4s"
                    begin={`${begin}s`}
                    repeatCount="indefinite"
                  />
                  <animate
                    attributeName="opacity"
                    values="0.7;0"
                    dur="2.4s"
                    begin={`${begin}s`}
                    repeatCount="indefinite"
                  />
                </circle>
              ))}
          <circle
            cx={HAZARD.x}
            cy={HAZARD.y}
            r={14}
            className="fill-chrome-bg stroke-chrome-ink"
            strokeWidth={2.75}
          />
          <path
            d={`M${HAZARD.x} ${HAZARD.y - 6}v6.5`}
            className="stroke-chrome-ink"
            strokeWidth={2.75}
          />
          <circle
            cx={HAZARD.x}
            cy={HAZARD.y + 6}
            r={1.4}
            className="fill-chrome-ink stroke-chrome-ink"
            strokeWidth={1}
          />
        </g>

        {/* Start and destination. */}
        <circle
          cx={START.x}
          cy={START.y}
          r={10}
          className="fill-chrome-bg stroke-chrome-accent"
          strokeWidth={4.5}
        />
        <circle
          cx={END.x}
          cy={END.y}
          r={6}
          className="stroke-chrome-accent"
          strokeWidth={2.2}
          opacity={0}
        >
          {still ? null : (
            <>
              <Over attr="r" values="6;6;30;30" keyTimes="0;0.8;0.93;1" />
              <Over attr="opacity" values="0;0.85;0;0" keyTimes="0;0.8;0.93;1" />
            </>
          )}
        </circle>
        <rect
          x={END.x - 10}
          y={END.y - 10}
          width={20}
          height={20}
          rx={6}
          className="fill-chrome-accent"
        />

        {/* The car: first along the planned road, then along the new one. */}
        {still ? null : (
          <>
            <Car
              path={A_HEAD}
              keyPoints="0;0;1;1"
              keyTimes="0;0.04;0.34;1"
              fade={{ values: '1;1;0;0;1', keyTimes: '0;0.46;0.48;0.99;1' }}
            />
            <Car
              path={B_DETOUR}
              keyPoints="0;0;1;1"
              keyTimes="0;0.48;0.82;1"
              fade={{ values: '0;0;1;1;0;0', keyTimes: '0;0.47;0.49;0.84;0.88;1' }}
            />
          </>
        )}

        {/* What the room says about it. */}
        <Callout
          x={388}
          y={226}
          width={162}
          title={t.report.types.flood}
          sub={t.queue.groups.unverified}
          still={still}
          clock={{
            opacity: ['0;0;1;1;0;0', '0;0.17;0.23;0.9;0.96;1'],
            lift: '0 12;0 12;0 0;0 0;0 -6;0 -6',
          }}
          dot={
            <>
              <circle
                cx={23}
                cy={25}
                r={11}
                className="fill-[var(--vw-art-danger)]"
                opacity={0.18}
              />
              <circle cx={23} cy={25} r={5.5} className="fill-[var(--vw-art-danger)]" />
            </>
          }
        />
        <Callout
          x={286}
          y={52}
          width={176}
          title={t.route.roles.recommended}
          sub={t.app.simulated}
          still={still}
          clock={{
            opacity: ['0;0;1;1;0;0', '0;0.4;0.47;0.92;0.97;1'],
            lift: '0 12;0 12;0 0;0 0;0 -6;0 -6',
          }}
          dot={
            <>
              <circle cx={23} cy={25} r={11} className="fill-chrome-bg" opacity={0.12} />
              <circle cx={23} cy={25} r={5.5} className="fill-chrome-bg" />
              <path
                d="M20.2 25.2l2.1 2.1 3.9-4.2"
                className="stroke-chrome-accent"
                strokeWidth={1.8}
              />
            </>
          }
        />
      </svg>
      <figcaption className="absolute left-0 top-0 inline-flex items-center gap-2 rounded-full border border-chrome-line bg-chrome-bg px-3 py-1 text-meta font-semibold text-chrome-ink">
        <span aria-hidden className="relative grid size-2 place-items-center">
          <span className="absolute inline-flex size-2 rounded-full bg-chrome-accent opacity-60 motion-safe:animate-ping" />
          <span className="relative inline-flex size-2 rounded-full bg-chrome-accent" />
        </span>
        {t.app.simulated}
      </figcaption>
    </figure>
  );
}
