import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FEED_PROVIDER_LABEL, PROFILES, type Profile } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import { ModeBadge } from '@/components/EvidenceChips';
import { Bike, Car, ChevronDown, Clock, Footprints, MapIcon, Menu, Radio, Search, ServerOff, WifiOff, type LucideIcon } from '@/components/icons';
import { easing, PressScale } from '@/components/motion';
import { Segmented } from '@/components/Segmented';
import { t, type StringKey } from '@/i18n/en';
import { useReduceMotion } from '@/lib/motion';
import { connectionMode, useConnection } from '@/stores/connection';
import { useFeed } from '@/stores/feed';
import { useIncidents } from '@/stores/incidents';
import { placeById, useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useSim } from '@/stores/sim';
import { useTrip } from '@/stores/trip';
import { useUi } from '@/stores/ui';
import { createStyles, fontFamily, hairline, layout, motion, radius, shadow, spacing, useTheme } from '@/theme';
import { statusPill, type StatusKind, type StatusPill } from './statusModel';

const PROFILE_META: Record<Profile, { label: StringKey; icon: LucideIcon }> = {
  car: { label: 'profileCar', icon: Car },
  two_wheeler: { label: 'profileTwoWheeler', icon: Bike },
  foot: { label: 'profileFoot', icon: Footprints },
};

const STATUS_ICON: Partial<Record<StatusKind, LucideIcon>> = {
  offline: WifiOff,
  unreachable: ServerOff,
  localClock: Clock,
  map: MapIcon,
  fixture: Clock,
  liveMissing: ServerOff,
  feed: Radio,
  feedOff: Radio,
};

/** Compact status pill: one icon and one or two words; tap to expand the full notices. */
function StatusButton({ pill, expanded, onToggle }: { pill: StatusPill; expanded: boolean; onToggle: () => void }) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  const Icon = STATUS_ICON[pill.kind];
  const warn = pill.tone === 'warn';
  const interactive = pill.notices.length > 0;
  return (
    <PressScale
      haptic={interactive ? 'selection' : null}
      onPress={interactive ? onToggle : undefined}
      disabled={!interactive}
      accessibilityRole={interactive ? 'button' : 'text'}
      accessibilityLabel={pill.a11y}
      accessibilityHint={interactive ? t('statusHint') : undefined}
      accessibilityState={interactive ? { expanded } : undefined}
      hitSlop={spacing.xxs}
      testID="status-pill"
      style={[styles.pill, warn ? styles.pillWarn : styles.pillCalm]}
    >
      {Icon ? (
        <Icon size={14} color={warn ? tc.warnInk : pill.tone === 'ok' ? tc.accentInk : tc.inkOnShellMuted} strokeWidth={2.25} />
      ) : (
        <View style={styles.liveDotWrap}>
          <View style={[styles.liveDot, pill.kind !== 'live' && styles.liveDotIdle]} />
        </View>
      )}
      <AppText variant="label" style={{ color: warn ? tc.warnInk : tc.inkOnShell }} numberOfLines={1}>
        {pill.short}
      </AppText>
      {pill.more ? (
        <AppText variant="label" tone="onShellMuted">
          {pill.more}
        </AppText>
      ) : null}
      {interactive ? <ChevronDown size={14} color={warn ? tc.warnInk : tc.inkOnShellMuted} style={expanded ? styles.flip : undefined} /> : null}
    </PressScale>
  );
}

/**
 * The one floating bar over the map (DESIGN.md 11.5): menu, destination (with the small
 * Simulated badge), a compact status pill that merges connection and map-fallback state, and the
 * single-row profile control with a sliding indicator underneath.
 */
