import { en, t, type StringKey } from '@/i18n/en';
import { fmtDistance } from '@/i18n/format';
import { departBearingName, type GuidePath, type Maneuver, type TurnKind } from './guide';

const TURN_KEY: Record<Exclude<TurnKind, 'depart' | 'arrive'>, StringKey> = {
  left: 'guideLeft',
  right: 'guideRight',
  slight_left: 'guideSlightLeft',
  slight_right: 'guideSlightRight',
  sharp_left: 'guideSharpLeft',
  sharp_right: 'guideSharpRight',
  uturn: 'guideUturn',
};

const DIR_KEY = {
  north: 'dirNorth',
  northeast: 'dirNortheast',
  east: 'dirEast',
  southeast: 'dirSoutheast',
  south: 'dirSouth',
  southwest: 'dirSouthwest',
  west: 'dirWest',
  northwest: 'dirNorthwest',
} as const satisfies Record<string, StringKey>;

type Say = (key: StringKey, params?: Record<string, string | number>) => string;

/** English, whatever the app language is: the voice falls back to it when the phone has no voice for the language. */
const sayEnglish: Say = (key, params) =>
  (en[key] as string).replace(/\{(\w+)\}/g, (m, name: string) => (params?.[name] === undefined ? m : String(params[name])));

const lower = (s: string) => (s ? s.charAt(0).toLowerCase() + s.slice(1) : s);

/** "Turn left onto Ram Tirath Road", "Head north on X", "You have arrived". No distance. */
export function maneuverText(m: Maneuver, path: Pick<GuidePath, 'startBearing'>, say: Say = t): string {
  if (m.kind === 'arrive') return say('guideArrive');
  if (m.kind === 'depart') {
    const dir = say(DIR_KEY[departBearingName(path.startBearing)]);
    return m.name ? say('guideDepartOn', { dir, road: m.name }) : say('guideDepart', { dir });
  }
  const turn = say(TURN_KEY[m.kind]);
  return m.name ? say('guideOnto', { turn, road: m.name }) : turn;
}

/** With the distance to it: "In 200 m, turn left onto X". Within a few metres it is just the instruction. */
export function instructionText(m: Maneuver, distM: number, path: Pick<GuidePath, 'startBearing'>, say: Say = t): string {
  const base = maneuverText(m, path, say);
  if (m.kind === 'arrive' || m.kind === 'depart' || distM < 25) return base;
  return say('guideIn', { dist: fmtDistance(distM), turn: lower(base) });
}

/** What to say aloud: the phone's language and the English fallback. */
export function spokenInstruction(m: Maneuver, distM: number, path: Pick<GuidePath, 'startBearing'>): { text: string; englishFallback: string } {
  return { text: instructionText(m, distM, path, t), englishFallback: instructionText(m, distM, path, sayEnglish) };
}
