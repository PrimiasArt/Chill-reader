import test from 'node:test';
import assert from 'node:assert/strict';

function getTodayDateString(d = new Date()) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getYesterdayDateString(d = new Date()) {
  const prev = new Date(d);
  prev.setDate(prev.getDate() - 1);
  const year = prev.getFullYear();
  const month = String(prev.getMonth() + 1).padStart(2, '0');
  const day = String(prev.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function calculateStreak(lastActiveDate, currentStreak, todayDate, yesterdayDate) {
  if (!lastActiveDate) return 1;
  if (lastActiveDate === todayDate) return currentStreak;
  if (lastActiveDate === yesterdayDate) return currentStreak + 1;
  return 1; // missed a day
}

test('Reading Stats - Date Format', () => {
  const today = getTodayDateString();
  assert.match(today, /^\d{4}-\d{2}-\d{2}$/, 'Date format should match YYYY-MM-DD');

  const yesterday = getYesterdayDateString();
  assert.match(yesterday, /^\d{4}-\d{2}-\d{2}$/, 'Yesterday format should match YYYY-MM-DD');
  assert.notEqual(today, yesterday, 'Yesterday must be different from today');
});

test('Reading Stats - Streak Calculation Logic', () => {
  const today = '2026-10-16';
  const yesterday = '2026-10-15';
  const twoDaysAgo = '2026-10-14';

  // 1. First time reading
  assert.equal(calculateStreak('', 0, today, yesterday), 1);

  // 2. Reading again on the same day -> streak stays the same
  assert.equal(calculateStreak(today, 5, today, yesterday), 5);

  // 3. Consecutive day (read yesterday and reading today) -> streak + 1
  assert.equal(calculateStreak(yesterday, 3, today, yesterday), 4);

  // 4. Missed day (last active 2 days ago) -> resets to 1
  assert.equal(calculateStreak(twoDaysAgo, 7, today, yesterday), 1);
});
