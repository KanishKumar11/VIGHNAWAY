import { useRef } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import Animated, { ZoomIn } from 'react-native-reanimated';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useReduceMotion } from '@/lib/motion';
import { useDialog, type DialogAction, type DialogSpec } from '@/stores/dialog';
import { createStyles, hairline, layout, radius, shadow, spacing, useColors } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { CircleAlert, Info, TriangleAlert } from './icons';
import { springEntry } from './motion';

/**
 * Themed confirmation dialog: a centred card on the theme's scrim, an icon tile in the tone's
 * colour, the title and message, then full-width buttons (stacked so long Hindi or Marathi labels
 * never clip). Mounted once at the root; screens call `showDialog` from stores/dialog.
 * Android Back and a tap on the scrim close it without choosing anything.
 */
export function DialogHost() {
  const current = useDialog((s) => s.current);
  const close = useDialog((s) => s.close);
  return (
    <Modal
      visible={!!current}
      transparent
      animationType="fade"
      onRequestClose={close}
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={['portrait', 'landscape']}
    >
      {/* A Modal is its own native window (BUILD_PROMPT 8.3): it needs its own insets provider and gesture root. */}
      <SafeAreaProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <DialogBody />
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}

function DialogBody() {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const reduce = useReduceMotion();
  const current = useDialog((s) => s.current);
  const close = useDialog((s) => s.close);
  // Keep the last dialog's content while the Modal fades out, so the card does not empty first.
  const last = useRef<DialogSpec | null>(null);
  if (current) last.current = current;
  const spec = current ?? last.current;

  const choose = (action: DialogAction) => {
    close();
    // Let the Modal leave before the action navigates or opens something else.
    if (action.onPress) setTimeout(action.onPress, 150);
  };

  const tone = spec?.tone ?? 'neutral';
  const Icon =
    spec?.icon ?? (tone === 'danger' ? CircleAlert : tone === 'warn' ? TriangleAlert : Info);
  const tile =
    tone === 'danger'
      ? { bg: tc.dangerSurface, fg: tc.dangerInk }
      : tone === 'warn'
        ? { bg: tc.warnSurface, fg: tc.warnInk }
        : { bg: tc.recommendedSurface, fg: tc.recommendedInk };

  return (
    <View
      style={[
        styles.root,
        {
          paddingTop: insets.top + spacing.md,
          paddingBottom: insets.bottom + spacing.md,
          paddingLeft: insets.left + spacing.md,
          paddingRight: insets.right + spacing.md,
        },
      ]}
    >
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={close}
        importantForAccessibility="no"
        accessibilityElementsHidden
      />
      {spec ? (
        <Animated.View
          key={spec.title}
          entering={reduce ? undefined : springEntry(ZoomIn)}
          style={[styles.card, shadow('lg')]}
          accessibilityViewIsModal
          accessibilityRole="alert"
          testID="dialog"
        >
          <View style={[styles.tile, { backgroundColor: tile.bg }]}>
            <Icon size={26} color={tile.fg} strokeWidth={2.25} />
          </View>
          <ScrollView
            style={{ maxHeight: height * 0.45 }}
            contentContainerStyle={styles.copy}
            bounces={false}
            showsVerticalScrollIndicator={false}
          >
            <AppText variant="title" style={styles.centre} accessibilityRole="header">
              {spec.title}
            </AppText>
            {spec.message ? (
              <AppText tone="muted" style={styles.centre}>
                {spec.message}
              </AppText>
            ) : null}
          </ScrollView>
          <View style={styles.actions}>
            {spec.actions.map((a, i) => (
              <Button
                key={`${i}-${a.label}`}
                label={a.label}
                kind={a.kind ?? 'secondary'}
                onPress={() => choose(a)}
                testID={`dialog-action-${i}`}
              />
            ))}
          </View>
        </Animated.View>
      ) : null}
    </View>
  );
}

const TILE = layout.minTouch + spacing.xs;

const useStyles = createStyles((tc) => ({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: tc.scrim },
  card: {
    width: '100%',
    maxWidth: layout.drawerMaxWidth + spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: tc.panel,
    borderRadius: radius.sheet,
    borderWidth: hairline,
    borderColor: tc.panelLine,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md + spacing.xxs,
  },
  tile: {
    width: TILE,
    height: TILE,
    borderRadius: TILE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copy: { gap: spacing.xs, alignItems: 'center' },
  centre: { textAlign: 'center' },
  actions: { alignSelf: 'stretch', gap: spacing.xs, marginTop: spacing.xs },
}));
