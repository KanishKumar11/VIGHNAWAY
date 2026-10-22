import { fireEvent, render, screen } from '@testing-library/react-native';
import { formatDuration } from '@vighnaway/contracts';
import { planTrip } from '@vighnaway/engine';
import { andheriGraph, andheriScenario } from '@vighnaway/scenario-data';
import { ChangeBanner, MiniChange, NoViableCard, PeekCard, PeekMore, RouteDetail } from '@/features/navigate/SheetParts';
import { getGraph } from '@/lib/engine';
import { recommendedRoute } from '@/stores/trip';

function initialPlan() {
  const origin = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.originId)!;
  const dest = andheriScenario.places.find((p) => p.id === andheriScenario.demoTrip.destinationId)!;
  return planTrip({
    graph: getGraph(andheriGraph, 'car'),
    origin: origin.nodeId,
    destination: dest.nodeId,
    incidents: [],
    nowS: 0,
    alerts: andheriScenario.alerts,
    hasAlertInformation: andheriScenario.hasAlertInformation,
    places: andheriScenario.places,
    destinationPlaceId: dest.id,
  });
}

const noop = () => undefined;

describe('sheet peek', () => {
  it('the small card is only the ETA, the route name and Start', async () => {
    const rec = recommendedRoute(initialPlan())!;
    await render(<PeekCard route={rec} etaS={rec.etaS} enRoute={false} onStart={noop} onEnd={noop} />);
    expect(screen.getByText(rec.name)).toBeTruthy();
    expect(screen.getByTestId('peek-eta')).toHaveTextContent(formatDuration(rec.etaS));
    expect(screen.getByText('Start trip')).toBeTruthy();
    // Reason, next step, confidence, share and drive wait in the opened sheet.
    expect(screen.queryByTestId('peek-reason')).toBeNull();
    expect(screen.queryByTestId('what-to-do-now')).toBeNull();
    expect(screen.queryByLabelText('Share route')).toBeNull();
  });

  it('shows the recommendation, reason and confidence word in the opened sheet (never a percentage)', async () => {
    const plan = initialPlan();
    const rec = recommendedRoute(plan)!;
    await render(<PeekMore route={rec} onShare={noop} hint={null} />);
    expect(screen.getByText('Recommended')).toBeTruthy();
    expect(screen.getByTestId('peek-reason')).toHaveTextContent(rec.explanation.reason);
    const word = { high: 'High', medium: 'Medium', low: 'Low' }[rec.explanation.confidence];
    expect(screen.getByText(word)).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
    expect(screen.getByLabelText('Share route')).toBeTruthy();
  });

  it('shows the remaining ETA and End trip en route', async () => {
    const rec = recommendedRoute(initialPlan())!;
    await render(<PeekCard route={rec} etaS={600} enRoute onStart={noop} onEnd={noop} />);
    expect(screen.getByTestId('peek-eta')).toHaveTextContent('10 min left');
    expect(screen.getByText('End trip')).toBeTruthy();
  });

  it('shows the hint in the opened sheet', async () => {
    const rec = recommendedRoute(initialPlan())!;
    await render(<PeekMore route={rec} onShare={noop} hint="Waiting" />);
    expect(screen.getByText('Waiting')).toBeTruthy();
  });
});

describe('opened sheet: what to do now', () => {
  it('shows the next action, labelled for screen readers', async () => {
    const rec = recommendedRoute(initialPlan())!;
    await render(<PeekMore route={rec} nextStep="Take Andheri Subway, 14 min." onShare={noop} onDrive={noop} hint={null} />);
    expect(screen.getByText('What to do now')).toBeTruthy();
    expect(screen.getByLabelText('What to do now: Take Andheri Subway, 14 min.')).toBeTruthy();
    expect(screen.getByLabelText('Drive mode')).toBeTruthy();
  });
});

