import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { useState } from 'react';
import * as Manipulator from 'expo-image-manipulator';
import * as Picker from 'expo-image-picker';
import { PHOTO_MAX_BYTES, ReportPhotoInputSchema } from '@vighnaway/contracts';
import { PhotoField } from '@/features/report/PhotoField';
import { flushPendingReports } from '@/features/live/liveSync';
import { base64Bytes, PHOTO_MAX_SIDE, takePhoto, type CapturedPhoto } from '@/lib/photo';
import { sendPhoto, submitReport } from '@/features/report/submit';
import { api } from '@/lib/api';
import { useConnection } from '@/stores/connection';
import { usePendingReports } from '@/stores/reports';
import { useToast } from '@/stores/toast';

const picker = Picker as jest.Mocked<typeof Picker>;
const manipulator = Manipulator as jest.Mocked<typeof Manipulator>;
const DEVICE = 'vw-test-device-01';
const input = { type: 'flood' as const, depth: 'ankle' as const, point: { lat: 19.12429, lng: 72.84673 }, observedPersonally: true, deviceId: DEVICE };
const PHOTO = { data: 'QUJD'.repeat(40) };

beforeEach(() => {
  jest.clearAllMocks();
  usePendingReports.setState({ pending: [] });
  useConnection.setState({ net: 'online' });
});

describe('takePhoto', () => {
  it('asks for the camera, resizes the long side and returns a small JPEG', async () => {
    const r = await takePhoto();
    expect(picker.requestCameraPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(r.ok && r.photo.uri).toBe('file:///cache/small.jpg');
    // A landscape 4000 x 3000 shot is resized by its width.
    expect(manipulator.manipulateAsync).toHaveBeenCalledWith('file:///camera/shot.jpg', [{ resize: { width: PHOTO_MAX_SIDE } }], expect.objectContaining({ base64: true, format: 'jpeg' }));
    expect(r.ok && r.photo.bytes).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
  });

  it('resizes a portrait shot by its height', async () => {
    picker.launchCameraAsync.mockResolvedValueOnce({ canceled: false, assets: [{ uri: 'file:///p.jpg', width: 3000, height: 4000 }] } as never);
    await takePhoto();
    expect(manipulator.manipulateAsync).toHaveBeenCalledWith('file:///p.jpg', [{ resize: { height: PHOTO_MAX_SIDE } }], expect.anything());
  });

  it('lowers the quality until the photo fits the upload limit, and gives up when it never does', async () => {
    const huge = 'A'.repeat(Math.ceil(((PHOTO_MAX_BYTES + 5000) * 4) / 3));
    manipulator.manipulateAsync
      .mockResolvedValueOnce({ uri: 'file:///a.jpg', base64: huge } as never)
      .mockResolvedValueOnce({ uri: 'file:///b.jpg', base64: 'QUJD'.repeat(500) } as never);
    const r = await takePhoto();
    expect(r.ok && r.photo.uri).toBe('file:///b.jpg');
    const qualities = manipulator.manipulateAsync.mock.calls.map((c) => (c[2] as { compress: number }).compress);
    expect(qualities[1]).toBeLessThan(qualities[0]!);

    // Every quality tried is still too big: five attempts, then it gives up.
    for (let i = 0; i < 5; i++) manipulator.manipulateAsync.mockResolvedValueOnce({ uri: 'file:///x.jpg', base64: huge } as never);
    expect(await takePhoto()).toEqual({ ok: false, reason: 'failed' });
  });

  it('reports a refused permission, a blocked one, a cancelled camera and a crash', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: true } as never);
    expect(await takePhoto()).toEqual({ ok: false, reason: 'denied' });
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false } as never);
    expect(await takePhoto()).toEqual({ ok: false, reason: 'blocked' });
    picker.launchCameraAsync.mockResolvedValueOnce({ canceled: true, assets: null } as never);
    expect(await takePhoto()).toEqual({ ok: false, reason: 'cancelled' });
    picker.launchCameraAsync.mockRejectedValueOnce(new Error('no camera'));
    expect(await takePhoto()).toEqual({ ok: false, reason: 'failed' });
  });

  it('counts base64 bytes the way the server decodes them', () => {
    expect(base64Bytes('QUJD')).toBe(3);
    expect(base64Bytes('QUI=')).toBe(2);
    expect(base64Bytes('QQ==')).toBe(1);
  });
});

function Harness() {
  const [photo, setPhoto] = useState<CapturedPhoto | null>(null);
  return <PhotoField photo={photo} onChange={setPhoto} />;
}

