'use client';

import { LottieSvg, type LottieHandle } from 'lottie-react';
import { useRef } from 'react';

export interface LottieInnerProps {
  data: object & { op: number };
  loop: boolean;
  reduced: boolean;
  onComplete?: () => void;
}

/** Browser-only Lottie (svg build). Reduced motion: never plays, rests on the final frame. */
export default function LottieInner({ data, loop, reduced, onComplete }: LottieInnerProps) {
  const ref = useRef<LottieHandle>(null);
  return (
    <LottieSvg
      src={data}
      lottieRef={ref}
      loop={reduced ? false : loop}
      autoplay={!reduced}
      className="size-full"
      subscriptions={{
        ready: () => {
          if (reduced) {
            ref.current?.seek({ frame: Math.max(0, data.op - 1) });
            onComplete?.();
          }
        },
        complete: () => onComplete?.(),
      }}
    />
  );
}
