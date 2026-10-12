import React, { useState, useRef } from 'react';
import { 
  X, 
  Book, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  Sparkles,
  Info
} from 'lucide-react';
import { parseTxtContentAsync, type ParsedBook } from '../services/parser/txtParser';
import { parseEpubFile } from '../services/parser/epubParser';
import { parsePdfFile } from '../services/parser/pdfParser';
import type { Story, Chapter, StorySource } from '../types';

interface ImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: (story: Story, chapters: Chapter[]) => void;
}

export const ImportModal: React.FC<ImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete
}) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{
    book: ParsedBook;
    source: StorySource;
    isScannedPdf?: boolean;
    fileName: string;
  } | null>(null);

  // Editable fields in preview
  const [customTitle, setCustomTitle] = useState('');
  const [customAuthor, setCustomAuthor] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setError(null);
    setParsedData(null);

    const ext = file.name.split('.').pop()?.toLowerCase();

    try {
      if (ext === 'txt') {
        const text = await file.text();
        const parsed = await parseTxtContentAsync(text, file.name);
        setParsedData({
          book: parsed,
          source: 'local_txt',
          fileName: file.name
        });
        setCustomTitle(parsed.title);
        setCustomAuthor(parsed.author);
      } else if (ext === 'epub') {
        const parsed = await parseEpubFile(file);
        setParsedData({
          book: parsed,
          source: 'local_epub',
          fileName: file.name
        });
        setCustomTitle(parsed.title);
        setCustomAuthor(parsed.author);
      } else if (ext === 'pdf') {
        const parsed = await parsePdfFile(file, file.name);
        setParsedData({
          book: parsed,
          source: 'local_pdf',
          isScannedPdf: parsed.isScannedPdf,
          fileName: file.name
        });
        setCustomTitle(parsed.title);
        setCustomAuthor(parsed.author);
      } else {
        throw new Error('Định dạng file không được hỗ trợ. Vui lòng chọn file .TXT, .EPUB hoặc .PDF');
      }
    } catch (err: any) {
      console.error('Import file error:', err);
      setError(err?.message || 'Có lỗi xảy ra khi đọc file.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSaveToLibrary = () => {
    if (!parsedData) return;

    const storyId = 'story_' + Date.now();
    const now = Date.now();

    const story: Story = {
      id: storyId,
      title: customTitle.trim() || parsedData.book.title,
      author: customAuthor.trim() || parsedData.book.author,
      description: parsedData.book.description,
      totalChapters: parsedData.book.chapters.length,
      currentChapterNumber: 1,
      currentProgressPercent: 0,
      currentSentenceIndex: 0,
      source: parsedData.source,
      isFavorite: false,
      tags: [parsedData.source.replace('local_', '').toUpperCase()],
      lastReadAt: now,
      createdAt: now
    };

    const chapters: Chapter[] = parsedData.book.chapters.map((ch) => ({
      id: `${storyId}_ch_${ch.chapterNumber}`,
      storyId: storyId,
      chapterNumber: ch.chapterNumber,
      title: ch.title,
      content: ch.content,
      wordCount: ch.content.split(/\s+/).length
    }));

    onImportComplete(story, chapters);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs">
      <div 
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md overflow-hidden bg-white p-0.5 border border-zinc-700/60 shadow-xs shrink-0 flex items-center justify-center">
              <img src="/icon-192.png" alt="NKI Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="font-semibold text-zinc-100">Nạp file truyện vào Chill Reader</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* Upload Dropzone */}
          {!parsedData && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files?.[0]) {
                  handleFile(e.dataTransfer.files[0]);
                }
              }}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center cursor-pointer transition-all ${
                isDragging
                  ? 'border-amber-500 bg-amber-500/10'
                  : 'border-zinc-700 hover:border-amber-500/50 hover:bg-zinc-800/40'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.epub,.pdf"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleFile(e.target.files[0]);
                  }
                }}
              />

              <div className="w-14 h-14 rounded-2xl bg-zinc-800 flex items-center justify-center mx-auto mb-3 text-amber-400">
                <Book className="w-7 h-7" />
              </div>
              
              <h3 className="font-semibold text-zinc-200 text-sm mb-1">
                Kéo thả file vào đây hoặc bấm để chọn
              </h3>
              <p className="text-xs text-zinc-400 mb-3">
                Hỗ trợ định dạng: <span className="text-amber-400 font-medium">.TXT</span> (tự động phân chương), <span className="text-amber-400 font-medium">.EPUB</span>, <span className="text-amber-400 font-medium">.PDF</span>
              </p>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800/80 text-[11px] text-zinc-400 border border-zinc-700">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Bộ phân chương thông minh tự động tách hàng ngàn chương
              </div>
            </div>
          )}

          {/* Loading Indicator */}
          {isProcessing && (
            <div className="py-8 text-center space-y-2">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm font-medium text-zinc-300">
                Đang quét và bóc tách cấu trúc chương tự động...
              </p>
              <p className="text-xs text-zinc-500">
                Hệ thống đang chuẩn hóa văn bản và tối ưu cho trình phát Audio TTS
              </p>
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="font-medium">Không thể nạp file</p>
                <p className="text-red-400/90 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Parsed Preview */}
          {parsedData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Phân tích thành công! Đã tìm thấy <strong>{parsedData.book.chapters.length} chương</strong>.</span>
              </div>

              {/* Scanned PDF Notice */}
              {parsedData.isScannedPdf && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <Info className="w-4 h-4" />
                    Lưu ý về file PDF ảnh scan
                  </div>
                  <p className="text-zinc-300">
                    File này là dạng ảnh scan không chứa lớp văn bản chữ số hóa. Trình đọc Text-to-Speech (TTS) chỉ có thể phát âm thanh khi có chữ thật. Bạn vẫn có thể lưu vào để xem nội dung, nhưng nên nạp định dạng .EPUB hoặc .TXT nếu muốn nghe audio nhé!
                  </p>
                </div>
              )}

              {/* Editable metadata */}
              <div className="space-y-3 bg-zinc-800/50 p-4 rounded-xl border border-zinc-800">
                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Tên truyện
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-zinc-400 mb-1">
                    Tác giả
                  </label>
                  <input
                    type="text"
                    value={customAuthor}
                    onChange={(e) => setCustomAuthor(e.target.value)}
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Chapter preview list */}
              <div>
                <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider mb-2">
                  Danh sách chương ({parsedData.book.chapters.length})
                </h4>
                <div className="max-h-40 overflow-y-auto space-y-1 border border-zinc-800 rounded-xl p-2 bg-zinc-950/40">
                  {parsedData.book.chapters.slice(0, 15).map((ch) => (
                    <div 
                      key={ch.chapterNumber}
                      className="flex items-center justify-between text-xs py-1.5 px-2 rounded-lg bg-zinc-900/60 text-zinc-300"
                    >
                      <span className="font-medium truncate max-w-[280px]">
                        {ch.title}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {ch.content.split(/\s+/).length} từ
                      </span>
                    </div>
                  ))}
                  {parsedData.book.chapters.length > 15 && (
                    <div className="text-center text-xs text-zinc-500 py-1">
                      ... và {parsedData.book.chapters.length - 15} chương tiếp theo
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3.5 border-t border-zinc-800 flex items-center justify-between bg-zinc-900/80">
          {parsedData ? (
            <>
              <button
                onClick={() => setParsedData(null)}
                className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
              >
                Chọn file khác
              </button>
              <button
                onClick={handleSaveToLibrary}
                className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm shadow-md shadow-amber-500/20 transition-all cursor-pointer"
              >
                Lưu vào tủ sách & Đọc ngay
              </button>
            </>
          ) : (
            <button
              onClick={onClose}
              className="ml-auto px-4 py-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
            >
              Hủy
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
