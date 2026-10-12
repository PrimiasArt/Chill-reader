import type { CrawlSearchResult } from '../../types';

export interface CrawledStoryDetail {
  title: string;
  author: string;
  coverUrl: string;
  description: string;
  sourceUrl: string;
  totalChapters: number;
  chapters: { title: string; url: string; number: number }[];
}

export interface FetchedChapterResult {
  url: string;
  title: string;
  content: string;
  wordCount: number;
  success: boolean;
  error?: string;
}

import { getApiBase } from '../apiConfig';

export function generateStoryId(sourceUrl: string, title: string): string {
  const cleanUrl = sourceUrl.split('?')[0].replace(/\/+$/, '');
  const lastPart = cleanUrl.split('/').pop() || '';
  const slug = lastPart.replace(/[^\w-]/g, '_').toLowerCase();
  if (slug && slug.length >= 3) return `crawled_${slug}`;
  return `crawled_${title.toLowerCase().trim().replace(/[^\w-]/g, '_')}`;
}

/**
 * Curated popular Vietnamese novels with working real sources
 */
export const POPULAR_RECOMMENDED_STORIES: CrawlSearchResult[] = [
  {
    id: 'dau-pha-thuong-khung',
    title: 'Đấu Phá Thương Khung',
    author: 'Thiên Tàm Thổ Đậu',
    coverUrl: 'https://cdn.wetruyen.com/medias/covers/0/12-dau-pha-thuong-khung_cover_large.jpg',
    description: 'Đây là thế giới thuộc về Đấu Khí, không có ma pháp hoa lệ, chỉ có đấu khí đã phồn thịnh tới đỉnh cao!',
    latestChapter: '1641 chương · Hoàn thành',
    sourceUrl: 'https://wetruyen.com/dau-pha-thuong-khung.12/',
    sourceName: 'WeTruyen'
  },
  {
    id: 'pham-nhan-tu-tien',
    title: 'Phàm Nhân Tu Tiên',
    author: 'Vong Ngữ',
    coverUrl: 'https://cdn.wetruyen.com/medias/covers/0/21-pham-nhan-tu-tien_cover_large.jpg',
    description: 'Một thiếu niên bình thường nơi thôn quê nghèo khó, tình cờ bước vào con đường tu tiên đầy chông gai...',
    latestChapter: '2446 chương · Hoàn thành',
    sourceUrl: 'https://wetruyen.com/pham-nhan-tu-tien.21/',
    sourceName: 'WeTruyen'
  },
  {
    id: 'muc-than-ky',
    title: 'Mục Thần Ký',
    author: 'Trạch Trư',
    coverUrl: 'https://cdn.wetruyen.com/medias/covers/3/3570-muc-than-ky_cover_large.jpg',
    description: 'Đại Khư tàn tích, đêm tối buông xuống, bóng tối thôn phệ vạn vật...',
    latestChapter: '1830 chương · Hoàn thành',
    sourceUrl: 'https://wetruyen.com/muc-than-ky.3570/',
    sourceName: 'WeTruyen'
  },
  {
    id: 'quy-bi-chi-chu',
    title: 'Quỷ Bí Chi Chủ (Lord of Mysteries)',
    author: 'Ái Tiềm Thủy Đích Ô Tặc',
    coverUrl: 'https://cdn.wetruyen.com/medias/covers/3/3941-quy-bi-chi-chu_cover_large.jpg',
    description: 'Trong làn sương mù mờ ảo của hơi nước và máy móc, ai có thể tiếp cận được siêu phàm...',
    latestChapter: '1432 chương · Hoàn thành',
    sourceUrl: 'https://wetruyen.com/quy-bi-chi-chu.3941/',
    sourceName: 'WeTruyen'
  },
  {
    id: 'dai-phung-da-canh-nhan',
    title: 'Đại Phụng Đả Canh Nhân',
    author: 'Mại Báo Tiểu Lang Quân',
    coverUrl: 'https://cdn.wetruyen.com/medias/covers/4/4648-dai-phung-da-canh-nhan_cover_large.jpg',
    description: 'Cảnh sát hình sự Hứa Thất An xuyên không về thế giới tiên hiệp kỳ bí, phá án đoạt mệnh...',
    latestChapter: '931 chương · Hoàn thành',
    sourceUrl: 'https://wetruyen.com/dai-phung-da-canh-nhan.4648/',
    sourceName: 'WeTruyen'
  },
  {
    id: 'tien-nghich',
    title: 'Tiên Nghịch',
    author: 'Nhĩ Căn',
    coverUrl: 'https://cdn.wetruyen.com/medias/covers/0/23-tien-nghich_cover_large.jpg',
    description: 'Thuận vi phàm, nghịch vi tiên, chỉ tại nhất niệm chi gian...',
    latestChapter: '1976 chương · Hoàn thành',
    sourceUrl: 'https://wetruyen.com/tien-nghich.23/',
    sourceName: 'WeTruyen'
  },
  {
    id: 'de-ba',
    title: 'Đế Bá',
    author: 'Yếm Bút Tiêu Sinh',
    coverUrl: 'https://cdn.wetruyen.com/medias/covers/0/134-de-ba_cover_large.jpg',
    description: 'Ngàn vạn năm trước, Lý Thất Dạ gieo xuống một cây trúc, dưỡng thành một con quạ đen...',
    latestChapter: '5000+ chương',
    sourceUrl: 'https://wetruyen.com/de-ba.134/',
    sourceName: 'WeTruyen'
  }
];

