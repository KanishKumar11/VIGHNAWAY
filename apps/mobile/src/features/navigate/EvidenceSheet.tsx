import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback, useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEED_PROVIDER_LABEL, formatSimClock, type Incident, type PlanResult } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { EvidenceChips } from '@/components/EvidenceChips';
import { BadgeCheck, Clock, MapPin, Radio, Route, Smartphone, type LucideIcon } from '@/components/icons';
import { IncidentGlyph } from '@/components/IncidentGlyph';
import { StatusRing } from '@/components/StatusRing';
import { t } from '@/i18n/en';
import { hazardText, incidentA11y, sourceText } from '@/i18n/engineText';
import { fmtAge, fmtDuration } from '@/i18n/format';
import { useReduceMotion } from '@/lib/motion';
import { useFeed } from '@/stores/feed';
import { createStyles, fontFamily, hairline, motion, radius, spacing, text, useColors } from '@/theme';

/** "Effect on routes", from the current plan's evaluation of this incident. */
export function effectLine(incident: Incident, plan: PlanResult | null): string {
  if (!plan) return t('evidenceEffectNone');
  if (plan.routes.some((r) => r.blockedBy.some((b) => b.incidentId === incident.id))) return t('evidenceEffectBlock');
  const hazards = plan.routes.flatMap((r) => r.hazards.filter((h) => h.incidentId === incident.id));
  const added = Math.max(0, ...hazards.map((h) => h.addedEtaS));
  if (added > 0) return t('evidenceEffectCongestion', { n: Math.max(1, Math.round(added / 60)) });
  if (hazards.some((h) => h.effect !== 'none')) return t('evidenceEffectPenalty');
  return t('evidenceEffectNone');
}

function Fact({ icon: Icon, text: value, last }: { icon: LucideIcon; text: string; last?: boolean }) {
  const tc = useColors();
  const styles = useStyles();
  return (
    <View style={[styles.fact, !last && styles.factDivider]}>
      <Icon size={16} color={tc.inkMuted} />
      <AppText style={styles.flex}>{value}</AppText>
    </View>
  );
}

const GLYPH = spacing.xl + spacing.md;

/**
 * Provenance of a live-feed incident (live mode): the provider, its own description and extent,
 * its delay estimate (display only) and when the feed last saw it, with the provider attribution.
 */
function FeedProvenance({ incident, nowS }: { incident: Incident; nowS: number }) {
  const tc = useColors();
  const styles = useStyles();
  const attribution = useFeed((s) => s.status?.attribution ?? null);
  const feed = incident.feed!;
  const provider = FEED_PROVIDER_LABEL[feed.provider];
  const seenAgo = Math.max(0, nowS - feed.lastSeenAtS);
  return (
    <View style={styles.feed} testID="feed-provenance">
      <View style={styles.feedHead}>
        <Radio size={16} color={tc.inkMuted} />
        <AppText variant="label" tone="muted" style={styles.flex}>
          {t('feedTitle')}
        </AppText>
        <AppText variant="meta" tone="muted">
          {sourceText(incident)}
        </AppText>
      </View>
      {/* Provider text is plain text, never HTML. */}
      {feed.description ? <Text style={[text.body, styles.noteText]}>{feed.description}</Text> : null}
      {feed.from && feed.to ? <AppText variant="meta">{t('feedFromTo', { from: feed.from, to: feed.to })}</AppText> : null}
      {feed.delayS ? <AppText variant="meta">{t('feedDelay', { delay: fmtDuration(feed.delayS) })}</AppText> : null}
      <AppText variant="meta" tone="muted">
        {seenAgo < 60 ? t('feedLastSeenNow') : t('feedLastSeen', { age: fmtAge(seenAgo) })}
      </AppText>
      <AppText variant="meta" tone="muted">
        {attribution ?? t('feedAttributionFallback', { provider })}
      </AppText>
    </View>
  );
}

type Step = { key: string; label: string; clock: string | null; done: boolean };

/**
 * How trust built (DESIGN_VISION appendix A): first report, devices, corroboration, operator
 * verification. Done steps are filled, pending steps hollow; the label always says which.
 */
