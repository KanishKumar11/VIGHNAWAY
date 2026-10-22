import { formatSimClock } from '@vighnaway/contracts';
import { Redirect } from 'expo-router';
import { Drawer, DrawerContentScrollView, type DrawerContentComponentProps } from 'expo-router/drawer';
import { useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ModeBadge } from '@/components/EvidenceChips';
import { Activity, BookOpen, Bug, ChevronRight, Navigation, Settings, type LucideIcon } from '@/components/icons';
import { Mark } from '@/components/Mark';
import { PressScale } from '@/components/motion';
import { appVersion } from '@/config/env';
import { t, type StringKey } from '@/i18n/en';
import { getLanguage } from '@/i18n/lang';
import { connectionMode, useConnection } from '@/stores/connection';
import { useIncidents } from '@/stores/incidents';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { createStyles, devanagariFamily, fontFamily, hairline, layout, letterSpacing, radius, spacing, text, useColors } from '@/theme';

const ITEMS: { name: string; label: StringKey; icon: LucideIcon }[] = [
  { name: 'index', label: 'drawerNavigate', icon: Navigation },
  { name: 'activity', label: 'drawerActivity', icon: Activity },
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
        <View style={styles.brand}>
          <View style={styles.markTile}>
            <Mark size={36} />
          </View>
          <View style={styles.brandText}>
            <AppText tone="onShell" style={styles.wordmark}>
              {t('appName')}
            </AppText>
            <ModeBadge compact style={styles.badge} />
          </View>
        </View>
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
                {focused ? <View style={styles.indicator} /> : null}
                <View style={[styles.iconTile, focused && styles.iconTileFocused]}>
                  <Icon size={18} color={focused ? tc.inkOnShell : tc.inkOnShellMuted} strokeWidth={2} />
                </View>
                <AppText tone={focused ? 'onShell' : 'onShellMuted'} style={[styles.label, focused && styles.labelFocused]}>
                  {t(it.label)}
                </AppText>
                {focused ? null : <ChevronRight size={16} color={tc.shellHairlineStrong} />}
              </PressScale>
            );
          })}
        </View>
      </DrawerContentScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <View style={styles.statusRow}>
          <View style={styles.dotWrap}>
            <View style={[styles.dot, !live && styles.dotIdle]} />
          </View>
          <AppText variant="meta" tone="onShell" style={styles.flex}>
            {dataStatus}
          </AppText>
        </View>
        <AppText variant="label" tone="onShellMuted">
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
        drawerStyle: { width: Math.min(layout.drawerMaxWidth, width * layout.drawerWidthRatio), backgroundColor: tc.panel },
        overlayColor: tc.scrim,
        keyboardDismissMode: 'on-drag',
        headerStyle: { backgroundColor: tc.panel, borderBottomWidth: hairline, borderBottomColor: tc.panelHairline },
        headerShadowVisible: false,
        headerTintColor: tc.ink,
        headerTitleStyle: { fontFamily: getLanguage() === 'en' ? fontFamily.semibold : devanagariFamily(fontFamily.semibold), fontSize: text.title.fontSize },
        sceneStyle: { backgroundColor: tc.shell },
      }}
    >
      <Drawer.Screen name="index" options={{ headerShown: false, swipeEnabled: false, title: t('drawerNavigate') }} />
      <Drawer.Screen name="activity" options={{ title: t('drawerActivity') }} />
      <Drawer.Screen name="settings" options={{ title: t('drawerSettings') }} />
      <Drawer.Screen name="how-it-decides" options={{ title: t('drawerHowItDecides') }} />
      <Drawer.Screen name="debug" options={{ title: t('drawerDebug') }} />
    </Drawer>
  );
}

const useStyles = createStyles((tc) => ({
  drawer: { flex: 1, backgroundColor: tc.panel, borderRightWidth: hairline, borderRightColor: tc.shellHairline },
  flex: { flex: 1 },
  scroll: { paddingHorizontal: spacing.sm },
  brand: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.lg },
  markTile: {
    width: spacing.xl + spacing.md,
    height: spacing.xl + spacing.md,
    borderRadius: radius.card,
    backgroundColor: tc.shell,
    borderWidth: hairline,
    borderColor: tc.shellHairlineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandText: { gap: spacing.xxs },
  badge: { alignSelf: 'flex-start' },
  wordmark: { fontFamily: fontFamily.semibold, letterSpacing: letterSpacing.wordmark },
  items: { gap: spacing.xxs },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch + spacing.xxs,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.button,
  },
  itemFocused: { backgroundColor: tc.tealSoft },
  indicator: { position: 'absolute', left: 0, top: spacing.sm, bottom: spacing.sm, width: 3, borderRadius: radius.chip, backgroundColor: tc.accent },
  iconTile: { width: spacing.xl + spacing.xxs, height: spacing.xl + spacing.xxs, borderRadius: radius.button - 2, alignItems: 'center', justifyContent: 'center' },
  iconTileFocused: { backgroundColor: tc.panel },
  label: { flex: 1, fontFamily: fontFamily.medium },
  labelFocused: { fontFamily: fontFamily.semibold },
  footer: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.xs, borderTopWidth: hairline, borderTopColor: tc.shellHairline },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dotWrap: { width: spacing.xs, height: spacing.xs, alignItems: 'center', justifyContent: 'center' },
  dot: { width: spacing.xs, height: spacing.xs, borderRadius: radius.chip, backgroundColor: tc.routeRecommended },
  dotIdle: { backgroundColor: tc.warn },
}));
