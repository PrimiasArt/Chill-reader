export interface ParsedChapter {
  chapterNumber: number;
  title: string;
  content: string;
}

export interface ParsedBook {
  title: string;
  author: string;
  description: string;
  chapters: ParsedChapter[];
}

/**
 * Intelligent Vietnamese novel chapter splitter for monolithic TXT files
 */
export function parseTxtContent(rawText: string, fallbackTitle: string = 'Truyện không tên'): ParsedBook {
  // 1. Normalize line endings and remove Byte Order Mark (BOM)
  let text = rawText.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // 2. Identify potential metadata in the first 50 lines (Title, Author, Description)
  const lines = text.split('\n');
  let title = fallbackTitle.replace(/\.[^/.]+$/, ""); // strip extension
  let author = 'Khuyết danh';
  let description = '';

  const headerLinesToInspect = Math.min(lines.length, 30);
  for (let i = 0; i < headerLinesToInspect; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const titleMatch = line.match(/^(?:Tên truyện|Tác phẩm|Truyện|Title)\s*[:：]\s*(.+)$/i);
    if (titleMatch && titleMatch[1].trim()) {
      title = titleMatch[1].trim();
      continue;
    }

    const authorMatch = line.match(/^(?:Tác giả|Author)\s*[:：]\s*(.+)$/i);
    if (authorMatch && authorMatch[1].trim()) {
      author = authorMatch[1].trim();
      continue;
    }

    const descMatch = line.match(/^(?:Giới thiệu|Mô tả|Văn án|Nội dung)\s*[:：]\s*(.*)$/i);
    if (descMatch) {
      description = descMatch[1].trim();
      continue;
    }
  }

  // 3. Regular Expression for Chapter Headings
  // Supports:
  // - "Chương 1", "Chương 1: Khởi đầu", "Chương 1 - Khởi đầu"
  // - "Chương thứ nhất", "Hồi thứ hai", "Hồi 12"
  // - "Quyển 1 Chương 2"
  // - "Tiết 1", "Tập 1", "Phần 1"
  // - "Chapter 1", "Chap 1", "Vol 1"
  const chapterRegex = /(?:^|\n)\s*((?:Quyển\s+[0-9IVXLCDMivxlcdm一二三四五六七八九十百千万零]+\s+)?(?:Chương\s+thứ\s+[0-9IVXLCDMivxlcdm一二三四五六七八九十百千万零]+|Hồi\s+thứ\s+[0-9IVXLCDMivxlcdm一二三四五六七八九十百千万零]+|Chương|Hồi|Tiết|Quyển|Tập|Phần|Mục|Bài|Bản|Chapter|Chap|Vol)\s*(?:[0-9IVXLCDMivxlcdm一二三四五六七八九十百千万零]+)?(?:[\s:.\-_–—]+[^\n]{0,100})?)(?=\n|$)/gi;

  const matches: { title: string; index: number }[] = [];
  let match: RegExpExecArray | null;

  while ((match = chapterRegex.exec(text)) !== null) {
    const matchedTitle = match[1].trim();
    // Validate heading length to avoid false positives (e.g. a normal sentence containing "phần...")
    if (matchedTitle.length >= 3 && matchedTitle.length <= 120) {
      matches.push({
        title: matchedTitle,
        index: match.index
      });
    }
  }

  const chapters: ParsedChapter[] = [];

  // Case A: Regex successfully detected multiple chapters
  if (matches.length >= 2) {
    // If there is intro content before Chapter 1, treat as "Lời mở đầu / Giới thiệu"
    if (matches[0].index > 100) {
      const introContent = text.substring(0, matches[0].index).trim();
      if (introContent.length > 50) {
        if (!description) {
          description = introContent.slice(0, 300) + '...';
        }
        chapters.push({
          chapterNumber: 1,
          title: 'Lời mở đầu / Giới thiệu',
          content: cleanChapterContent(introContent)
        });
      }
    }

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const startPos = current.index;
      const endPos = (i + 1 < matches.length) ? matches[i + 1].index : text.length;

      let chapterText = text.substring(startPos, endPos).trim();
      
      // Remove chapter title line from the beginning of chapter content if it is redundant
      const lines = chapterText.split('\n');
      if (lines.length > 1 && lines[0].includes(current.title)) {
        chapterText = lines.slice(1).join('\n').trim();
      }

      chapters.push({
        chapterNumber: chapters.length + 1,
        title: current.title,
        content: cleanChapterContent(chapterText)
      });
    }
  } else {
    // Case B: Fallback - No standard chapter headings found (monolithic story)
    // Automatically split by word count (~2500 - 3500 words per chapter) on sentence boundaries
    console.warn('Không tìm thấy mẫu tiêu đề chương chuẩn, kích hoạt bộ chia chương tự động thông minh...');
    const chunks = splitIntoLogicalChapters(text, 3000);
    
    chunks.forEach((chunk, idx) => {
      chapters.push({
        chapterNumber: idx + 1,
        title: `Phần ${idx + 1}`,
        content: cleanChapterContent(chunk)
      });
    });

    if (!description && chapters.length > 0) {
      description = chapters[0].content.slice(0, 250) + '...';
    }
  }

  return {
    title,
    author,
    description: description || `Truyện gồm ${chapters.length} chương.`,
    chapters
  };
}

