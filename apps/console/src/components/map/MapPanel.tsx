'use client';

import { APIProvider } from '@vis.gl/react-google-maps';
import { useCallback, useEffect, useState } from 'react';
import { GOOGLE_MAPS_KEY } from '@/lib/env';
import { GoogleMapView, type GoogleMapViewProps } from './GoogleMapView';
import { SchematicMap } from './SchematicMap';

export type MapPanelProps = Omit<GoogleMapViewProps, 'onFail'>;

/**
 * Google map when a key is configured and the API loads; otherwise the schematic view with
 * "Map unavailable: check the Google Maps key or the network". Everything else keeps working.
 */
export function MapPanel(props: MapPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => setMounted(true), []);
  const onFail = useCallback(() => setFailed(true), []);
  const useGoogle = mounted && GOOGLE_MAPS_KEY !== '' && !failed;
  if (!useGoogle) return <SchematicMap {...props} unavailable />;
  return (
    <APIProvider apiKey={GOOGLE_MAPS_KEY} onError={onFail}>
      <GoogleMapView {...props} onFail={onFail} />
    </APIProvider>
  );
}
