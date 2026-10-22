import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DrawerActions } from '@react-navigation/native';
import { router, useNavigation } from 'expo-router';
import { t } from '@/i18n/en';
import { useReduceMotion } from '@/lib/motion';
import { createStyles, fontFamily, hairline, layout, radius, shadow, spacing, useColors } from '@/theme';
import { AppText } from './AppText';
import { ArrowLeft, ChevronRight, Menu, X, type LucideIcon } from './icons';
import { enterUp, PressScale } from './motion';

/**
 * The shared layout kit (DESIGN.md section 15). Every screen is built from the same few pieces so
 * gutters, radii, row heights and icon tiles line up everywhere:
 * - ScreenHeader: a large title on the page with one round leading button;
 * - Section: a label above one rounded card that groups related rows;
 * - Row: icon tile, title and subtitle, then a trailing value or control, with an inset divider.
 */

export const GUTTER = spacing.md;
const TILE = spacing.xl + spacing.xxs;
const ROUND = layout.minTouch - spacing.xxs;

/** Round floating button used for menu, back and close. */
export function RoundButton({ icon: Icon, label, onPress, testID }: { icon: LucideIcon; label: string; onPress: () => void; testID?: string }) {
  const tc = useColors();
  const styles = useStyles();
  return (
    <PressScale onPress={onPress} haptic="selection" accessibilityRole="button" accessibilityLabel={label} style={[styles.round, shadow('sm')]} testID={testID}>
      <Icon size={20} color={tc.ink} strokeWidth={2.25} />
    </PressScale>
  );
}

/**
 * Large-title header on the page colour (no bar, no hairline). `leading` is the drawer menu on
 * drawer screens and back or close on stacked ones; `trailing` holds a badge or an action.
 */
