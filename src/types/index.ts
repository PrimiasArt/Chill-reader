export type ReaderTheme = 'sepia' | 'dark' | 'amoled' | 'light' | 'paper';
export type FontFamily = 'serif' | 'sans' | 'lora' | 'merriweather';
export type ReaderMode = 'scroll' | 'paged';
export type StorySource = 'local_txt' | 'local_epub' | 'local_pdf' | 'crawler';

export interface Story {
  id: string;
  title: string;
  author: string;
  description: string;
  coverUrl?: string;
  totalChapters: number;
  currentChapterNumber: number;
  currentProgressPercent: number;
  currentSentenceIndex: number;
  source: StorySource;
  sourceUrl?: string;
  isFavorite: boolean;
  tags: string[];
  lastReadAt: number;
  createdAt: number;
}

export interface Chapter {
  id: string;
  storyId: string;
  chapterNumber: number;
  title: string;
  content: string;
  wordCount?: number;
  sourceUrl?: string;
}

export interface ReaderSettings {
  theme: ReaderTheme;
  fontFamily: FontFamily;
  fontSize: number; // in px, e.g. 18
  lineHeight: number; // e.g. 1.8
  letterSpacing: number; // e.g. 0.5
  paragraphSpacing: number; // in px
  readerMode: ReaderMode;
  autoScroll: boolean;
  autoScrollSpeed: number; // 1 - 10
}

export type TTSEngineType = 'ai' | 'google' | 'browser' | 'native';

export interface TTSSettings {
  voiceURI: string;
  engine?: TTSEngineType;
  rate: number; // 0.5 - 4.0
  pitch: number; // 0.8 - 1.2
  sleepTimerMinutes: number | null; // e.g. 15, 30, 45, or null
  highlightSentence: boolean;
  autoNextChapter: boolean;
  playAlongOtherApps?: boolean;
}

export interface CrawlSearchResult {
  id: string;
  title: string;
  author: string;
  coverUrl?: string;
  description?: string;
  latestChapter?: string;
  sourceUrl: string;
  sourceName: string;
}
