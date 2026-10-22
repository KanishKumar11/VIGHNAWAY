import { memo } from 'react';
import { Linking, Pressable, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';
import { formatSimClock, type Incident, type PlanResult, type RouteEvaluation, type RouteRole } from '@vighnaway/contracts';
import { SCORING_RULES } from '@vighnaway/engine';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { ConfidenceMeter } from '@/components/ConfidenceMeter';
import { EvidenceChips } from '@/components/EvidenceChips';
import { ArrowRight, Car, ChevronRight, CircleCheck, Hospital, Info, Phone, Play, Share2, TriangleAlert, X } from '@/components/icons';
import { IncidentGlyph } from '@/components/IncidentGlyph';
import { Illustration } from '@/components/Illustration';
import { enterUp, PressScale, RollingText, SkeletonBlock } from '@/components/motion';
import { RouteStrip } from '@/components/RouteStrip';
import { StatusRing } from '@/components/StatusRing';
import { t, type StringKey } from '@/i18n/en';
import { counterfactualOf, hazardWhere, incidentA11y, reasonOf, routeLabel, tradeOffOf } from '@/i18n/engineText';
import { fmtDelta, fmtDistance, fmtDuration } from '@/i18n/format';
import type { DeltaBar } from '@/lib/geometry';
import { useReduceMotion } from '@/lib/motion';
import type { ActivityEntry } from '@/stores/activity';
import type { Banner } from '@/stores/trip';
import { createStyles, fontFamily, hairline, layout, motion, radius, spacing, useColors, type ThemeColors } from '@/theme';

const roleKey: Record<RouteRole, StringKey> = { recommended: 'recommended', usual_fastest: 'usualFastest', alternative: 'alternative', blocked: 'notViable' };
const roleLabel = (r: RouteRole) => t(roleKey[r]);

/** Section heading: a quiet semibold label, an optional count, and a hairline that carries the eye. */
export function SectionLabel({ children, count }: { children: string; count?: number }) {
  const styles = useStyles();
  return (
    <View style={styles.sectionLabel}>
      <AppText variant="label" tone="muted" accessibilityRole="header">
        {children}
      </AppText>
      {count !== undefined ? (
        <AppText variant="num" tone="muted">
          {String(count)}
        </AppText>
      ) : null}
      <View style={styles.sectionRule} />
    </View>
  );
}

/** A state treatment (DESIGN_VISION 4.3): fixed background/foreground pair plus a word. */
export function StateTag({ kind, label }: { kind: 'recommended' | 'warning' | 'critical' | 'resolved'; label: string }) {
  const tc = useColors();
  const styles = useStyles();
  const pair =
    kind === 'recommended'
      ? { bg: tc.recommendedSurface, fg: tc.recommendedInk }
      : kind === 'warning'
        ? { bg: tc.warnSurface, fg: tc.warnInk }
        : kind === 'critical'
          ? { bg: tc.dangerSurface, fg: tc.dangerInk }
          : { bg: tc.positiveSoft, fg: tc.positiveInk };
  return (
    <View style={[styles.tag, { backgroundColor: pair.bg }]}>
      <AppText variant="label" style={{ color: pair.fg }}>
        {label}
      </AppText>
    </View>
  );
}

/**
 * "The changing situation" (DESIGN_VISION 3.2, 9 step 6): what changed and why, with the evidence
 * of the incident that caused it. Warning treatment for a change, critical for a danger notice.
 * It enters after the new route has drawn in, so cause and effect read in order.
 */
export function ChangeBanner({
  banner,
  incident,
  nowS = 0,
  onDetails,
  onDismiss,
}: {
  banner: Banner;
  incident?: Incident | null;
  nowS?: number;
  onDetails: () => void;
  onDismiss: () => void;
}) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const danger = banner.tone === 'danger';
  return (
    <Animated.View
      key={banner.id}
      entering={reduce ? undefined : FadeInDown.duration(motion.banner).delay(motion.routeChangeTotal * 0.55)}
      style={[styles.banner, { backgroundColor: danger ? tc.dangerSurface : tc.warnSurface }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      testID="change-banner"
    >
      <View style={styles.bannerHead}>
        <TriangleAlert size={16} color={danger ? tc.dangerInk : tc.warnInk} strokeWidth={2.25} />
        <AppText variant="label" style={[styles.flex, { color: danger ? tc.dangerInk : tc.warnInk }]} numberOfLines={1}>
          {banner.title}
        </AppText>
        <Pressable onPress={onDetails} accessibilityRole="button" style={styles.detailsButton} hitSlop={spacing.xs}>
          <AppText variant="label">{t('details')}</AppText>
          <ChevronRight size={16} color={tc.ink} />
        </Pressable>
        <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t('evidenceClose')} hitSlop={spacing.sm} style={styles.iconButton}>
          <X size={18} color={tc.inkMuted} />
        </Pressable>
      </View>
      {/* With the trigger known, the banner shows the incident and its evidence; the full engine
          sentence is what screen readers hear and what Details expands. */}
      {incident ? (
        <>
          <AppText style={styles.strong} numberOfLines={2} accessibilityLabel={banner.message} testID="change-banner-message">
            {hazardWhere(incident)}
          </AppText>
          <EvidenceChips incident={incident} nowS={nowS} dense />
        </>
      ) : (
        <AppText testID="change-banner-message">{banner.message}</AppText>
      )}
      {banner.tradeOff ? (
        <AppText variant="meta" style={{ color: danger ? tc.dangerInk : tc.warnInk }}>
          {banner.tradeOff}
        </AppText>
      ) : null}
    </Animated.View>
  );
}

/**
 * Loading and evaluating: says what is being checked, over a static skeleton shaped like the
 * decision (no indefinite progress animation, DESIGN_VISION 11).
 */
export function EvaluatingCard({ routes, incidents }: { routes: number; incidents: number }) {
  const tc = useColors();
  const styles = useStyles();
  return (
    <View style={styles.peek} accessibilityLiveRegion="polite" accessibilityLabel={t('checking', { routes, incidents })} testID="evaluating">
      <View style={styles.etaRow}>
        <SkeletonBlock width={128} height={spacing.xl + spacing.md} />
        <SkeletonBlock width={96} height={spacing.lg} round />
      </View>
      <View style={styles.scanRow}>
        <ArrowRight size={16} color={tc.accentInk} />
        <AppText variant="meta" tone="muted" style={styles.flex}>
          {t('checking', { routes, incidents })}
        </AppText>
      </View>
      <SkeletonBlock width="70%" height={spacing.md + 2} />
      <SkeletonBlock width="92%" height={spacing.sm} />
      <SkeletonBlock width="100%" height={spacing.xs} round style={styles.skeletonStrip} />
      <View style={styles.actions}>
        <SkeletonBlock width="100%" height={layout.minTouch + spacing.xxs} style={styles.flex} />
        <SkeletonBlock width={layout.minTouch + spacing.xxs} height={layout.minTouch + spacing.xxs} />
      </View>
    </View>
  );
}

interface PeekProps {
  route: RouteEvaluation;
  etaS: number;
  enRoute: boolean;
  /** The traveller picked this route instead of the recommended one. */
  chosen?: boolean;
  onStart: () => void;
  onEnd: () => void;
}

/**
 * The small decision that stays at the bottom while the map is in use: ETA, route name and the one
 * main action. Everything else (what to do now, the reason, confidence, share and drive) is in
 * PeekMore, which the sheet reveals as it is pulled up, so the map stays open by default.
 */
export const PeekCard = memo(function PeekCard({ route, etaS, enRoute, chosen, onStart, onEnd }: PeekProps) {
  const styles = useStyles();
  const eta = fmtDuration(etaS);
  const conf = route.explanation.confidence;
  const name = routeLabel(route);
  return (
    <View
      style={styles.mini}
      testID="peek-card"
      accessible
      accessibilityLabel={t('recommendationA11y', {
        name,
        eta: enRoute ? t('etaLeft', { eta }) : eta,
        confidence: t(conf === 'high' ? 'confidenceHigh' : conf === 'medium' ? 'confidenceMedium' : 'confidenceLow'),
        reason: reasonOf(route),
      })}
    >
      <View style={styles.miniText}>
        <RollingText value={enRoute ? t('etaLeft', { eta }) : eta} variant="eta" unitVariant="label" testID="peek-eta" style={styles.flexShrink} />
        <View style={styles.nameRow}>
          {/* The road distance of the recommended route: exact for the mapped roads, never a guess. */}
          <AppText variant="num" tone="muted" numberOfLines={1} style={styles.noShrink} testID="peek-distance">
            {fmtDistance(route.distanceM)}
          </AppText>
          {chosen ? (
            <AppText variant="label" tone="accent" numberOfLines={1} style={styles.noShrink} testID="peek-chosen">
              {t('yourChoice')}
            </AppText>
          ) : null}
          <AppText variant="body" tone="muted" numberOfLines={1} style={[styles.strong, styles.flexShrink]}>
            {name}
          </AppText>
        </View>
      </View>
      {enRoute ? (
        <Button label={t('endTrip')} kind="secondary" onPress={onEnd} style={styles.miniButton} testID="end-trip" />
      ) : (
        <Button label={t('startTrip')} icon={Play} onPress={onStart} style={styles.miniButton} testID="start-trip" />
      )}
    </View>
  );
});

/**
 * Shown on the corridor map (Amritsar to Ambala), which has roads only: no incident or live traffic
 * data, so the route is road distance at typical speeds. When the start or end is far from a mapped
 * road, says how far; that distance is not in the route.
 */
export function RoadsOnlyNote({ access }: { access: { fromM: number; toM: number } | null }) {
  const tc = useColors();
  const styles = useStyles();
  const far = access && (access.fromM > 500 || access.toM > 500);
  return (
    <View style={styles.roadsOnly} testID="roads-only-note" accessible>
      <Info size={18} color={tc.inkMuted} />
      <View style={styles.roadsOnlyText}>
        <AppText variant="meta" tone="muted">
          {t('roadsOnlyNote')}
        </AppText>
        {far ? (
          <AppText variant="meta" tone="muted">
            {t('accessNote', { from: fmtDistance(access.fromM), to: fmtDistance(access.toM) })}
          </AppText>
        ) : null}
      </View>
    </View>
  );
}

interface MoreProps {
  route: RouteEvaluation;
  /** Arrival on the simulation clock ("14:22"). */
  arriveClock?: string;
  /** "What to do now" (engine nextAction, localised). */
  nextStep?: string;
  /** Hide the reason line (a change banner already gives it). */
  compact?: boolean;
  onShare: () => void;
  onDrive?: () => void;
  hint: string | null;
}

/** The rest of the decision, shown from the half-open sheet: status, next step, reason, share and drive. */
export const PeekMore = memo(function PeekMore({ route, arriveClock, nextStep, compact, onShare, onDrive, hint }: MoreProps) {
  const tc = useColors();
  const styles = useStyles();
  const conf = route.explanation.confidence;
  return (
    <View style={styles.more} testID="peek-more">
      <View style={styles.moreHead}>
        <StateTag kind="recommended" label={t('recommended')} />
        <ConfidenceMeter confidence={conf} />
        <View style={styles.flex} />
        {arriveClock ? <ArriveAt clock={arriveClock} /> : null}
        <AppText variant="num" tone="muted">
          {fmtDistance(route.distanceM)}
        </AppText>
      </View>
      {nextStep ? (
        <View style={styles.next} accessible accessibilityLabel={`${t('whatToDoNow')}: ${nextStep}`} testID="what-to-do-now">
          <AppText variant="label" tone="accent">
            {t('whatToDoNow')}
          </AppText>
          <View style={styles.nextRow}>
            <ArrowRight size={18} color={tc.accentInk} strokeWidth={2.5} style={styles.nextIcon} />
            <AppText style={[styles.flex, styles.strong]}>{nextStep}</AppText>
          </View>
        </View>
      ) : null}
      {compact ? null : (
        <AppText testID="peek-reason" tone="muted" numberOfLines={3}>
          {reasonOf(route)}
        </AppText>
      )}
      {hint ? (
        <AppText variant="meta" tone="muted">
          {hint}
        </AppText>
      ) : null}
      <View style={styles.actions}>
        {onDrive ? <Button label={t('driveOpen')} accessibilityHint={t('driveOpenHint')} kind="secondary" icon={Car} onPress={onDrive} style={styles.flex} testID="open-drive" /> : null}
        <Button label={t('shareRoute')} kind="secondary" icon={Share2} iconOnly onPress={onShare} testID="share-route" />
      </View>
    </View>
  );
});

/**
 * One line in the small sheet for a route change or a danger notice, so it is never hidden while
 * the sheet is low. The full banner (cause, evidence, trade-off) is in the opened sheet.
 */
export function MiniChange({ banner, onPress, onDismiss }: { banner: Banner; onPress: () => void; onDismiss: () => void }) {
  const tc = useColors();
  const styles = useStyles();
  const danger = banner.tone === 'danger';
  const ink = danger ? tc.dangerInk : tc.warnInk;
  return (
    <View style={[styles.miniChange, { backgroundColor: danger ? tc.dangerSurface : tc.warnSurface }]} accessibilityRole="alert" accessibilityLiveRegion="polite" testID="mini-change">
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${banner.title}. ${banner.message}`} style={styles.miniChangeMain} hitSlop={spacing.xxs}>
        <TriangleAlert size={16} color={ink} strokeWidth={2.25} />
        <AppText variant="label" style={[styles.flex, { color: ink }]} numberOfLines={1}>
          {banner.title}
        </AppText>
        <AppText variant="label" style={{ color: ink }}>
          {t('details')}
        </AppText>
        <ChevronRight size={16} color={ink} />
      </Pressable>
      <Pressable onPress={onDismiss} accessibilityRole="button" accessibilityLabel={t('evidenceClose')} hitSlop={spacing.sm} style={styles.iconButton}>
        <X size={18} color={tc.inkMuted} />
      </Pressable>
    </View>
  );
}

/** "Arrive 14:22": words in Manrope, the simulation clock in the technical face (DESIGN_VISION 6). */
export function ArriveAt({ clock, tone = 'muted' }: { clock: string; tone?: 'muted' | 'onAccent' }) {
  const [before, after = ''] = t('arriveAt', { clock: '\u0000' }).split('\u0000');
  return (
    <AppText variant="meta" tone={tone}>
      {before}
      <AppText variant="mono" tone={tone}>
        {clock}
      </AppText>
      {after}
    </AppText>
  );
}

/**
 * The rest of the route decision, under the compact peek (DESIGN_VISION 8): the trade-off, the
 * route strip and the evidence on this route, as hairline rows rather than cards.
 */
export function RouteDetail({
  route,
  evidence = [],
  nowS = 0,
  travelledFraction,
  onIncidentPress,
}: {
  route: RouteEvaluation;
  evidence?: Incident[];
  nowS?: number;
  travelledFraction?: number;
  onIncidentPress?: (i: Incident) => void;
}) {
  const tc = useColors();
  const styles = useStyles();
  return (
    <View style={styles.detail} testID="route-detail">
      {tradeOffOf(route) ? (
        <AppText variant="meta" tone="muted">
          {tradeOffOf(route)}
        </AppText>
      ) : null}
      <RouteStrip route={route} travelledFraction={travelledFraction} />
      {evidence.length ? (
        <View style={styles.evidence}>
          {evidence.slice(0, 3).map((inc) => (
            <PressScale
              key={inc.id}
              haptic={null}
              scaleTo={0.985}
              onPress={() => onIncidentPress?.(inc)}
              accessibilityRole="button"
              accessibilityLabel={incidentA11y(inc, nowS)}
              style={styles.evidenceRow}
              testID="peek-evidence"
            >
              <View style={styles.glyphSmall}>
                <View style={styles.ringFill}>
                  <StatusRing status={inc.status} size={spacing.xl} strokeWidth={2} />
                </View>
                <IncidentGlyph type={inc.type} color={tc.ink} size={16} />
              </View>
              <View style={[styles.flex, styles.evidenceText]}>
                <AppText variant="meta" style={styles.strong} numberOfLines={1}>
                  {hazardWhere(inc)}
                </AppText>
                <EvidenceChips incident={inc} nowS={nowS} dense />
              </View>
              <ChevronRight size={16} color={tc.inkMuted} />
            </PressScale>
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function ArrivedCard({ placeName, onDone }: { placeName: string; onDone: () => void }) {
  const tc = useColors();
  const styles = useStyles();
  return (
    <View style={styles.arrived}>
      <CircleCheck size={28} color={tc.positiveInk} />
      <AppText variant="title" style={styles.center}>
        {t('arrivedAt', { place: placeName })}
      </AppText>
      <Button label={t('done')} onPress={onDone} style={styles.stretch} />
    </View>
  );
}

/**
 * No viable route: a calm statement, the cause, the nearest reachable place as the one action,
 * and 112 one tap away (DESIGN_VISION 11). No fabricated route.
 */
export function NoViableCard({ plan, onGoTo, cause, onDetails }: { plan: PlanResult; onGoTo: (placeId: string) => void; cause?: string; onDetails?: () => void }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const prefix = `${t('noViableTitle')}. `;
  const raw = cause ? (cause.startsWith(prefix) ? cause.slice(prefix.length) : cause).trim() : '';
  // A bare "No viable route." adds nothing under the title.
  const detail = raw.replace(/\.$/, '') === t('noViableTitle') ? '' : raw;
  return (
    <Animated.View entering={reduce ? undefined : FadeIn.duration(motion.noViableRoute)} style={styles.noViable} testID="no-viable">
      <View style={styles.noViableHead}>
        <Illustration kind="noViableRoute" size={48} accent={tc.danger} />
        <View style={styles.flex}>
          <StateTag kind="critical" label={t('notViable')} />
          <AppText variant="title" accessibilityRole="header" style={styles.noViableTitle}>
            {t('noViableTitle')}
          </AppText>
        </View>
      </View>
      <AppText tone="muted">{t('noViableBody')}</AppText>
      {detail ? (
        <Pressable onPress={onDetails} accessibilityRole="button" style={styles.cause} testID="no-viable-cause">
          <TriangleAlert size={16} color={tc.dangerInk} />
          <AppText variant="meta" tone="danger" style={styles.flex}>
            {detail}
          </AppText>
          {onDetails ? <ChevronRight size={16} color={tc.dangerInk} /> : null}
        </Pressable>
      ) : null}
      {plan.reachable ? (
        <View style={styles.reach}>
          <View style={styles.reachHead}>
            <Hospital size={18} color={tc.positiveInk} />
            <AppText style={[styles.flex, styles.strong]}>{t('nearestReachable', { place: plan.reachable.placeName, eta: fmtDuration(plan.reachable.etaS) })}</AppText>
          </View>
          <Button label={t('goTo', { place: plan.reachable.placeName })} trailingIcon={ArrowRight} onPress={() => onGoTo(plan.reachable!.placeId)} />
        </View>
      ) : null}
      <Button label={t('driveCall')} kind="secondary" icon={Phone} onPress={() => void Linking.openURL('tel:112')} testID="call-112" />
      <AppText variant="meta" tone="danger" style={styles.center}>
        {t('emergencyFooter')}
      </AppText>
    </Animated.View>
  );
}

const barColor = (tc: ThemeColors, role: RouteRole) => (role === 'recommended' ? tc.routeRecommended : tc.routeMuted);

/** One route in the comparison: a row, not a card. Role, name, ETA, a delta bar, the reason. */
export const RouteRow = memo(function RouteRow({
  route,
  bar,
  index,
  strip,
  selected,
  onSelect,
}: {
  route: RouteEvaluation;
  bar: DeltaBar | undefined;
  index: number;
  strip?: boolean;
  /** This is the route the trip will follow (default: the recommended one). */
  selected?: boolean;
  /** Tapping the card chooses this route. Absent = the card is read-only. */
  onSelect?: () => void;
}) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const blocked = route.role === 'blocked';
  const rec = route.role === 'recommended';
  const name = routeLabel(route);
  const whyNot = counterfactualOf(route);
  return (
    <Animated.View entering={enterUp(index, reduce)}>
    <PressScale
      onPress={onSelect}
      disabled={!onSelect}
      haptic="selection"
      scaleTo={0.99}
      style={[styles.row, (selected ?? rec) && styles.rowRecommended, blocked && styles.rowBlocked]}
      accessible
      accessibilityRole={onSelect ? 'button' : undefined}
      accessibilityState={onSelect ? { selected: !!(selected ?? rec) } : undefined}
      testID={`route-row-${index}`}
      accessibilityLabel={`${t('routeA11y', { role: roleLabel(route.role), name, eta: fmtDuration(route.etaS) })}. ${reasonOf(route)}${whyNot ? `. ${t('whyNot')} ${whyNot}` : ''}`}
    >
      <View style={styles.rowHead}>
        <View style={[styles.flex, styles.rowTitle]}>
          {rec ? (
            <StateTag kind="recommended" label={roleLabel(route.role)} />
          ) : blocked ? (
            <StateTag kind="critical" label={roleLabel(route.role)} />
          ) : (
            <AppText variant="label" tone="muted">
              {roleLabel(route.role)}
            </AppText>
          )}
          {selected && !rec ? (
            <AppText variant="label" tone="accent" testID="row-chosen">
              {t('yourChoice')}
            </AppText>
          ) : null}
          <AppText variant="body" style={styles.strong} numberOfLines={2}>
            {name}
          </AppText>
        </View>
        <AppText variant="figure" tone={blocked ? 'muted' : 'ink'} style={blocked && styles.struck}>
          {fmtDuration(route.etaS)}
        </AppText>
      </View>
      {bar ? (
        <View style={styles.barRow}>
          <View style={styles.barTrack}>
            {blocked ? (
              <View style={[styles.barFill, styles.barBlocked, { width: `${(bar.base + bar.extra) * 100}%` }]} />
            ) : (
              <>
                <View style={[styles.barFill, { width: `${bar.base * 100}%`, backgroundColor: barColor(tc, route.role) }]} />
                {bar.extra > 0 ? <View style={[styles.barExtra, { left: `${bar.base * 100}%`, width: `${bar.extra * 100}%` }]} /> : null}
              </>
            )}
          </View>
          <AppText variant="num" tone="muted" style={styles.delta}>
            {blocked ? '' : bar.label}
          </AppText>
        </View>
      ) : null}
      <AppText variant="meta" tone="muted" numberOfLines={2}>
        {reasonOf(route)}
      </AppText>
      {whyNot ? (
        <AppText variant="meta" tone="muted" numberOfLines={3} testID="why-not">
          <AppText variant="meta" style={styles.whyNotLabel}>
            {t('whyNot')}{' '}
          </AppText>
          {whyNot}
        </AppText>
      ) : null}
      {strip ? <RouteStrip route={route} /> : null}
    </PressScale>
    </Animated.View>
  );
});

/** Shown while the traveller's chosen route is not the recommended one: what it costs, and a way back. */
export function ChoiceNote({ route, recommended, onReset }: { route: RouteEvaluation; recommended: RouteEvaluation; onReset: () => void }) {
  const styles = useStyles();
  return (
    <View style={styles.choiceNote} testID="choice-note">
      <AppText variant="meta" tone="muted" style={styles.flex}>
        {t('choiceVsRecommended', { delta: fmtDelta(route.etaS - recommended.etaS) })}
      </AppText>
      <Button label={t('useRecommended')} kind="secondary" onPress={onReset} testID="use-recommended" />
    </View>
  );
}

/** One incident in the evidence list; opens the evidence sheet. */
export function IncidentRow({ incident, nowS, onPress, index = 0 }: { incident: Incident; nowS: number; onPress: (i: Incident) => void; index?: number }) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const closed = incident.status === 'resolved' || incident.status === 'dismissed';
  return (
    <Animated.View entering={enterUp(index, reduce)}>
      <PressScale
        haptic={null}
        scaleTo={0.985}
        onPress={() => onPress(incident)}
        accessibilityRole="button"
        accessibilityLabel={incidentA11y(incident, nowS)}
        style={[styles.incidentRow, index > 0 && styles.rowDivider]}
      >
        <View style={styles.glyphRing}>
          <View style={styles.ringFill}>
            <StatusRing status={incident.status} size={spacing.xl + spacing.sm} strokeWidth={2} />
          </View>
          <IncidentGlyph type={incident.type} color={closed ? tc.resolved : tc.ink} size={20} />
        </View>
        <View style={[styles.flex, styles.incidentText]}>
          <AppText variant="body" style={styles.strong}>
            {hazardWhere(incident)}
          </AppText>
          <EvidenceChips incident={incident} nowS={nowS} />
        </View>
        <ChevronRight size={20} color={tc.inkMuted} />
      </PressScale>
    </Animated.View>
  );
}

/** No incidents: states what the dataset holds, never that roads are clear (DESIGN_VISION 11). */
export function EmptyEvidence() {
  const styles = useStyles();
  return (
    <View style={styles.empty}>
      <Illustration kind="noIncidents" size={40} />
      <AppText tone="muted" style={styles.flex}>
        {t('noHazardsOnRoute')}
      </AppText>
    </View>
  );
}

/** Recent activity as a small timeline: simulation clock (technical, mono), dot, line. */
export function ActivityRows({ entries, clockStartsAt }: { entries: ActivityEntry[]; clockStartsAt: string }) {
  const styles = useStyles();
  const reduce = useReduceMotion();
  if (!entries.length) {
    return (
      <AppText tone="muted" style={styles.paddedText}>
        {t('activityEmpty')}
      </AppText>
    );
  }
  return (
    <View>
      {entries.map((e, i) => (
        <Animated.View key={e.id} entering={enterUp(i, reduce)} style={styles.activityRow}>
          <AppText variant="mono" tone="muted" style={styles.clock}>
            {formatSimClock(clockStartsAt, e.atS)}
          </AppText>
          <View style={styles.timeline}>
            <View style={[styles.timelineDot, (e.kind === 'route_changed' || e.kind === 'warning' || e.kind === 'no_viable_route') && styles.timelineDotWarn]} />
            {i < entries.length - 1 ? <View style={styles.timelineLine} /> : null}
          </View>
          <AppText variant="meta" style={[styles.flex, styles.activityText]}>
            {e.text}
          </AppText>
        </Animated.View>
      ))}
    </View>
  );
}

export const maxDisplayedRoutes = SCORING_RULES.candidates.value.maxDisplayed;

const useStyles = createStyles((tc) => ({
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  center: { textAlign: 'center' },
  strong: { fontFamily: fontFamily.semibold },
  whyNotLabel: { fontFamily: fontFamily.semibold },
  stretch: { alignSelf: 'stretch' },
  sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  sectionRule: { flex: 1, height: hairline, backgroundColor: tc.panelHairline },
  tag: { alignSelf: 'flex-start', paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.chip },
  banner: { borderRadius: radius.card, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs, marginBottom: spacing.sm },
  bannerHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: spacing.xl },
  iconButton: { minWidth: spacing.lg, alignItems: 'flex-end', marginLeft: spacing.xxs },
  detailsButton: { flexDirection: 'row', alignItems: 'center', gap: 2, minHeight: spacing.xl, paddingLeft: spacing.xs },
  peek: { gap: spacing.sm },
  mini: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  miniText: { flex: 1, minWidth: 0, gap: 0 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minWidth: 0 },
  noShrink: { flexShrink: 0 },
  roadsOnly: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.card, backgroundColor: tc.panelSunken },
  roadsOnlyText: { flex: 1, gap: spacing.xxs },
  miniButton: { flexShrink: 0, paddingHorizontal: spacing.md },
  miniChange: { flexDirection: 'row', alignItems: 'center', borderRadius: radius.card, paddingLeft: spacing.sm, paddingRight: spacing.xs, minHeight: layout.minTouch - spacing.xs },
  miniChangeMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: layout.minTouch - spacing.xs },
  more: { gap: spacing.sm, paddingTop: spacing.xs },
  moreHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.xs },
  etaRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  statusCol: { alignItems: 'flex-end', gap: spacing.xs, paddingTop: spacing.xs },
  titleBlock: { gap: 2, marginTop: -spacing.xxs },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: spacing.md },
  nextRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
  nextIcon: { marginTop: 2 },
  next: { gap: 2 },
  detail: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, backgroundColor: tc.panelRaised, borderWidth: hairline, borderColor: tc.panelHairline },
  scanRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  skeletonStrip: { marginVertical: spacing.xs },
  evidence: { borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  evidenceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  evidenceText: { gap: spacing.xxs },
  glyphSmall: { width: spacing.xl, height: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  ringFill: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 },
  actions: { flexDirection: 'row', gap: spacing.xs, alignItems: 'center', marginTop: spacing.xxs },
  arrived: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  noViable: { gap: spacing.md, paddingTop: spacing.xs },
  noViableHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  noViableTitle: { marginTop: spacing.xxs },
  cause: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xs, borderTopWidth: hairline, borderBottomWidth: hairline, borderColor: tc.panelHairline },
  reach: { gap: spacing.sm },
  reachHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  // Each route is a card: same padding, one head line (role and name left, ETA right), the delta bar, the reason.
  row: { gap: spacing.sm, padding: spacing.md, borderRadius: radius.card, backgroundColor: tc.panelRaised, borderWidth: hairline, borderColor: tc.panelHairline },
  rowDivider: { borderTopWidth: hairline, borderTopColor: tc.panelHairline },
  rowRecommended: { borderColor: tc.routeRecommended, borderWidth: 1.5 },
  choiceNote: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.card, backgroundColor: tc.panelSunken },
  rowBlocked: { borderColor: tc.danger, borderStyle: 'dashed' },
  rowHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
  rowTitle: { gap: spacing.xxs },
  struck: { textDecorationLine: 'line-through' },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  barTrack: { flex: 1, height: spacing.xs - 2, borderRadius: radius.chip, backgroundColor: tc.panelSunken, overflow: 'hidden' },
  barFill: { position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: radius.chip },
  barExtra: { position: 'absolute', top: 0, bottom: 0, backgroundColor: tc.routeMuted, opacity: 0.4 },
  barBlocked: { backgroundColor: tc.dangerSoft, borderWidth: hairline, borderColor: tc.danger, borderStyle: 'dashed' },
  delta: { minWidth: spacing.xl * 2, textAlign: 'right' },
  incidentRow: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', paddingVertical: spacing.sm },
  glyphRing: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, alignItems: 'center', justifyContent: 'center' },
  incidentText: { gap: spacing.xxs },
  empty: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  activityRow: { flexDirection: 'row', gap: spacing.sm, minHeight: spacing.xl + spacing.xs },
  clock: { minWidth: spacing.xl + spacing.md, paddingTop: 1 },
  timeline: { width: spacing.sm, alignItems: 'center' },
  timelineDot: { width: spacing.xs, height: spacing.xs, borderRadius: radius.chip, backgroundColor: tc.inkSubtle, marginTop: spacing.xxs + 1 },
  timelineDotWarn: { backgroundColor: tc.warn },
  timelineLine: { flex: 1, width: hairline * 2, backgroundColor: tc.panelLine, marginVertical: 2 },
  activityText: { paddingBottom: spacing.sm },
  paddedText: { paddingVertical: spacing.sm },
}));
