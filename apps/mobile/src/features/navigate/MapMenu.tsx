import { Pressable, StyleSheet, Switch, useWindowDimensions, View } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { Flag, List, LocateFixed, MapIcon, Settings } from '@/components/icons';
import { Card, GUTTER, Row } from '@/components/ui';
import { t } from '@/i18n/en';
import { useReduceMotion } from '@/lib/motion';
import { useSettings } from '@/stores/settings';
import { createStyles, motion, shadow, spacing, useColors } from '@/theme';

const MENU_MAX_W = 340;

/**
 * Quick options under the status pill (top right): Report, route list, Show my location (live),
 * Google's traffic layer and Settings. Tapping outside closes it.
 */
export function MapMenu({
  top,
  onClose,
  onReport,
  onList,
  onLocate,
  onSettings,
}: {
  top: number;
  onClose: () => void;
  onReport: () => void;
  onList: () => void;
  /** Live mode only. */
  onLocate?: () => void;
  onSettings: () => void;
}) {
  const tc = useColors();
  const styles = useStyles();
  const reduce = useReduceMotion();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const traffic = useSettings((s) => s.googleTraffic);
  const pick = (fn: () => void) => () => {
    onClose();
    fn();
  };
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityElementsHidden importantForAccessibility="no" testID="map-menu-backdrop" />
      <Animated.View
        entering={reduce ? undefined : FadeIn.duration(motion.buttonPress + 40)}
        exiting={reduce ? undefined : FadeOut.duration(motion.buttonPress * 2)}
        style={[styles.panel, { top, right: insets.right + GUTTER, width: Math.min(MENU_MAX_W, width - insets.left - insets.right - GUTTER * 2) }]}
        accessibilityViewIsModal
        testID="map-menu"
      >
        <Card style={shadow('lg')}>
          <View style={styles.head}>
            <AppText variant="label" tone="muted" accessibilityRole="header">
              {t('mapMenuTitle')}
            </AppText>
          </View>
          <Row first icon={Flag} title={t('reportButtonLabel')} subtitle={t('mapMenuReportHint')} onPress={pick(onReport)} testID="menu-report" />
          <Row icon={List} title={t('listTitle')} subtitle={t('mapMenuListHint')} onPress={pick(onList)} testID="open-list" />
          {onLocate ? <Row icon={LocateFixed} title={t('locateMe')} subtitle={t('locateMeHint')} onPress={pick(onLocate)} testID="menu-locate" /> : null}
          <Row
            icon={MapIcon}
            iconTone={traffic ? 'accent' : 'neutral'}
            title={t('mapMenuTraffic')}
            subtitle={t('mapMenuTrafficHint')}
            onPress={() => useSettings.getState().setGoogleTraffic(!traffic)}
            accessibilityRole="switch"
            accessibilityLabel={t('googleTraffic')}
            testID="google-traffic"
            trailing={
              <Switch
                value={traffic}
                onValueChange={(v) => useSettings.getState().setGoogleTraffic(v)}
                trackColor={{ true: tc.accent, false: tc.controlBorder }}
                thumbColor={tc.white}
                accessibilityElementsHidden
                importantForAccessibility="no"
              />
            }
          />
          <Row icon={Settings} iconTone="neutral" title={t('drawerSettings')} subtitle={t('mapMenuSettingsHint')} onPress={pick(onSettings)} testID="menu-settings" />
        </Card>
      </Animated.View>
    </View>
  );
}

const useStyles = createStyles(() => ({
  panel: { position: 'absolute' },
  head: { paddingHorizontal: GUTTER, paddingTop: spacing.sm, paddingBottom: spacing.xxs },
}));
