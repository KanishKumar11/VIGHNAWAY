import { router } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Incident } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import { EvidenceChips, ModeBadge } from '@/components/EvidenceChips';
import { IncidentGlyph } from '@/components/IncidentGlyph';
import { GUTTER, ScreenHeader, Section, StatusBarScrim } from '@/components/ui';
import { StatusRing } from '@/components/StatusRing';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { EmptyEvidence, RouteRow } from '@/features/navigate/SheetParts';
import { t } from '@/i18n/en';
import { hazardWhere, incidentA11y } from '@/i18n/engineText';
import { etaDeltaBars } from '@/lib/geometry';
import { useIncidents } from '@/stores/incidents';
import { placeById, useScenario } from '@/stores/scenario';
import { useSim } from '@/stores/sim';
import { useTrip } from '@/stores/trip';
import { createStyles, fontFamily, hairline, spacing, useColors } from '@/theme';

/**
 * The map as text (DESIGN_VISION 5.4, appendix A): every route the engine evaluated, with its
 * role, ETA, reason and strip, and every incident on those routes with status, source and age.
 */
export function MapListScreen() {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const plan = useTrip((s) => s.plan);
  const destinationId = useTrip((s) => s.destinationId);
  const scenario = useScenario((s) => s.scenario);
  const byId = useIncidents((s) => s.byId);
  const nowS = useSim((s) => Math.floor(s.simTimeS / 60) * 60);
  const dest = placeById(scenario, destinationId);
  const bars = useMemo(() => (plan ? etaDeltaBars(plan.routes, plan.recommendedRouteId) : []), [plan]);
  const incidents = useMemo(() => {
    if (!plan) return [] as Incident[];
    const ids = new Set<string>();
    for (const r of plan.routes) {
      for (const h of r.hazards) ids.add(h.incidentId);
      for (const b of r.blockedBy) ids.add(b.incidentId);
    }
    return [...ids]
      .sort()
      .map((id) => byId[id])
      .filter((i): i is Incident => !!i);
  }, [plan, byId]);
  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));

  return (
    <View style={styles.root} testID="map-list">
      <ThemedStatusBar />
      <StatusBarScrim />
      <ScrollView contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + spacing.xl, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}>
        <View style={styles.headerBleed}>
          <ScreenHeader
            title={t('listTitle')}
            subtitle={dest ? t('shareTo', { place: dest.name }) : null}
            leading="back"
            onLeading={close}
            leadingTestID="list-close"
            trailing={<ModeBadge onShell={false} />}
          />
        </View>
        <Section title={t('listRoutes')} count={plan?.routes.length ?? 0} bare>
          {plan?.routes.length ? (
            <View style={styles.cards}>
              {plan.routes.map((r, i) => (
                <RouteRow key={r.routeId} route={r} bar={bars.find((b) => b.routeId === r.routeId)} index={i} strip />
              ))}
            </View>
          ) : (
            <AppText tone="muted">{plan?.noViableRoute ? t('noViableTitle') : t('driveNoTrip')}</AppText>
          )}
        </Section>
        <Section title={t('listIncidents')} count={incidents.length} bare={!incidents.length}>
          {incidents.length ? (
            incidents.map((inc, i) => (
              <View key={inc.id} style={[styles.incident, i > 0 && styles.divider]} accessible accessibilityLabel={incidentA11y(inc, nowS)}>
                <View style={styles.glyph}>
                  <View style={styles.ring}>
                    <StatusRing status={inc.status} size={spacing.xl + spacing.sm} strokeWidth={2} />
                  </View>
                  <IncidentGlyph type={inc.type} color={tc.ink} size={20} />
                </View>
                <View style={[styles.flex, styles.incidentText]}>
                  <AppText style={styles.strong}>{hazardWhere(inc)}</AppText>
                  <EvidenceChips incident={inc} nowS={nowS} />
                </View>
              </View>
            ))
          ) : (
            <EmptyEvidence />
          )}
        </Section>
      </ScrollView>
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  flex: { flex: 1 },
  strong: { fontFamily: fontFamily.semibold },
  headerBleed: { marginHorizontal: -GUTTER, marginBottom: -spacing.sm },
  body: { gap: spacing.lg },
  cards: { gap: spacing.sm },
  incident: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.md, paddingHorizontal: GUTTER },
  divider: { borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  glyph: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, alignItems: 'center', justifyContent: 'center' },
  ring: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  incidentText: { gap: spacing.xxs },
}));
