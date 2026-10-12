import React, { useState, useEffect } from 'react';
import { 
  X, 
  Sparkles, 
  BookOpen, 
  History, 
  Key, 
  Loader2, 
  Check, 
  Copy, 
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { geminiSummaryService } from '../services/ai/geminiSummary';
import type { Chapter } from '../types';

interface AISummaryModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookTitle: string;
  currentChapter: Chapter;
  previousChapters: Chapter[];
}

export const AISummaryModal: React.FC<AISummaryModalProps> = ({
  isOpen,
  onClose,
  bookTitle,
  currentChapter,
  previousChapters
}) => {
  const [activeTab, setActiveTab] = useState<'chapter' | 'recap'>('chapter');
  const [, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);
  const [keyInput, setKeyInput] = useState('');
  const [showKeyConfig, setShowKeyConfig] = useState(false);

  // Results
  const [chapterSummary, setChapterSummary] = useState<string | null>(null);
  const [recapSummary, setRecapSummary] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (isOpen) {
      geminiSummaryService.getApiKey().then((k) => {
        setApiKey(k);
        setKeyInput(k);
        const exists = !!(k && k.trim());
        setHasApiKey(exists);
        if (!exists) {
          setShowKeyConfig(true);
        } else {
          setShowKeyConfig(false);
        }
      });
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSaveKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!keyInput.trim()) return;
    await geminiSummaryService.saveApiKey(keyInput.trim());
    setApiKey(keyInput.trim());
    setHasApiKey(true);
    setShowKeyConfig(false);
    setError(null);
  };

  const handleGenerateChapterSummary = async () => {
    if (!currentChapter?.content) {
      setError('Chương này hiện chưa có nội dung để tóm tắt.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await geminiSummaryService.summarizeChapter(
        bookTitle,
        currentChapter.title,
        currentChapter.content
      );
      setChapterSummary(res.summary);
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi gọi AI Gemini.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerateRecap = async () => {
    if (previousChapters.length === 0) {
      setError('Chưa có đủ các chương trước đó để nhắc lại diễn biến.');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const recent = previousChapters.slice(-4);
      const res = await geminiSummaryService.recapRecentChapters(
        bookTitle,
        recent.map(c => ({ title: c.title, content: c.content }))
      );
      setRecapSummary(res.summary);
    } catch (err: any) {
      setError(err?.message || 'Có lỗi xảy ra khi gọi AI Gemini.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-xl bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
              <Sparkles className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h3 className="font-bold text-sm sm:text-base text-zinc-100 flex items-center gap-2">
                Trợ Lý Cốt Truyện AI
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-amber-400/20 text-amber-300 border border-amber-500/30">
                  Gemini Flash
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400 truncate max-w-xs sm:max-w-md">
                {bookTitle} • {currentChapter.title}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* API Key Banner / Config Section */}
        {showKeyConfig ? (
          <div className="my-3 p-4 rounded-2xl bg-zinc-800/80 border border-amber-500/30">
            <div className="flex items-start gap-3 mb-3">
              <Key className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold text-zinc-100">Thiết lập Google Gemini API Key</h4>
                <p className="text-[11px] text-zinc-400 leading-relaxed mt-1">
                  Gemini API hoàn toàn <b>miễn phí</b> từ Google. Bạn chỉ cần lấy 1 mã khóa (API Key) và dán vào đây để sử dụng vĩnh viễn:
                </p>
              </div>
            </div>

            <form onSubmit={handleSaveKey} className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                placeholder="Dán AI Studio API Key (AIzaSy...)"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl transition-all cursor-pointer shrink-0"
              >
                Lưu cấu hình
              </button>
            </form>

            <div className="mt-2.5 flex items-center justify-between text-[11px]">
              <a
                href="https://aistudio.google.com/app/apikey"
                target="_blank"
                rel="noreferrer"
                className="text-amber-400 hover:underline flex items-center gap-1 font-medium"
              >
                <span>Nhận API Key miễn phí tại Google AI Studio</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              {hasApiKey && (
                <button
                  type="button"
                  onClick={() => setShowKeyConfig(false)}
                  className="text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  Đóng
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-between py-1.5 px-2 text-[11px] text-zinc-400 border-b border-zinc-800/60 mb-2">
            <span className="flex items-center gap-1.5 text-emerald-400">
              <Check className="w-3.5 h-3.5" />
              <span>Đã kết nối Gemini API</span>
            </span>
            <button
              onClick={() => setShowKeyConfig(true)}
              className="text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer flex items-center gap-1"
            >
              <Key className="w-3 h-3" />
              <span>Đổi API Key</span>
            </button>
          </div>
        )}

        {/* Tab Switcher */}
        <div className="grid grid-cols-2 gap-2 my-2">
          <button
            onClick={() => {
              setActiveTab('chapter');
              setError(null);
            }}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'chapter'
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm'
                : 'bg-zinc-800/50 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Tóm tắt chương này</span>
          </button>

          <button
            onClick={() => {
              setActiveTab('recap');
              setError(null);
            }}
            className={`py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer ${
              activeTab === 'recap'
                ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm'
                : 'bg-zinc-800/50 border-zinc-800 text-zinc-400 hover:text-zinc-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Nhắc lại diễn biến</span>
          </button>
        </div>

        {/* Content View */}
        <div className="flex-1 my-2 min-h-[220px] flex flex-col justify-between">
          {error && (
            <div className="p-3 mb-3 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
              <div>
                <p className="font-semibold">Lỗi yêu cầu AI:</p>
                <p className="text-[11px] opacity-90 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {activeTab === 'chapter' && (
            <div className="flex-1 flex flex-col">
              {chapterSummary ? (
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 text-xs text-zinc-200 leading-relaxed font-sans space-y-3 select-text max-h-[360px] overflow-y-auto">
                  <div className="whitespace-pre-line">{chapterSummary}</div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400">
                  <Sparkles className="w-10 h-10 text-amber-400/40 mb-3 animate-pulse" />
                  <p className="text-xs font-medium text-zinc-300">
                    Bấm nút bên dưới để AI đọc và chắt lọc nhanh 3-4 ý chính quan trọng nhất của chương {currentChapter.chapterNumber}.
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Không bỏ lỡ tình tiết đột phá cảnh giới hay biến cố bất ngờ!
                  </p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'recap' && (
            <div className="flex-1 flex flex-col">
              {recapSummary ? (
                <div className="p-4 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 text-xs text-zinc-200 leading-relaxed font-sans space-y-3 select-text max-h-[360px] overflow-y-auto">
                  <div className="whitespace-pre-line">{recapSummary}</div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-zinc-400">
                  <History className="w-10 h-10 text-amber-400/40 mb-3" />
                  <p className="text-xs font-medium text-zinc-300">
                    Bạn bỏ dở truyện đã lâu? AI sẽ tổng hợp diễn biến 3-5 chương vừa qua để bạn bắt nhịp lại ngay lập tức!
                  </p>
                  <p className="text-[11px] text-zinc-500 mt-1">
                    Số chương trước đó có sẵn: {previousChapters.length} chương.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="pt-3 border-t border-zinc-800 flex items-center justify-between gap-3">
          {((activeTab === 'chapter' && chapterSummary) || (activeTab === 'recap' && recapSummary)) ? (
            <button
              onClick={() => handleCopy((activeTab === 'chapter' ? chapterSummary : recapSummary) || '')}
              className="py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Đã sao chép</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Sao chép tóm tắt</span>
                </>
              )}
            </button>
          ) : <div />}

          <button
            disabled={isLoading || !hasApiKey}
            onClick={activeTab === 'chapter' ? handleGenerateChapterSummary : handleGenerateRecap}
            className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 font-bold text-xs flex items-center gap-2 shadow-lg shadow-amber-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>AI đang đọc và tóm tắt...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 fill-current" />
                <span>{activeTab === 'chapter' ? 'Tạo tóm tắt chương' : 'Nhắc lại diễn biến'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
