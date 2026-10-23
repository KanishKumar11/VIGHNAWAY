import { router } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { StatusBar } from 'expo-status-bar';
import { useMemo, useState } from 'react';
import { PanResponder, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { identity } from '@vighnaway/tokens';
import { AppText } from '@/components/AppText';
import { ArrowRight, CloudRain } from '@/components/icons';
import { PressScale } from '@/components/motion';
import { IdentityMark } from '@/features/firstrun/IdentityMark';
import { StoryScene, type Step } from '@/features/firstrun/StoryScene';
import { t, type StringKey } from '@/i18n/en';
import { useReduceMotion } from '@/lib/motion';
import { useSettings } from '@/stores/settings';
import { fontFamily, glow, hairline, layout, letterSpacing, radius, spacing, withAlpha } from '@/theme';

const STEPS: { eyebrow: StringKey; title: StringKey; body: StringKey; accent: string }[] = [
  { eyebrow: 'storyEyebrow1', title: 'story1Title', body: 'story1Body', accent: identity.water },
  { eyebrow: 'storyEyebrow2', title: 'story2Title', body: 'story2Body', accent: identity.marigold },
  // The last panel carries the product sentence from the earlier single-screen first run.
  { eyebrow: 'storyEyebrow3', title: 'story3Title', body: 'firstRunBody', accent: identity.lime },
];
const SWIPE = 48;
const FADE = spacing.xl + spacing.xs;

/**
 * First run, "Monsoon Signal" (DESIGN_VISION appendix B): three full-bleed night maps, one per beat
 * of the idea: a report, the evidence it waits for, the way around. A fixed dark scene in both
 * themes, like a splash. Swipe or tap the thumb-zone button; Skip is always there until the last
 * panel. No permission prompts here. A panel change is a short fade, instant with reduce motion;
 * the route draws once and nothing loops.
 */
export default function FirstRun() {
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { height: winH } = useWindowDimensions();
  const [stage, setStage] = useState({ w: 0, h: 0 });
  const [step, setStep] = useState<Step>(1);
  const s = STEPS[step - 1]!;
  const last = step === 3;

  const finish = () => {
    useSettings.getState().completeFirstRun();
    router.replace('/');
  };
  const go = (to: number) => setStep((cur) => (to < 1 || to > 3 ? cur : (to as Step)));

  // Horizontal swipes only: a mostly vertical drag is left to the scroller.
  const pan = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 18 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
        onPanResponderRelease: (_e, g) => {
          if (g.dx <= -SWIPE) setStep((cur) => (cur < 3 ? ((cur + 1) as Step) : cur));
          else if (g.dx >= SWIPE) setStep((cur) => (cur > 1 ? ((cur - 1) as Step) : cur));
        },
      }),
    [],
  );

  return (
    <View style={styles.root} {...pan.panHandlers}>
      <StatusBar style="light" />
      <LinearGradient colors={[identity.skyTop, identity.skyMid, identity.skyLow]} locations={[0, 0.5, 1]} style={StyleSheet.absoluteFill} />
      <ScrollView
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.scroll, { minHeight: winH, paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md }]}
      >
        <View style={[styles.head, { paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.lg }]}>
          <View style={styles.brand}>
            <IdentityMark size={spacing.xl + spacing.xs} />
            <AppText style={styles.wordmark} accessibilityRole="header">
              {t('appName')}
            </AppText>
          </View>
          {!last ? (
            <PressScale testID="first-run-skip" accessibilityRole="button" accessibilityLabel={t('storySkip')} haptic={null} onPress={finish} style={styles.skip}>
              <AppText variant="body" control style={styles.skipText}>
                {t('storySkip')}
              </AppText>
            </PressScale>
          ) : (
            <View style={styles.skip} />
          )}
        </View>

        <View style={[styles.progressRow, { paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.lg }]} accessible accessibilityRole="progressbar" accessibilityLabel={t('storyStep', { n: step })}>
          {[1, 2, 3].map((n) => (
            <View key={n} style={[styles.segment, n === step ? { backgroundColor: identity.lime } : n < step ? { backgroundColor: withAlpha(identity.lime, 0.5) } : null]} />
          ))}
        </View>

        <View style={[styles.badgeRow, { paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.lg }]}>
          <View style={styles.badge} accessibilityRole="text">
            <CloudRain size={16} color={identity.textMuted} />
            <AppText variant="meta" style={styles.badgeText}>
              {t('firstRunBadge')}
            </AppText>
          </View>
        </View>

        <View style={styles.stage} onLayout={(e) => setStage({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
          {stage.w > 0 ? (
            <Animated.View key={step} entering={reduce ? undefined : FadeIn.duration(320)} style={StyleSheet.absoluteFill} testID={`story-${step}`}>
              <StoryScene step={step} width={stage.w} height={stage.h} />
            </Animated.View>
          ) : null}
          <LinearGradient pointerEvents="none" colors={[identity.skyTop, withAlpha(identity.skyTop, 0)]} style={[styles.fade, { top: 0 }]} />
          <LinearGradient pointerEvents="none" colors={[withAlpha(identity.skyMid, 0), identity.skyMid]} style={[styles.fade, { bottom: 0 }]} />
        </View>

        <Animated.View
          key={`copy-${step}`}
          entering={reduce ? undefined : FadeInDown.duration(360)}
          style={[styles.copy, { paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.lg }]}
        >
          <View style={styles.eyebrowRow}>
            <AppText style={[styles.eyebrowNum, { color: s.accent }]}>{`0${step}`}</AppText>
            <View style={[styles.eyebrowRule, { backgroundColor: s.accent }]} />
            <AppText style={[styles.eyebrowText, { color: s.accent }]}>{t(s.eyebrow)}</AppText>
          </View>
          <AppText accessibilityRole="header" style={styles.title}>
            {t(s.title)}
          </AppText>
          <AppText style={styles.body}>{t(s.body)}</AppText>
        </Animated.View>

        <View style={[styles.foot, { paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.lg }]}>
          <PressScale
            testID={last ? 'first-run-continue' : 'first-run-next'}
            accessibilityRole="button"
            accessibilityLabel={last ? t('firstRunContinue') : t('storyNext')}
            haptic="light"
            onPress={last ? finish : () => go(step + 1)}
            style={[styles.cta, glow(identity.lime, 0.9)]}
          >
            <View style={styles.ctaRow}>
              <AppText variant="body" control style={styles.ctaText}>
                {last ? t('firstRunContinue') : t('storyNext')}
              </AppText>
              <ArrowRight size={20} color={identity.onLime} strokeWidth={2.5} />
            </View>
          </PressScale>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: identity.skyTop },
  scroll: { flexGrow: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: layout.minTouch },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wordmark: { color: identity.text, fontFamily: fontFamily.semibold, fontSize: 16, lineHeight: 22, letterSpacing: letterSpacing.wordmark },
  skip: { minHeight: layout.minTouch, minWidth: layout.minTouch, alignItems: 'center', justifyContent: 'center', paddingHorizontal: spacing.sm, marginRight: -spacing.sm },
  skipText: { color: identity.textMuted, fontFamily: fontFamily.semibold },
  progressRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
  segment: { flex: 1, height: spacing.xs, borderRadius: radius.chip, backgroundColor: identity.glassStrong },
  badgeRow: { marginTop: spacing.md, alignItems: 'flex-start' },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderWidth: hairline,
    borderStyle: 'dashed',
    borderColor: identity.textSubtle,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 2,
    backgroundColor: identity.glass,
  },
  badgeText: { color: identity.textMuted, flexShrink: 1 },
  // The scene takes whatever height the copy and button leave; it fades into the sky at both edges.
  stage: { flex: 1, minHeight: 260, marginTop: spacing.xs },
  fade: { position: 'absolute', left: 0, right: 0, height: FADE },
  copy: { gap: spacing.sm },
  eyebrowRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  eyebrowNum: { fontFamily: fontFamily.monoBold, fontSize: 13, lineHeight: 18, letterSpacing: 1 },
  eyebrowRule: { width: spacing.lg, height: 2, borderRadius: radius.chip },
  eyebrowText: { fontFamily: fontFamily.semibold, fontSize: 14, lineHeight: 18, letterSpacing: 0.2 },
  title: { color: identity.text, fontFamily: fontFamily.bold, fontSize: 38, lineHeight: 44, letterSpacing: -1.3 },
  body: { color: identity.textMuted, fontFamily: fontFamily.regular, fontSize: 17, lineHeight: 25, maxWidth: 440 },
  foot: { marginTop: spacing.lg },
  cta: { minHeight: layout.minTouch + spacing.md, borderRadius: radius.button, backgroundColor: identity.lime, alignItems: 'center', justifyContent: 'center' },
  ctaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  ctaText: { color: identity.onLime, fontFamily: fontFamily.bold },
});
