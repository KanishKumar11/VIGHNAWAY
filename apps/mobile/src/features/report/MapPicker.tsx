import { useMemo, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type MapStyleElement } from 'react-native-maps';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LatLng } from '@vighnaway/contracts';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { X } from '@/components/icons';
import { MapField } from '@/components/MapField';
import { Card, GUTTER, RoundButton } from '@/components/ui';
import { googleMapsConfigured } from '@/config/env';
import { t } from '@/i18n/en';
import { getGraph, snapToRoad } from '@/lib/engine';
import { graphForRegion, insideBox, regionBox } from '@/regions';
import { useUi } from '@/stores/ui';
import { createStyles, shadow, spacing, useTheme } from '@/theme';

/** Where the map opens when there is no usable point: the middle of the Andheri map, where reports work. */
function andheriCentre(): LatLng {
  const b = regionBox('andheri');
  return { lat: (b.south + b.north) / 2, lng: (b.west + b.east) / 2 };
}

/**
 * "Choose on map": a full-screen map with one locator pin. Tap anywhere (or drag the pin) to move it,
 * then OK uses that spot. OK waits for a mapped road, because the API only takes reports on one.
 */
export function MapPicker({ visible, initial, onCancel, onConfirm }: { visible: boolean; initial: LatLng | null; onCancel: () => void; onConfirm: (p: LatLng) => void }) {
  const styles = useStyles();
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onCancel} statusBarTranslucent navigationBarTranslucent>
      {/* A Modal is its own native window (BUILD_PROMPT 8.3): it needs its own insets provider and gesture root. */}
      <SafeAreaProvider>
        <GestureHandlerRootView style={styles.flex}>
          {/* Mounted only while open, so every visit starts from the current point. */}
          {visible ? <PickerBody initial={initial} onCancel={onCancel} onConfirm={onConfirm} /> : null}
        </GestureHandlerRootView>
      </SafeAreaProvider>
    </Modal>
  );
}

function PickerBody({ initial, onCancel, onConfirm }: { initial: LatLng | null; onCancel: () => void; onConfirm: (p: LatLng) => void }) {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const { mapStyle } = useTheme();
  const mapUnavailable = useUi((s) => s.mapStatus === 'unavailable');
  const start = useMemo(() => (initial && insideBox(regionBox('andheri'), initial) ? initial : andheriCentre()), [initial]);
  const [pin, setPin] = useState<LatLng>(start);
  const snap = useMemo(() => snapToRoad(getGraph(graphForRegion('andheri'), 'car'), pin), [pin]);
  const mapOk = googleMapsConfigured && !mapUnavailable;

  return (
    <View style={styles.root} testID="map-picker">
      {mapOk ? (
        <MapView
          style={StyleSheet.absoluteFill}
          provider={PROVIDER_GOOGLE}
          customMapStyle={mapStyle as unknown as MapStyleElement[]}
          initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
          onPress={(e) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsMyLocationButton={false}
        >
          <Marker
            draggable
            coordinate={{ latitude: pin.lat, longitude: pin.lng }}
            onDragEnd={(e) => setPin({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
          />
        </MapView>
      ) : (
        <View style={styles.unavailable}>
          <MapField width={400} height={800} />
        </View>
      )}
      <View testID="map-picker-top" pointerEvents="box-none" style={[styles.top, { paddingTop: insets.top + spacing.xs, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}>
        <Card style={styles.titleCard}>
          <View style={styles.titleRow}>
            <View style={styles.flex}>
              <AppText variant="title" accessibilityRole="header">
                {t('mapPickTitle')}
              </AppText>
              <AppText variant="meta" tone="muted">
                {t(mapOk ? 'mapPickHint' : 'mapUnavailable')}
              </AppText>
            </View>
            <RoundButton icon={X} label={t('cancel')} onPress={onCancel} testID="map-picker-close" />
          </View>
        </Card>
      </View>
      <View testID="map-picker-bottom" pointerEvents="box-none" style={[styles.bottom, { paddingBottom: insets.bottom + spacing.sm, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}>
        <Card style={styles.bottomCard}>
          <View style={styles.info}>
            <AppText variant="mono" testID="map-picker-coords">
              {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
            </AppText>
            <AppText variant="meta" tone={snap ? 'muted' : 'warn'} testID="map-picker-road">
              {snap ? (snap.roadName ? t('reportOnRoad', { road: snap.roadName }) : t('reportOnRoadUnnamed')) : t('reportOffRoad')}
            </AppText>
          </View>
          <View style={styles.buttons}>
            <Button label={t('cancel')} kind="secondary" onPress={onCancel} style={styles.flex} testID="map-picker-cancel" />
            <Button label={t('ok')} onPress={() => onConfirm(snap ? snap.point : pin)} disabled={!snap || !mapOk} style={styles.flex} testID="map-picker-ok" />
          </View>
        </Card>
      </View>
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  flex: { flex: 1 },
  unavailable: { ...StyleSheet.absoluteFill, overflow: 'hidden' },
  top: { position: 'absolute', top: 0, left: 0, right: 0 },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0 },
  titleCard: { padding: spacing.sm, ...shadow('md') },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  bottomCard: { padding: spacing.md, gap: spacing.sm, ...shadow('md') },
  info: { gap: 2 },
  buttons: { flexDirection: 'row', gap: spacing.sm },
}));
