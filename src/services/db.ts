import Dexie, { type Table } from 'dexie';
import type { Story, Chapter, ReaderSettings, TTSSettings } from '../types';

export const DEFAULT_READER_SETTINGS: ReaderSettings = {
  theme: 'sepia',
  fontFamily: 'lora',
  fontSize: 19,
  lineHeight: 1.8,
  letterSpacing: 0.3,
  paragraphSpacing: 16,
  readerMode: 'scroll',
  autoScroll: false,
  autoScrollSpeed: 3,
  keepScreenAwake: true
};

export const DEFAULT_TTS_SETTINGS: TTSSettings = {
  voiceURI: 'edge:vi-VN-NamMinhNeural',
  engine: 'ai',
  rate: 1.0,
  pitch: 1.0,
  sleepTimerMinutes: null,
  highlightSentence: true,
  autoNextChapter: true,
  playAlongOtherApps: true
};

export interface ChapterMetadata {
  id: string;
  storyId: string;
  chapterNumber: number;
  title: string;
  wordCount?: number;
  sourceUrl?: string;
  hasContent?: boolean;
}

export interface ChapterContentRecord {
  id: string; // matches chapter id
  storyId: string;
  chapterNumber: number;
  content: string;
}

export interface StoryNote {
  id: string;
  storyId: string;
  title: string;
  content: string;
  category: 'character' | 'cultivation' | 'lore' | 'general';
  updatedAt: number;
}

export interface OfflineAudioRecord {
  id: string; // `${storyId}_${chapterNumber}_${sentenceIndex}`
  storyId: string;
  chapterNumber: number;
  sentenceIndex: number;
  audioBlob: Blob;
  createdAt: number;
}

export class ChillReaderDB extends Dexie {
  stories!: Table<Story, string>;
  chapters!: Table<Chapter, string>;
  chapterContents!: Table<ChapterContentRecord, string>;
  settings!: Table<{ key: string; value: any }, string>;
  storyNotes!: Table<StoryNote, string>;
  offlineAudioCache!: Table<OfflineAudioRecord, string>;

  constructor() {
    super('ChillReaderDB');
    this.version(1).stores({
      stories: 'id, title, author, isFavorite, lastReadAt, createdAt',
      chapters: 'id, storyId, chapterNumber, [storyId+chapterNumber]',
      settings: 'key'
    });

    this.version(2).stores({
      stories: 'id, title, author, isFavorite, lastReadAt, createdAt',
      chapters: 'id, storyId, chapterNumber, [storyId+chapterNumber]',
      chapterContents: 'id, storyId, chapterNumber, [storyId+chapterNumber]',
      settings: 'key',
      storyNotes: 'id, storyId, category, updatedAt',
      offlineAudioCache: 'id, storyId, chapterNumber, sentenceIndex'
    });
  }

  async getSetting<T>(key: string, defaultValue: T): Promise<T> {
    const item = await this.settings.get(key);
    return item ? (item.value as T) : defaultValue;
  }

  async saveSetting<T>(key: string, value: T): Promise<void> {
    await this.settings.put({ key, value });
  }

  /**
   * High performance: Fetch chapter metadata list without reading massive text content into RAM
   */
  async getStoryChaptersMetadata(storyId: string): Promise<ChapterMetadata[]> {
    return await this.chapters
      .where('storyId')
      .equals(storyId)
      .sortBy('chapterNumber')
      .then(chapters => chapters.map(c => ({
        id: c.id,
        storyId: c.storyId,
        chapterNumber: c.chapterNumber,
        title: c.title,
        wordCount: c.wordCount || (c.content ? c.content.length : 0),
        sourceUrl: c.sourceUrl,
        hasContent: !!(c.content && c.content.trim().length > 0)
      })));
  }

  async getStoryChapters(storyId: string): Promise<Chapter[]> {
    return await this.chapters.where('storyId').equals(storyId).sortBy('chapterNumber');
  }

  async saveStoryChapters(chapters: Chapter[]): Promise<void> {
    await this.chapters.bulkPut(chapters);
  }

  async getChapter(storyId: string, chapterNumber: number): Promise<Chapter | undefined> {
    const ch = await this.chapters.where('[storyId+chapterNumber]').equals([storyId, chapterNumber]).first();
    if (!ch) return undefined;
    if (ch.content && ch.content.trim().length > 0) {
      return ch;
    }
    // Check separated contents table if empty
    try {
      const contentRow = await this.chapterContents.where('[storyId+chapterNumber]').equals([storyId, chapterNumber]).first();
      if (contentRow && contentRow.content) {
        return { ...ch, content: contentRow.content };
      }
    } catch {}
    return ch;
  }

  async deleteStoryWithChapters(storyId: string): Promise<void> {
    await this.transaction('rw', this.stories, this.chapters, this.chapterContents, this.storyNotes, this.offlineAudioCache, async () => {
      await this.chapters.where('storyId').equals(storyId).delete();
      try {
        await this.chapterContents.where('storyId').equals(storyId).delete();
        await this.storyNotes.where('storyId').equals(storyId).delete();
        await this.offlineAudioCache.where('storyId').equals(storyId).delete();
      } catch {}
      await this.stories.delete(storyId);
    });
  }

  // --- Story Notes & Cultivation Lore ---
  async getStoryNotes(storyId: string): Promise<StoryNote[]> {
    return await this.storyNotes.where('storyId').equals(storyId).reverse().sortBy('updatedAt');
  }

  async saveStoryNote(note: StoryNote): Promise<void> {
    await this.storyNotes.put(note);
  }

  async deleteStoryNote(noteId: string): Promise<void> {
    await this.storyNotes.delete(noteId);
  }

  // --- Offline TTS Audio Cache ---
  async getOfflineAudio(storyId: string, chapterNumber: number, sentenceIndex: number): Promise<Blob | null> {
    const id = `${storyId}_${chapterNumber}_${sentenceIndex}`;
    const record = await this.offlineAudioCache.get(id);
    return record ? record.audioBlob : null;
  }

  async saveOfflineAudio(storyId: string, chapterNumber: number, sentenceIndex: number, audioBlob: Blob): Promise<void> {
    const id = `${storyId}_${chapterNumber}_${sentenceIndex}`;
    await this.offlineAudioCache.put({
      id,
      storyId,
      chapterNumber,
      sentenceIndex,
      audioBlob,
      createdAt: Date.now()
    });
  }

  async hasOfflineChapterAudio(storyId: string, chapterNumber: number, sentenceCount: number): Promise<boolean> {
    if (sentenceCount <= 0) return false;
    const count = await this.offlineAudioCache
      .where('storyId')
      .equals(storyId)
      .and(r => r.chapterNumber === chapterNumber)
      .count();
    return count >= sentenceCount;
  }

  async clearOfflineAudioForStory(storyId: string): Promise<void> {
    await this.offlineAudioCache.where('storyId').equals(storyId).delete();
  }
}

export const db = new ChillReaderDB();
