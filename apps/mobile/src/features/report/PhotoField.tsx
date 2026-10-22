import { useState } from 'react';
import { ActivityIndicator, Image, Linking, View } from 'react-native';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Camera, RefreshCw, X } from '@/components/icons';
import { PressScale } from '@/components/motion';
import { t, type StringKey } from '@/i18n/en';
import { haptic } from '@/lib/feedback';
import { takePhoto, type CapturedPhoto } from '@/lib/photo';
import { createStyles, fontFamily, hairline, layout, radius, shadow, spacing, useColors, withAlpha } from '@/theme';

const THUMB = spacing.xl * 3;

/**
 * The optional photo of the place in a report. The camera opens (and asks for permission) only when
 * the traveller taps Take photo; the picture is shrunk and re-encoded on the phone and shown here as
 * a preview they can retake or remove. Nothing is uploaded until the report is sent.
 */
export function PhotoField({ photo, onChange }: { photo: CapturedPhoto | null; onChange: (p: CapturedPhoto | null) => void }) {
  const tc = useColors();
  const styles = useStyles();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ text: string; settings: boolean } | null>(null);

  const capture = async () => {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    const r = await takePhoto();
    setBusy(false);
    if (r.ok) {
      haptic.selection();
      onChange(r.photo);
      return;
    }
    const keys: Partial<Record<typeof r.reason, StringKey>> = { denied: 'photoDenied', blocked: 'photoBlocked', failed: 'photoFailed' };
    const key = keys[r.reason];
    if (key) setNotice({ text: t(key), settings: r.reason === 'blocked' });
  };

  const kb = photo ? String(Math.max(1, Math.round(photo.bytes / 1000))) : '';

  return (
    <View style={styles.wrap}>
      {photo ? (
        <View style={styles.preview} testID="photo-preview">
          <Image source={{ uri: photo.uri }} style={styles.thumb} resizeMode="cover" accessibilityLabel={t('photoPreviewA11y', { kb })} />
          <View style={styles.previewSide}>
            <AppText variant="meta" tone="muted">
              {t('photoSize', { kb })}
            </AppText>
            <Button label={t('photoRetake')} kind="secondary" icon={RefreshCw} onPress={() => void capture()} loading={busy} testID="photo-retake" />
            <Button label={t('photoRemove')} kind="ghost" icon={X} onPress={() => onChange(null)} testID="photo-remove" />
          </View>
        </View>
      ) : (
        <PressScale
          onPress={() => void capture()}
          haptic="selection"
          accessibilityRole="button"
          accessibilityLabel={t('photoTakeA11y')}
          accessibilityHint={t('photoHint')}
          style={[styles.take, shadow('sm')]}
          testID="photo-take"
        >
          <View style={styles.tile}>{busy ? <ActivityIndicator size="small" color={tc.accentInk} /> : <Camera size={22} color={tc.accentInk} strokeWidth={2.25} />}</View>
          <View style={styles.takeText}>
            <AppText variant="body" style={styles.strong}>
              {t('photoTake')}
            </AppText>
            <AppText variant="meta" tone="muted">
              {t('photoHint')}
            </AppText>
          </View>
        </PressScale>
      )}
      {notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <AppText variant="meta" tone="warn" testID="photo-notice">
            {notice.text}
          </AppText>
          {notice.settings ? <Button label={t('photoOpenSettings')} kind="secondary" onPress={() => void Linking.openSettings()} testID="photo-settings" /> : null}
        </View>
      ) : null}
    </View>
  );
}

const useStyles = createStyles((tc) => ({
  wrap: { gap: spacing.sm },
  strong: { fontFamily: fontFamily.semibold },
  take: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTouch + spacing.md,
    padding: spacing.sm,
    borderRadius: radius.sheet,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    // A soft accent edge: the label and the camera disc say what this is, so the edge need not shout.
    borderColor: withAlpha(tc.accent, 0.45),
    backgroundColor: tc.panel,
  },
  tile: { width: spacing.xl + spacing.sm, height: spacing.xl + spacing.sm, borderRadius: radius.chip, backgroundColor: tc.tealSoft, alignItems: 'center', justifyContent: 'center' },
  takeText: { flex: 1, gap: spacing.xxs },
  preview: { flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' },
  thumb: { width: THUMB, height: THUMB, borderRadius: radius.sheet, backgroundColor: tc.panelSunken, borderWidth: hairline, borderColor: tc.panelLine },
  previewSide: { flex: 1, gap: spacing.xs },
  notice: { gap: spacing.xs },
}));
