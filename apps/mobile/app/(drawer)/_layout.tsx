import { formatSimClock } from '@vighnaway/contracts';
import { Redirect } from 'expo-router';
import { Drawer, DrawerContentScrollView, type DrawerContentComponentProps } from 'expo-router/drawer';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ModeBadge } from '@/components/EvidenceChips';
import { Activity, BookOpen, Bug, ChevronRight, Navigation, Settings, UserRound, type LucideIcon } from '@/components/icons';
import { Mark } from '@/components/Mark';
import { PressScale } from '@/components/motion';
import { appVersion } from '@/config/env';
import { t, type StringKey } from '@/i18n/en';
import { connectionMode, useConnection } from '@/stores/connection';
import { useIncidents } from '@/stores/incidents';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { createStyles, fontFamily, hairline, layout, letterSpacing, radius, shadow, spacing, useColors } from '@/theme';

const ITEMS: { name: string; label: StringKey; icon: LucideIcon }[] = [
  { name: 'index', label: 'drawerNavigate', icon: Navigation },
  { name: 'activity', label: 'drawerActivity', icon: Activity },
  { name: 'account', label: 'drawerAccount', icon: UserRound },
  { name: 'settings', label: 'drawerSettings', icon: Settings },
  { name: 'how-it-decides', label: 'drawerHowItDecides', icon: BookOpen },
];

function DrawerContent(props: DrawerContentComponentProps) {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const debugUnlocked = useSettings((s) => s.debugUnlocked);
  const mode = useConnection((s) => connectionMode(s.net, s.socket));
  const cachedAtSimS = useIncidents((s) => s.cachedAtSimS);
  const clockStartsAt = useScenario((s) => s.scenario.clockStartsAt);
  const current = props.state.routes[props.state.index]?.name;
  const items = debugUnlocked ? [...ITEMS, { name: 'debug', label: 'drawerDebug' as const, icon: Bug }] : ITEMS;
  const live = mode === 'live';
  const dataStatus = live
    ? t('drawerFooterLive')
    : cachedAtSimS !== null
      ? t('drawerFooterCached', { clock: formatSimClock(clockStartsAt, cachedAtSimS) })
      : t('drawerFooterNoData');
  return (
    <View style={styles.drawer}>
      <DrawerContentScrollView {...props} contentContainerStyle={styles.scroll}>
        {/* Brand hero: the one place the accent fills a surface, so the app has a recognisable face. */}
        <View style={[styles.hero, shadow('md')]}>
          <View style={styles.markTile}>
            <Mark size={30} />
          </View>
          <View style={styles.brandText}>
            <AppText tone="onAccent" style={styles.wordmark}>
              {t('appName')}
            </AppText>
            <AppText variant="meta" tone="onAccent" style={styles.tagline} numberOfLines={2}>
              {t('drawerTagline')}
            </AppText>
          </View>
        </View>
        <ModeBadge onShell={false} style={styles.badge} />
        <View style={styles.items}>
          {items.map((it) => {
            const focused = current === it.name;
            const Icon = it.icon;
            return (
              <PressScale
                key={it.name}
                haptic="selection"
                scaleTo={0.98}
                onPress={() => props.navigation.navigate(it.name)}
                accessibilityRole="button"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={t(it.label)}
                style={[styles.item, focused && styles.itemFocused]}
              >
                <View style={[styles.iconTile, focused && styles.iconTileFocused]}>
                  <Icon size={18} color={focused ? tc.onAccent : tc.ink} strokeWidth={2.25} />
                </View>
                <AppText style={[styles.label, focused && styles.labelFocused]}>{t(it.label)}</AppText>
                <ChevronRight size={16} color={focused ? tc.accentInk : tc.inkSubtle} />
              </PressScale>
            );
          })}
        </View>
      </DrawerContentScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.statusCard}>
          <View style={[styles.dot, !live && styles.dotIdle]} />
          <AppText variant="meta" style={styles.flex}>
            {dataStatus}
          </AppText>
        </View>
        <AppText variant="label" tone="muted" style={styles.version}>
          {t('drawerFooterVersion', { version: appVersion })}
        </AppText>
      </View>
    </View>
  );
}

export default function DrawerLayout() {
  const tc = useColors();
  const firstRunDone = useSettings((s) => s.firstRunDone);
  const { width } = useWindowDimensions();
  if (!firstRunDone) return <Redirect href="/first-run" />;
  return (
    <Drawer
      drawerContent={(p) => <DrawerContent {...p} />}
      screenOptions={{
        drawerType: 'front',
        drawerStyle: { width: Math.min(layout.drawerMaxWidth, width * layout.drawerWidthRatio), backgroundColor: tc.shell },
        overlayColor: tc.scrim,
        keyboardDismissMode: 'on-drag',
        // Every screen draws its own large-title header (components/ui ScreenHeader).
        headerShown: false,
        sceneStyle: { backgroundColor: tc.shell },
      }}
    >
      <Drawer.Screen name="index" options={{ swipeEnabled: false, title: t('drawerNavigate') }} />
      <Drawer.Screen name="activity" options={{ title: t('drawerActivity') }} />
      <Drawer.Screen name="account" options={{ title: t('drawerAccount') }} />
      <Drawer.Screen name="settings" options={{ title: t('drawerSettings') }} />
      <Drawer.Screen name="how-it-decides" options={{ title: t('drawerHowItDecides') }} />
      <Drawer.Screen name="debug" options={{ title: t('drawerDebug') }} />
    </Drawer>
  );
}

const TILE = spacing.xl + spacing.xxs;

const useStyles = createStyles((tc) => ({
  drawer: { flex: 1, backgroundColor: tc.shell },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.md },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.md, borderRadius: radius.sheet, backgroundColor: tc.accent },
  markTile: { width: TILE + spacing.xs, height: TILE + spacing.xs, borderRadius: radius.card, backgroundColor: tc.panel, alignItems: 'center', justifyContent: 'center' },
  brandText: { flex: 1, gap: 2 },
  wordmark: { fontFamily: fontFamily.bold, letterSpacing: letterSpacing.wordmark },
  tagline: { opacity: 0.9 },
  badge: { alignSelf: 'flex-start', marginLeft: spacing.xxs },
  items: { gap: spacing.xxs, padding: spacing.xs, borderRadius: radius.sheet, backgroundColor: tc.panel, borderWidth: hairline, borderColor: tc.panelHairline },
  item: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: layout.minTouch + spacing.xs, paddingHorizontal: spacing.xs, borderRadius: radius.card },
  itemFocused: { backgroundColor: tc.tealSoft },
  iconTile: { width: TILE, height: TILE, borderRadius: radius.button - 2, backgroundColor: tc.panelSunken, alignItems: 'center', justifyContent: 'center' },
  iconTileFocused: { backgroundColor: tc.accent },
  label: { flex: 1, fontFamily: fontFamily.medium, color: tc.ink },
  labelFocused: { fontFamily: fontFamily.bold, color: tc.accentInk },
  footer: { paddingHorizontal: spacing.md, paddingTop: spacing.sm, gap: spacing.xs },
  statusCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, padding: spacing.sm, borderRadius: radius.card, backgroundColor: tc.panel, borderWidth: hairline, borderColor: tc.panelHairline },
  dot: { width: spacing.xs + 2, height: spacing.xs + 2, borderRadius: radius.chip, backgroundColor: tc.positive },
  dotIdle: { backgroundColor: tc.warn },
  version: { paddingHorizontal: spacing.xxs },
}));
