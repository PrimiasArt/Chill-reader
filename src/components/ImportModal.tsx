import React, { useState, useRef, useEffect } from 'react';
import { 
  X, 
  Book, 
  AlertTriangle, 
  CheckCircle2, 
  Loader2, 
  Sparkles, 
  Info,
  Camera,
  Image as ImageIcon,
  FileText,
  Trash2,
  Key,
  FolderOpen
} from 'lucide-react';
import { parseTxtContentAsync, type ParsedBook } from '../services/parser/txtParser';
import { parseEpubFile } from '../services/parser/epubParser';
import { parsePdfFile } from '../services/parser/pdfParser';
import { parseComicFile, type ParsedComicBook } from '../services/parser/comicParser';
import { geminiSummaryService } from '../services/ai/geminiSummary';
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
  const [activeTab, setActiveTab] = useState<'file' | 'ocr'>('file');
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatus, setProcessingStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{
    book: ParsedBook;
    source: StorySource;
    isScannedPdf?: boolean;
    fileName: string;
    coverUrl?: string;
  } | null>(null);

  // Editable fields in preview
  const [customTitle, setCustomTitle] = useState('');
  const [customAuthor, setCustomAuthor] = useState('');

  // OCR specific states
  const [ocrImages, setOcrImages] = useState<{ id: string; base64: string; name: string }[]>([]);
  const [ocrRecognizedText, setOcrRecognizedText] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [ocrProgress, setOcrProgress] = useState<{ current: number; total: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      geminiSummaryService.getApiKey().then((k) => {
        if (k && k.trim()) {
          setHasApiKey(true);
          setGeminiKey(k);
        } else {
          setHasApiKey(false);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFile = async (file: File) => {
    setIsProcessing(true);
    setProcessingStatus('Đang đọc tệp tin...');
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
      } else if (ext === 'cbz' || ext === 'cbr' || ext === 'zip') {
        const parsedComic: ParsedComicBook = await parseComicFile(file, file.name, (_, msg) => {
          setProcessingStatus(msg);
        });
        setParsedData({
          book: parsedComic,
          source: 'local_comic',
          coverUrl: parsedComic.coverUrl,
          fileName: file.name
        });
        setCustomTitle(parsedComic.title);
        setCustomAuthor(parsedComic.author);
      } else {
        throw new Error('Định dạng file không được hỗ trợ. Vui lòng chọn .TXT, .EPUB, .PDF, .CBZ, hoặc .ZIP');
      }
    } catch (err: any) {
      console.error('Import file error:', err);
      setError(err?.message || 'Có lỗi xảy ra khi nạp file.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
    }
  };

  const handleImageFilesSelected = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setError(null);

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        if (base64) {
          setOcrImages((prev) => [
            ...prev,
            {
              id: 'img_' + Math.random().toString(36).slice(2, 9),
              base64,
              name: file.name || `Trang_${prev.length + 1}.jpg`
            }
          ]);
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const handleSaveGeminiKey = async () => {
    if (!geminiKey.trim()) return;
    await geminiSummaryService.saveApiKey(geminiKey.trim());
    setHasApiKey(true);
    setShowKeyInput(false);
  };

  const handleStartOCR = async () => {
    if (ocrImages.length === 0) {
      setError('Vui lòng chụp hoặc tải lên ít nhất một ảnh để nhận diện.');
      return;
    }

    const key = await geminiSummaryService.getApiKey();
    if (!key) {
      setShowKeyInput(true);
      setError('Cần thiết lập Gemini API Key miễn phí để nhận diện chữ qua AI.');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setOcrProgress({ current: 0, total: ocrImages.length });

    try {
      const recognizedPages: string[] = [];
      for (let i = 0; i < ocrImages.length; i++) {
        setOcrProgress({ current: i + 1, total: ocrImages.length });
        setProcessingStatus(`Đang quét chữ ảnh trang ${i + 1}/${ocrImages.length} bằng AI Gemini...`);
        const text = await geminiSummaryService.ocrImageToText(ocrImages[i].base64);
        if (text && text.trim()) {
          recognizedPages.push(text.trim());
        }
      }

      if (recognizedPages.length === 0) {
        throw new Error('AI không nhận diện được chữ nào trong các ảnh đã chọn.');
      }

      const combinedText = recognizedPages.join('\n\n');
      setOcrRecognizedText(combinedText);
      setCustomTitle(customTitle.trim() || 'Tài liệu OCR ' + new Date().toLocaleDateString('vi-VN'));
      setCustomAuthor('Chụp ảnh OCR');
    } catch (err: any) {
      console.error('OCR Error:', err);
      setError(err?.message || 'Lỗi nhận diện chữ từ hình ảnh.');
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
      setOcrProgress(null);
    }
  };

  const handleProceedOcrToParsed = async () => {
    if (!ocrRecognizedText.trim()) return;
    setIsProcessing(true);
    setProcessingStatus('Đang cấu trúc chương truyện...');
    try {
      const titleToUse = customTitle.trim() || 'Tài liệu OCR ' + new Date().toLocaleDateString('vi-VN');
      const parsed = await parseTxtContentAsync(ocrRecognizedText, titleToUse);
      parsed.author = customAuthor.trim() || 'Chụp ảnh OCR';

      setParsedData({
        book: parsed,
        source: 'ocr',
        fileName: titleToUse,
        coverUrl: ocrImages[0]?.base64
      });
    } catch (err: any) {
      setError(err?.message || 'Không thể tạo chương từ văn bản OCR');
    } finally {
      setIsProcessing(false);
      setProcessingStatus(null);
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
      coverUrl: parsedData.coverUrl || (parsedData.book as any).coverUrl,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-xs">
      <div 
        className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-md overflow-hidden bg-white p-0.5 border border-zinc-700/60 shadow-xs shrink-0 flex items-center justify-center">
              <img src="/icon-192.png" alt="NKI Logo" className="w-full h-full object-contain" />
            </div>
            <h2 className="font-semibold text-zinc-100">Nạp truyện vào Chill Reader</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector (when not previewing parsed book) */}
        {!parsedData && (
          <div className="flex border-b border-zinc-800 bg-zinc-950/40 p-1.5 gap-1.5">
            <button
              onClick={() => { setActiveTab('file'); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'file'
                  ? 'bg-zinc-800 text-amber-400 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <FolderOpen className="w-4 h-4" />
              File Truyện & Comic (.TXT, .EPUB, .PDF, .CBZ)
            </button>
            <button
              onClick={() => { setActiveTab('ocr'); setError(null); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                activeTab === 'ocr'
                  ? 'bg-zinc-800 text-amber-400 shadow-xs'
                  : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/40'
              }`}
            >
              <Camera className="w-4 h-4" />
              Chụp ảnh / OCR AI Gemini
            </button>
          </div>
        )}

        {/* Content Area */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {/* File Tab */}
          {!parsedData && activeTab === 'file' && (
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
                accept=".txt,.epub,.pdf,.cbz,.cbr,.zip"
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
              <p className="text-xs text-zinc-400 mb-3 leading-relaxed">
                Hỗ trợ định dạng: <span className="text-amber-400 font-medium">.TXT</span> (tự phân chương), <span className="text-amber-400 font-medium">.EPUB</span>, <span className="text-amber-400 font-medium">.PDF</span>, và <span className="text-amber-400 font-medium">.CBZ / .ZIP</span> (truyện tranh & manga)
              </p>

              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800/80 text-[11px] text-zinc-400 border border-zinc-700">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Bộ giải mã thông minh tự động trích xuất cấu trúc và tối ưu TTS
              </div>
            </div>
          )}

          {/* OCR Tab */}
          {!parsedData && activeTab === 'ocr' && (
            <div className="space-y-4">
              {/* API Key warning/prompt if not configured */}
              {(!hasApiKey || showKeyInput) && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2">
                  <div className="flex items-center gap-1.5 text-amber-400 text-xs font-semibold">
                    <Key className="w-4 h-4" />
                    Thiết lập Gemini Vision AI Key (Hoàn toàn miễn phí)
                  </div>
                  <p className="text-[11px] text-zinc-300">
                    Nhận diện chữ từ ảnh sách sử dụng mô hình Google Gemini Vision AI. Bạn có thể lấy key miễn phí tại <a href="https://aistudio.google.com/app/apikey" target="_blank" rel="noreferrer" className="underline text-amber-400">Google AI Studio</a>.
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="password"
                      placeholder="Dán Gemini API Key của bạn tại đây..."
                      value={geminiKey}
                      onChange={(e) => setGeminiKey(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={handleSaveGeminiKey}
                      disabled={!geminiKey.trim()}
                      className="px-3 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-semibold hover:bg-amber-400 disabled:opacity-50 cursor-pointer"
                    >
                      Lưu Key
                    </button>
                  </div>
                </div>
              )}

              {/* Action buttons to capture or pick images */}
              <div className="grid grid-cols-2 gap-3">
                {/* Camera input */}
                <input
                  ref={cameraInputRef}
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="hidden"
                  onChange={(e) => handleImageFilesSelected(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800 hover:border-amber-500/60 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <Camera className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-zinc-200">Chụp bằng Camera</span>
                  <span className="text-[10px] text-zinc-500">Chụp trang sách thực tế</span>
                </button>

                {/* Gallery picker */}
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleImageFilesSelected(e.target.files)}
                />
                <button
                  type="button"
                  onClick={() => imageInputRef.current?.click()}
                  className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800 hover:border-amber-500/60 transition-all cursor-pointer group"
                >
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform">
                    <ImageIcon className="w-5 h-5" />
                  </div>
                  <span className="text-xs font-medium text-zinc-200">Chọn ảnh từ máy</span>
                  <span className="text-[10px] text-zinc-500">Chọn một hoặc nhiều ảnh</span>
                </button>
              </div>

              {/* Selected photos thumbnail strip */}
              {ocrImages.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs text-zinc-400">
                    <span>Ảnh đã chọn ({ocrImages.length} ảnh):</span>
                    <button
                      onClick={() => { setOcrImages([]); setOcrRecognizedText(''); }}
                      className="text-red-400 hover:underline cursor-pointer"
                    >
                      Xóa tất cả
                    </button>
                  </div>

                  <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 max-h-36 overflow-y-auto p-1 bg-zinc-950/40 rounded-xl border border-zinc-800">
                    {ocrImages.map((img, idx) => (
                      <div key={img.id} className="relative group rounded-lg overflow-hidden border border-zinc-700 aspect-3/4 bg-zinc-800">
                        <img src={img.base64} alt={img.name} className="w-full h-full object-cover" />
                        <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-center text-zinc-300 py-0.5 truncate">
                          Trang {idx + 1}
                        </span>
                        <button
                          onClick={() => setOcrImages(ocrImages.filter(item => item.id !== img.id))}
                          className="absolute top-1 right-1 p-1 rounded-md bg-black/80 text-red-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Trigger OCR Button */}
                  {!ocrRecognizedText && (
                    <button
                      onClick={handleStartOCR}
                      disabled={isProcessing}
                      className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-zinc-950 font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20 cursor-pointer disabled:opacity-50 transition-all"
                    >
                      <Sparkles className="w-4 h-4" />
                      Trích xuất chữ bằng AI Gemini Vision ({ocrImages.length} trang)
                    </button>
                  )}
                </div>
              )}

              {/* OCR Result Text Preview & Edit */}
              {ocrRecognizedText && (
                <div className="space-y-2 pt-2 border-t border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-zinc-300 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-emerald-400" />
                      Văn bản trích xuất thành công:
                    </span>
                    <button
                      onClick={handleStartOCR}
                      className="text-[11px] text-amber-400 hover:underline cursor-pointer"
                    >
                      Quét lại AI
                    </button>
                  </div>

                  <textarea
                    rows={6}
                    value={ocrRecognizedText}
                    onChange={(e) => setOcrRecognizedText(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 leading-relaxed font-sans focus:outline-none focus:border-amber-500"
                    placeholder="Nội dung chữ sau khi nhận diện..."
                  />

                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Tiêu đề truyện..."
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                    />
                    <button
                      onClick={handleProceedOcrToParsed}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold cursor-pointer transition-all"
                    >
                      Tạo truyện & Xem trước
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Loading Indicator */}
          {isProcessing && (
            <div className="py-8 text-center space-y-2">
              <Loader2 className="w-8 h-8 text-amber-400 animate-spin mx-auto" />
              <p className="text-sm font-medium text-zinc-300">
                {processingStatus || 'Đang quét và xử lý dữ liệu...'}
              </p>
              {ocrProgress && (
                <p className="text-xs text-amber-400 font-mono font-medium">
                  {ocrProgress.current} / {ocrProgress.total} trang hoàn tất
                </p>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/30 flex items-start gap-2.5 text-red-300 text-xs">
              <AlertTriangle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="font-medium">Thông báo</p>
                <p className="text-red-400/90 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {/* Parsed Preview */}
          {parsedData && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-2 rounded-xl">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>
                  Phân tích thành công! Đã tìm thấy <strong>{parsedData.book.chapters.length} chương</strong>{' '}
                  {parsedData.source === 'local_comic' ? '(Định dạng Comic/Manga)' : ''}.
                </span>
              </div>

              {/* Scanned PDF Notice */}
              {parsedData.isScannedPdf && (
                <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                    <Info className="w-4 h-4" />
                    Lưu ý về file PDF ảnh scan
                  </div>
                  <p className="text-zinc-300">
                    File này là dạng ảnh scan không chứa lớp văn bản chữ số hóa. Trình đọc Text-to-Speech (TTS) chỉ có thể phát âm thanh khi có chữ thật.
                  </p>
                </div>
              )}

              {/* Editable metadata */}
              <div className="flex gap-4 bg-zinc-800/50 p-4 rounded-xl border border-zinc-800">
                {parsedData.coverUrl && (
                  <div className="w-16 h-24 rounded-lg overflow-hidden border border-zinc-700 shrink-0 bg-black">
                    <img src={parsedData.coverUrl} alt="Cover" className="w-full h-full object-cover" />
                  </div>
                )}
                <div className="space-y-3 flex-1">
                  <div>
                    <label className="block text-xs font-medium text-zinc-400 mb-1">
                      Tên truyện
                    </label>
                    <input
                      type="text"
                      value={customTitle}
                      onChange={(e) => setCustomTitle(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
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
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
                    />
                  </div>
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
                        {parsedData.source === 'local_comic' ? 'Trang tranh ảnh' : `${ch.content.split(/\s+/).length} từ`}
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
