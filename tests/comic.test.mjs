import test from 'node:test';
import assert from 'node:assert/strict';
import JSZip from 'jszip';

// Natural sorting logic matching comicParser.ts
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

test('Comic Parser - Natural Sorting of Image Page Numbers', () => {
  const fileNames = ['page 10.jpg', 'page 1.jpg', 'page 2.jpg', 'page 20.jpg', 'page 3.jpg'];
  const sorted = [...fileNames].sort((a, b) => naturalCollator.compare(a, b));
  assert.deepEqual(sorted, [
    'page 1.jpg',
    'page 2.jpg',
    'page 3.jpg',
    'page 10.jpg',
    'page 20.jpg'
  ]);
});

test('Comic Parser - Mock Zip Unpacking with Chapters and Pages', async () => {
  const zip = new JSZip();
  // Simulate Chapter 1 with 2 pages
  zip.file('Chapter 1/01.jpg', 'dummy-image-data-1');
  zip.file('Chapter 1/02.jpg', 'dummy-image-data-2');
  // Simulate Chapter 2 with 2 pages
  zip.file('Chapter 2/01.jpg', 'dummy-image-data-3');
  zip.file('Chapter 2/02.jpg', 'dummy-image-data-4');
  // System junk that should be ignored
  zip.file('__MACOSX/._01.jpg', 'mac-junk');
  zip.file('.DS_Store', 'ds-store');

  const SUPPORTED_IMAGE_REGEX = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;
  const imageEntries = [];

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (relativePath.includes('__MACOSX') || relativePath.startsWith('.') || relativePath.includes('/.')) return;
    if (SUPPORTED_IMAGE_REGEX.test(relativePath)) {
      const parts = relativePath.split('/').filter(Boolean);
      const name = parts[parts.length - 1];
      const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      imageEntries.push({ path: relativePath, name, folder });
    }
  });

  assert.equal(imageEntries.length, 4);

  const folderMap = new Map();
  imageEntries.forEach((item) => {
    const fKey = item.folder || '__root__';
    if (!folderMap.has(fKey)) folderMap.set(fKey, []);
    folderMap.get(fKey).push(item);
  });

  const sortedFolders = Array.from(folderMap.keys()).sort((a, b) => naturalCollator.compare(a, b));
  assert.deepEqual(sortedFolders, ['Chapter 1', 'Chapter 2']);
  assert.equal(folderMap.get('Chapter 1').length, 2);
  assert.equal(folderMap.get('Chapter 2').length, 2);
});