export function ScreenHeader({
  title,
  subtitle,
  leading = 'menu',
  onLeading,
  leadingTestID,
  trailing,
}: {
  title: string;
  subtitle?: string | null;
  leading?: 'menu' | 'back' | 'close' | 'none';
  onLeading?: () => void;
  leadingTestID?: string;
  trailing?: ReactNode;
}) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const leave = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const press = onLeading ?? (leading === 'menu' ? () => navigation.dispatch(DrawerActions.openDrawer()) : leave);
  return (
    <View style={[styles.header, { paddingTop: insets.top + spacing.xs, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}>
      <View style={styles.headerBar}>
        {leading === 'none' ? (
          <View />
        ) : (
          <RoundButton
            icon={leading === 'menu' ? Menu : leading === 'back' ? ArrowLeft : X}
            label={leading === 'menu' ? t('drawerOpen') : leading === 'back' ? t('listClose') : t('driveExitLabel')}
            onPress={press}
            testID={leadingTestID ?? (leading === 'menu' ? 'header-menu' : 'header-back')}
          />
        )}
        {trailing ? <View style={styles.headerTrailing}>{trailing}</View> : null}
      </View>
      <AppText variant="headline" accessibilityRole="header" style={styles.title}>
        {title}
      </AppText>
      {subtitle ? (
        <AppText tone="muted" numberOfLines={2}>
          {subtitle}
        </AppText>
      ) : null}
    </View>
  );
}

/** A rounded surface. `accent` is the brand hero (blue with light text); `tint` a soft blue panel. */
export function Card({ children, tone = 'default', style, testID }: { children: ReactNode; tone?: 'default' | 'accent' | 'tint'; style?: StyleProp<ViewStyle>; testID?: string }) {
  const styles = useStyles();
  return (
    <View style={[styles.card, tone === 'accent' ? styles.cardAccent : tone === 'tint' ? styles.cardTint : shadow('sm'), style]} testID={testID}>
      {children}
    </View>
  );
}

/** A label above one card. `hint` sits under the card, aligned with the label. */
export function Section({
  title,
  count,
  hint,
  children,
  index = 0,
  bare,
  style,
}: {
  title?: string;
  count?: number;
  hint?: string | null;
  children: ReactNode;
  index?: number;
  /** Children are placed without the card (segmented controls, button rows). */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const styles = useStyles();
  const reduce = useReduceMotion();
  return (
    <Animated.View entering={enterUp(Math.min(index, 8), reduce)} style={[styles.section, style]}>
      {title ? (
        <View style={styles.sectionHead}>
          <AppText variant="label" tone="muted" accessibilityRole="header">
            {title}
          </AppText>
          {count !== undefined ? (
            <View style={styles.count}>
              <AppText variant="num" tone="accent">
                {String(count)}
              </AppText>
            </View>
          ) : null}
        </View>
      ) : null}
      {bare ? children : <Card>{children}</Card>}
      {hint ? (
        <AppText variant="meta" tone="muted" style={styles.hint}>
          {hint}
        </AppText>
      ) : null}
    </Animated.View>
  );
}

/**
 * One aligned row inside a card: an icon tile, the title and an optional subtitle, then a trailing
 * value or control. Pressable when `onPress` is given (with a chevron unless `trailing` is set).
 */
export function Row({
  icon: Icon,
  iconTone = 'accent',
  title,
  subtitle,
  trailing,
  onPress,
  first,
  selected,
  accessibilityRole,
  accessibilityLabel,
  testID,
  children,
}: {
  icon?: LucideIcon;
  iconTone?: 'accent' | 'neutral' | 'warn' | 'danger' | 'positive';
  title?: string;
  subtitle?: string | null;
  trailing?: ReactNode;
  onPress?: () => void;
  /** The first row in a card draws no divider above it. */
  first?: boolean;
  selected?: boolean;
  accessibilityRole?: 'button' | 'radio' | 'switch' | 'text';
  accessibilityLabel?: string;
  testID?: string;
  /** Extra content under the title (chips, inputs). */
  children?: ReactNode;
}) {
  const tc = useColors();
  const styles = useStyles();
  const tile = {
    accent: [tc.tealSoft, tc.accentInk],
    neutral: [tc.panelSunken, tc.ink],
    warn: [tc.warnSurface, tc.warnInk],
    danger: [tc.dangerSurface, tc.dangerInk],
    positive: [tc.positiveSoft, tc.positiveInk],
  }[iconTone];
  const body = (
    <>
      {Icon ? (
        <View style={[styles.tile, { backgroundColor: tile[0] }]}>
          <Icon size={18} color={tile[1]} strokeWidth={2.25} />
        </View>
      ) : null}
      <View style={styles.rowText}>
        {title ? (
          <AppText variant="body" style={selected ? styles.titleStrong : styles.rowTitle}>
            {title}
          </AppText>
        ) : null}
        {subtitle ? (
          <AppText variant="meta" tone="muted">
            {subtitle}
          </AppText>
        ) : null}
        {children}
      </View>
      {trailing ?? (onPress ? <ChevronRight size={18} color={tc.inkSubtle} /> : null)}
    </>
  );
  return (
    <View>
      {first ? null : <View style={[styles.divider, { marginLeft: Icon ? GUTTER + TILE + spacing.sm : GUTTER }]} />}
      {onPress ? (
        <PressScale
          onPress={onPress}
          haptic="selection"
          scaleTo={0.985}
          accessibilityRole={accessibilityRole ?? 'button'}
          accessibilityState={selected !== undefined ? { selected } : undefined}
          accessibilityLabel={accessibilityLabel}
          style={styles.row}
          testID={testID}
        >
          {body}
        </PressScale>
      ) : (
        <View style={styles.row} accessible={!!accessibilityLabel} accessibilityLabel={accessibilityLabel} testID={testID}>
          {body}
        </View>
      )}
    </View>
  );
}

/** Radio mark for single-choice rows. */
export function Radio({ on }: { on: boolean }) {
  const styles = useStyles();
  return <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>;
}

const useStyles = createStyles((tc) => ({
  header: { gap: spacing.xxs, paddingBottom: spacing.md, backgroundColor: tc.shell },
  headerBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: ROUND, marginBottom: spacing.sm },
  headerTrailing: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  title: { marginTop: spacing.xxs },
  round: { width: ROUND, height: ROUND, borderRadius: ROUND / 2, backgroundColor: tc.panel, alignItems: 'center', justifyContent: 'center' },
  card: { borderRadius: radius.sheet, backgroundColor: tc.panel, overflow: 'hidden', borderWidth: hairline, borderColor: tc.panelHairline },
  cardAccent: { backgroundColor: tc.accent, borderColor: tc.accent },
  cardTint: { backgroundColor: tc.tealSoft, borderColor: tc.panelHairline },
  section: { gap: spacing.xs },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.xxs },
  count: { minWidth: spacing.lg, paddingHorizontal: spacing.xs - 2, borderRadius: radius.chip, backgroundColor: tc.tealSoft, alignItems: 'center' },
  hint: { paddingHorizontal: spacing.xxs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: layout.minTouch + spacing.xs, paddingHorizontal: GUTTER, paddingVertical: spacing.sm },
  rowText: { flex: 1, minWidth: 0, gap: 2 },
  rowTitle: { fontFamily: fontFamily.medium },
  titleStrong: { fontFamily: fontFamily.semibold },
  tile: { width: TILE, height: TILE, borderRadius: radius.button - 2, alignItems: 'center', justifyContent: 'center' },
  divider: { height: hairline, backgroundColor: tc.panelHairline, marginRight: 0 },
  radio: { width: spacing.md + 4, height: spacing.md + 4, borderRadius: radius.chip, borderWidth: 2, borderColor: tc.controlBorder, alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: tc.accent },
  radioDot: { width: spacing.xs + 2, height: spacing.xs + 2, borderRadius: radius.chip, backgroundColor: tc.accent },
}));