export function trustSteps(incident: Incident, clockStartsAt: string): Step[] {
  const clock = (s: number | null) => (s === null ? null : formatSimClock(clockStartsAt, s));
  const provider = incident.feed ? FEED_PROVIDER_LABEL[incident.feed.provider] : 'TomTom';
  if (incident.source === 'live_feed' && incident.reportCount === 0) {
    return [{ key: 'feed', label: t('trustFeed', { provider }), clock: clock(incident.createdAtS), done: true }];
  }
  const steps: Step[] = [{ key: 'first', label: t('trustFirst'), clock: clock(incident.createdAtS), done: true }];
  if (incident.deviceCount >= 2) steps.push({ key: 'devices', label: t('trustDevices', { n: incident.deviceCount }), clock: clock(incident.lastReportAtS), done: true });
  const corroborated = incident.deviceCount >= 2 || incident.status === 'corroborated' || incident.status === 'verified';
  steps.push({ key: 'corroborated', label: t('trustCorroborated'), clock: null, done: corroborated });
  steps.push({ key: 'verified', label: t('trustVerified'), clock: clock(incident.verifiedAtS), done: incident.verifiedAtS !== null || incident.status === 'verified' });
  return steps;
}

function TrustTimeline({ incident, clockStartsAt }: { incident: Incident; clockStartsAt: string }) {
  const styles = useStyles();
  const steps = trustSteps(incident, clockStartsAt);
  return (
    <View style={styles.trust} testID="trust-timeline">
      <AppText variant="label" tone="muted" accessibilityRole="header">
        {t('trustTitle')}
      </AppText>
      {steps.map((st, i) => (
        <View key={st.key} style={styles.step} accessible accessibilityLabel={`${st.label}${st.clock ? `, ${st.clock}` : ''}`} accessibilityState={{ checked: st.done }}>
          <View style={styles.stepRail}>
            <View style={[styles.stepDot, st.done ? styles.stepDotDone : styles.stepDotPending]} />
            {i < steps.length - 1 ? <View style={styles.stepLine} /> : null}
          </View>
          <AppText variant="meta" tone={st.done ? 'ink' : 'muted'} style={[styles.flex, st.done && styles.strong]}>
            {st.label}
          </AppText>
          {st.clock ? (
            <AppText variant="mono" tone="muted">
              {st.clock}
            </AppText>
          ) : null}
        </View>
      ))}
    </View>
  );
}

/**
 * The operator's Verify as a one-shot stamp: it lands once when the status changes to Verified
 * while the sheet is open (a success haptic comes from liveSync). Already verified: shown still.
 */
function VerifiedStamp({ incident }: { incident: Incident }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const seen = useRef<{ id: string; verified: boolean } | null>(null);
  const verified = incident.status === 'verified';
  const animate = !reduce && verified && seen.current?.id === incident.id && !seen.current.verified;
  useEffect(() => {
    seen.current = { id: incident.id, verified };
  }, [incident.id, verified]);
  if (!verified) return null;
  return (
    <Animated.View
      key={animate ? 'stamp-new' : 'stamp'}
      entering={animate ? ZoomIn.duration(motion.statusUpgrade + 100) : undefined}
      style={[styles.stamp, { borderColor: tc.dangerInk }]}
      accessibilityRole="text"
      accessibilityLabel={t('trustVerified')}
      testID="verified-stamp"
    >
      <BadgeCheck size={16} color={tc.dangerInk} strokeWidth={2.25} />
      <AppText variant="label" tone="danger">
        {t('stampVerified')}
      </AppText>
    </Animated.View>
  );
}

interface Props {
  incident: Incident | null;
  plan: PlanResult | null;
  nowS: number;
  clockStartsAt: string;
  onDismiss: () => void;
}

