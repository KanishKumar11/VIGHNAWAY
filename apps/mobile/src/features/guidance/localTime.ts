import type { Profile } from '@vighnaway/contracts';
import { useGuidance } from '@/stores/guidance';
import { useSettings } from '@/stores/settings';
import { useTrip } from '@/stores/trip';
import type { GuidePath, GuideProgress } from './guide';
import type { AccessLeg } from './localRoads';
import { localSpeedKmh } from './localRoads';

/** Seconds on the local roads still ahead: the whole of both legs before the trip, what is left of them during it. */
export function localTimeS(profile: Profile, from: AccessLeg | null, to: AccessLeg | null, path: GuidePath | null, progress: GuideProgress | null): number {
  const mps = localSpeedKmh(profile) / 3.6;
  const fromLeft = from ? (progress ? Math.max(0, from.lengthM - progress.alongM) : from.lengthM) : 0;
  const toLeft = to ? (progress && path ? Math.min(to.lengthM, Math.max(0, path.totalM - progress.alongM)) : to.lengthM) : 0;
  return Math.round((fromLeft + toLeft) / mps);
}

/** The same for the trip on screen (0 when there are no local legs for it). */
export function useLocalTimeS(): number {
  const profile = useSettings((s) => s.profile);
  const key = useTrip((s) => `${profile}|${s.originId}|${s.destinationId ?? 'none'}`);
  const g = useGuidance((s) => (s.key === key && s.status === 'ready' ? s : null));
  return g ? localTimeS(profile, g.from, g.to, g.path, g.progress) : 0;
}
