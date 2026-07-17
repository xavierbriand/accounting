// Seconds-resolution stamp for export bundle names (story-4.5b). The existing
// nodeClock (node-clock.ts) is date-only and would collide on same-day
// exports; hyphens throughout (no colons) keep the stamp filesystem-safe as a
// directory-name component.
export function nodeTimestampClock(timezone: string = 'Europe/Paris'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(new Date());

  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? '';

  return `${get('year')}-${get('month')}-${get('day')}T${get('hour')}-${get('minute')}-${get('second')}`;
}
