import { View, type StyleProp, type ViewStyle } from 'react-native';
import type { Incident } from '@vighnaway/contracts';
import { isStale } from '@vighnaway/engine';
import { t } from '@/i18n/en';
import { sourceText, statusText } from '@/i18n/engineText';
import { fmtAge } from '@/i18n/format';
import { useSettings } from '@/stores/settings';
import { createStyles, fontFamily, hairline, radius, spacing, statusChip, useColors } from '@/theme';
import { AppText } from './AppText';
import { Clock, Radio, Split } from './icons';
import { StatusRing } from './StatusRing';

/** Status (with ring), source, age, and Stale / Conflicting when they apply. Never colour alone. */
export function EvidenceChips({ incident, nowS, onShell, dense }: { incident: Incident; nowS: number; onShell?: boolean; dense?: boolean }) {
  const tc = useColors();
  const styles = useStyles();
  const ageS = Math.max(0, nowS - incident.lastReportAtS);
  const stale = isStale(ageS);
  const chip = [styles.chip, dense && styles.chipDense, onShell ? styles.chipShell : styles.chipPanel];
  const tone = onShell ? 'onShell' : 'ink';
  const muted = onShell ? 'onShellMuted' : 'muted';
  // State treatments (DESIGN_VISION 4.3): Unverified and Corroborated share the warning pair and
  // differ by ring style and label; Verified is critical; Resolved is the resolved pair.
  const status = statusChip(tc, incident.status);
  const feed = incident.source === 'live_feed';
  return (
    <View style={styles.row} accessibilityRole="text">
      <View style={[styles.chip, dense && styles.chipDense, { backgroundColor: status.bg }]}>
        <StatusRing status={incident.status} />
        <AppText variant="meta" style={[styles.strong, { color: status.fg }]}>
          {statusText(incident)}
        </AppText>
      </View>
      <View style={feed ? [styles.chip, dense && styles.chipDense, styles.live] : chip}>
        <Radio size={13} color={feed ? tc.liveInk : onShell ? tc.inkOnShellMuted : tc.inkMuted} />
        <AppText variant="meta" tone={feed ? 'live' : tone}>
          {sourceText(incident)}
        </AppText>
      </View>
      <View style={chip}>
        <Clock size={13} color={onShell ? tc.inkOnShellMuted : tc.inkMuted} />
        <AppText variant="num" tone={muted}>
          {fmtAge(ageS)}
        </AppText>
      </View>
      {stale ? (
        <View style={[styles.chip, styles.warn]}>
          <Clock size={13} color={tc.warnInk} />
          <AppText variant="meta" tone="warn">
            {t('stale')}
          </AppText>
        </View>
      ) : null}
      {incident.conflicting ? (
        <View style={[styles.chip, styles.warn]}>
          <Split size={13} color={tc.warnInk} />
          <AppText variant="meta" tone="warn">
            {t('conflicting')}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/** The Simulated label: a dashed neutral tag. `compact` for the map header. */
export function SimulatedBadge({ onShell = true, compact, style }: { onShell?: boolean; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <View
      style={[styles.badge, compact && styles.badgeCompact, onShell ? styles.badgeShell : styles.badgePanel, style]}
      accessibilityLabel={t('simulatedScenario')}
      accessibilityRole="text"
    >
      <AppText variant="label" tone={onShell ? 'onShellMuted' : 'muted'} style={compact ? styles.badgeTextCompact : undefined}>
        {t('simulated')}
      </AppText>
    </View>
  );
}

/** Live data label: a neutral solid tag with a dot. Never shown in simulated mode. */
export function LiveBadge({ onShell = true, compact, style }: { onShell?: boolean; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const styles = useStyles();
  return (
    <View
      style={[styles.badge, styles.badgeLive, compact && styles.badgeCompact, onShell ? styles.badgeLiveShell : styles.badgeLivePanel, style]}
      accessibilityLabel={t('liveDataScenario')}
      accessibilityRole="text"
    >
      <View style={styles.liveDot} />
      <AppText variant="label" tone="live" style={compact ? styles.badgeTextCompact : undefined}>
        {t('liveData')}
      </AppText>
    </View>
  );
}

/** The data-mode label for headers: Simulated (dashed) in the demo, Live data in live mode. */
export function ModeBadge(props: { onShell?: boolean; compact?: boolean; style?: StyleProp<ViewStyle> }) {
  const live = useSettings((s) => s.dataMode === 'live');
  return live ? <LiveBadge {...props} /> : <SimulatedBadge {...props} />;
}

const useStyles = createStyles((tc) => ({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xxs + 2 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs + 1,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.chip,
  },
  chipDense: { paddingHorizontal: spacing.xxs + 2 },
  chipPanel: { backgroundColor: tc.panelSunken },
  chipShell: { backgroundColor: tc.shellRaised, borderWidth: hairline, borderColor: tc.shellHairline },
  warn: { backgroundColor: tc.warnSurface },
  live: { backgroundColor: tc.liveSurface },
  strong: { fontFamily: fontFamily.semibold },
  badge: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.chip,
    borderWidth: hairline,
    borderStyle: 'dashed',
  },
  badgeCompact: { paddingHorizontal: spacing.xxs + 2, paddingVertical: 0 },
  badgeTextCompact: { lineHeight: spacing.md - 1 },
  // Both neutral (DESIGN_VISION appendix A); Simulated is dashed, Live data solid with a dot.
  badgeShell: { borderColor: tc.inkSubtle },
  badgeLive: { borderStyle: 'solid', flexDirection: 'row', alignItems: 'center', gap: spacing.xxs + 1 },
  badgeLiveShell: { borderColor: tc.live, backgroundColor: tc.liveSurface },
  badgeLivePanel: { borderColor: tc.live, backgroundColor: tc.liveSurface },
  liveDot: { width: spacing.xxs + 2, height: spacing.xxs + 2, borderRadius: radius.chip, backgroundColor: tc.live },
  badgePanel: { backgroundColor: tc.panelSunken, borderColor: tc.inkSubtle },
}));
