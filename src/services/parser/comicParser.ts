import JSZip from 'jszip';
import type { ParsedBook, ParsedChapter } from './txtParser';

export interface ParsedComicBook extends ParsedBook {
  coverUrl?: string;
}

const SUPPORTED_IMAGE_REGEX = /\.(jpe?g|png|webp|avif|gif|bmp)$/i;

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    case 'avif':
      return 'image/avif';
    case 'gif':
      return 'image/gif';
    case 'bmp':
      return 'image/bmp';
    default:
      return 'image/jpeg';
  }
}

/**
 * Natural sorting for file and folder names (e.g. "page 2" comes before "page 10")
 */
const naturalCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export async function parseComicFile(
  file: File | ArrayBuffer,
  fileName: string,
  onProgress?: (percent: number, message: string) => void
): Promise<ParsedComicBook> {
  let zip: JSZip;
  try {
    if (onProgress) onProgress(10, 'Đang giải nén file lưu trữ comic...');
    zip = await JSZip.loadAsync(file);
  } catch (err: any) {
    const isRar = fileName.toLowerCase().endsWith('.cbr');
    if (isRar) {
      throw new Error(
        'Tệp .cbr này được nén bằng chuẩn RAR độc quyền. Vui lòng giải nén và nén lại thành file .CBZ (chuẩn ZIP) để mở trực tiếp trong Chill Reader.'
      );
    }
    throw new Error('Không thể giải nén file comic. Vui lòng kiểm tra định dạng .CBZ hoặc .ZIP hợp lệ.');
  }

  // 1. Collect all valid image entries, ignoring metadata / macOS junk
  const imageEntries: { path: string; name: string; folder: string; entry: JSZip.JSZipObject }[] = [];

  zip.forEach((relativePath, entry) => {
    if (entry.dir) return;
    if (relativePath.includes('__MACOSX') || relativePath.startsWith('.') || relativePath.includes('/.')) return;
    if (SUPPORTED_IMAGE_REGEX.test(relativePath)) {
      const parts = relativePath.split('/').filter(Boolean);
      const name = parts[parts.length - 1];
      const folder = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
      imageEntries.push({ path: relativePath, name, folder, entry });
    }
  });

  if (imageEntries.length === 0) {
    throw new Error('Không tìm thấy tệp hình ảnh (.jpg, .png, .webp, .avif) nào trong file comic lưu trữ này.');
  }

  if (onProgress) onProgress(30, `Đã tìm thấy ${imageEntries.length} trang truyện. Đang sắp xếp cấu trúc chương...`);

  // 2. Group into chapters by directory if multiple folders exist, otherwise all in 1 chapter
  const folderMap = new Map<string, typeof imageEntries>();

  imageEntries.forEach((item) => {
    const fKey = item.folder || '__root__';
    if (!folderMap.has(fKey)) {
      folderMap.set(fKey, []);
    }
    folderMap.get(fKey)!.push(item);
  });

  const sortedFolderKeys = Array.from(folderMap.keys()).sort((a, b) => {
    if (a === '__root__') return -1;
    if (b === '__root__') return 1;
    return naturalCollator.compare(a, b);
  });

  const cleanBookTitle = fileName.replace(/\.[^/.]+$/, '').trim() || 'Truyện tranh Manga';
  const chapters: ParsedChapter[] = [];
  let firstCoverDataUrl: string | undefined = undefined;
  let totalProcessed = 0;

  for (let cIdx = 0; cIdx < sortedFolderKeys.length; cIdx++) {
    const fKey = sortedFolderKeys[cIdx];
    const itemsInChapter = folderMap.get(fKey)!;

    // Natural sort images within chapter
    itemsInChapter.sort((a, b) => naturalCollator.compare(a.name, b.name));

    const pageDataUrls: string[] = [];
    for (let pIdx = 0; pIdx < itemsInChapter.length; pIdx++) {
      const img = itemsInChapter[pIdx];
      const mime = getMimeType(img.name);
      const base64 = await img.entry.async('base64');
      const dataUrl = `data:${mime};base64,${base64}`;
      pageDataUrls.push(dataUrl);

      if (!firstCoverDataUrl) {
        firstCoverDataUrl = dataUrl;
      }

      totalProcessed++;
      if (onProgress && totalProcessed % 5 === 0) {
        const pct = 30 + Math.round((totalProcessed / imageEntries.length) * 65);
        onProgress(pct, `Đang xử lý hình ảnh trang ${totalProcessed}/${imageEntries.length}...`);
      }
    }

    let chapterTitle = `Chương ${cIdx + 1}`;
    if (fKey !== '__root__') {
      const folderLastName = fKey.split('/').pop() || fKey;
      chapterTitle = folderLastName.trim();
    } else if (sortedFolderKeys.length === 1) {
      chapterTitle = cleanBookTitle;
    }

    chapters.push({
      chapterNumber: cIdx + 1,
      title: chapterTitle,
      content: JSON.stringify({ comicPages: pageDataUrls })
    });
  }

  if (onProgress) onProgress(100, 'Hoàn tất phân tích truyện tranh!');

  return {
    title: cleanBookTitle,
    author: 'Truyện tranh / Manga',
    description: `Truyện tranh định dạng Comic Archive gồm ${chapters.length} chương và ${imageEntries.length} trang hình ảnh chất lượng cao.`,
    coverUrl: firstCoverDataUrl,
    chapters
  };
}
