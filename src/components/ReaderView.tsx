import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  ArrowLeft, 
  Settings2, 
  Headphones, 
  List, 
  ChevronLeft, 
  ChevronRight, 
  Type, 
  Check, 
  X,
  Search,
  Zap,
  CloudDownload,
  Download,
  BookOpen,
  Loader2,
  AlertCircle,
  RefreshCw,
  FileDown,
  BookMarked,
  Quote,
  Sparkles
} from 'lucide-react';
import type { Story, Chapter, ReaderSettings, ReaderTheme, FontFamily, CrawlSearchResult } from '../types';
import { ttsEngine, type TTSState } from '../services/tts/ttsEngine';
import { supabaseSync } from '../services/sync/supabaseSync';
import { fetchStoryDetail, batchDownloadChapters, searchStories } from '../services/crawler';
import { db } from '../services/db';
import { StoryNotesDrawer } from './StoryNotesDrawer';
import { QuoteCardModal } from './QuoteCardModal';
import { AISummaryModal } from './AISummaryModal';
import { exportStoryToEpub, exportStoryToTxt } from '../services/export/epubExport';

interface ReaderViewProps {
  story: Story;
  chapters: Chapter[];
  currentChapterNumber: number;
  onSelectChapter: (chapterNumber: number) => void;
  onBackToLibrary: () => void;
  settings: ReaderSettings;
  onUpdateSettings: (newSettings: Partial<ReaderSettings>) => void;
  ttsState: TTSState;
  onStartTTS: () => void;
  onToggleTTS: () => void;
  activeSentenceIndex: number;
  onReloadChapters?: () => Promise<void>;
}

