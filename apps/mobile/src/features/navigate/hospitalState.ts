import type { HospitalStateValue } from '@vighnaway/contracts';
import { t } from '@/i18n/en';

/**
 * The line under a hospital in the search results when the control room has marked it Busy or Diverting. It says who
 * set it (and "simulated" in the demo), because the state is an operator's word, not a fact the app can check, and
 * it only affects which hospital is suggested: it never closes a road.
 */
export function hospitalStateNote(state: HospitalStateValue | undefined, simulated: boolean): string | null {
  if (!state || state === 'accepting') return null;
  const label = t(state === 'busy' ? 'hospitalBusy' : 'hospitalDiverting');
  return `${label}. ${t(simulated ? 'hospitalSetBySimulated' : 'hospitalSetBy')}`;
}
