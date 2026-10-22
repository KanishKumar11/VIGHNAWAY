// Web-preview shim for react-native-maps (design review in a browser only; never shipped).
// MapView never reports ready, so the app shows its labelled schematic fallback, exactly as on a
// phone without a Maps key.
import React from 'react';
import { View } from 'react-native';

const MapView = React.forwardRef<View, { style?: object; children?: React.ReactNode }>((props, ref) => (
  <View ref={ref} style={props.style} />
));
MapView.displayName = 'MapViewWebShim';
export default MapView;
export const Marker = () => null;
export const Polyline = () => null;
export const Circle = () => null;
export const PROVIDER_GOOGLE = 'google';
export type MapStyleElement = object;
export type EdgePadding = { top: number; right: number; bottom: number; left: number };
export type Region = { latitude: number; longitude: number; latitudeDelta: number; longitudeDelta: number };