export const ReaderView: React.FC<ReaderViewProps> = ({
  story,
  chapters,
  currentChapterNumber,
  onSelectChapter,
  onBackToLibrary,
  settings,
  onUpdateSettings,
  ttsState,
  onStartTTS,
  onToggleTTS,
  activeSentenceIndex,
  onReloadChapters
}) => {
  const currentChapter = chapters.find(c => c.chapterNumber === currentChapterNumber) || chapters[0];
  const hasContent = Boolean(currentChapter && currentChapter.content && currentChapter.content.trim().length > 0);
  
  // UI states
  const [showControls, setShowControls] = useState(true);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showTocDrawer, setShowTocDrawer] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [showQuoteModal, setShowQuoteModal] = useState(false);
  const [selectedQuoteText, setSelectedQuoteText] = useState('');
  const [showAiSummaryModal, setShowAiSummaryModal] = useState(false);

  const handleOpenQuoteModal = () => {
    let text = '';
    if (typeof window !== 'undefined') {
      const sel = window.getSelection()?.toString().trim();
      if (sel) text = sel;
    }
    if (!text && sentences.length > 0) {
      text = sentences[activeSentenceIndex] || sentences[0] || '';
    }
    setSelectedQuoteText(text);
    setShowQuoteModal(true);
  };

  // Quick jump & TOC search states
  const [tocSearch, setTocSearch] = useState('');
  const [quickJumpInput, setQuickJumpInput] = useState('');
  const [tocScrollTop, setTocScrollTop] = useState(0);
  const tocContainerRef = useRef<HTMLDivElement>(null);

  // Paged mode pagination state
  const [currentPageIndex, setCurrentPageIndex] = useState(0);

  // Check new chapters state
  const [isCheckingNewChapters, setIsCheckingNewChapters] = useState(false);
  const [checkNewMsg, setCheckNewMsg] = useState<string | null>(null);

  // Audio download and export states
  const [isDownloadingAudio, setIsDownloadingAudio] = useState(false);
  const [audioDownloadProgress, setAudioDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // On-demand download state for empty chapters
  const [isDownloadingChapters, setIsDownloadingChapters] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Auto source detection states
  const [detectedSource, setDetectedSource] = useState<CrawlSearchResult | null>(null);
  const [isSearchingSource, setIsSearchingSource] = useState(false);
  const [showManualUrlInput, setShowManualUrlInput] = useState(false);
  const [manualUrlInput, setManualUrlInput] = useState('');

  // Auto search online source if story has no sourceUrl and has no content
  useEffect(() => {
    let isMounted = true;
    if (!hasContent && !story.sourceUrl && story.title) {
      setIsSearchingSource(true);
      searchStories(story.title)
        .then(results => {
          if (!isMounted) return;
          if (results && results.length > 0) {
            setDetectedSource(results[0]);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setIsSearchingSource(false);
        });
    }
    return () => { isMounted = false; };
  }, [hasContent, story.sourceUrl, story.title]);

  const handlePullFromCloud = async () => {
    setIsDownloadingChapters(true);
    setDownloadStatus('Đang kết nối Supabase Cloud để tải chương...');
    setDownloadError(null);
    try {
      if (!supabaseSync.isConnected()) {
        throw new Error('Chưa kết nối Supabase. Vui lòng vào Cài đặt để thiết lập tài khoản Supabase.');
      }
      const res = await supabaseSync.pullStoryChapters(story.id);
      if (res.count > 0) {
        setDownloadStatus(`Đã tải thành công ${res.count} chương từ đám mây!`);
        if (onReloadChapters) {
          await onReloadChapters();
        }
      } else {
        setDownloadError(
          res.error || 'Không tìm thấy nội dung chương của truyện này trên Supabase Cloud. Bạn hãy bấm nút "Tải từ Web Online" bên dưới để tải trực tiếp các chương về máy.'
        );
      }
    } catch (err: any) {
      setDownloadError(err?.message || 'Lỗi khi tải chương từ Supabase');
    } finally {
      setIsDownloadingChapters(false);
    }
  };

  const handleDownloadFromOnlineSource = async (customUrl?: string) => {
    const urlToUse = customUrl || story.sourceUrl || detectedSource?.sourceUrl || manualUrlInput.trim();
    if (!urlToUse) {
      setDownloadError('Vui lòng chọn hoặc nhập liên kết nguồn truyện online.');
      return;
    }

    setIsDownloadingChapters(true);
    setDownloadStatus('Đang lấy danh mục chương từ nguồn web...');
    setDownloadError(null);

    try {
      const detail = await fetchStoryDetail(urlToUse);
      if (!detail.chapters || detail.chapters.length === 0) {
        throw new Error('Không lấy được danh sách chương từ nguồn web này.');
      }

      // Calculate 50-chapter download window starting from the current chapter (e.g. 1364)
      const targetStartNum = Math.max(1, currentChapterNumber);
      let startIdx = detail.chapters.findIndex(c => c.number === targetStartNum);
      if (startIdx === -1) {
        startIdx = Math.max(0, targetStartNum - 1);
      }
      const endIdx = Math.min(detail.chapters.length, startIdx + 50);
      const chaptersToDownload = detail.chapters.slice(startIdx, endIdx);

      const fromNum = chaptersToDownload[0]?.number || targetStartNum;
      const toNum = chaptersToDownload[chaptersToDownload.length - 1]?.number || (fromNum + chaptersToDownload.length - 1);

      setDownloadStatus(`Đang tải chương ${fromNum} đến ${toNum} từ nguồn web...`);

      const results = await batchDownloadChapters(
        chaptersToDownload.map((c, i) => ({ 
          title: c.title, 
          url: c.url, 
          number: c.number || (targetStartNum + i) 
        })),
        (cur, tot, t) => {
          setDownloadStatus(`Đang tải chương ${cur}/${tot}: ${t || ''}`);
        }
      );

      const successfulChapters: Chapter[] = [];
      results.forEach((r) => {
        if (r.success && r.content) {
          const chMeta = chaptersToDownload.find(c => c.url === r.url);
          const chNum = chMeta ? chMeta.number : (targetStartNum + successfulChapters.length);
          successfulChapters.push({
            id: `${story.id}_ch_${chNum}`,
            storyId: story.id,
            chapterNumber: chNum,
            title: r.title || chMeta?.title || `Chương ${chNum}`,
            content: r.content,
            wordCount: r.wordCount || r.content.split(/\s+/).length,
            sourceUrl: r.url
          });
        }
      });

      if (successfulChapters.length === 0) {
        throw new Error('Không tải được nội dung của chương nào từ nguồn web này. Vui lòng kiểm tra lại kết nối mạng.');
      }

      await db.chapters.bulkPut(successfulChapters);
      const updatedTotal = Math.max(story.totalChapters || 0, detail.totalChapters || detail.chapters.length);
      await db.stories.update(story.id, {
        sourceUrl: urlToUse,
        totalChapters: updatedTotal
      });

      // Also sync progress & chapters to Supabase in background
      if (supabaseSync.isConnected()) {
        await supabaseSync.pushStoryProgress({
          ...story,
          sourceUrl: urlToUse,
          totalChapters: updatedTotal
        });
        supabaseSync.pushStoryChapters(story.id, successfulChapters).catch(() => {});
      }

      setDownloadStatus(`Đã tải xong ${successfulChapters.length} chương (Chương ${fromNum} - ${toNum})!`);
      if (onReloadChapters) {
        await onReloadChapters();
      }
    } catch (err: any) {
      setDownloadError(err?.message || 'Lỗi khi tải chương từ nguồn web');
    } finally {
      setIsDownloadingChapters(false);
    }
  };

  const containerRef = useRef<HTMLDivElement>(null);
  const sentenceRefs = useRef<(HTMLSpanElement | null)[]>([]);

  // Touch gesture tracker to distinguish scrolling/swiping from clicking
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isTouchDragging = useRef(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartPos.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      isTouchDragging.current = false;
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartPos.current && e.touches.length === 1) {
      const dx = Math.abs(e.touches[0].clientX - touchStartPos.current.x);
      const dy = Math.abs(e.touches[0].clientY - touchStartPos.current.y);
      if (dx > 8 || dy > 8) {
        isTouchDragging.current = true;
      }
    }
  };

  // Split chapter content into clean readable sentences matching ttsEngine
  const sentences = React.useMemo(() => {
    if (!currentChapter || !currentChapter.content) return [];
    return ttsEngine.splitIntoSentences(currentChapter.content);
  }, [currentChapter]);

  // Paged mode calculations
  const sentencesPerPage = 8;
  const totalPages = Math.max(1, Math.ceil(sentences.length / sentencesPerPage));

  // Reset page when chapter changes
  useEffect(() => {
    setCurrentPageIndex(0);
  }, [currentChapterNumber]);

  // Turn page automatically when TTS reads in paged mode
  useEffect(() => {
    if (settings.readerMode === 'paged' && ttsState !== 'idle' && activeSentenceIndex >= 0) {
      const pageOfActiveSentence = Math.floor(activeSentenceIndex / sentencesPerPage);
      if (pageOfActiveSentence !== currentPageIndex && pageOfActiveSentence < totalPages) {
        setCurrentPageIndex(pageOfActiveSentence);
      }
    }
  }, [activeSentenceIndex, settings.readerMode, ttsState, totalPages, currentPageIndex]);

  // Keep screen awake while reading or listening in ReaderView
  useEffect(() => {
    const androidMedia = (window as any).AndroidMedia;
    const shouldKeepAwake = settings.keepScreenAwake !== false;
    if (androidMedia && typeof androidMedia.setKeepScreenOn === 'function') {
      androidMedia.setKeepScreenOn(shouldKeepAwake);
    }
    return () => {
      if (androidMedia && typeof androidMedia.setKeepScreenOn === 'function') {
        androidMedia.setKeepScreenOn(false);
      }
    };
  }, [settings.keepScreenAwake]);

  // Virtual scrolling parameters for TOC (Optimized for 10,000+ chapters)
  const ITEM_HEIGHT = 40;
  const filteredChapters = useMemo(() => {
    const q = tocSearch.trim().toLowerCase();
    if (!q) return chapters;
    return chapters.filter(c => 
      c.title.toLowerCase().includes(q) || 
      c.chapterNumber.toString() === q ||
      c.chapterNumber.toString().includes(q)
    );
  }, [chapters, tocSearch]);

  const startIndex = Math.max(0, Math.floor(tocScrollTop / ITEM_HEIGHT) - 8);
  const endIndex = Math.min(filteredChapters.length, Math.ceil((tocScrollTop + 750) / ITEM_HEIGHT) + 8);
  const visibleChapters = useMemo(() => {
    return filteredChapters.slice(startIndex, endIndex);
  }, [filteredChapters, startIndex, endIndex]);
  const totalHeight = filteredChapters.length * ITEM_HEIGHT;

  // Auto-scroll TOC drawer to current chapter when drawer opens
  useEffect(() => {
    if (showTocDrawer) {
      const idx = filteredChapters.findIndex(c => c.chapterNumber === currentChapterNumber);
      if (idx >= 0 && tocContainerRef.current) {
        const timer = setTimeout(() => {
          if (tocContainerRef.current) {
            tocContainerRef.current.scrollTop = Math.max(0, idx * ITEM_HEIGHT - 160);
          }
        }, 50);
        return () => clearTimeout(timer);
      }
    }
  }, [showTocDrawer, currentChapterNumber]);

  // Handle Check New Chapters
  const handleCheckNewChapters = async () => {
    if (!story.sourceUrl) {
      setCheckNewMsg('Truyện này chưa có liên kết nguồn trực tuyến.');
      setTimeout(() => setCheckNewMsg(null), 3500);
      return;
    }
    setIsCheckingNewChapters(true);
    setCheckNewMsg('Đang kiểm tra chương mới...');
    try {
      const detail = await fetchStoryDetail(story.sourceUrl);
      if (detail && detail.chapters && detail.chapters.length > chapters.length) {
        const newChapters = detail.chapters.slice(chapters.length);
        setCheckNewMsg(`Tìm thấy ${newChapters.length} chương mới! Đang tải nội dung...`);
        const downloadedResults = await batchDownloadChapters(
          newChapters,
          (curr, tot) => {
            setCheckNewMsg(`Đang tải (${curr}/${tot})...`);
          }
        );
        const chaptersToSave: Chapter[] = downloadedResults
          .filter(r => r.success && r.content)
          .map((r, idx) => ({
            id: `${story.id}_${newChapters[idx].number}`,
            storyId: story.id,
            chapterNumber: newChapters[idx].number,
            title: r.title || newChapters[idx].title,
            content: r.content,
            wordCount: r.wordCount,
            sourceUrl: r.url
          }));
        await db.saveStoryChapters(chaptersToSave);
        await db.stories.update(story.id, { totalChapters: detail.chapters.length });
        if (onReloadChapters) await onReloadChapters();
        setCheckNewMsg(`Thành công! Đã thêm ${chaptersToSave.length} chương mới.`);
      } else {
        setCheckNewMsg('Truyện đã ở chương mới nhất!');
      }
    } catch (e: any) {
      setCheckNewMsg(`Lỗi kiểm tra: ${e.message || 'Không thể kết nối'}`);
    } finally {
      setIsCheckingNewChapters(false);
      setTimeout(() => setCheckNewMsg(null), 4000);
    }
  };

  // 1-Click Download Current Chapter Audio
  const handleDownloadChapterAudio = async () => {
    if (sentences.length === 0) return;
    setIsDownloadingAudio(true);
    setAudioDownloadProgress({ done: 0, total: sentences.length });
    try {
      await ttsEngine.downloadChapterAudio(
        story.id,
        currentChapter.chapterNumber,
        (done, total) => {
          setAudioDownloadProgress({ done, total });
        }
      );
      setCheckNewMsg(`Đã tải ngoại tuyến cả chương (${sentences.length} câu) thành công!`);
    } catch {
      setCheckNewMsg('Tải audio thất bại. Vui lòng thử lại.');
    } finally {
      setIsDownloadingAudio(false);
      setAudioDownloadProgress(null);
      setTimeout(() => setCheckNewMsg(null), 3500);
    }
  };

  // Export handlers
  const handleExportEpub = async () => {
    try {
      setIsExporting(true);
      const allChapters = await db.getStoryChapters(story.id);
      const blob = await exportStoryToEpub(story, allChapters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story.title.replace(/[\\/:*?"<>|]/g, '_')}.epub`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Export EPUB error:', e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportTxt = async () => {
    try {
      setIsExporting(true);
      const allChapters = await db.getStoryChapters(story.id);
      const blob = exportStoryToTxt(story, allChapters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${story.title.replace(/[\\/:*?"<>|]/g, '_')}.txt`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Export TXT error:', e);
    } finally {
      setIsExporting(false);
    }
  };

  // Scroll to active sentence ONLY if it is out of the visible screen viewport
  useEffect(() => {
    if (settings.readerMode !== 'paged' && ttsState === 'playing' && sentenceRefs.current[activeSentenceIndex]) {
      const el = sentenceRefs.current[activeSentenceIndex];
      if (el) {
        const rect = el.getBoundingClientRect();
        const isInViewport = rect.top >= 90 && rect.bottom <= (window.innerHeight - 110);
        if (!isInViewport) {
          el.scrollIntoView({
            behavior: 'smooth',
            block: 'center'
          });
        }
      }
    }
  }, [activeSentenceIndex, ttsState, settings.readerMode]);

  // Handle click on specific sentence to listen from that sentence (guarded against swipes)
  const handleSentenceClick = (index: number) => {
    if (isTouchDragging.current) return;

    if (ttsState === 'idle') {
      ttsEngine.loadChapter(
        currentChapter.content,
        {
          title: story.title,
          author: story.author,
          chapterTitle: currentChapter.title,
          coverUrl: story.coverUrl,
          storyId: story.id,
          chapterNumber: currentChapter.chapterNumber
        },
        index
      );
      ttsEngine.play();
    } else {
      ttsEngine.jumpToSentence(index);
    }
  };

  // Jump directly to a given chapter number
  const jumpToChapter = (chapterNum: number) => {
    const validNum = Math.max(1, Math.min(chapterNum, chapters.length));
    onSelectChapter(validNum);
    setShowTocDrawer(false);
    setTocSearch('');
    setQuickJumpInput('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleQuickJumpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(quickJumpInput.trim(), 10);
    if (!isNaN(num) && num >= 1 && num <= chapters.length) {
      jumpToChapter(num);
    }
  };

  const getThemeClass = (theme: ReaderTheme) => {
    switch (theme) {
      case 'sepia': return 'theme-sepia';
      case 'dark': return 'theme-dark';
      case 'amoled': return 'theme-amoled';
      case 'paper': return 'theme-paper';
      case 'light':
      default: return 'theme-light';
    }
  };

  const getFontFamilyStyle = (font: FontFamily) => {
    switch (font) {
      case 'serif':
      case 'lora':
        return { fontFamily: "'Lora', serif" };
      case 'merriweather':
        return { fontFamily: "'Merriweather', serif" };
      case 'sans':
      default:
        return { fontFamily: "'Be Vietnam Pro', sans-serif" };
    }
  };

  return (
    <div className={`min-h-screen transition-colors duration-200 ${getThemeClass(settings.theme)} flex flex-col`}>
      {/* Top Floating Control Bar */}
      <div 
        className={`fixed top-0 left-0 right-0 z-30 transition-transform duration-300 ${
          showControls ? 'translate-y-0' : '-translate-y-full'
        } bg-zinc-900/90 backdrop-blur-md border-b border-zinc-800 text-zinc-100 shadow-md`}
      >
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between gap-3">
          {/* Back & Chapter Info */}
          <div className="flex items-center gap-2 min-w-0">
            <button
              onClick={onBackToLibrary}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              title="Quay lại tủ sách"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h2 className="text-xs font-semibold truncate text-zinc-200">
                {story.title}
              </h2>
              <p className="text-[11px] text-zinc-400 truncate">
                {currentChapter?.title || `Chương ${currentChapterNumber}`}
              </p>
            </div>
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-1.5 shrink-0">
            {/* TTS Toggle Button */}
            <button
              disabled={chapters.length === 0}
              onClick={() => {
                if (chapters.length === 0) return;
                if (ttsState === 'idle') {
                  onStartTTS();
                } else {
                  onToggleTTS();
                }
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                chapters.length === 0
                  ? 'opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-500 border border-zinc-700'
                  : ttsState === 'playing'
                  ? 'bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/30 cursor-pointer'
                  : ttsState === 'paused'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer'
              }`}
              title={chapters.length === 0 ? 'Chưa có nội dung để đọc audio' : 'Nghe audio chương này'}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>{ttsState === 'playing' ? 'Đang nghe' : (ttsState === 'paused' ? 'Tạm dừng' : 'Nghe audio')}</span>
            </button>

            {/* Story Lore & Character Notes */}
            <button
              onClick={() => setShowNotesDrawer(true)}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
              title="Sổ tay nhân vật & cảnh giới tu tiên"
            >
              <BookMarked className="w-5 h-5" />
            </button>

            {/* Check for new chapters if online story */}
            {story.sourceUrl && (
              <button
                disabled={isCheckingNewChapters}
                onClick={handleCheckNewChapters}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer disabled:opacity-40"
                title="Kiểm tra & tải thêm chương mới"
              >
                <RefreshCw className={`w-5 h-5 ${isCheckingNewChapters ? 'animate-spin text-amber-400' : ''}`} />
              </button>
            )}

            {/* AI Summary & Story Recap */}
            <button
              onClick={() => setShowAiSummaryModal(true)}
              className="p-2 rounded-lg hover:bg-zinc-800 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
              title="Trợ lý AI Gemini: Tóm tắt chương & nhắc lại cốt truyện"
            >
              <Sparkles className="w-5 h-5" />
            </button>

            {/* Quote Card Generator */}
            <button
              onClick={handleOpenQuoteModal}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
              title="Tạo thẻ trích dẫn nghệ thuật"
            >
              <Quote className="w-5 h-5" />
            </button>

            {/* Table of contents */}
            <button
              disabled={chapters.length === 0}
              onClick={() => setShowTocDrawer(true)}
              className={`p-2 rounded-lg text-zinc-400 transition-colors ${
                chapters.length === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer'
              }`}
              title="Mục lục chương"
            >
              <List className="w-5 h-5" />
            </button>

            {/* Settings */}
            <button
              onClick={() => setShowSettingsModal(!showSettingsModal)}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              title="Tùy chỉnh giao diện đọc"
            >
              <Settings2 className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Status Toast Banner for Check New Chapters / Offline Audio */}
        {checkNewMsg && (
          <div className="bg-amber-500/90 text-zinc-950 font-semibold text-xs py-1.5 px-4 text-center transition-all animate-in fade-in slide-in-from-top-1">
            {checkNewMsg}
          </div>
        )}
      </div>

      {/* Main Reading Text Area or Empty State */}
      {!hasContent ? (
        <main className="flex-1 max-w-xl mx-auto w-full px-5 py-16 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-32 rounded-xl overflow-hidden shadow-2xl border border-zinc-700/60 mb-5 bg-zinc-900 shrink-0">
            {story.coverUrl ? (
              <img src={story.coverUrl} alt={story.title} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-600">
                <BookOpen className="w-10 h-10" />
              </div>
            )}
          </div>

          <h2 className="text-lg sm:text-xl font-bold mb-1 text-zinc-100">{story.title}</h2>
          <p className="text-xs text-zinc-400 mb-6">{story.author} • {story.totalChapters ? `${story.totalChapters} chương` : 'Chưa có chương'}</p>

          <div className="w-full bg-zinc-900/90 border border-zinc-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-center gap-2 text-amber-400 font-semibold text-sm">
              <AlertCircle className="w-4 h-4" />
              Chương {currentChapterNumber} chưa có nội dung chữ
            </div>
            <p className="text-xs text-zinc-400 leading-relaxed">
              Truyện đã được đồng bộ danh mục tới <strong>Chương {currentChapterNumber}</strong>, nhưng chữ của chương này chưa được tải về máy. Hãy tải ngay dưới đây:
            </p>

            {downloadStatus && (
              <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2 text-left">
                {isDownloadingChapters ? <Loader2 className="w-4 h-4 shrink-0 animate-spin text-amber-400" /> : <Check className="w-4 h-4 shrink-0 text-emerald-400" />}
                <span className="truncate">{downloadStatus}</span>
              </div>
            )}

            {downloadError && (
              <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-start gap-2 text-left">
                <AlertCircle className="w-4 h-4 shrink-0 text-red-400 mt-0.5" />
                <span className="leading-relaxed">{downloadError}</span>
              </div>
            )}

            <div className="pt-2 space-y-3">
              {/* Option A: Online Web Source (Primary & Instant) */}
              {(story.sourceUrl || detectedSource) ? (
                <div className="p-3.5 rounded-xl bg-gradient-to-r from-amber-500/15 via-zinc-800 to-zinc-900 border border-amber-500/30 text-left space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wide">
                      <Zap className="w-3.5 h-3.5 text-amber-400" />
                      Nguồn online: {detectedSource?.sourceName || (story.sourceUrl?.includes('wetruyen') ? 'WeTruyen' : 'Web Online')}
                    </span>
                    {(detectedSource?.latestChapter || story.totalChapters) && (
                      <span className="text-[10px] text-zinc-400 font-medium">
                        {detectedSource?.latestChapter || `${story.totalChapters} chương`}
                      </span>
                    )}
                  </div>

                  <button
                    onClick={() => handleDownloadFromOnlineSource(story.sourceUrl || detectedSource?.sourceUrl)}
                    disabled={isDownloadingChapters}
                    className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 disabled:opacity-50 text-zinc-950 font-bold text-xs transition-all shadow-lg shadow-amber-500/20 cursor-pointer"
                  >
                    {isDownloadingChapters ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4 text-zinc-950" />}
                    Tải 50 chương (từ Chương {currentChapterNumber}) từ Web Online
                  </button>
                </div>
              ) : isSearchingSource ? (
                <div className="p-3.5 rounded-xl bg-zinc-800/80 border border-zinc-700 text-xs text-zinc-300 flex items-center justify-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Đang tự động tìm nguồn đọc online cho "{story.title}"...</span>
                </div>
              ) : null}

              {/* Manual URL Input Option */}
              <div className="text-left">
                {!showManualUrlInput ? (
                  <button
                    onClick={() => setShowManualUrlInput(true)}
                    className="text-[11px] text-amber-400 hover:text-amber-300 underline underline-offset-2 flex items-center gap-1 cursor-pointer mx-auto"
                  >
                    <Search className="w-3 h-3" />
                    Nhập hoặc dán link nguồn truyện online
                  </button>
                ) : (
                  <div className="p-3 rounded-xl bg-zinc-950 border border-zinc-800 space-y-2">
                    <label className="text-[11px] text-zinc-400 block font-medium">
                      Dán link truyện từ WeTruyen hoặc TruyenFull:
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="url"
                        value={manualUrlInput}
                        onChange={(e) => setManualUrlInput(e.target.value)}
                        placeholder="https://wetruyen.com/..."
                        className="flex-1 bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500"
                      />
                      <button
                        onClick={() => handleDownloadFromOnlineSource(manualUrlInput)}
                        disabled={isDownloadingChapters || !manualUrlInput.trim()}
                        className="px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 font-bold text-xs cursor-pointer"
                      >
                        Tải
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Option B: Supabase Cloud (Secondary) */}
              <button
                onClick={handlePullFromCloud}
                disabled={isDownloadingChapters}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-98 disabled:opacity-50 text-zinc-300 border border-zinc-700 font-medium text-xs transition-all cursor-pointer"
              >
                {isDownloadingChapters ? <Loader2 className="w-4 h-4 animate-spin" /> : <CloudDownload className="w-4 h-4 text-zinc-400" />}
                Tải từ Supabase Cloud cá nhân
              </button>

              <button
                onClick={onBackToLibrary}
                className="w-full py-2 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Quay lại Thư viện
              </button>
            </div>
          </div>
        </main>
      ) : (
        <main 
          ref={containerRef}
          onClick={() => setShowControls(!showControls)}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          className={`flex-1 max-w-3xl mx-auto w-full px-5 sm:px-8 pt-20 transition-all select-text cursor-default ${
            ttsState !== 'idle' ? 'pb-36' : 'pb-20'
          }`}
          style={{
            ...getFontFamilyStyle(settings.fontFamily),
            fontSize: `${settings.fontSize}px`,
            lineHeight: settings.lineHeight,
            letterSpacing: `${settings.letterSpacing}px`
          }}
        >
          {/* Chapter Title Heading */}
          <div className="mb-10 pb-4 border-b border-current opacity-20 text-center">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight mb-2">
              {currentChapter?.title}
            </h1>
            <p className="text-xs opacity-60">
              {story.title} • {story.author}
            </p>
          </div>

          {/* Text Sentences - Paged vs Continuous Scroll */}
          {settings.readerMode === 'paged' ? (
            <div className="flex flex-col min-h-[55vh] justify-between">
              <div className="space-y-4">
                {sentences
                  .slice(currentPageIndex * sentencesPerPage, (currentPageIndex + 1) * sentencesPerPage)
                  .map((sentence, localIdx) => {
                    const sentenceIdx = currentPageIndex * sentencesPerPage + localIdx;
                    const isActive = ttsState !== 'idle' && sentenceIdx === activeSentenceIndex;
                    return (
                      <span
                        key={sentenceIdx}
                        ref={(el) => { sentenceRefs.current[sentenceIdx] = el; }}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSentenceClick(sentenceIdx);
                        }}
                        className={`inline-block mr-1 rounded px-0.5 transition-colors cursor-pointer hover:bg-amber-500/10 ${
                          isActive ? 'tts-highlight font-medium' : ''
                        }`}
                      >
                        {sentence}{' '}
                      </span>
                    );
                  })}
              </div>

              {/* Paged Navigation Bar */}
              <div className="mt-8 pt-4 border-t border-current opacity-30 flex items-center justify-between text-xs">
                <button
                  disabled={currentPageIndex === 0}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPageIndex(p => Math.max(0, p - 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                >
                  <ChevronLeft className="w-3.5 h-3.5" /> Trang trước
                </button>

                <span className="font-mono text-xs opacity-80">
                  Trang {currentPageIndex + 1} / {totalPages}
                </span>

                <button
                  disabled={currentPageIndex >= totalPages - 1}
                  onClick={(e) => {
                    e.stopPropagation();
                    setCurrentPageIndex(p => Math.min(totalPages - 1, p + 1));
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                >
                  Trang sau <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              {sentences.map((sentence, idx) => {
                const isActive = ttsState !== 'idle' && idx === activeSentenceIndex;
                return (
                  <span
                    key={idx}
                    ref={(el) => { sentenceRefs.current[idx] = el; }}
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSentenceClick(idx);
                    }}
                    className={`inline-block mr-1 rounded px-0.5 transition-colors cursor-pointer hover:bg-amber-500/10 ${
                      isActive ? 'tts-highlight font-medium' : ''
                    }`}
                  >
                    {sentence}{' '}
                  </span>
                );
              })}
            </div>
          )}

          {/* Chapter Bottom Navigation */}
          <div className="mt-16 pt-8 border-t border-current opacity-20 flex items-center justify-between gap-4">
            <button
              disabled={currentChapterNumber <= 1}
              onClick={(e) => {
                e.stopPropagation();
                onSelectChapter(currentChapterNumber - 1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-current opacity-80 hover:opacity-100 text-zinc-950 font-medium text-xs disabled:opacity-20 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              Chương trước
            </button>

            <span className="text-xs opacity-75 font-medium">
              {currentChapterNumber} / {chapters.length}
            </span>

            <button
              disabled={currentChapterNumber >= chapters.length}
              onClick={(e) => {
                e.stopPropagation();
                onSelectChapter(currentChapterNumber + 1);
                window.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-current opacity-80 hover:opacity-100 text-zinc-950 font-medium text-xs disabled:opacity-20 cursor-pointer"
            >
              Chương sau
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </main>
      )}

      {/* Reader Settings Modal */}
      {showSettingsModal && (
        <div 
          className="fixed bottom-4 right-4 z-40 bg-zinc-900 border border-zinc-800 text-zinc-100 rounded-2xl shadow-2xl p-4 w-80 space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between pb-2 border-b border-zinc-800">
            <span className="text-xs font-semibold text-zinc-200 flex items-center gap-1.5">
              <Type className="w-4 h-4 text-amber-400" />
              Tùy chỉnh trang đọc
            </span>
            <button 
              onClick={() => setShowSettingsModal(false)}
              className="text-zinc-500 hover:text-zinc-300"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Theme Palette */}
          <div>
            <label className="text-[11px] text-zinc-400 font-medium block mb-2">Màu nền</label>
            <div className="grid grid-cols-4 gap-2">
              <button
                onClick={() => onUpdateSettings({ theme: 'sepia' })}
                className={`py-2 rounded-xl border text-xs font-medium bg-[#f4ecd8] text-[#5b4636] transition-all ${
                  settings.theme === 'sepia' ? 'ring-2 ring-amber-500 font-bold' : 'border-zinc-700'
                }`}
              >
                Vàng Sepia
              </button>
              <button
                onClick={() => onUpdateSettings({ theme: 'dark' })}
                className={`py-2 rounded-xl border text-xs font-medium bg-[#1e1e24] text-zinc-200 transition-all ${
                  settings.theme === 'dark' ? 'ring-2 ring-amber-500 font-bold' : 'border-zinc-700'
                }`}
              >
                Tối
              </button>
              <button
                onClick={() => onUpdateSettings({ theme: 'amoled' })}
                className={`py-2 rounded-xl border text-xs font-medium bg-black text-zinc-300 transition-all ${
                  settings.theme === 'amoled' ? 'ring-2 ring-amber-500 font-bold' : 'border-zinc-700'
                }`}
              >
                OLED
              </button>
              <button
                onClick={() => onUpdateSettings({ theme: 'light' })}
                className={`py-2 rounded-xl border text-xs font-medium bg-white text-zinc-900 transition-all ${
                  settings.theme === 'light' ? 'ring-2 ring-amber-500 font-bold' : 'border-zinc-700'
                }`}
              >
                Sáng
              </button>
            </div>
          </div>

          {/* Font Family */}
          <div>
            <label className="text-[11px] text-zinc-400 font-medium block mb-2">Phông chữ</label>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => onUpdateSettings({ fontFamily: 'lora' })}
                className={`py-1.5 rounded-lg border text-xs font-serif transition-all ${
                  settings.fontFamily === 'lora' ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-zinc-700 text-zinc-300'
                }`}
              >
                Lora
              </button>
              <button
                onClick={() => onUpdateSettings({ fontFamily: 'merriweather' })}
                className={`py-1.5 rounded-lg border text-xs font-serif transition-all ${
                  settings.fontFamily === 'merriweather' ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-zinc-700 text-zinc-300'
                }`}
              >
                Merriweather
              </button>
              <button
                onClick={() => onUpdateSettings({ fontFamily: 'sans' })}
                className={`py-1.5 rounded-lg border text-xs font-sans transition-all ${
                  settings.fontFamily === 'sans' ? 'border-amber-500 bg-amber-500/10 text-amber-300' : 'border-zinc-700 text-zinc-300'
                }`}
              >
                Không chân
              </button>
            </div>
          </div>

          {/* Font Size & Line Height */}
          <div className="space-y-3 pt-1">
            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Cỡ chữ</span>
                <span className="font-semibold text-zinc-200">{settings.fontSize}px</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onUpdateSettings({ fontSize: Math.max(14, settings.fontSize - 1) })}
                  className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-sm"
                >
                  -
                </button>
                <input
                  type="range"
                  min="14"
                  max="32"
                  value={settings.fontSize}
                  onChange={(e) => onUpdateSettings({ fontSize: Number(e.target.value) })}
                  className="flex-1 accent-amber-500"
                />
                <button
                  onClick={() => onUpdateSettings({ fontSize: Math.min(32, settings.fontSize + 1) })}
                  className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center font-bold text-sm"
                >
                  +
                </button>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs text-zinc-400 mb-1">
                <span>Dãn dòng</span>
                <span className="font-semibold text-zinc-200">{settings.lineHeight.toFixed(1)}</span>
              </div>
              <input
                type="range"
                min="1.4"
                max="2.4"
                step="0.1"
                value={settings.lineHeight}
                onChange={(e) => onUpdateSettings({ lineHeight: Number(e.target.value) })}
                className="w-full accent-amber-500"
              />
            </div>

            {/* Reader Mode (Cuộn liên tục vs Lật trang) */}
            <div className="pt-2 border-t border-zinc-800">
              <label className="text-[11px] text-zinc-400 font-medium block mb-2">Chế độ đọc</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => onUpdateSettings({ readerMode: 'scroll' })}
                  className={`py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    settings.readerMode === 'scroll'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300 font-bold'
                      : 'border-zinc-700 text-zinc-300'
                  }`}
                >
                  Cuộn liên tục
                </button>
                <button
                  onClick={() => onUpdateSettings({ readerMode: 'paged' })}
                  className={`py-1.5 rounded-lg border text-xs font-medium transition-all ${
                    settings.readerMode === 'paged'
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300 font-bold'
                      : 'border-zinc-700 text-zinc-300'
                  }`}
                >
                  Lật trang (Kindle)
                </button>
              </div>
            </div>

            {/* Giữ màn hình luôn sáng khi đọc */}
            <div className="pt-2 border-t border-zinc-800 flex items-center justify-between">
              <div>
                <label className="text-xs text-zinc-200 font-medium block">Giữ màn hình luôn sáng</label>
                <span className="text-[11px] text-zinc-400">Không tự tắt màn hình khi đang mở truyện đọc</span>
              </div>
              <input
                type="checkbox"
                checked={settings.keepScreenAwake !== false}
                onChange={(e) => onUpdateSettings({ keepScreenAwake: e.target.checked })}
                className="w-4 h-4 rounded-sm accent-amber-500 cursor-pointer"
              />
            </div>

            {/* Offline Audio Download */}
            <div className="pt-2 border-t border-zinc-800">
              <button
                disabled={isDownloadingAudio || sentences.length === 0}
                onClick={handleDownloadChapterAudio}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/30 transition-all cursor-pointer disabled:opacity-50"
              >
                {isDownloadingAudio ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang tải audio ({audioDownloadProgress ? `${audioDownloadProgress.done}/${audioDownloadProgress.total}` : '...'})</span>
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    <span>Tải Audio ngoại tuyến chương này</span>
                  </>
                )}
              </button>
            </div>

            {/* Export Story */}
            <div className="pt-2 border-t border-zinc-800">
              <label className="text-[11px] text-zinc-400 font-medium block mb-1.5">Xuất truyện về máy</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  disabled={isExporting}
                  onClick={handleExportEpub}
                  className="py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FileDown className="w-3.5 h-3.5 text-amber-400" />
                  <span>File .EPUB</span>
                </button>
                <button
                  disabled={isExporting}
                  onClick={handleExportTxt}
                  className="py-1.5 px-2 rounded-lg bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-xs text-zinc-200 flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <FileDown className="w-3.5 h-3.5 text-zinc-400" />
                  <span>File .TXT</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Table of Contents Drawer with High-Performance Virtual Scrolling */}
      {showTocDrawer && (
        <div 
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex justify-end"
          onClick={() => setShowTocDrawer(false)}
        >
          <div 
            className="w-full max-w-sm sm:max-w-md h-full bg-zinc-900 border-l border-zinc-800 flex flex-col p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800 mb-3">
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-5 h-5 rounded overflow-hidden bg-white p-0.5 border border-zinc-700/60 shrink-0 flex items-center justify-center">
                  <img src="/icon-192.png" alt="NKI Logo" className="w-full h-full object-contain" />
                </div>
                <h3 className="font-semibold text-sm text-zinc-100 truncate">
                  Mục lục ({chapters.length.toLocaleString('vi-VN')} chương)
                </h3>
              </div>
              <button 
                onClick={() => setShowTocDrawer(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Quick Jump Bar (Đi nhanh tới số chương) */}
            <form onSubmit={handleQuickJumpSubmit} className="flex items-center gap-2 mb-2.5">
              <input
                type="number"
                min="1"
                max={chapters.length}
                placeholder={`Đi nhanh tới số chương (1 - ${chapters.length})...`}
                value={quickJumpInput}
                onChange={(e) => setQuickJumpInput(e.target.value)}
                className="flex-1 bg-zinc-800/90 border border-zinc-700/80 rounded-xl px-3 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="flex items-center gap-1 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-xl transition-all cursor-pointer shadow-sm shadow-amber-500/20 shrink-0"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span>Đi ngay</span>
              </button>
            </form>

            {/* Search Input Filter */}
            <div className="relative mb-2.5">
              <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                placeholder="Tìm nhanh theo số chương hoặc tên..."
                value={tocSearch}
                onChange={(e) => setTocSearch(e.target.value)}
                className="w-full bg-zinc-800/60 border border-zinc-700/60 rounded-xl pl-8 pr-8 py-2 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
              />
              {tocSearch && (
                <button
                  type="button"
                  onClick={() => setTocSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Quick Navigation Presets */}
            <div className="flex items-center gap-1.5 mb-3 text-[11px] overflow-x-auto pb-1">
              <button
                type="button"
                onClick={() => jumpToChapter(1)}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0 cursor-pointer"
              >
                Đầu (Ch 1)
              </button>
              <button
                type="button"
                onClick={() => {
                  const idx = filteredChapters.findIndex(c => c.chapterNumber === currentChapterNumber);
                  if (idx >= 0 && tocContainerRef.current) {
                    tocContainerRef.current.scrollTo({
                      top: Math.max(0, idx * ITEM_HEIGHT - 160),
                      behavior: 'smooth'
                    });
                  }
                }}
                className="px-2.5 py-1 rounded-lg bg-amber-500/20 text-amber-300 border border-amber-500/30 font-medium transition-colors shrink-0 cursor-pointer"
              >
                Đang đọc (Ch {currentChapterNumber})
              </button>
              <button
                type="button"
                onClick={() => jumpToChapter(chapters.length)}
                className="px-2.5 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors shrink-0 cursor-pointer"
              >
                Cuối (Ch {chapters.length})
              </button>
              {tocSearch && (
                <span className="text-[10px] text-zinc-400 ml-auto shrink-0">
                  Khớp {filteredChapters.length} / {chapters.length}
                </span>
              )}
            </div>

            {/* Virtualized Chapter List for 60fps Scrolling */}
            <div 
              ref={tocContainerRef}
              onScroll={(e) => setTocScrollTop(e.currentTarget.scrollTop)}
              className="flex-1 overflow-y-auto pr-1 custom-scrollbar relative"
            >
              {filteredChapters.length === 0 ? (
                <div className="py-8 text-center text-xs text-zinc-500">
                  Không tìm thấy chương nào khớp với "{tocSearch}"
                </div>
              ) : (
                <div style={{ height: `${totalHeight}px`, position: 'relative' }}>
                  {visibleChapters.map((ch, localIdx) => {
                    const actualIdx = startIndex + localIdx;
                    const isCurrent = ch.chapterNumber === currentChapterNumber;
                    return (
                      <button
                        key={ch.id}
                        onClick={() => jumpToChapter(ch.chapterNumber)}
                        style={{
                          position: 'absolute',
                          top: `${actualIdx * ITEM_HEIGHT}px`,
                          left: 0,
                          right: 0,
                          height: '36px'
                        }}
                        className={`w-full text-left px-3 rounded-xl text-xs flex items-center justify-between transition-colors cursor-pointer ${
                          isCurrent
                            ? 'bg-amber-500/20 text-amber-300 font-semibold border border-amber-500/30 shadow-xs'
                            : 'text-zinc-300 hover:bg-zinc-800/80 hover:text-zinc-100'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 pr-2">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono shrink-0 ${
                            isCurrent ? 'bg-amber-500/30 text-amber-200' : 'bg-zinc-800 text-zinc-400'
                          }`}>
                            #{ch.chapterNumber}
                          </span>
                          <span className="truncate">{ch.title}</span>
                        </div>
                        {isCurrent && <Check className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Story Lore & Cultivation Notes Drawer */}
      <StoryNotesDrawer
        isOpen={showNotesDrawer}
        onClose={() => setShowNotesDrawer(false)}
        storyId={story.id}
        storyTitle={story.title}
      />

      {/* Quote Card Generator Modal */}
      {showQuoteModal && (
        <QuoteCardModal
          isOpen={showQuoteModal}
          onClose={() => setShowQuoteModal(false)}
          quoteText={selectedQuoteText}
          bookTitle={story.title}
          chapterTitle={currentChapter?.title}
          author={story.author || 'Khuyết danh'}
        />
      )}

      {/* AI Story Recap & Chapter Summary Modal */}
      {showAiSummaryModal && currentChapter && (
        <AISummaryModal
          isOpen={showAiSummaryModal}
          onClose={() => setShowAiSummaryModal(false)}
          bookTitle={story.title}
          currentChapter={currentChapter}
          previousChapters={chapters.filter(c => c.chapterNumber < currentChapterNumber)}
        />
      )}
    </div>
  );
};
