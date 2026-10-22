import {
  REPORT_DESCRIPTION_MAX,
  ReportInputSchema,
  type CongestionLevel,
  type Depth,
  type LatLng,
  type ReportInput,
  type ReportType,
  type Severity,
} from '@vighnaway/contracts';
import { t } from '@/i18n/en';

export interface ReportDraft {
  type: ReportType | null;
  /** 'not_sure' sends no depth (the engine treats it as knee deep). */
  depth: Depth | 'not_sure' | null;
  congestion: CongestionLevel | null;
  severity: Severity | null;
  impassable: boolean;
  point: LatLng | null;
  note: string;
  observedPersonally: boolean;
}

export const emptyDraft: ReportDraft = {
  type: null,
  depth: null,
  congestion: null,
  severity: null,
  impassable: false,
  point: null,
  note: '',
  observedPersonally: true,
};

export type ReportField = 'type' | 'congestion' | 'note' | 'point' | 'form';
export type ReportErrors = Partial<Record<ReportField, string>>;

export type ValidationResult = { ok: true; input: ReportInput } | { ok: false; errors: ReportErrors };

/** Validates the form with the same schema the API uses; messages are the UX_FLOWS copy. */
export function validateReport(draft: ReportDraft, deviceId: string): ValidationResult {
  const errors: ReportErrors = {};
  if (!draft.type) errors.type = t('errChooseType');
  if (draft.type === 'congestion' && !draft.congestion) errors.congestion = t('errChooseCongestion');
  const note = draft.note.trim();
  if (note.length > REPORT_DESCRIPTION_MAX) errors.note = t('errNoteTooLong');
  if (!draft.point) errors.point = t('errChooseLocation');
  if (Object.keys(errors).length || !draft.type || !draft.point) return { ok: false, errors };

  const type = draft.type;
  const input: ReportInput = {
    type,
    point: draft.point,
    observedPersonally: draft.observedPersonally,
    deviceId,
    ...(type === 'flood' && draft.depth && draft.depth !== 'not_sure' ? { depth: draft.depth } : null),
    ...(type === 'congestion' && draft.congestion ? { congestion: draft.congestion } : null),
    ...((type === 'debris' || type === 'accident') && draft.severity ? { severity: draft.severity } : null),
    ...((type === 'debris' || type === 'accident') && draft.impassable ? { impassable: true } : null),
    ...(note ? { description: note } : null),
  };
  const parsed = ReportInputSchema.safeParse(input);
  if (!parsed.success) {
    const out: ReportErrors = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (field === 'congestion') out.congestion = t('errChooseCongestion');
      else if (field === 'description') out.note = t('errNoteTooLong');
      else if (field === 'type') out.type = t('errChooseType');
      else out.form = issue.message;
    }
    return { ok: false, errors: out };
  }
  return { ok: true, input: parsed.data };
}