describe('PhotoField', () => {
  it('takes a photo, previews it, and lets the traveller remove it', async () => {
    await render(<Harness />);
    expect(screen.queryByTestId('photo-preview')).toBeNull();
    await fireEvent.press(screen.getByTestId('photo-take'));
    await waitFor(() => expect(screen.getByTestId('photo-preview')).toBeTruthy());
    expect(screen.getByText(/kB$/)).toBeTruthy();
    expect(screen.getByTestId('photo-retake')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('photo-remove'));
    expect(screen.queryByTestId('photo-preview')).toBeNull();
    expect(screen.getByTestId('photo-take')).toBeTruthy();
  });

  it('says what happened when the camera permission is blocked, and offers the settings', async () => {
    picker.requestCameraPermissionsAsync.mockResolvedValueOnce({ granted: false, canAskAgain: false } as never);
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('photo-take'));
    await waitFor(() => expect(screen.getByTestId('photo-notice')).toBeTruthy());
    expect(screen.getByText(/blocked for VIGHNAWAY/)).toBeTruthy();
    expect(screen.getByTestId('photo-settings')).toBeTruthy();
  });

  it('shows nothing when the camera is cancelled', async () => {
    picker.launchCameraAsync.mockResolvedValueOnce({ canceled: true, assets: null } as never);
    await render(<Harness />);
    await fireEvent.press(screen.getByTestId('photo-take'));
    await act(async () => undefined);
    expect(screen.queryByTestId('photo-notice')).toBeNull();
    expect(screen.queryByTestId('photo-preview')).toBeNull();
  });
});

describe('sending a photo with a report', () => {
  const accepted = { receipt: { reportId: 'sim:rep:u1' }, incident: null } as never;

  it('sends the report first, then the photo as its own request for the same report and device', async () => {
    const report = jest.spyOn(api, 'report').mockResolvedValue(accepted);
    const upload = jest.spyOn(api, 'reportPhoto').mockResolvedValue({ reportId: 'sim:rep:u1', sizeBytes: 3 });
    const outcome = await submitReport(input, PHOTO);
    expect(outcome).toEqual({ kind: 'sent', photo: 'sent' });
    expect(report.mock.invocationCallOrder[0]!).toBeLessThan(upload.mock.invocationCallOrder[0]!);
    expect(upload.mock.calls[0]![2]).toBe('sim:rep:u1');
    const body = upload.mock.calls[0]![3];
    expect(body).toMatchObject({ deviceId: DEVICE, contentType: 'image/jpeg' });
    expect(ReportPhotoInputSchema.safeParse(body).success).toBe(true);
  });

  it('keeps the report when the photo cannot be uploaded (an older server, a bad link)', async () => {
    jest.spyOn(api, 'report').mockResolvedValue(accepted);
    jest.spyOn(api, 'reportPhoto').mockRejectedValue(new Error('404'));
    expect(await submitReport(input, PHOTO)).toEqual({ kind: 'sent', photo: 'failed' });
    expect(await sendPhoto('sim', 'sim:rep:u1', DEVICE, PHOTO)).toBe('failed');
  });

  it('sends no photo request when none was taken', async () => {
    jest.spyOn(api, 'report').mockResolvedValue(accepted);
    const upload = jest.spyOn(api, 'reportPhoto');
    expect(await submitReport(input)).toEqual({ kind: 'sent', photo: 'none' });
    expect(upload).not.toHaveBeenCalled();
  });

  it('queues the photo with an offline report and uploads it after the report goes through', async () => {
    useConnection.setState({ net: 'offline' });
    expect(await submitReport(input, PHOTO)).toEqual({ kind: 'pending' });
    expect(usePendingReports.getState().pending[0]?.photo).toEqual(PHOTO);

    useConnection.setState({ net: 'online' });
    jest.spyOn(api, 'report').mockResolvedValue(accepted);
    const upload = jest.spyOn(api, 'reportPhoto').mockResolvedValue({ reportId: 'sim:rep:u1', sizeBytes: 3 });
    await flushPendingReports();
    expect(usePendingReports.getState().pending).toHaveLength(0);
    expect(upload).toHaveBeenCalledTimes(1);
  });

  it('warns when a queued report arrives but its photo cannot', async () => {
    useConnection.setState({ net: 'offline' });
    await submitReport(input, PHOTO);
    useConnection.setState({ net: 'online' });
    jest.spyOn(api, 'report').mockResolvedValue(accepted);
    jest.spyOn(api, 'reportPhoto').mockRejectedValue(new Error('down'));
    await flushPendingReports();
    expect(useToast.getState().toast?.message).toBe('Your report was sent, but the photo could not be uploaded.');
  });
});