/** Evidence for one incident in a dynamically sized BottomSheetModal over the map. */
export const EvidenceSheet = forwardRef<BottomSheetModal, Props>(function EvidenceSheet({ incident, plan, nowS, clockStartsAt, onDismiss }, ref) {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const backdrop = useCallback(
    (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />,
    [],
  );
  const ageS = incident ? Math.max(0, nowS - incident.lastReportAtS) : 0;
  return (
    <BottomSheetModal
      ref={ref}
      enableDynamicSizing
      enablePanDownToClose
      onDismiss={onDismiss}
      backdropComponent={backdrop}
      topInset={insets.top}
      backgroundStyle={styles.bg}
      handleIndicatorStyle={styles.handle}
    >
      <BottomSheetView style={[styles.content, { paddingBottom: insets.bottom + spacing.lg }]}>
        {incident ? (
          <>
            <View style={styles.head} accessible accessibilityLabel={incidentA11y(incident, nowS)}>
              <View style={styles.glyph}>
                <View style={StyleSheet.absoluteFill}>
                  <StatusRing status={incident.status} size={GLYPH} strokeWidth={2.5} />
                </View>
                <IncidentGlyph type={incident.type} color={tc.ink} size={24} />
              </View>
              <AppText variant="title" style={styles.flex} accessibilityRole="header">
                {hazardText(incident)}
              </AppText>
              <VerifiedStamp incident={incident} />
            </View>
            <EvidenceChips incident={incident} nowS={nowS} />
            <View style={styles.facts}>
              <Fact icon={MapPin} text={incident.roadName ? t('evidenceRoad', { road: incident.roadName }) : t('evidenceRoadUnknown')} />
              <Fact
                icon={Smartphone}
                text={
                  incident.source === 'live_feed' && incident.reportCount === 0
                    ? t('evidenceReportsFeedOnly')
                    : t('evidenceReports', { n: incident.reportCount, d: incident.deviceCount })
                }
              />
              <Fact
                icon={Clock}
                text={
                  ageS < 60
                    ? t('evidenceLastReportJustNow', { clock: formatSimClock(clockStartsAt, incident.lastReportAtS) })
                    : t('evidenceLastReport', { clock: formatSimClock(clockStartsAt, incident.lastReportAtS), age: fmtAge(ageS) })
                }
              />
              <Fact icon={Route} text={effectLine(incident, plan)} last />
            </View>
            <TrustTimeline incident={incident} clockStartsAt={clockStartsAt} />
            {incident.feed ? <FeedProvenance incident={incident} nowS={nowS} /> : null}
            {/* A feed incident's note is the provider description, already shown above. */}
            {incident.note && incident.note !== incident.feed?.description ? (
              <View style={styles.note}>
                <AppText variant="label" tone="muted">
                  {t('evidenceNote')}
                </AppText>
                {/* Plain text only: never rendered as HTML or markdown. */}
                <Text style={[text.body, styles.noteText]} selectable>
                  {incident.note}
                </Text>
              </View>
            ) : null}
            <AppText variant="meta" tone="muted">
              {t('evidenceFooter')}
            </AppText>
            <Button label={t('evidenceClose')} kind="secondary" onPress={onDismiss} />
          </>
        ) : null}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const useStyles = createStyles((tc) => ({
  bg: { backgroundColor: tc.panel, borderRadius: radius.sheet },
  handle: { backgroundColor: tc.panelLine, width: spacing.xl + spacing.xxs },
  content: { paddingHorizontal: spacing.md, paddingTop: spacing.xxs, gap: spacing.md },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  glyph: { width: GLYPH, height: GLYPH, borderRadius: radius.chip, alignItems: 'center', justifyContent: 'center' },
  flex: { flex: 1 },
  strong: { fontFamily: fontFamily.semibold },
  // Facts as hairline rows, not a card (DESIGN_VISION 3.3).
  facts: { borderTopWidth: hairline, borderBottomWidth: hairline, borderColor: tc.panelHairline },
  fact: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  factDivider: { borderBottomWidth: hairline, borderBottomColor: tc.panelHairline },
  trust: { gap: 0 },
  step: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, minHeight: spacing.xl + spacing.xxs },
  stepRail: { width: spacing.sm, alignItems: 'center', alignSelf: 'stretch', paddingTop: spacing.xxs },
  stepDot: { width: spacing.xs + 2, height: spacing.xs + 2, borderRadius: radius.chip, borderWidth: 1.5 },
  stepDotDone: { backgroundColor: tc.ink, borderColor: tc.ink },
  stepDotPending: { backgroundColor: tc.panel, borderColor: tc.controlBorder },
  stepLine: { flex: 1, width: hairline * 2, backgroundColor: tc.panelLine, marginVertical: 2 },
  stamp: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderWidth: 1.5,
    borderRadius: radius.chip,
    transform: [{ rotate: '-4deg' }],
  },
  feed: { gap: spacing.xxs + 2, paddingTop: spacing.sm, borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  feedHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  note: { gap: spacing.xxs },
  noteText: { color: tc.ink },
}));
