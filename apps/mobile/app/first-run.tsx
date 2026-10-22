import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ArrowRight, CloudRain } from '@/components/icons';
import { MapField } from '@/components/MapField';
import { Mark } from '@/components/Mark';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { StoryDiagram } from '@/features/firstrun/StoryDiagram';
import { StateTag } from '@/features/navigate/SheetParts';
import { t, type StringKey } from '@/i18n/en';
import { useReduceMotion } from '@/lib/motion';
import { useSettings } from '@/stores/settings';
import { createStyles, fontFamily, hairline, layout, letterSpacing, motion, radius, spacing, type, useColors } from '@/theme';

type Step = 1 | 2 | 3;
const STEPS: { title: StringKey; body: StringKey; tag: { kind: 'warning' | 'recommended'; label: StringKey } }[] = [
  { title: 'story1Title', body: 'story1Body', tag: { kind: 'warning', label: 'statusUnverified' } },
  { title: 'story2Title', body: 'story2Body', tag: { kind: 'warning', label: 'statusCorroborated' } },
  // The last panel carries the product sentence from the earlier single-screen first run.
  { title: 'story3Title', body: 'firstRunBody', tag: { kind: 'recommended', label: 'recommended' } },
];

/**
 * First run: three still story panels (DESIGN_VISION appendix A) under the Simulated badge, so the
 * idea reads before the map: a report, the evidence it waits for, the way around. Skippable;
 * Next / Continue sits in the thumb zone. No permission prompts here. A panel change is a short
 * fade, instant with reduce motion; nothing loops.
 */
export default function FirstRun() {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const { width: winW } = useWindowDimensions();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [step, setStep] = useState<Step>(1);
  const s = STEPS[step - 1]!;
  const diagramW = Math.min(winW - spacing.lg * 2 - insets.left - insets.right, 420);
  const finish = () => {
    useSettings.getState().completeFirstRun();
    router.replace('/');
  };
  return (
    <View style={styles.root} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      <ThemedStatusBar />
      {size.w > 0 ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <MapField width={size.w} height={size.h} cy={0.38} />
        </View>
      ) : null}
      <View
        style={[
          styles.content,
          { paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.md, paddingLeft: insets.left + spacing.lg, paddingRight: insets.right + spacing.lg },
        ]}
      >
        <View style={styles.head}>
          <View style={styles.brand}>
            <Mark size={spacing.xl} />
            <AppText tone="onShell" style={styles.wordmark} accessibilityRole="header">
              {t('appName')}
            </AppText>
          </View>
          {step < 3 ? <Button label={t('storySkip')} kind="ghost" onPress={finish} testID="first-run-skip" style={styles.skip} /> : null}
        </View>
        <View style={styles.badge} accessibilityRole="text">
          <CloudRain size={16} color={tc.inkOnShellMuted} />
          <AppText variant="meta" tone="onShell" style={styles.flexShrink}>
            {t('firstRunBadge')}
          </AppText>
        </View>
        <ScrollView style={styles.flex} contentContainerStyle={styles.story} showsVerticalScrollIndicator={false}>
          <Animated.View key={step} entering={reduce ? undefined : FadeIn.duration(motion.banner)} style={styles.panel} testID={`story-${step}`}>
            <StoryDiagram step={step} width={diagramW} />
            <StateTag kind={s.tag.kind} label={t(s.tag.label, { n: 2 })} />
            <AppText variant="eta" tone="onShell" accessibilityRole="header" style={styles.title}>
              {t(s.title)}
            </AppText>
            <AppText tone="onShellMuted" style={styles.body}>
              {t(s.body)}
            </AppText>
          </Animated.View>
        </ScrollView>
        <View style={styles.foot}>
          <View style={styles.dots} accessible accessibilityRole="text" accessibilityLabel={t('storyStep', { n: step })}>
            {[1, 2, 3].map((n) => (
              <View key={n} style={[styles.dot, n === step ? styles.dotOn : styles.dotOff]} />
            ))}
            <AppText variant="meta" tone="onShellMuted" style={styles.stepText}>
              {t('storyStep', { n: step })}
            </AppText>
          </View>
          {step < 3 ? (
            <Button testID="first-run-next" label={t('storyNext')} trailingIcon={ArrowRight} onPress={() => setStep((step + 1) as Step)} />
          ) : (
            <Button testID="first-run-continue" label={t('firstRunContinue')} trailingIcon={ArrowRight} onPress={finish} />
          )}
        </View>
      </View>
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shellDeep },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  content: { flex: 1, gap: spacing.md },
  // Same height with or without Skip, so nothing shifts on the last panel.
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: layout.minTouch + spacing.xxs },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  wordmark: { fontFamily: fontFamily.semibold, fontSize: type.title.size, lineHeight: type.title.lineHeight, letterSpacing: letterSpacing.wordmark },
  skip: { paddingHorizontal: spacing.sm, marginRight: -spacing.sm },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: spacing.xs,
    borderWidth: hairline,
    borderStyle: 'dashed',
    borderColor: tc.inkOnShellMuted,
    borderRadius: radius.chip,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xxs + 2,
    backgroundColor: tc.shellRaised,
  },
  story: { flexGrow: 1, justifyContent: 'center', paddingVertical: spacing.md },
  panel: { gap: spacing.sm },
  title: { marginTop: spacing.sm },
  body: { maxWidth: 420 },
  foot: { gap: spacing.md },
  dots: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  dot: { height: spacing.xs - 2, borderRadius: radius.chip },
  dotOn: { width: spacing.lg, backgroundColor: tc.inkOnShell },
  dotOff: { width: spacing.xs - 2, backgroundColor: tc.inkOnShellMuted },
  stepText: { marginLeft: spacing.xs },
}));
