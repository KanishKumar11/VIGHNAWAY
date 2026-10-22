import { BottomSheetBackdrop, BottomSheetModal, BottomSheetView, type BottomSheetBackdropProps } from '@gorhom/bottom-sheet';
import { forwardRef, useCallback } from 'react';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { Place } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import { Check, Hospital } from '@/components/icons';
import { t } from '@/i18n/en';
import { createStyles, fontFamily, hairline, layout, radius, spacing, useColors } from '@/theme';

interface Props {
  places: Place[];
  selectedId: string;
  onSelect: (id: string) => void;
  onDismiss: () => void;
}

/** Destination picker opened from the search card. */
export const DestinationSheet = forwardRef<BottomSheetModal, Props>(function DestinationSheet({ places, selectedId, onSelect, onDismiss }, ref) {
  const tc = useColors();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const backdrop = useCallback(
    (p: BottomSheetBackdropProps) => <BottomSheetBackdrop {...p} appearsOnIndex={0} disappearsOnIndex={-1} pressBehavior="close" />,
    [],
  );
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
        <AppText variant="label" tone="muted" accessibilityRole="header" style={styles.title}>
          {t('destinationsTitle')}
        </AppText>
        {places.map((p) => {
          const selected = p.id === selectedId;
          return (
            <Pressable
              key={p.id}
              onPress={() => onSelect(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              style={[styles.row, selected && styles.rowSelected]}
            >
              <View style={[styles.icon, selected && styles.iconSelected]}>
                <Hospital size={18} color={selected ? tc.panel : tc.ink} />
              </View>
              <View style={styles.flex}>
                <AppText variant="body" style={styles.name}>
                  {p.name}
                </AppText>
                {p.address ? (
                  <AppText variant="meta" tone="muted">
                    {p.address}
                  </AppText>
                ) : null}
              </View>
              {selected ? <Check size={20} color={tc.ink} strokeWidth={2.5} /> : null}
            </Pressable>
          );
        })}
      </BottomSheetView>
    </BottomSheetModal>
  );
});

const useStyles = createStyles((tc) => ({
  bg: { backgroundColor: tc.panel, borderRadius: radius.sheet },
  handle: { backgroundColor: tc.panelLine },
  content: { paddingHorizontal: spacing.md, gap: spacing.xs },
  flex: { flex: 1 },
  title: { marginBottom: spacing.xxs },
  name: { fontFamily: fontFamily.semibold },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch + spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.card,
    backgroundColor: tc.panelRaised,
    borderWidth: hairline,
    borderColor: tc.panelHairline,
  },
  rowSelected: { borderColor: tc.ink, borderWidth: 1.5 },
  icon: { width: spacing.xl + spacing.xxs, height: spacing.xl + spacing.xxs, borderRadius: radius.button - 2, backgroundColor: tc.panelSunken, alignItems: 'center', justifyContent: 'center' },
  iconSelected: { backgroundColor: tc.ink },
}));
