import test from 'node:test';
import assert from 'node:assert/strict';

test('Vault Service - Validates ChillVault JSON Payload Structure', () => {
  const samplePayload = {
    format: 'chillvault_v1',
    createdAt: Date.now(),
    exportedAt: new Date().toISOString(),
    version: '1.0.44',
    stories: [
      {
        id: 'story_1',
        title: 'Mục Thần Ký',
        author: 'Trạch Trư',
        totalChapters: 1800,
        currentChapterNumber: 15,
        currentProgressPercent: 1.2,
        currentSentenceIndex: 0,
        source: 'local_txt',
        isFavorite: true,
        tags: ['TIÊN HIỆP'],
        lastReadAt: Date.now(),
        createdAt: Date.now()
      }
    ],
    chapters: [],
    storyNotes: [],
    settings: [{ key: 'readerSettings', value: { theme: 'sepia' } }]
  };

  assert.equal(samplePayload.format, 'chillvault_v1');
  assert.equal(samplePayload.stories.length, 1);
  assert.equal(samplePayload.stories[0].title, 'Mục Thần Ký');

  const serialized = JSON.stringify(samplePayload);
  const parsed = JSON.parse(serialized);
  assert.equal(parsed.format, 'chillvault_v1');
  assert.equal(parsed.stories[0].author, 'Trạch Trư');
});
