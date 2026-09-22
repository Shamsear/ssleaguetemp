/**
 * Utility functions for dynamic week range management across SS League
 */

export interface WeekRange {
  week: number;
  start: number;
  end: number;
  label: string;
}

/**
 * Returns week ranges based on max rounds or optional custom admin configuration.
 */
export function getWeekRanges(
  maxRounds: number = 26,
  adminCustomRanges?: Array<{ week: number; start: number; end: number }>
): WeekRange[] {
  if (adminCustomRanges && Array.isArray(adminCustomRanges) && adminCustomRanges.length > 0) {
    return adminCustomRanges.map((r, idx) => ({
      week: r.week || idx + 1,
      start: Number(r.start),
      end: Number(r.end),
      label: `Rounds ${r.start}-${r.end}`,
    }));
  }

  const total = maxRounds > 0 ? maxRounds : 26;

  // Standard 26-round preset
  if (total === 26) {
    return [
      { week: 1, start: 1, end: 7, label: 'Rounds 1-7' },
      { week: 2, start: 8, end: 13, label: 'Rounds 8-13' },
      { week: 3, start: 14, end: 20, label: 'Rounds 14-20' },
      { week: 4, start: 21, end: 26, label: 'Rounds 21-26' },
    ];
  }

  // Dynamic computation for any number of rounds
  const roundsPerWeek = 7;
  const numWeeks = Math.ceil(total / roundsPerWeek);
  const ranges: WeekRange[] = [];

  for (let w = 1; w <= numWeeks; w++) {
    const start = (w - 1) * roundsPerWeek + 1;
    const end = Math.min(w * roundsPerWeek, total);
    ranges.push({
      week: w,
      start,
      end,
      label: start === end ? `Round ${start}` : `Rounds ${start}-${end}`,
    });
  }

  return ranges;
}

/**
 * Get week range for a specific week number
 */
export function getWeekRangeByWeek(
  weekNumber: number,
  maxRounds: number = 26,
  adminCustomRanges?: any
): { start: number; end: number } {
  const ranges = getWeekRanges(maxRounds, adminCustomRanges);
  const found = ranges.find((r) => r.week === weekNumber);
  if (found) return { start: found.start, end: found.end };

  // Fallback for requested week
  const start = (weekNumber - 1) * 7 + 1;
  const end = Math.min(weekNumber * 7, maxRounds > 0 ? maxRounds : weekNumber * 7);
  return { start, end: Math.max(start, end) };
}

/**
 * Find which week a given round belongs to
 */
export function getWeekForRound(
  roundNumber: number,
  weekRanges?: WeekRange[]
): number {
  if (!weekRanges || weekRanges.length === 0) {
    return Math.max(1, Math.ceil(roundNumber / 7));
  }
  const found = weekRanges.find((w) => roundNumber >= w.start && roundNumber <= w.end);
  if (found) return found.week;
  return Math.max(1, Math.ceil(roundNumber / 7));
}