/**
 * Clean chapter text, strip annoying repeated whitespace, format paragraphs
 */
function cleanChapterContent(content: string): string {
  return content
    .replace(/\r/g, '')
    // Normalize consecutive blank lines to double newlines (paragraphs)
    .replace(/\n{3,}/g, '\n\n')
    // Remove unwanted leading/trailing whitespace
    .trim();
}

/**
 * Split large text into natural chapters based on word count & sentence punctuation
 */
function splitIntoLogicalChapters(text: string, wordsPerChapter: number): string[] {
  const paragraphs = text.split(/\n\s*\n/);
  const chapters: string[] = [];
  let currentChapterParagraphs: string[] = [];
  let currentWordCount = 0;

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const words = trimmed.split(/\s+/).length;
    currentChapterParagraphs.push(trimmed);
    currentWordCount += words;

    if (currentWordCount >= wordsPerChapter) {
      chapters.push(currentChapterParagraphs.join('\n\n'));
      currentChapterParagraphs = [];
      currentWordCount = 0;
    }
  }

  if (currentChapterParagraphs.length > 0) {
    chapters.push(currentChapterParagraphs.join('\n\n'));
  }

  return chapters.length > 0 ? chapters : [text];
}

/**
 * Web Worker-assisted async parser:
 * For files > 300KB, runs chapter splitting in a background Web Worker so UI remains 100% responsive.
 */
export async function parseTxtContentAsync(rawText: string, fallbackTitle: string = 'Truyện không tên'): Promise<ParsedBook> {
  if (typeof Worker === 'undefined' || rawText.length < 300_000) {
    return parseTxtContent(rawText, fallbackTitle);
  }

  return new Promise((resolve) => {
    try {
      const workerCode = `
        ${cleanChapterContent.toString()}
        ${splitIntoLogicalChapters.toString()}
        ${parseTxtContent.toString()}

        self.onmessage = function(e) {
          try {
            var res = parseTxtContent(e.data.rawText, e.data.fallbackTitle);
            self.postMessage({ success: true, result: res });
          } catch(err) {
            self.postMessage({ success: false, error: err.message });
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);

      worker.onmessage = (e: MessageEvent) => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        if (e.data && e.data.success) {
          resolve(e.data.result);
        } else {
          resolve(parseTxtContent(rawText, fallbackTitle));
        }
      };

      worker.onerror = () => {
        worker.terminate();
        URL.revokeObjectURL(workerUrl);
        resolve(parseTxtContent(rawText, fallbackTitle));
      };

      worker.postMessage({ rawText, fallbackTitle });
    } catch {
      resolve(parseTxtContent(rawText, fallbackTitle));
    }
  });
}

