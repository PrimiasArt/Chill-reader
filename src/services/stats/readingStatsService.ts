/**
 * Reading Statistics & Daily Streaks Tracker Service
 */

import { db } from '../db';

export interface ReadingStats {
  totalSeconds: number;
  todaySeconds: number;
  currentStreakDays: number;
  longestStreakDays: number;
  lastActiveDate: string; // 'YYYY-MM-DD'
  dailyHistory: Record<string, number>; // date -> seconds
  totalWordsRead: number;
  totalChaptersCompleted: number;
}

const STATS_KEY = 'chill_reader_reading_stats';

const DEFAULT_STATS: ReadingStats = {
  totalSeconds: 0,
  todaySeconds: 0,
  currentStreakDays: 1,
  longestStreakDays: 1,
  lastActiveDate: '',
  dailyHistory: {},
  totalWordsRead: 0,
  totalChaptersCompleted: 0
};

export function getTodayDateString(): string {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getYesterdayDateString(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

class ReadingStatsService {
  private stats: ReadingStats = { ...DEFAULT_STATS };
  private isLoaded = false;
  private listeners: ((stats: ReadingStats) => void)[] = [];
  private saveDebounceTimer: any = null;

  constructor() {
    this.loadStats();
  }

  public async loadStats(): Promise<ReadingStats> {
    try {
      const saved = await db.getSetting<ReadingStats>(STATS_KEY, DEFAULT_STATS);
      this.stats = this.normalizeStats(saved);
      this.isLoaded = true;
      this.notifyListeners();
      return this.stats;
    } catch {
      this.stats = { ...DEFAULT_STATS };
      this.isLoaded = true;
      return this.stats;
    }
  }

  private normalizeStats(raw: ReadingStats): ReadingStats {
    const today = getTodayDateString();
    const yesterday = getYesterdayDateString();

    const normalized: ReadingStats = {
      ...DEFAULT_STATS,
      ...raw,
      dailyHistory: { ...(raw?.dailyHistory || {}) }
    };

    // Calculate today's seconds from history
    normalized.todaySeconds = normalized.dailyHistory[today] || 0;

    // Check streak continuation
    if (!normalized.lastActiveDate) {
      normalized.currentStreakDays = 1;
      normalized.lastActiveDate = today;
    } else if (normalized.lastActiveDate === today) {
      // Already active today, streak remains
    } else if (normalized.lastActiveDate === yesterday) {
      // Was active yesterday, user is reading today -> increment streak
      normalized.currentStreakDays = (normalized.currentStreakDays || 0) + 1;
      normalized.lastActiveDate = today;
      if (normalized.currentStreakDays > normalized.longestStreakDays) {
        normalized.longestStreakDays = normalized.currentStreakDays;
      }
    } else {
      // Missed more than 1 day -> reset streak to 1
      normalized.currentStreakDays = 1;
      normalized.lastActiveDate = today;
    }

    return normalized;
  }

  public async getStats(): Promise<ReadingStats> {
    if (!this.isLoaded) {
      return await this.loadStats();
    }
    return this.stats;
  }

  /**
   * Track seconds read or listened
   */
  public addReadingSeconds(seconds: number) {
    if (seconds <= 0) return;
    const today = getTodayDateString();

    this.stats.totalSeconds += seconds;
    this.stats.dailyHistory[today] = (this.stats.dailyHistory[today] || 0) + seconds;
    this.stats.todaySeconds = this.stats.dailyHistory[today];

    // Estimated 3.5 words read per second of reading or TTS listening
    this.stats.totalWordsRead += Math.round(seconds * 3.5);

    this.scheduleSave();
    this.notifyListeners();
  }

  /**
   * Track completed chapter
   */
  public recordChapterCompleted(estimatedWords: number = 2500) {
    this.stats.totalChaptersCompleted += 1;
    this.stats.totalWordsRead += estimatedWords;
    this.scheduleSave();
    this.notifyListeners();
  }

  private scheduleSave() {
    if (this.saveDebounceTimer) {
      clearTimeout(this.saveDebounceTimer);
    }
    this.saveDebounceTimer = setTimeout(() => {
      db.saveSetting(STATS_KEY, this.stats).catch((e) => {
        console.warn('Failed to save reading stats:', e);
      });
    }, 2000);
  }

  public subscribe(listener: (stats: ReadingStats) => void): () => void {
    this.listeners.push(listener);
    listener(this.stats);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  private notifyListeners() {
    this.listeners.forEach(l => l(this.stats));
  }
}

export const readingStatsService = new ReadingStatsService();
