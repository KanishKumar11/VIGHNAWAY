import * as Speech from 'expo-speech';
import { getLanguage, speechTag } from '@/i18n/lang';
import { useSettings } from '@/stores/settings';
import { useTrip } from '@/stores/trip';

/**
 * Spoken route changes (DESIGN_VISION appendix A). Speaks only during a trip (or in Drive mode)
 * and only while Settings > Speak route changes is on. Uses the selected language when the phone
 * has a voice for it, otherwise the English sentence from the engine.
 */
const voiceCache = new Map<string, boolean>();

export async function hasVoiceFor(tag: string): Promise<boolean> {
  const base = tag.split('-')[0]!.toLowerCase();
  if (base === 'en') return true;
  const cached = voiceCache.get(base);
  if (cached !== undefined) return cached;
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    const ok = voices.some((v) => (v.language ?? '').toLowerCase().replace('_', '-').startsWith(base));
    voiceCache.set(base, ok);
    return ok;
  } catch {
    return false;
  }
}

let driveOpen = false;
/** Drive mode counts as "during a trip" for speech, even before Start trip. */
export function setDriveOpen(open: boolean): void {
  driveOpen = open;
}

/** Whether a route change should be spoken now. */
export function shouldSpeak(): boolean {
  if (!useSettings.getState().speakChanges) return false;
  return useTrip.getState().mode === 'en_route' || driveOpen;
}

/** Speak a route change; resolves to what was spoken (for tests), or null. */
export async function speakChange(speech: { text: string; englishFallback: string } | null): Promise<{ text: string; language: string } | null> {
  if (!speech || !shouldSpeak()) return null;
  const tag = speechTag[getLanguage()];
  const local = await hasVoiceFor(tag);
  const text = local ? speech.text : speech.englishFallback;
  const language = local ? tag : speechTag.en;
  try {
    Speech.stop();
    Speech.speak(text, { language, rate: 0.95 });
  } catch {
    return null;
  }
  return { text, language };
}

/** Clear cached voice lookups (tests). */
export function resetSpeechCache(): void {
  voiceCache.clear();
}
