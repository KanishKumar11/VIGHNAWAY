import type { ReportInput } from '@vighnaway/contracts';
import type { DataGapQuestion } from '@vighnaway/engine';

export type Answer = 'yes' | 'no' | 'not_sure';

/**
 * An answer is an ordinary report, with the ordinary status: Yes files a flood report (depth not
 * given, which the engine treats as knee deep, conservatively); No files a Road clear report; Not
 * sure files nothing. Never Verified: only an operator action sets that. The traveller has not
 * confirmed they are at the road, so the report is not marked as personally observed.
 */
export function reportForAnswer(question: DataGapQuestion, answer: Answer, deviceId: string): ReportInput | null {
  if (answer === 'not_sure') return null;
  const common = { point: question.point, observedPersonally: false, deviceId } as const;
  return answer === 'yes' ? { type: 'flood', depth: null, ...common } : { type: 'road_clear', ...common };
}
