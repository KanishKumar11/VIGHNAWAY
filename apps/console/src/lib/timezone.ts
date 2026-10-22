/**
 * Short label for a scenario's IANA timezone ("Asia/Kolkata" is "IST"), so the clock's zone comes
 * from the scenario instead of being typed into the header. `fallback` covers runtimes without the
 * zone, and zones that have no abbreviation ("GMT+4" is still shown as such).
 */
export function timezoneLabel(timezone: string | undefined, fallback: string): string {
  if (!timezone) return fallback;
  try {
    const parts = new Intl.DateTimeFormat('en-IN', { timeZone: timezone, timeZoneName: 'short' }).formatToParts(new Date());
    return parts.find((p) => p.type === 'timeZoneName')?.value ?? fallback;
  } catch {
    return fallback;
  }
}
