// Inlined logic from utils/date.ts for testing purposes
// This avoids ts-node module resolution issues in the current environment

interface JournalEntry {
  id: string;
  date: string;
  title: string;
  summary: string;
  emotion: 'happy' | 'sad' | 'excited' | 'calm' | 'tired' | 'neutral';
  duration?: number;
  createdAt: number;
}

const calculateStreak = (entries: JournalEntry[]): number => {
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

// --- Mock Data Helpers ---

const mockEntry = (date: string): JournalEntry => ({
    id: 'test',
    date,
    title: 'Test',
    summary: 'Test',
    emotion: 'neutral',
    createdAt: new Date(date).getTime()
});

const runTests = () => {
    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;

    const twoDaysAgo = new Date();
    twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
    const twoDaysAgoStr = `${twoDaysAgo.getFullYear()}-${String(twoDaysAgo.getMonth() + 1).padStart(2, '0')}-${String(twoDaysAgo.getDate()).padStart(2, '0')}`;

    console.log('Running Streak Logic Tests (Inlined)...\n');

    // Case 1: No entries
    const case1 = calculateStreak([]);
    console.log(`Case 1 (No entries): Expected 0, Got ${case1} -> ${case1 === 0 ? 'PASS' : 'FAIL'}`);

    // Case 2: Today only
    const case2 = calculateStreak([mockEntry(todayStr)]);
    console.log(`Case 2 (Today only): Expected 1, Got ${case2} -> ${case2 === 1 ? 'PASS' : 'FAIL'}`);

    // Case 3: Yesterday only (Active streak of 1)
    const case3 = calculateStreak([mockEntry(yesterdayStr)]);
    console.log(`Case 3 (Yesterday only): Expected 1, Got ${case3} -> ${case3 === 1 ? 'PASS' : 'FAIL'}`);
    
    // Case 4: Today + Yesterday (Streak 2)
    const case4 = calculateStreak([mockEntry(todayStr), mockEntry(yesterdayStr)]);
    console.log(`Case 4 (Today + Yesterday): Expected 2, Got ${case4} -> ${case4 === 2 ? 'PASS' : 'FAIL'}`);

    // Case 5: Today + 2 days ago (Gap, so streak 1)
    const case5 = calculateStreak([mockEntry(todayStr), mockEntry(twoDaysAgoStr)]);
    console.log(`Case 5 (Today + Gap): Expected 1, Got ${case5} -> ${case5 === 1 ? 'PASS' : 'FAIL'}`);

    // Case 6: 2 days ago only (Broken streak)
    const case6 = calculateStreak([mockEntry(twoDaysAgoStr)]);
    console.log(`Case 6 (2 days ago): Expected 0, Got ${case6} -> ${case6 === 0 ? 'PASS' : 'FAIL'}`);

    // Case 7: Duplicate dates (Should ignore duplicates)
    const case7 = calculateStreak([mockEntry(todayStr), mockEntry(todayStr), mockEntry(yesterdayStr)]);
    console.log(`Case 7 (Duplicates): Expected 2, Got ${case7} -> ${case7 === 2 ? 'PASS' : 'FAIL'}`);
};

runTests();
