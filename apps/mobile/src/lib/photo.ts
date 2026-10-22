import { PHOTO_MAX_BYTES } from '@vighnaway/contracts';

/** A photo ready to send: a small JPEG, re-encoded on the phone (which also drops its EXIF data). */
export interface CapturedPhoto {
  /** Local file, for the preview only. */
  uri: string;
  /** The JPEG bytes as base64 (no data: prefix). */
  data: string;
  bytes: number;
}

export type PhotoResult =
  | { ok: true; photo: CapturedPhoto }
  | { ok: false; reason: 'denied' | 'blocked' | 'cancelled' | 'failed' };

/** Longest side after resizing: enough to see a flooded road, small enough for a slow network. */
export const PHOTO_MAX_SIDE = 1280;
/** JPEG qualities tried in turn until the photo fits PHOTO_MAX_BYTES. */
const QUALITIES = [0.7, 0.55, 0.4, 0.3, 0.2];

/** Bytes of a base64 string (no data: prefix). */
export const base64Bytes = (b64: string): number => Math.floor((b64.length * 3) / 4) - (b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0);

/**
 * Opens the camera (asking for permission only now, because the traveller tapped Take photo), then
 * resizes and re-encodes the picture so it fits the upload limit. Nothing leaves the phone here.
 */
export async function takePhoto(): Promise<PhotoResult> {
  try {
    // Loaded only now: a phone whose installed build predates these native modules still opens the report screen
    // (and everything else), and Take photo reports "failed" instead of the whole app throwing on import.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImagePicker = require('expo-image-picker') as typeof import('expo-image-picker');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const ImageManipulator = require('expo-image-manipulator') as typeof import('expo-image-manipulator');
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return { ok: false, reason: perm.canAskAgain ? 'denied' : 'blocked' };
    const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: false, exif: false, quality: 1 });
    const asset = shot.canceled ? null : shot.assets[0];
    if (!asset) return { ok: false, reason: 'cancelled' };
    const resize = asset.width >= asset.height ? { width: Math.min(asset.width, PHOTO_MAX_SIDE) } : { height: Math.min(asset.height, PHOTO_MAX_SIDE) };
    for (const compress of QUALITIES) {
      const out = await ImageManipulator.manipulateAsync(asset.uri, [{ resize }], { compress, format: ImageManipulator.SaveFormat.JPEG, base64: true });
      if (!out.base64) continue;
      const bytes = base64Bytes(out.base64);
      if (bytes <= PHOTO_MAX_BYTES) return { ok: true, photo: { uri: out.uri, data: out.base64, bytes } };
    }
    return { ok: false, reason: 'failed' };
  } catch {
    return { ok: false, reason: 'failed' };
  }
}
