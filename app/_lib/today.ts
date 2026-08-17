import type { Day } from '@/core/dates.ts';

/**
 * "Today," read once — the one place in the whole app that touches the wall
 * clock. `src/numbers/`'s own doc comments promise nothing under it ever
 * does; this is the edge those comments point to.
 *
 * Correct because sluice is localhost, single-user: the server *is* the
 * household's own machine, so its local time and the reader's are the same
 * clock by construction. Would need revisiting the day this ever runs
 * anywhere else.
 */
export function todayAsDay(): Day {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}` as Day;
}
