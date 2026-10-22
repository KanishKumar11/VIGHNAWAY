'use client';

import { useMutation } from '@tanstack/react-query';
import { INCIDENT_STATUS_LABEL, REPORT_TYPE_LABEL, type ReportResponse } from '@vighnaway/contracts';
import { ScanLine } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { t } from '@/i18n';
import { api, ApiError } from '@/lib/api';
import { checkRelay, readQr } from '@/lib/relayScan';
import { useScenarioStore } from '@/stores/scenario';

/** How often a camera frame is read, and the widest frame that is analysed (a QR code needs no more). */
const SCAN_MS = 250;
const FRAME_WIDTH = 640;

interface Relayed {
  clientReportId: string;
  line: string;
}

/**
 * Offline QR relay (P2-2.c). Anyone with a network can scan a phone's pending-report code (webcam) or paste its
 * text, and this sends the report exactly as the phone would have: same device id, same limits, the server's
 * own received time. Sending the same code twice stores it once (the server returns the original receipt).
 * A relayer adds no weight to a report, and nothing is sent until the code has been checked.
 */
export function RelayScanner() {
  const scenarioId = useScenarioStore((s) => s.id);
  const [open, setOpen] = useState(false);
  const [paste, setPaste] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [camera, setCamera] = useState<'starting' | 'on' | 'unavailable'>('starting');
  const [done, setDone] = useState<Relayed[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const seen = useRef<Set<string>>(new Set());

  const send = useMutation({
    mutationFn: async (text: string) => {
      const check = checkRelay(text, scenarioId);
      if (!check.ok) throw new RelayRefused(check.reason);
      const res: ReportResponse = await api.report(check.payload.s, check.payload.r);
      return { res, id: check.payload.r.clientReportId!, type: check.payload.r.type };
    },
    onSuccess: ({ res, id, type }) => {
      setProblem(null);
      const status = res.incident ? INCIDENT_STATUS_LABEL[res.incident.status] : null;
      const line =
        res.receipt.outcome === 'off_map'
          ? t.relay.relayedOffMap(REPORT_TYPE_LABEL[type])
          : t.relay.relayed(REPORT_TYPE_LABEL[type], res.receipt.roadName ?? t.relay.unnamedRoad, status);
      setDone((cur) => (cur.some((d) => d.clientReportId === id) ? cur : [{ clientReportId: id, line }, ...cur]));
    },
    onError: (e, text) => {
      seen.current.delete(text);
      setProblem(describe(e));
    },
  });
  const submit = send.mutate;

  const handleText = useCallback(
    (text: string) => {
      // A code stays in front of the camera for many frames: act on it once.
      if (seen.current.has(text)) return;
      seen.current.add(text);
      submit(text);
    },
    [submit],
  );

  // Webcam: only while the dialog is open, and always released on close.
  useEffect(() => {
    if (!open) return;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let stopped = false;
    const canvas = document.createElement('canvas');
    setCamera('starting');
    seen.current = new Set();
    void (async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera api');
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (stopped) return stream.getTracks().forEach((tr) => tr.stop());
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play().catch(() => undefined);
        setCamera('on');
        timer = setInterval(() => {
          if (!video.videoWidth) return;
          const scale = Math.min(1, FRAME_WIDTH / video.videoWidth);
          canvas.width = Math.round(video.videoWidth * scale);
          canvas.height = Math.round(video.videoHeight * scale);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return;
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const text = readQr(ctx.getImageData(0, 0, canvas.width, canvas.height));
          if (text) handleText(text);
        }, SCAN_MS);
      } catch {
        if (!stopped) setCamera('unavailable');
      }
    })();
    return () => {
      stopped = true;
      if (timer) clearInterval(timer);
      stream?.getTracks().forEach((tr) => tr.stop());
    };
  }, [open, handleText]);

  return (
    <>
      <div className="min-w-0 flex-1">
        <Button variant="outline" onClick={() => setOpen(true)} className="h-auto min-h-16 w-full flex-col gap-1 px-1 py-2 text-center text-meta leading-tight" aria-label={t.relay.open} title={t.relay.open} data-testid="relay-open">
          <ScanLine aria-hidden className="size-5" />
          {t.relay.openShort}
        </Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(94vw,calc(var(--spacing)*150))]">
          <DialogTitle>{t.relay.title}</DialogTitle>
          <DialogDescription>{t.relay.intro}</DialogDescription>

          <div className="relative mt-4 aspect-video overflow-hidden rounded-card border border-control-border bg-panel-sunken">
            <video ref={videoRef} muted playsInline className="size-full object-cover" aria-label={t.relay.cameraLabel} />
            {camera !== 'on' && (
              <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-body text-ink-muted" data-testid="relay-camera-state">
                {camera === 'starting' ? t.relay.cameraStarting : t.relay.cameraUnavailable}
              </p>
            )}
          </div>

          <label className="mt-4 flex flex-col gap-1">
            <span className="text-meta font-medium text-ink-muted">{t.relay.pasteLabel}</span>
            <textarea
              value={paste}
              onChange={(e) => setPaste(e.target.value)}
              rows={3}
              spellCheck={false}
              className="rounded-button border border-control-border bg-panel-raised p-3 font-mono text-meta text-ink"
              data-testid="relay-paste"
            />
          </label>
          <div className="mt-2 flex justify-end">
            <Button
              disabled={!paste.trim() || send.isPending}
              onClick={() => {
                handleText(paste.trim());
                // The same text can be sent again on purpose (the server stores it once).
                seen.current.delete(paste.trim());
              }}
              data-testid="relay-send"
            >
              {t.relay.send}
            </Button>
          </div>

          {problem && (
            <p role="alert" className="mt-3 text-body font-semibold text-danger-ink" data-testid="relay-problem">
              {problem}
            </p>
          )}
          {done.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2" data-testid="relay-done" aria-live="polite">
              {done.map((d) => (
                <li key={d.clientReportId} className="rounded-card border border-panel-line bg-panel px-4 py-2 text-body text-ink">
                  {d.line}
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-meta text-ink-muted">{t.relay.footnote}</p>
        </DialogContent>
      </Dialog>
    </>
  );
}

class RelayRefused extends Error {
  constructor(readonly reason: 'not_vighnaway' | 'too_long' | 'bad_json' | 'bad_payload' | 'other_scenario') {
    super(reason);
  }
}

function describe(e: unknown): string {
  if (e instanceof RelayRefused) return t.relay.refused[e.reason];
  if (e instanceof ApiError) {
    if (e.code === 'NOT_ON_ROAD') return t.relay.notOnRoad;
    if (e.status === 429) return t.relay.rateLimited;
    return t.relay.failed(e.message);
  }
  return t.relay.failed(e instanceof Error ? e.message : String(e));
}
