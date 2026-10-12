import type { ParsedBook, ParsedChapter } from './txtParser';

export interface PdfParseResult extends ParsedBook {
  isScannedPdf?: boolean;
}

export async function parsePdfFile(file: File | ArrayBuffer, fileName: string): Promise<PdfParseResult> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : file;
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;

  const numPages = pdf.numPages;
  const pageTexts: string[] = [];
  let totalCharacters = 0;

  for (let i = 1; i <= numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageStr = textContent.items
      .map((item: any) => item.str || '')
      .join(' ')
      .trim();

    pageTexts.push(pageStr);
    totalCharacters += pageStr.length;
  }

  const baseTitle = fileName.replace(/\.[^/.]+$/, '');

  // If average characters per page is less than 30, it is very likely a scanned/image PDF
  const avgCharsPerPage = totalCharacters / Math.max(1, numPages);
  if (avgCharsPerPage < 30) {
    return {
      title: baseTitle,
      author: 'PDF Scan',
      description: 'Cảnh báo: File PDF này dường như là dạng ảnh scan (không có lớp chữ số hóa). Bộ đọc Text-to-Speech (TTS) không thể đọc phát âm thành tiếng nếu không có text.',
      isScannedPdf: true,
      chapters: [
        {
          chapterNumber: 1,
          title: 'Nội dung nhận diện',
          content: 'File PDF này là dạng tài liệu ảnh chụp/scan không chứa văn bản (Text Layer).\n\nĐể nghe được bằng Audio TTS, bạn nên:\n1. Tìm phiên bản sách định dạng .EPUB hoặc .TXT\n2. Hoặc sử dụng phần mềm OCR (như Google Drive / Adobe Acrobat) để chuyển PDF scan thành văn bản có chữ trước khi nạp vào Chill Reader.'
        }
      ]
    };
  }

  // Group into logical chapters (~15-20 pages per chapter if not demarcated, or split by keywords)
  const chapters: ParsedChapter[] = [];
  const pagesPerChapter = 10;
  
  for (let i = 0; i < pageTexts.length; i += pagesPerChapter) {
    const chunk = pageTexts.slice(i, i + pagesPerChapter).join('\n\n');
    const startPage = i + 1;
    const endPage = Math.min(i + pagesPerChapter, pageTexts.length);
    chapters.push({
      chapterNumber: chapters.length + 1,
      title: `Trang ${startPage} - ${endPage}`,
      content: chunk
    });
  }

  return {
    title: baseTitle,
    author: 'Tài liệu PDF',
    description: `Tài liệu PDF gồm ${numPages} trang.`,
    isScannedPdf: false,
    chapters
  };
}
