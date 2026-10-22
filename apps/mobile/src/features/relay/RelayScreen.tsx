import { REPORT_TYPE_LABEL, type ReportInput } from '@vighnaway/contracts';
import { useEffect, useMemo } from 'react';
import { FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '@/components/AppText';
import { ModeBadge } from '@/components/EvidenceChips';
import { QrCode } from '@/components/QrCode';
import { ThemedStatusBar } from '@/components/ThemedStatusBar';
import { Card, GUTTER, ScreenHeader, StatusBarScrim } from '@/components/ui';
import { t } from '@/i18n/en';
import { newClientReportId, relayMatrix, type QrMatrix } from '@/lib/relay';
import { usePendingReports, type PendingReport } from '@/stores/reports';
import { useScenario } from '@/stores/scenario';
import { createStyles, spacing } from '@/theme';

/** The QR is dark on white at this size: large enough to scan from an arm's length. */
const QR_SIZE = 248;

/** The code for one pending report, or null when it cannot be made (the report stays queued either way). */
export function matrixFor(p: PendingReport): QrMatrix | null {
  if (!p.input.clientReportId) return null;
  try {
    return relayMatrix(p.scenarioId, p.input);
  } catch {
    return null;
  }
}

/**
 * Offline QR relay (P2-2.b). With no signal a report waits on the phone; this shows each waiting report as a
 * QR code that anyone with a connection can scan (VIGHNAWAY's console or app) to send it for you. The report
 * keeps its device id and the time you saw it; the server records when it arrived, and a relayer adds no weight.
 */
export function RelayScreen() {
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const pending = usePendingReports((s) => s.pending);
  const scenarioId = useScenario((s) => s.scenario.id);
  const stamp = usePendingReports((s) => s.stampMissingIds);
  // Reports queued before codes existed get their id now, once, so they can be shown too.
  useEffect(() => stamp(newClientReportId), [stamp, pending.length]);
  const mine = useMemo(() => pending.filter((p) => p.scenarioId === scenarioId), [pending, scenarioId]);

  return (
    <View style={styles.root}>
      <ThemedStatusBar />
      <StatusBarScrim />
      <FlatList
        data={mine}
        keyExtractor={(p) => p.localId}
        ListHeaderComponent={
          <View style={styles.headerBleed}>
            <ScreenHeader title={t('relayTitle')} leading="close" trailing={<ModeBadge onShell compact />} />
            <AppText tone="muted" style={styles.intro}>
              {t('relayIntro')}
            </AppText>
          </View>
        }
        contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl, paddingLeft: insets.left + GUTTER, paddingRight: insets.right + GUTTER }]}
        ListEmptyComponent={
          <Card style={styles.empty} testID="relay-empty">
            <AppText variant="title" style={styles.center}>
              {t('relayEmptyTitle')}
            </AppText>
            <AppText tone="muted" style={styles.center}>
              {t('relayEmpty')}
            </AppText>
          </Card>
        }
        renderItem={({ item }) => <RelayItem p={item} />}
      />
    </View>
  );
}

function RelayItem({ p }: { p: PendingReport }) {
  const styles = useStyles();
  const matrix = useMemo(() => matrixFor(p), [p]);
  const type = REPORT_TYPE_LABEL[(p.input as ReportInput).type];
  return (
    <Card style={styles.item} testID={`relay-item-${p.localId}`}>
      <AppText variant="title">{t('relayItem', { type })}</AppText>
      <AppText tone="muted" variant="meta">
        {t('relayState')}
      </AppText>
      {matrix ? (
        <View style={styles.qr}>
          <QrCode matrix={matrix} size={QR_SIZE} label={t('relayCodeLabel', { type })} testID={`relay-qr-${p.localId}`} />
        </View>
      ) : (
        <AppText tone="danger" testID={`relay-noqr-${p.localId}`}>
          {t('relayNoCode')}
        </AppText>
      )}
    </Card>
  );
}

const useStyles = createStyles((tc) => ({
  root: { flex: 1, backgroundColor: tc.shell },
  list: { gap: spacing.md },
  headerBleed: { marginHorizontal: -GUTTER, gap: spacing.sm, paddingBottom: spacing.md },
  intro: { paddingHorizontal: GUTTER },
  item: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg },
  qr: { marginTop: spacing.sm },
  empty: { alignItems: 'center', gap: spacing.xs, paddingHorizontal: spacing.lg, paddingVertical: spacing.xl },
  center: { textAlign: 'center' },
}));
