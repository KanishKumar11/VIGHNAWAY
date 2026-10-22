import { useMemo } from 'react';
import { View } from 'react-native';
import type { PlanResult } from '@vighnaway/contracts';
import { dataGapQuestions, nextQuestion, type Graph } from '@vighnaway/engine';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { t } from '@/i18n/en';
import { getDeviceId } from '@/lib/deviceId';
import { askKey, useAsked } from '@/stores/ask';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useToast } from '@/stores/toast';
import { useTrip } from '@/stores/trip';
import { createStyles, hairline, spacing } from '@/theme';
import { submitReport } from '../report/submit';
import { reportForAnswer, type Answer } from './answer';

/**
 * "Help check this road": at a data gap (a flood-prone road with no report in the last hour while a
 * rain alert is active) the app asks for the evidence it is missing instead of only guessing around
 * it. At most one prompt per road per device per 30 minutes, and never while the traveller is moving
 * faster than walking pace. The answer is an ordinary report: it stays Unverified until others
 * confirm it or an operator verifies it.
 */
export function AskCard({ plan, graph }: { plan: PlanResult; graph: Graph }) {
  const styles = useStyles();
  const scenarioId = useScenario((s) => s.scenario.id);
  const profile = useSettings((s) => s.profile);
  const enRoute = useTrip((s) => s.mode === 'en_route');
  const askedAtMs = useAsked((s) => s.askedAtMs);

  const question = useMemo(() => {
    const scoped: Record<string, number> = {};
    for (const q of dataGapQuestions(plan, graph)) {
      const at = askedAtMs[askKey(scenarioId, q.key)];
      if (at !== undefined) scoped[q.key] = at;
    }
    return nextQuestion(dataGapQuestions(plan, graph), { askedAtMs: scoped, nowMs: Date.now(), movingFasterThanWalking: enRoute && profile !== 'foot' });
  }, [plan, graph, askedAtMs, scenarioId, enRoute, profile]);

  if (!question) return null;
  const road = question.roadName ?? t('askUnnamedRoad');

  const answer = (a: Answer) => {
    useAsked.getState().mark(scenarioId, question.key, Date.now());
    const input = reportForAnswer(question, a, getDeviceId());
    if (!input) return;
    void submitReport(input).then((outcome) => {
      const toast = useToast.getState();
      if (outcome.kind === 'error') toast.show(outcome.message, 'warn');
      else toast.show(t(a === 'yes' ? 'askThanksYes' : 'askThanksNo'), 'positive');
    });
  };

  return (
    <View style={styles.card} testID="ask-card" accessible={false}>
      <View style={styles.head}>
        <AppText variant="label" tone="muted" accessibilityRole="header">
          {t('askTitle')}
        </AppText>
        <View style={styles.headRule} />
      </View>
      <AppText variant="title" testID="ask-question">
        {t('askQuestion', { road })}
      </AppText>
      <AppText variant="meta" tone="muted">
        {t('askWhy')}
      </AppText>
      <View style={styles.buttons}>
        <Button label={t('askYes')} kind="secondary" onPress={() => answer('yes')} testID="ask-yes" style={styles.button} />
        <Button label={t('askNo')} kind="secondary" onPress={() => answer('no')} testID="ask-no" style={styles.button} />
        <Button label={t('askNotSure')} kind="ghost" onPress={() => answer('not_sure')} testID="ask-not-sure" style={styles.button} />
      </View>
      <AppText variant="meta" tone="muted">
        {t('askNote')}
      </AppText>
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  card: { gap: spacing.sm },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  headRule: { flex: 1, height: hairline, backgroundColor: tc.panelHairline },
  buttons: { flexDirection: 'row', gap: spacing.xs },
  button: { flex: 1 },
}));
