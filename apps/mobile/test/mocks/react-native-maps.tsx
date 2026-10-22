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
};

interface AnyProps {
  children?: ReactNode;
  testID?: string;
  [key: string]: unknown;
}

const MapView = forwardRef<unknown, AnyProps>(function MapView(props, ref) {
  useImperativeHandle(ref, () => ({
    fitToCoordinates: jest.fn(),
    animateCamera: jest.fn(),
    animateToRegion: jest.fn(),
  }));
  return <View testID={typeof props.testID === 'string' ? props.testID : 'map-view'}>{props.children as ReactNode}</View>;
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
