import { JournalEntry } from '../services/storage';

/**
 * Calculates the current streak based on journal entries.
 * A streak is defined as consecutive days with at least one journal entry.
 * - If the user has an entry today, the streak includes today.
 * - If the user has an entry yesterday but not today, the streak is still active (includes yesterday).
 * - If the user missed yesterday, the streak is broken (0), unless they have an entry today (1).
 * 
 * @param entries List of journal entries
 * @returns Current streak count
 */
export const calculateStreak = (entries: JournalEntry[]): number => {
  if (entries.length === 0) return 0;

  // 1. Extract unique dates (YYYY-MM-DD)
  const uniqueDates = Array.from(new Set(entries.map(e => {
    const d = new Date(e.date);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (uniqueDates.length === 0) return 0;

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

  // 2. Determine where to start counting
  // If the latest entry is neither today nor yesterday, the streak is broken (0).
  const latestDateStr = uniqueDates[0];
  if (latestDateStr !== todayStr && latestDateStr !== yesterdayStr) {
    return 0;
  }

  let streak = 0;
  let currentCheckDate = new Date(latestDateStr); // Start counting from the latest valid entry

  // 3. Count backwards
  for (const dateStr of uniqueDates) {
    const checkStr = `${currentCheckDate.getFullYear()}-${String(currentCheckDate.getMonth() + 1).padStart(2, '0')}-${String(currentCheckDate.getDate()).padStart(2, '0')}`;
    
    if (dateStr === checkStr) {
      streak++;
      // Move to previous day
      currentCheckDate.setDate(currentCheckDate.getDate() - 1);
    } else {
      // Gap found, stop counting
      break;
    }
  }

  return streak;
};

/**
 * Returns true if the user has already journaled today.
 */
export const hasJournaledToday = (entries: JournalEntry[]): boolean => {
    if (entries.length === 0) return false;
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    return entries.some(e => {
        const d = new Date(e.date);
        const entryDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return entryDateStr === todayStr;
    });
};
