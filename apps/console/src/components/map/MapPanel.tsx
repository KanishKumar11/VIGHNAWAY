'use client';

import { APIProvider } from '@vis.gl/react-google-maps';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useContainPinchZoom } from '@/hooks/useContainPinchZoom';
import { GOOGLE_MAPS_KEY } from '@/lib/env';
import { GoogleMapView, type GoogleMapViewProps } from './GoogleMapView';
import { SchematicMap } from './SchematicMap';

export type MapPanelProps = Omit<GoogleMapViewProps, 'onFail'>;

/**
 * Google map when a key is configured and the API loads; otherwise the schematic view with
 * "Map unavailable: check the Google Maps key or the network". Everything else keeps working.
 * A trackpad pinch over the map zooms the map, never the page.
 */
export function MapPanel(props: MapPanelProps) {
  const [mounted, setMounted] = useState(false);
  const [failed, setFailed] = useState(false);
  const stage = useRef<HTMLDivElement>(null);
  useContainPinchZoom(stage);
  useEffect(() => setMounted(true), []);
  const onFail = useCallback(() => setFailed(true), []);
  const useGoogle = mounted && GOOGLE_MAPS_KEY !== '' && !failed;
  return (
    <div ref={stage} className="h-full w-full overscroll-contain">
      {useGoogle ? (
        <APIProvider apiKey={GOOGLE_MAPS_KEY} onError={onFail}>
          <GoogleMapView {...props} onFail={onFail} />
        </APIProvider>
      ) : (
        <SchematicMap {...props} unavailable />
      )}
    </div>
  );
}
