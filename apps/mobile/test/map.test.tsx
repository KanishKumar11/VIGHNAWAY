import { render } from '@testing-library/react-native';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { recorded, resetRecorded } from './mocks/react-native-maps';
import { GoogleMapLayer } from '@/features/navigate/GoogleMapLayer';
import { useMapModel } from '@/features/navigate/mapModel';
import { enterFixture, leaveFixture } from '@/fixtures/hero';
import { getGraph } from '@/lib/engine';
import { useIncidents } from '@/stores/incidents';
import { useTrip } from '@/stores/trip';
import { lineStyle, themes, zIndex } from '@/theme';

// Tests render with the system scheme, which is light under Jest.
const recStyle = lineStyle(themes.light, 'recommended');

function Harness() {
  const trip = useTrip.getState();
  const model = useMapModel({
    graph: getGraph(andheriGraph, 'car'),
    plan: trip.plan,
    vehicle: trip.vehicle,
    transition: null,
    incidents: Object.values(useIncidents.getState().byId),
    origin: andheriScenario.places[0]!,
    destination: andheriScenario.places[1]!,
    nowS: 300,
    revealProgress: 1,
  });
  return (
    <GoogleMapLayer
      initialRegion={{ latitude: 19.12, longitude: 72.85, latitudeDelta: 0.05, longitudeDelta: 0.05 }}
      padding={{ top: 0, left: 0, right: 0, bottom: 0 }}
      onReady={() => undefined}
      onIncidentPress={() => undefined}
      onMapPress={() => undefined}
      onRegionChange={() => undefined}
      {...model}
    />
  );
}

describe('map overlays (react-native-maps mock records them)', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => {
    leaveFixture();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  it('draws routes by role in the documented z-order, with markers and the vehicle on top', async () => {
    enterFixture('change');
    resetRecorded();
    await render(<Harness />);
    const lines = recorded.filter((o) => o.kind === 'polyline').map((o) => o.props);
    const markers = recorded.filter((o) => o.kind === 'marker').map((o) => o.props);

    const recommended = lines.filter((l) => l.strokeColor === recStyle.color);
    expect(recommended.length).toBeGreaterThan(0);
    expect(recommended.every((l) => l.zIndex === zIndex.recommended)).toBe(true);
    // A dark casing is drawn under the teal route.
    expect(lines.some((l) => l.strokeColor === recStyle.casing && l.zIndex === zIndex.recommended)).toBe(true);
    // Flood-prone underlay sits at the bottom.
    expect(lines.some((l) => l.zIndex === zIndex.floodProne)).toBe(true);
    const zs = lines.map((l) => l.zIndex as number);
    expect(Math.min(...zs)).toBe(zIndex.floodProne);

    expect(markers.some((m) => m.zIndex === zIndex.incidentMarker)).toBe(true);
    const vehicle = markers.find((m) => m.zIndex === zIndex.vehicle);
    expect(vehicle).toBeTruthy();
    expect(typeof vehicle!.rotation).toBe('number');
    expect(vehicle!.flat).toBe(true);
    // Every custom-view marker starts tracking view changes, then stops (no flicker).
    expect(markers.every((m) => typeof m.tracksViewChanges === 'boolean')).toBe(true);
  });
});
