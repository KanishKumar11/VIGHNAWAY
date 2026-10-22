import { planTrip, parityHash } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { router } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Button } from '@/components/Button';
import { enterFixture, leaveFixture } from '@/fixtures/hero';
import { t } from '@/i18n/en';
import { getGraph } from '@/lib/engine';
import { useConnection } from '@/stores/connection';
import { useIncidents } from '@/stores/incidents';
import { useSettings } from '@/stores/settings';
import { createStyles, hairline, radius, spacing } from '@/theme';

interface Result {
  hash: string;
  caseCount: number;
  parityMs: number;
  planMs: number;
}

let bust = 0;

/** Measures parity and planTrip time on this phone (the 200 ms Hermes budget). */
function measure(): Result {
  const t0 = performance.now();
  const { hash, caseCount } = parityHash(andheriGraph, andheriScenario);
  const parityMs = performance.now() - t0;
  const graph = getGraph(andheriGraph, 'car');
  const origin = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.originId)!;
  const dest = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.destinationId)!;
  bust += 1;
  const t1 = performance.now();
  planTrip({
    graph,
    origin: origin.nodeId,
    destination: dest.nodeId,
    incidents: [],
    // A unique simulation time defeats the plan memo so this measures a real evaluation.
    nowS: 7 * 24 * 3600 + bust,
    alerts: andheriScenario.alerts,
    hasAlertInformation: andheriScenario.hasAlertInformation,
    places: andheriScenario.places,
    destinationPlaceId: dest.id,
  });
  const planMs = performance.now() - t1;
  return { hash, caseCount, parityMs, planMs };
}

export default function DebugScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const apiUrl = useSettings((s) => s.apiUrl);
  const fixtureMode = useSettings((s) => s.fixtureMode);
  // Hero fixtures are built from the simulated scenario's places and events.
  const liveMode = useSettings((s) => s.dataMode === 'live');
  const socket = useConnection((s) => s.socket);
  const lastSeq = useIncidents((s) => s.lastSeq);
  const runId = useIncidents((s) => s.runId);

  const run = () => {
    setBusy(true);
    // Let the button render its busy state before the synchronous work.
    setTimeout(() => {
      setResult(measure());
      setBusy(false);
    }, 50);
  };

  return (
    <SafeAreaView edges={['left', 'right']} style={styles.root}>
      <ThemedStatusBar />
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.card}>
          <AppText variant="label" tone="muted">
            {t('debugParityHash')}
          </AppText>
          <AppText selectable testID="parity-hash" variant="mono" style={styles.hash}>
            {result ? result.hash : busy ? t('debugComputing') : '—'}
          </AppText>
          {result ? (
            <>
              <AppText>{t('debugCaseCount', { n: result.caseCount })}</AppText>
              <AppText>
                {t('debugParityTime', {
                  ms: result.parityMs.toFixed(0),
                  n: result.caseCount,
                  mean: (result.parityMs / Math.max(1, result.caseCount)).toFixed(1),
                })}
              </AppText>
              <AppText>{t('debugPlanTime', { ms: result.planMs.toFixed(1) })}</AppText>
            </>
          ) : null}
          <AppText variant="meta" tone="muted">
            {t('debugPlanBudget')}
          </AppText>
          <AppText variant="mono">{t('debugGraphVersion', { v: andheriGraph.graphVersion })}</AppText>
          <AppText variant="mono">{t('debugGraphSource', { s: andheriGraph.source })}</AppText>
          <Button label={t('debugCompute')} onPress={run} loading={busy} />
        </View>
        <View style={styles.card}>
          <AppText variant="mono">{t('debugApi', { url: apiUrl })}</AppText>
          <AppText variant="mono">{t('debugSocket', { status: socket })}</AppText>
          <AppText variant="mono">{t('debugLastSeq', { seq: lastSeq, runId: runId ?? '—' })}</AppText>
        </View>
        <View style={styles.card}>
          <AppText variant="label" tone="muted">
            {t('debugHeroTitle')}
          </AppText>
          {liveMode ? (
            <AppText variant="meta" tone="muted">
              {t('debugHeroSimulatedOnly')}
            </AppText>
          ) : null}
          <Button
            label={t('debugHeroPeek')}
            kind="secondary"
            disabled={liveMode}
            testID="fixture-peek"
            onPress={() => {
              enterFixture('peek');
              router.navigate('/');
            }}
          />
          <Button
            label={t('debugHeroChange')}
            kind="secondary"
            disabled={liveMode}
            testID="fixture-change"
            onPress={() => {
              enterFixture('change');
              router.navigate('/');
            }}
          />
          <Button
            label={t('debugHeroNoViable')}
            kind="secondary"
            disabled={liveMode}
            testID="fixture-no-viable"
            onPress={() => {
              enterFixture('noViable');
              router.navigate('/');
            }}
          />
          <Button
            label={t('debugHeroReport')}
            kind="secondary"
            disabled={liveMode}
            testID="fixture-report"
            onPress={() => {
              enterFixture('report');
              router.navigate('/');
              setTimeout(() => router.push('/report?fixture=1'), 300);
            }}
          />
          {fixtureMode ? <Button label={t('debugHeroClear')} kind="danger" onPress={leaveFixture} /> : null}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  content: { padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: tc.panelRaised,
    borderRadius: radius.card,
    padding: spacing.md,
    gap: spacing.xs,
    borderWidth: hairline,
    borderColor: tc.panelHairline,
  },
  hash: { padding: spacing.sm, borderRadius: radius.button, backgroundColor: tc.panelSunken, color: tc.ink },
}));
