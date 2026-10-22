import { SCORING_RULES, scoringRulesTable } from '@vighnaway/engine';
import { graphAttribution } from '@vighnaway/scenario-data';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Mark } from '@/components/Mark';
import { enterUp } from '@/components/motion';
import { Card, GUTTER, ScreenHeader, Section } from '@/components/ui';
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
    <View style={styles.root}>
      <ThemedStatusBar />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xl, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}>
        <View style={styles.headerBleed}>
          <ScreenHeader title={t('drawerHowItDecides')} subtitle={t('howSubtitle')} />
        </View>
        <Animated.View entering={enterUp(0, reduce)}>
          <Card tone="tint" style={styles.hero}>
            <View style={styles.heroHead}>
              <View style={styles.markTile}>
                <Mark size={26} />
              </View>
              <AppText variant="label" tone="accent">
                {t('howFormula')}
              </AppText>
            </View>
            <AppText variant="mono" style={styles.formula}>
              {ruleText('formula', SCORING_RULES.formula)}
            </AppText>
          </Card>
        </Animated.View>
        <Section index={1}>
          <View style={styles.intro}>
            <AppText>{t('howIntro')}</AppText>
            <AppText variant="meta" tone="muted" testID="translation-note">
              {t('translationNote')}
            </AppText>
            {getLanguage() !== 'en' ? (
              <AppText variant="meta" tone="muted">
                {t('howEnglishOnly')}
              </AppText>
            ) : null}
          </View>
        </Section>
        <Section title={t('howRules')} count={rules.length} index={2}>
          {rules.map((r, i) => (
            <View key={r.key} style={[styles.rule, i > 0 && styles.divider]}>
              <AppText variant="mono" tone="accent">
                {r.key}
              </AppText>
              <AppText variant="meta">{ruleText(r.key, r.description)}</AppText>
              <View style={styles.value}>
                <AppText variant="mono">{r.value}</AppText>
              </View>
            </View>
          ))}
        </Section>
        <Section title={t('howLimitations')} index={3}>
          {strings().limitations.map((l, i) => (
            <View key={l} style={[styles.limit, i > 0 && styles.divider]}>
              <View style={styles.limitNo}>
                <AppText variant="num" tone="accent">
                  {String(i + 1)}
                </AppText>
              </View>
              <AppText variant="meta" style={styles.flex}>
                {l}
              </AppText>
            </View>
          ))}
        </Section>
        <View style={styles.attribution}>
          <AppText variant="meta" tone="muted">
            {graphAttribution(graphFile)}
          </AppText>
          <AppText variant="meta" tone="muted">
            {t('mapDataGoogle')}
          </AppText>
        </View>
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  content: { gap: spacing.lg },
  headerBleed: { marginHorizontal: -GUTTER, marginBottom: -spacing.sm },
  flex: { flex: 1 },
  hero: { gap: spacing.sm, padding: GUTTER },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  markTile: { width: spacing.xl + spacing.xs, height: spacing.xl + spacing.xs, borderRadius: radius.button, backgroundColor: tc.panel, alignItems: 'center', justifyContent: 'center' },
  formula: { lineHeight: spacing.lg - spacing.xxs },
  intro: { gap: spacing.xs, padding: GUTTER },
  rule: { paddingVertical: spacing.md, paddingHorizontal: GUTTER, gap: spacing.xs },
  divider: { borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  value: { alignSelf: 'flex-start', paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, borderRadius: radius.button - 4, backgroundColor: tc.panelSunken },
  limit: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, paddingVertical: spacing.sm, paddingHorizontal: GUTTER },
  limitNo: { width: spacing.lg, height: spacing.lg, borderRadius: radius.chip, backgroundColor: tc.tealSoft, alignItems: 'center', justifyContent: 'center' },
  attribution: { gap: spacing.xxs, paddingHorizontal: spacing.xxs },
}));
