import React, { useState, useEffect, useRef } from 'react';
import { X, CloudDownload, Download, Check, AlertCircle, Loader2, HardDrive, Trash2 } from 'lucide-react';
import type { Story, Chapter } from '../types';
import { ttsEngine } from '../services/tts/ttsEngine';
import { db } from '../services/db';

interface OfflineAudioModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: Story;
  currentChapterNumber: number;
  chapters: Chapter[];
  onPlayChapter?: (chapterNumber: number) => void;
}

export const OfflineAudioModal: React.FC<OfflineAudioModalProps> = ({
  isOpen,
  onClose,
  story,
  currentChapterNumber,
  chapters,
  onPlayChapter: _onPlayChapter
}) => {
  const [downloadCount, setDownloadCount] = useState<number>(1);
  const [isDownloading, setIsDownloading] = useState(false);
  const [progress, setProgress] = useState<{
    chapterIndex: number;
    totalChapters: number;
    currentChapterNumber: number;
    sentenceDone: number;
    sentenceTotal: number;
    overallPercent: number;
  } | null>(null);
  const [cachedBytes, setCachedBytes] = useState<number>(0);
  const [cachedSentenceCount, setCachedSentenceCount] = useState<number>(0);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);

  // Load storage stats for this story
  const loadCacheStats = async () => {
    try {
      const records = await db.offlineAudioCache
        .where('storyId')
        .equals(story.id)
        .toArray();

      const totalSize = records.reduce((sum, r) => sum + (r.sizeBytes || r.audioBlob?.size || 0), 0);
      setCachedBytes(totalSize);
      setCachedSentenceCount(records.length);
    } catch (e) {
      console.warn('Failed to load audio cache stats:', e);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadCacheStats();
      setSuccessMsg(null);
      setErrorMsg(null);
    }
  }, [isOpen, story.id]);

  if (!isOpen) return null;

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const mb = bytes / (1024 * 1024);
    if (mb < 0.1) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${mb.toFixed(1)} MB`;
  };

  const handleStartDownload = async () => {
    setIsDownloading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // 1. Gather target chapters from currentChapterNumber onward
      const targetChapters: { chapterNumber: number; content: string }[] = [];
      const endChapterNumber = Math.min(chapters.length, currentChapterNumber + downloadCount - 1);

      for (let chNum = currentChapterNumber; chNum <= endChapterNumber; chNum++) {
        // Find existing or fetch content from db
        const chMeta = chapters.find(c => c.chapterNumber === chNum);
        if (chMeta && chMeta.content) {
          targetChapters.push({ chapterNumber: chNum, content: chMeta.content });
        } else {
          const fullCh = await db.getChapter(story.id, chNum);
          if (fullCh && fullCh.content) {
            targetChapters.push({ chapterNumber: chNum, content: fullCh.content });
          }
        }
      }

      if (targetChapters.length === 0) {
        throw new Error('Chưa có nội dung các chương cần tải. Hãy tải nội dung chữ trước.');
      }

      const result = await ttsEngine.downloadChaptersBatch(
        story.id,
        targetChapters,
        (p) => {
          setProgress(p);
        },
        abortController.signal
      );

      if (result.success) {
        setSuccessMsg(`Đã tải thành công ${result.downloadedChapters} chương audio để nghe offline!`);
      } else {
        setSuccessMsg('Đã tạm dừng tải audio.');
      }
      await loadCacheStats();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMsg(err.message || 'Tải audio thất bại. Vui lòng kiểm tra mạng và thử lại.');
      }
    } finally {
      setIsDownloading(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  };

  const handleCancelDownload = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  const handleClearStoryAudio = async () => {
    if (window.confirm('Bạn có chắc muốn xóa toàn bộ audio đã tải của truyện này để giải phóng dung lượng?')) {
      try {
        await db.clearOfflineAudioForStory(story.id);
        await loadCacheStats();
        setSuccessMsg('Đã xóa toàn bộ audio ngoại tuyến của truyện này.');
      } catch {
        setErrorMsg('Không thể xóa audio cache.');
      }
    }
  };

  const currentVoiceName = ttsEngine.getSettings().voiceURI.includes('HoaiMy')
    ? 'Hoài My (Nữ · AI Neural)'
    : 'Nam Minh (Nam · AI Neural)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <CloudDownload className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                Tải Audio Ngoại Tuyến
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                  AI Neural
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">Nghe trọn vẹn khi không có mạng 4G/Wi-Fi</p>
            </div>
          </div>
          <button
            disabled={isDownloading}
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Story & Chapter Info */}
          <div className="p-3.5 rounded-xl bg-zinc-800/40 border border-zinc-700/60 flex items-center justify-between">
            <div className="truncate mr-2">
              <h4 className="text-xs font-semibold text-zinc-100 truncate">{story.title}</h4>
              <p className="text-[11px] text-amber-400 mt-0.5">Bắt đầu từ: Chương {currentChapterNumber}</p>
            </div>
            <div className="text-right shrink-0">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700">
                {currentVoiceName}
              </span>
            </div>
          </div>

          {/* Download Count Options */}
          {!isDownloading && (
            <div className="space-y-2">
              <label className="text-xs font-medium text-zinc-300">Chọn số lượng chương muốn tải trước:</label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { count: 1, label: '1 chương', desc: 'Chỉ chương hiện tại' },
                  { count: 3, label: '3 chương', desc: `Chương ${currentChapterNumber} - ${Math.min(chapters.length, currentChapterNumber + 2)}` },
                  { count: 5, label: '5 chương', desc: `Chương ${currentChapterNumber} - ${Math.min(chapters.length, currentChapterNumber + 4)}` },
                  { count: 10, label: '10 chương', desc: `Chương ${currentChapterNumber} - ${Math.min(chapters.length, currentChapterNumber + 9)}` }
                ].map((opt) => (
                  <button
                    key={opt.count}
                    onClick={() => setDownloadCount(opt.count)}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      downloadCount === opt.count
                        ? 'bg-amber-500/15 border-amber-500/50 text-amber-300 shadow-sm'
                        : 'bg-zinc-800/50 hover:bg-zinc-800 border-zinc-700/60 text-zinc-300'
                    }`}
                  >
                    <div className="text-xs font-bold">{opt.label}</div>
                    <div className="text-[10px] text-zinc-400 mt-0.5 truncate">{opt.desc}</div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Active Download Progress */}
          {isDownloading && progress && (
            <div className="p-4 rounded-xl bg-zinc-800/60 border border-amber-500/30 space-y-3 animate-fade-in">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Đang tải Chương {progress.currentChapterNumber} ({progress.chapterIndex}/{progress.totalChapters})
                </span>
                <span className="font-bold text-zinc-200">{progress.overallPercent}%</span>
              </div>

              {/* Progress bar */}
              <div className="w-full h-2 rounded-full bg-zinc-700 overflow-hidden">
                <div 
                  className="h-full bg-amber-400 transition-all duration-300 rounded-full"
                  style={{ width: `${progress.overallPercent}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-zinc-400">
                <span>Câu {progress.sentenceDone}/{progress.sentenceTotal}</span>
                <span>Tự động lưu vào bộ nhớ máy</span>
              </div>

              <button
                onClick={handleCancelDownload}
                className="w-full py-2 rounded-xl bg-zinc-700 hover:bg-zinc-600 text-xs font-medium text-zinc-200 transition-colors cursor-pointer mt-2"
              >
                Hủy tải
              </button>
            </div>
          )}

          {/* Status Messages */}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-300 flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-300 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Storage stats */}
          <div className="pt-3 border-t border-zinc-800/80 flex items-center justify-between text-xs text-zinc-400">
            <div className="flex items-center gap-2">
              <HardDrive className="w-4 h-4 text-zinc-500" />
              <span>Đã lưu offline: <strong className="text-zinc-200">{formatSize(cachedBytes)}</strong> ({cachedSentenceCount} câu)</span>
            </div>
            {cachedBytes > 0 && (
              <button
                disabled={isDownloading}
                onClick={handleClearStoryAudio}
                className="flex items-center gap-1 text-[11px] text-rose-400 hover:text-rose-300 transition-colors cursor-pointer disabled:opacity-40"
                title="Xóa audio để giải phóng bộ nhớ"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Xóa cache</span>
              </button>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-zinc-800 bg-zinc-950/60 flex items-center justify-between shrink-0">
          <button
            disabled={isDownloading}
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition-colors cursor-pointer disabled:opacity-40"
          >
            Đóng
          </button>
          {!isDownloading && (
            <button
              onClick={handleStartDownload}
              className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-all shadow-md cursor-pointer flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Bắt đầu tải ({downloadCount} chương)</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
