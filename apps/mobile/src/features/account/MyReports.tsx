import { formatSimClock, type IncidentStatus, type MyReport, type MyReportsResponse, type ReportType } from '@vighnaway/contracts';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { FileText, TriangleAlert, WifiOff } from '@/components/icons';
import { Row, Section } from '@/components/ui';
import { t, type StringKey } from '@/i18n/en';
import { api } from '@/lib/api';
import { useAuth } from '@/stores/auth';
import { useConnection } from '@/stores/connection';
import { useScenario } from '@/stores/scenario';
import { useSettings } from '@/stores/settings';
import { useColors } from '@/theme';

const TYPE_KEY: Record<ReportType, StringKey> = {
  flood: 'typeFlood',
  closure: 'typeClosure',
  congestion: 'typeCongestion',
  debris: 'typeDebris',
  accident: 'typeAccident',
  walking_concern: 'typeWalkingConcern',
  road_clear: 'typeRoadClear',
};

/** What became of a report, in the app's own words. A verified status in the simulated scenario says it is simulated. */
const STATUS_KEY = (status: IncidentStatus, simulated: boolean): StringKey =>
  status === 'unverified'
    ? 'statusUnverified'
    : status === 'corroborated'
      ? 'statusCorroboratedShort'
      : status === 'verified'
        ? simulated
          ? 'statusVerifiedSim'
          : 'statusVerified'
        : status === 'resolved'
          ? 'statusResolved'
          : 'statusDismissed';

/** One line under a report: the road, what became of it, and when. */
export function reportLine(r: MyReport, clockStartsAt: string, simulated: boolean): { title: string; subtitle: string } {
  const what = r.status ? t(STATUS_KEY(r.status, simulated)) : t('accountReportNoIncident');
  const road = r.roadName ?? t('accountReportRoadUnknown');
  return { title: t(TYPE_KEY[r.type]), subtitle: `${road} · ${what} · ${formatSimClock(clockStartsAt, r.receivedAtS)}` };
}

type State = { state: 'loading' } | { state: 'offline' } | { state: 'error' } | { state: 'ok'; reports: MyReport[] };

/** The signed-in person's own recent reports: loading, offline, error and empty each have a line of their own. */
export function MyReports() {
  const tc = useColors();
  const apiUrl = useSettings((s) => s.apiUrl);
  const simulated = useSettings((s) => s.dataMode === 'simulated');
  const token = useAuth((s) => s.token);
  const offline = useConnection((s) => s.net === 'offline');
  const clockStartsAt = useScenario((s) => s.scenario.clockStartsAt);
  const [data, setData] = useState<State>({ state: 'loading' });

  useEffect(() => {
    if (!token) return;
    if (offline) {
      setData({ state: 'offline' });
      return;
    }
    let alive = true;
    setData({ state: 'loading' });
    api
      .myReports(apiUrl, token)
      .then((r: MyReportsResponse) => alive && setData({ state: 'ok', reports: r.reports }))
      .catch(() => alive && setData({ state: 'error' }));
    return () => {
      alive = false;
    };
  }, [token, offline, apiUrl]);

  return (
    <Section title={t('accountReportsTitle')} index={2} hint={t('accountReportsHint')}>
      <>
        {data.state === 'loading' ? (
          <Row first icon={FileText} iconTone="neutral" title={t('accountReportsLoading')} trailing={<ActivityIndicator color={tc.inkMuted} />} testID="my-reports-loading" />
        ) : data.state === 'offline' ? (
          <Row first icon={WifiOff} iconTone="neutral" title={t('accountReportsOffline')} testID="my-reports-offline" />
        ) : data.state === 'error' ? (
          <Row first icon={TriangleAlert} iconTone="warn" title={t('accountReportsError')} testID="my-reports-error" />
        ) : data.reports.length === 0 ? (
          <Row first icon={FileText} iconTone="neutral" title={t('accountReportsEmpty')} testID="my-reports-empty" />
        ) : (
          data.reports.map((r, i) => {
            const line = reportLine(r, clockStartsAt, simulated);
            return <Row key={r.id} first={i === 0} icon={FileText} title={line.title} subtitle={line.subtitle} testID={`my-report-${r.id}`} />;
          })
        )}
      </>
    </Section>
  );
}
