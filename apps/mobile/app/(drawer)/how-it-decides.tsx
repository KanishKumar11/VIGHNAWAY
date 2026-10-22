import { SCORING_RULES, scoringRulesTable } from '@vighnaway/engine';
import { graphAttribution } from '@vighnaway/scenario-data';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Mark } from '@/components/Mark';
import { enterUp } from '@/components/motion';
import { strings, t } from '@/i18n/en';
import { ruleText } from '@/i18n/engineText';
import { getLanguage } from '@/i18n/lang';
import { useReduceMotion } from '@/lib/motion';
import { useScenario } from '@/stores/scenario';
import { createStyles, hairline, radius, spacing } from '@/theme';

const rules = scoringRulesTable();

/** Renders SCORING_RULES from the engine, the known limitations and the attribution. */
export default function HowItDecides() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const graphFile = useScenario((s) => s.graphFile);
  return (
    <SafeAreaView edges={['left', 'right']} style={styles.root}>
      <ThemedStatusBar />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Animated.View entering={enterUp(0, reduce)} style={styles.hero}>
          <View style={styles.heroHead}>
            <Mark size={32} />
            <AppText variant="label" tone="muted">
              {t('howFormula')}
            </AppText>
          </View>
          <AppText variant="mono" style={styles.formula}>
            {SCORING_RULES.formula}
          </AppText>
        </Animated.View>
        <Animated.View entering={enterUp(1, reduce)} style={styles.intro}>
          <AppText>{t('howIntro')}</AppText>
          <AppText variant="meta" tone="muted" testID="translation-note">
            {t('translationNote')}
          </AppText>
          {getLanguage() !== 'en' ? (
            <AppText variant="meta" tone="muted">
              {t('howEnglishOnly')}
            </AppText>
          ) : null}
        </Animated.View>
        <AppText variant="label" tone="muted" accessibilityRole="header" style={styles.heading}>
          {t('howRules')}
        </AppText>
        <View style={styles.rules}>
          {rules.map((r, i) => (
            <Animated.View key={r.key} entering={enterUp(Math.min(i + 2, 10), reduce)} style={[styles.rule, i > 0 && styles.ruleDivider]}>
              <AppText variant="mono" tone="muted">
                {r.key}
              </AppText>
              <AppText variant="meta">{ruleText(r.key, r.description)}</AppText>
              <View style={styles.value}>
                <AppText variant="mono">{r.value}</AppText>
              </View>
            </Animated.View>
          ))}
        </View>
        <AppText variant="label" tone="muted" accessibilityRole="header" style={styles.heading}>
          {t('howLimitations')}
        </AppText>
        <View style={styles.list}>
          {strings().limitations.map((l, i) => (
            <View key={l} style={[styles.limit, i > 0 && styles.ruleDivider]}>
              <AppText variant="num" tone="muted" style={styles.limitNo}>
                {String(i + 1).padStart(2, '0')}
              </AppText>
              <AppText variant="meta" style={styles.flex}>
                {l}
              </AppText>
            </View>
          ))}
        </View>
        <View style={styles.attribution}>
          <AppText variant="meta" tone="muted">
            {graphAttribution(graphFile)}
          </AppText>
          <AppText variant="meta" tone="muted">
            {t('mapDataGoogle')}
          </AppText>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  content: { padding: spacing.md, gap: spacing.md },
  flex: { flex: 1 },
  hero: { gap: spacing.sm, paddingBottom: spacing.md, borderBottomWidth: hairline, borderBottomColor: tc.shellHairlineStrong },
  intro: { gap: spacing.xs },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  formula: { lineHeight: spacing.lg - spacing.xxs },
  heading: { marginTop: spacing.xs },
  // Rules and limitations as hairline lists, not cards (DESIGN_VISION 3.3).
  rules: { borderTopWidth: hairline, borderTopColor: tc.shellHairlineStrong },
  rule: { paddingVertical: spacing.md, gap: spacing.xs },
  ruleDivider: { borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  value: { alignSelf: 'flex-start', paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.button - 4, backgroundColor: tc.panelSunken },
  list: { borderTopWidth: hairline, borderTopColor: tc.shellHairlineStrong },
  limit: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.sm },
  limitNo: { minWidth: spacing.lg },
  attribution: { gap: spacing.xxs, paddingTop: spacing.md, borderTopWidth: hairline, borderTopColor: tc.panelLine },
}));
