// Web-preview shim for lottie-react-native (design review in a browser only; never shipped).
// The library's web build needs @lottiefiles/dotlottie-react, which this app does not install;
// lottie-web (already in the workspace for the console) renders the same JSON here.
import lottie, { type AnimationItem } from 'lottie-web';
import React, { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

interface Props {
  source: object;
  autoPlay?: boolean;
  loop?: boolean;
  progress?: number;
  style?: StyleProp<ViewStyle>;
  onAnimationFinish?: (cancelled: boolean) => void;
}

export default function LottieView({ source, autoPlay, loop, progress, style, onAnimationFinish }: Props) {
  const ref = useRef<View>(null);
  useEffect(() => {
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
    const anim: AnimationItem = lottie.loadAnimation({
      container: node,
      renderer: 'svg',
      loop: !!loop,
      autoplay: !!autoPlay && progress === undefined,
      animationData: JSON.parse(JSON.stringify(source)),
    });
    if (progress !== undefined) anim.addEventListener('DOMLoaded', () => anim.goToAndStop(Math.max(0, anim.totalFrames - 1) * progress, true));
    const done = () => onAnimationFinish?.(false);
    anim.addEventListener('complete', done);
    return () => anim.destroy();
  }, [source, autoPlay, loop, progress, onAnimationFinish]);
  return <View ref={ref} style={style} />;
}
