/**
 * react-native-maps has no official Jest mock. This one renders plain Views and records every
 * overlay so tests can assert what the map would draw (roles, colours, z-order).
 */
import { forwardRef, useImperativeHandle, type ReactNode } from 'react';
import { View } from 'react-native';

export interface RecordedOverlay {
  kind: 'polyline' | 'marker';
  props: Record<string, unknown>;
}

export const recorded: RecordedOverlay[] = [];
export const resetRecorded = () => {
  recorded.length = 0;
  cameraCalls.length = 0;
};

/** Every animateCamera call, so tests can assert where the camera went. */
export const cameraCalls: { camera: Record<string, unknown>; opts: Record<string, unknown> | undefined }[] = [];

interface AnyProps {
  children?: ReactNode;
  testID?: string;
  [key: string]: unknown;
}

const MapView = forwardRef<unknown, AnyProps>(function MapView(props, ref) {
  useImperativeHandle(ref, () => ({
    fitToCoordinates: jest.fn(),
    animateCamera: (camera: Record<string, unknown>, opts?: Record<string, unknown>) => {
      cameraCalls.push({ camera, opts });
    },
    animateToRegion: jest.fn(),
  }));
  // onPanDrag is passed through so a test can fire a drag with fireEvent(map, 'panDrag').
  return (
    <View testID={typeof props.testID === 'string' ? props.testID : 'map-view'} {...({ onPanDrag: props.onPanDrag } as object)}>
      {props.children as ReactNode}
    </View>
  );
});

export function Polyline(props: AnyProps) {
  recorded.push({ kind: 'polyline', props: { ...props } });
  return <View testID="map-polyline" />;
}

export function Marker(props: AnyProps) {
  recorded.push({ kind: 'marker', props: { ...props } });
  return <View testID="map-marker">{props.children as ReactNode}</View>;
}

export const Callout = (p: AnyProps) => <View>{p.children as ReactNode}</View>;
export const Circle = () => <View />;
export const Polygon = () => <View />;
export const PROVIDER_GOOGLE = 'google';
export const PROVIDER_DEFAULT = undefined;
export type EdgePadding = { top: number; right: number; bottom: number; left: number };
export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
export type MapStyleElement = { featureType?: string; elementType?: string; stylers: object[] };

export default MapView;
