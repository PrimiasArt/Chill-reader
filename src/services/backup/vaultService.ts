import { db, type StoryNote } from '../db';
import type { Story, Chapter } from '../../types';

export interface ChillVaultData {
  format: 'chillvault_v1';
  createdAt: number;
  exportedAt: string;
  version: string;
  stories: Story[];
  chapters: Chapter[];
  storyNotes: StoryNote[];
  settings: { key: string; value: any }[];
}

export class VaultService {
  /**
   * Export entire library, chapters, notes, and preferences into a single Vault JSON file
   */
  async exportVaultData(): Promise<Blob> {
    const stories = await db.stories.toArray();
    const chapters = await db.chapters.toArray();
    const storyNotes = await db.storyNotes.toArray();
    const settings = await db.settings.toArray();

    const vaultPayload: ChillVaultData = {
      format: 'chillvault_v1',
      createdAt: Date.now(),
      exportedAt: new Date().toISOString(),
      version: '1.0.44',
      stories,
      chapters,
      storyNotes,
      settings
    };

    const jsonString = JSON.stringify(vaultPayload, null, 2);
    return new Blob([jsonString], { type: 'application/json' });
  }

  /**
   * Trigger 1-click browser/app download of vault backup
   */
  async downloadVaultBackup(): Promise<string> {
    const blob = await this.exportVaultData();
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const timeStr = new Date().toTimeString().slice(0, 5).replace(/:/g, '');
    const filename = `ChillReader_Vault_${dateStr}_${timeStr}.chillvault`;

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 5000);

    return filename;
  }

  /**
   * Import and restore data from a .chillvault file
   */
  async importVaultData(file: File): Promise<{
    storiesCount: number;
    chaptersCount: number;
    notesCount: number;
  }> {
    const text = await file.text();
    let data: ChillVaultData;

    try {
      data = JSON.parse(text);
    } catch {
      throw new Error('Tệp sao lưu không đúng định dạng JSON hoặc bị hỏng.');
    }

    if (!data.format || (data.format !== 'chillvault_v1' && !Array.isArray(data.stories))) {
      throw new Error('Tệp không phải là bản sao lưu Chill Reader Vault hợp lệ.');
    }

    // 1. Restore stories
    if (data.stories && data.stories.length > 0) {
      await db.stories.bulkPut(data.stories);
    }

    // 2. Restore chapters
    if (data.chapters && data.chapters.length > 0) {
      await db.chapters.bulkPut(data.chapters);
    }

    // 3. Restore story notes
    if (data.storyNotes && data.storyNotes.length > 0) {
      await db.storyNotes.bulkPut(data.storyNotes);
    }

    // 4. Restore settings if present
    if (data.settings && data.settings.length > 0) {
      await db.settings.bulkPut(data.settings);
    }

    return {
      storiesCount: data.stories?.length || 0,
      chaptersCount: data.chapters?.length || 0,
      notesCount: data.storyNotes?.length || 0
    };
  }
}

export const vaultService = new VaultService();