export function TopBar({ onOpenDrawer, onOpenDestinations, onLayout }: { onOpenDrawer: () => void; onOpenDestinations: () => void; onLayout: (bottom: number) => void }) {
  const { colors: tc } = useTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const reduce = useReduceMotion();
  const profile = useSettings((s) => s.profile);
  const fixture = useSettings((s) => s.fixtureMode !== null);
  const apiUrl = useSettings((s) => s.apiUrl);
  const scenario = useScenario((s) => s.scenario);
  const destinationId = useTrip((s) => s.destinationId);
  const mode = useConnection((s) => connectionMode(s.net, s.socket));
  const cachedAtSimS = useIncidents((s) => s.cachedAtSimS);
  const cachedAtWallMs = useIncidents((s) => s.cachedAtWallMs);
  const localClock = useSim((s) => s.clockSource === 'local');
  const mapUnavailable = useUi((s) => s.mapStatus === 'unavailable');
  const liveMode = useSettings((s) => s.dataMode === 'live');
  const feed = useFeed();
  const simTimeS = useSim((s) => s.simTimeS);
  const dest = placeById(scenario, destinationId);
  const [expanded, setExpanded] = useState(false);
  // The status pill sits on its own line under the profile control; its notices open just below it.
  const [statusBottom, setStatusBottom] = useState(BAR_H * 2 + spacing.sm);
  // Re-render the "(6 min old)" age twice a minute.
  const [nowWallMs, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const pill = statusPill({
    mode,
    apiUrl,
    cachedAtSimS,
    cachedAtWallMs,
    clockStartsAt: scenario.clockStartsAt,
    localClock,
    fixture,
    nowWallMs,
    mapUnavailable,
    live: liveMode
      ? {
          scenarioMissing: feed.scenarioMissing,
          feed: {
            availability: feed.availability,
            enabled: !!feed.status?.enabled,
            provider: feed.status ? FEED_PROVIDER_LABEL[feed.status.provider] : FEED_PROVIDER_LABEL.tomtom,
            updatedAgoS: feed.status?.lastSuccessAtS != null ? Math.max(0, simTimeS - feed.status.lastSuccessAtS) : null,
            reason: feed.status?.enabled ? null : (feed.status?.reason ?? null),
          },
        }
      : undefined,
  });
  const showPanel = expanded && pill.notices.length > 0;
  const top = insets.top + layout.searchCardOffset;

  return (
    <View
      style={[styles.wrap, { top, left: insets.left + spacing.md, right: insets.right + spacing.md }]}
      onLayout={(e) => onLayout(e.nativeEvent.layout.height + top)}
      pointerEvents="box-none"
    >
      <View style={[styles.bar, shadow('lg')]}>
        <PressScale onPress={onOpenDrawer} haptic={null} style={styles.menu} accessibilityRole="button" accessibilityLabel={t('drawerOpen')} testID="open-drawer">
          <Menu size={22} color={tc.inkOnShell} />
        </PressScale>
        <View style={styles.divider} />
        <PressScale
          haptic={null}
          scaleTo={0.985}
          onPress={onOpenDestinations}
          style={styles.dest}
          accessibilityRole="button"
          accessibilityLabel={t('searchLabel', { place: dest?.name ?? '' })}
          accessibilityHint={t('searchHint')}
        >
          <View style={styles.destText}>
            <View style={styles.destHead}>
              <AppText variant="label" tone="onShellMuted">
                {t('destinationEyebrow')}
              </AppText>
              <ModeBadge compact />
            </View>
            <AppText variant="body" tone="onShell" numberOfLines={1} style={styles.destName}>
              {dest?.name ?? t('searchPlaceholder')}
            </AppText>
          </View>
          <View style={styles.searchBadge} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            <Search size={18} color={tc.accentInk} strokeWidth={2.4} />
          </View>
        </PressScale>
      </View>
      <Segmented
        variant="shell"
        dense
        accessibilityLabel={t('profileGroupLabel')}
        value={profile}
        onChange={(p) => useSettings.getState().setProfile(p)}
        options={PROFILES.map((p) => ({ value: p, label: t(PROFILE_META[p].label), icon: PROFILE_META[p].icon, testID: `profile-${p}` }))}
        style={shadow('md')}
      />
      <View
        style={styles.statusRow}
        pointerEvents="box-none"
        onLayout={(e) => setStatusBottom(e.nativeEvent.layout.y + e.nativeEvent.layout.height)}
      >
        <StatusButton pill={pill} expanded={showPanel} onToggle={() => setExpanded((v) => !v)} />
      </View>
      {showPanel ? (
        <Animated.View
          entering={reduce ? undefined : FadeInDown.duration(motion.banner).easing(easing)}
          exiting={reduce ? undefined : FadeOutUp.duration(motion.banner - 100)}
          style={[styles.panel, { top: statusBottom + spacing.xs }, shadow('lg')]}
          accessibilityLiveRegion="polite"
          testID="connection-bar"
        >
          {pill.notices.map((n) => {
            const Icon = STATUS_ICON[n.key] ?? Clock;
            return (
              <View key={n.key} style={styles.notice}>
                <View style={[styles.noticeIcon, n.tone === 'ok' ? styles.noticeIconOk : n.tone === 'neutral' ? styles.noticeIconNeutral : null]}>
                  <Icon size={16} color={n.tone === 'warn' ? tc.warnInk : n.tone === 'ok' ? tc.accentInk : tc.inkOnShellMuted} />
                </View>
                <View style={styles.flex}>
                  <AppText variant="meta" tone="onShell">
                    {n.text}
                  </AppText>
                  {n.sub ? (
                    <AppText variant="meta" tone="onShellMuted">
                      {n.sub}
                    </AppText>
                  ) : null}
                </View>
              </View>
            );
          })}
          <Pressable onPress={() => setExpanded(false)} style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no" />
        </Animated.View>
      ) : null}
    </View>
  );
}

const BAR_H = layout.minTouch + spacing.xs;

const useStyles = createStyles((tc) => ({
  wrap: { position: 'absolute', gap: spacing.xs },
  flex: { flex: 1 },
  // The bar grows with the phone's text size instead of clipping: every row is centred on one axis.
  bar: {
    minHeight: BAR_H,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.card + 2,
    backgroundColor: tc.shellOverlay,
    borderWidth: hairline,
    borderColor: tc.shellHairlineStrong,
    paddingHorizontal: spacing.xxs,
    paddingVertical: spacing.xxs,
    gap: spacing.xxs,
  },
  menu: { width: layout.minTouch, height: layout.minTouch, alignItems: 'center', justifyContent: 'center', borderRadius: radius.button },
  divider: { width: hairline, alignSelf: 'stretch', marginVertical: spacing.xs, backgroundColor: tc.shellHairlineStrong },
  dest: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xs, paddingVertical: spacing.xxs, minHeight: layout.minTouch },
  destText: { flex: 1, minWidth: 0, justifyContent: 'center', gap: 2 },
  searchBadge: { width: spacing.xl + spacing.xxs, height: spacing.xl + spacing.xxs, borderRadius: radius.button, backgroundColor: tc.tealSoft, alignItems: 'center', justifyContent: 'center' },
  statusRow: { flexDirection: 'row', alignItems: 'center' },
  // "To" and the mode badge share one centred line, so the eyebrow never sits above or below the badge text.
  destHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, minHeight: spacing.md + spacing.xxs, overflow: 'hidden' },
  destName: { fontFamily: fontFamily.semibold },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs + 2,
    minHeight: spacing.xl,
    paddingHorizontal: spacing.sm - 2,
    borderRadius: radius.chip,
    borderWidth: hairline,
  },
  pillCalm: { backgroundColor: tc.shellRaised, borderColor: tc.shellHairline },
  pillWarn: { backgroundColor: tc.warnSurface, borderColor: tc.warnSoft },
  flip: { transform: [{ rotate: '180deg' }] },
  liveDotWrap: { width: spacing.xs, height: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  liveDot: { width: spacing.xs, height: spacing.xs, borderRadius: radius.chip, backgroundColor: tc.routeRecommended },
  liveDotIdle: { backgroundColor: tc.inkOnShellMuted },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    padding: spacing.sm,
    gap: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: tc.shellOverlay,
    borderWidth: hairline,
    borderColor: tc.shellHairlineStrong,
  },
  notice: { flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' },
  noticeIcon: {
    width: spacing.xl - spacing.xxs,
    height: spacing.xl - spacing.xxs,
    borderRadius: radius.button - 2,
    backgroundColor: tc.warnSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noticeIconOk: { backgroundColor: tc.tealSoft },
  noticeIconNeutral: { backgroundColor: tc.shellRaised },
}));