/**
 * Search stories via serverless API with fallback
 */
export async function searchStories(keyword: string): Promise<CrawlSearchResult[]> {
  const trimmed = keyword.trim();
  if (!trimmed) return POPULAR_RECOMMENDED_STORIES;

  try {
    const res = await fetch(`${getApiBase()}/api/crawler?action=search&q=${encodeURIComponent(trimmed)}`, {
      signal: AbortSignal.timeout(10000)
    });

    if (res.ok) {
      const data = await res.json();
      if (data.success && Array.isArray(data.results)) {
        return data.results;
      }
    }
  } catch (err) {
    console.warn('Lỗi gọi API tìm kiếm, thử tìm kiếm cục bộ:', err);
  }

  // Fallback to local filtering of recommended stories
  const lower = trimmed.toLowerCase();
  const matched = POPULAR_RECOMMENDED_STORIES.filter(s =>
    s.title.toLowerCase().includes(lower) ||
    s.author.toLowerCase().includes(lower)
  );

  return matched.length > 0 ? matched : POPULAR_RECOMMENDED_STORIES;
}

/**
 * Fetch story details & chapter list
 */
export async function fetchStoryDetail(storyUrl: string): Promise<CrawledStoryDetail> {
  const res = await fetch(`${getApiBase()}/api/crawler?action=detail&url=${encodeURIComponent(storyUrl)}`, {
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    throw new Error(`Không thể lấy thông tin truyện (HTTP ${res.status}).`);
  }

  const data = await res.json();
  if (!data.success || !data.detail) {
    throw new Error(data.error || 'Dữ liệu truyện không hợp lệ.');
  }

  return data.detail;
}

/**
 * Fetch a single chapter's content
 */
export async function fetchChapterContent(chapterUrl: string): Promise<{ title: string; content: string; wordCount: number }> {
  const res = await fetch(`${getApiBase()}/api/crawler?action=chapter&url=${encodeURIComponent(chapterUrl)}`, {
    signal: AbortSignal.timeout(12000)
  });

  if (!res.ok) {
    throw new Error(`Lỗi tải chương (HTTP ${res.status}).`);
  }

  const data = await res.json();
  if (!data.success || !data.chapter) {
    throw new Error(data.error || 'Nội dung chương không tồn tại.');
  }

  return data.chapter;
}

/**
 * Batch download multiple chapters concurrently with real-time progress callback
 */
export async function batchDownloadChapters(
  chapters: { title: string; url: string; number: number }[],
  onProgress?: (current: number, total: number, currentTitle: string) => void
): Promise<FetchedChapterResult[]> {
  const total = chapters.length;
  const results: FetchedChapterResult[] = [];
  const chunkSize = 10; // 10 chapters per serverless request

  for (let i = 0; i < chapters.length; i += chunkSize) {
    const chunk = chapters.slice(i, i + chunkSize);
    const chunkUrls = chunk.map(c => c.url);

    try {
      // Try batch endpoint first
      const res = await fetch(`${getApiBase()}/api/crawler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch', urls: chunkUrls }),
        signal: AbortSignal.timeout(25000)
      });

      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.chapters)) {
          data.chapters.forEach((ch: any, idx: number) => {
            const originalCh = chunk[idx];
            results.push({
              url: ch.url,
              title: ch.title || originalCh.title,
              content: ch.content || '',
              wordCount: ch.wordCount || 0,
              success: ch.success !== false && !!ch.content,
              error: ch.error
            });
            if (onProgress) {
              onProgress(results.length, total, ch.title || originalCh.title);
            }
          });
          continue; // Next chunk
        }
      }
    } catch (e) {
      console.warn('Batch POST failed, falling back to parallel fetch:', e);
    }

    // Fallback: Fetch chunk in parallel with Promise.all
    const chunkPromises = chunk.map(async (ch) => {
      try {
        const data = await fetchChapterContent(ch.url);
        return {
          url: ch.url,
          title: data.title || ch.title,
          content: data.content,
          wordCount: data.wordCount,
          success: true
        };
      } catch (err: any) {
        return {
          url: ch.url,
          title: ch.title,
          content: '',
          wordCount: 0,
          success: false,
          error: err.message
        };
      }
    });

    const chunkResults = await Promise.all(chunkPromises);
    chunkResults.forEach((r) => {
      results.push(r);
      if (onProgress) {
        onProgress(results.length, total, r.title);
      }
    });
  }

  return results;
}