describe('route detail evidence', () => {
  it('shows source, status and age chips for a hazard on the recommended route', async () => {
    const { fixtureIncident } = require('@/fixtures/hero') as typeof import('@/fixtures/hero');
    const rec = recommendedRoute(initialPlan())!;
    const inc = fixtureIncident('ev01-ankle', 'unverified', 1);
    await render(<RouteDetail route={rec} evidence={[inc]} nowS={inc.lastReportAtS + 12 * 60} />);
    expect(screen.getByText('Unverified')).toBeTruthy();
    expect(screen.getByText('Simulated')).toBeTruthy();
    expect(screen.getByText('12 min')).toBeTruthy();
    // The row speaks hazard, status, source and age together.
    expect(screen.getByLabelText(/Unverified, Simulated, 12 min ago$/)).toBeTruthy();
  });
});

describe('change banner', () => {
  it('shows the title, the engine message, the trade-off and Details', async () => {
    const message = 'Route changed. Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated. New route via Gokhale Bridge adds 5 min.';
    await render(
      <ChangeBanner
        banner={{ id: 1, tone: 'change', title: 'Route changed', message, tradeOff: '+5 min compared with the previous route', atS: 180 }}
        onDetails={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByText('Route changed')).toBeTruthy();
    expect(screen.getByTestId('change-banner-message')).toHaveTextContent(message);
    expect(screen.getByText('+5 min compared with the previous route')).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
  });

  it('with the trigger incident, shows the incident and its evidence instead of repeating the sentence', async () => {
    const { fixtureIncident } = require('@/fixtures/hero') as typeof import('@/fixtures/hero');
    const inc = fixtureIncident('ev01-ankle', 'corroborated', 2, { depth: 'knee' });
    const message = 'Route changed. Flooding (knee deep) at Andheri Subway: Corroborated (2 devices), Simulated. New route via Gokhale Bridge adds 5 min.';
    await render(
      <ChangeBanner
        banner={{ id: 1, tone: 'change', title: 'Route changed', message, tradeOff: '+5 min compared with the previous route', atS: 180, incidentId: inc.id }}
        incident={inc}
        nowS={inc.lastReportAtS}
        onDetails={noop}
        onDismiss={noop}
      />,
    );
    expect(screen.getByTestId('change-banner-message')).toHaveTextContent(`Flooding (knee deep) at ${inc.roadName}`);
    expect(screen.getByLabelText(message)).toBeTruthy();
    expect(screen.getByText('Corroborated (2 devices)')).toBeTruthy();
    expect(screen.getByText('Just now')).toBeTruthy();
  });
});

describe('no viable route', () => {
  it('offers the nearest reachable place and the emergency number', async () => {
    const plan = { ...initialPlan(), noViableRoute: true, reachable: { placeId: 'hosp-hbt', placeName: 'HBT Trauma Care Hospital', etaS: 600, routeId: 'x' } };
    await render(<NoViableCard plan={plan} onGoTo={noop} />);
    expect(screen.getByText('No viable route')).toBeTruthy();
    expect(screen.getByText('Every route we checked crosses a verified or corroborated blockage.')).toBeTruthy();
    expect(screen.getByText('Nearest reachable: HBT Trauma Care Hospital, 10 min')).toBeTruthy();
    expect(screen.getByText('Go to HBT Trauma Care Hospital')).toBeTruthy();
    expect(screen.getByText('In an emergency, call 112.')).toBeTruthy();
    expect(screen.getByText('Call 112')).toBeTruthy();
  });
});

describe('change notice in the small sheet', () => {
  it('is one line with the title and Details, opens the sheet when pressed and can be dismissed', async () => {
    const onPress = jest.fn();
    const onDismiss = jest.fn();
    await render(
      <MiniChange
        banner={{ id: 1, tone: 'change', title: 'Route changed', message: 'Route changed. Flooding at Andheri Subway.', tradeOff: '+5 min', atS: 180 }}
        onPress={onPress}
        onDismiss={onDismiss}
      />,
    );
    expect(screen.getByText('Route changed')).toBeTruthy();
    expect(screen.getByText('Details')).toBeTruthy();
    // The cause and trade-off wait in the opened sheet; the notice itself is spoken in full.
    expect(screen.queryByText('+5 min')).toBeNull();
    expect(screen.getByLabelText('Route changed. Route changed. Flooding at Andheri Subway.')).toBeTruthy();
    fireEvent.press(screen.getByLabelText('Route changed. Route changed. Flooding at Andheri Subway.'));
    expect(onPress).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByLabelText('Close'));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
});
