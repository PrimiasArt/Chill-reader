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
  Sparkles,
  MoreVertical,
  Copy,
  Volume2,
  Flame,
  Bot,
  Play,
  Pause,
  SkipBack,
  SkipForward
} from 'lucide-react';
import type { Story, Chapter, ReaderSettings, ReaderTheme, FontFamily, CrawlSearchResult } from '../types';
import { ttsEngine, type TTSState } from '../services/tts/ttsEngine';
import { supabaseSync } from '../services/sync/supabaseSync';
import { fetchStoryDetail, batchDownloadChapters, searchStories } from '../services/crawler';
import { db } from '../services/db';
import { readingStatsService } from '../services/stats/readingStatsService';
import { ambientAudioService } from '../services/tts/ambientAudio';
import { renderBionicWord } from '../services/reader/bionicReader';
import { StoryNotesDrawer } from './StoryNotesDrawer';
import { QuoteCardModal } from './QuoteCardModal';
import { HanVietModal } from './HanVietModal';
import { OfflineAudioModal } from './OfflineAudioModal';
import { AISummaryModal } from './AISummaryModal';
import { ReadingStatsModal } from './ReadingStatsModal';
import { StoryAiCompanionModal } from './StoryAiCompanionModal';
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
  const [showMoreToolsModal, setShowMoreToolsModal] = useState(false);
  const [showHanVietModal, setShowHanVietModal] = useState(false);
  const [hanVietQuery, setHanVietQuery] = useState('');
  const [floatingToolbarPos, setFloatingToolbarPos] = useState<{ top: number; left: number } | null>(null);
  const [selectedText, setSelectedText] = useState('');
  const [copiedToast, setCopiedToast] = useState(false);
  const [showOfflineAudioModal, setShowOfflineAudioModal] = useState(false);
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showAiCompanion, setShowAiCompanion] = useState(false);
  const [pageFlipDirection, setPageFlipDirection] = useState<'next' | 'prev'>('next');
  const [rulerY, setRulerY] = useState<number | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

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

  // Export state
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

  // Check if current chapter contains comic / manga images
  const isComicChapter = React.useMemo(() => {
    if (story.source === 'local_comic') return true;
    if (!currentChapter || !currentChapter.content) return false;
    return currentChapter.content.includes('"comicPages":');
  }, [story.source, currentChapter]);

  const comicPages = React.useMemo<string[]>(() => {
    if (!isComicChapter || !currentChapter?.content) return [];
    try {
      const data = JSON.parse(currentChapter.content);
      if (Array.isArray(data.comicPages)) {
        return data.comicPages;
      }
    } catch {}
    return [];
  }, [isComicChapter, currentChapter]);

  // Split chapter content into clean readable sentences matching ttsEngine
  const sentences = React.useMemo(() => {
    if (!currentChapter || !currentChapter.content) return [];
    if (isComicChapter && comicPages.length > 0) {
      return comicPages.map((_, i) => `Trang ${i + 1}`);
    }
    return ttsEngine.splitIntoSentences(currentChapter.content);
  }, [currentChapter, isComicChapter, comicPages]);

  // Paged mode calculations
  const sentencesPerPage = 8;
  const totalPages = isComicChapter 
    ? Math.max(1, comicPages.length) 
    : Math.max(1, Math.ceil(sentences.length / sentencesPerPage));

  // Reset page when chapter changes
  useEffect(() => {
    setCurrentPageIndex(0);
  }, [currentChapterNumber]);

  // Luxury page change with realistic page turn sound effect
  const handlePageChange = (direction: 'next' | 'prev') => {
    if (settings.pageTurnSound !== false && ttsState !== 'playing') {
      ambientAudioService.playPageTurnSound();
    }
    setPageFlipDirection(direction);
    if (direction === 'next') {
      setCurrentPageIndex(p => Math.min(totalPages - 1, p + 1));
    } else {
      setCurrentPageIndex(p => Math.max(0, p - 1));
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Luxury chapter change with realistic sound effect
  const handleChapterChange = (chapterNumber: number) => {
    if (settings.pageTurnSound !== false && ttsState !== 'playing') {
      ambientAudioService.playPageTurnSound();
    }
    onSelectChapter(chapterNumber);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Turn page automatically when TTS reads in paged mode
  useEffect(() => {
    if (settings.readerMode === 'paged' && ttsState !== 'idle' && activeSentenceIndex >= 0) {
      const pageOfActiveSentence = Math.floor(activeSentenceIndex / sentencesPerPage);
      if (pageOfActiveSentence !== currentPageIndex && pageOfActiveSentence < totalPages) {
        setPageFlipDirection(pageOfActiveSentence > currentPageIndex ? 'next' : 'prev');
        setCurrentPageIndex(pageOfActiveSentence);
      }
    }
  }, [activeSentenceIndex, settings.readerMode, ttsState, totalPages, currentPageIndex]);

  // Periodic reading activity tracker (Reading Stats & Streaks)
  useEffect(() => {
    const timer = setInterval(() => {
      if (!document.hidden || ttsState === 'playing') {
        readingStatsService.addReadingSeconds(10);
      }
    }, 10000);
    return () => clearInterval(timer);
  }, [ttsState]);

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

  // Handle click on specific sentence to listen from that sentence (guarded against swipes and selections)
  const handleSentenceClick = (index: number) => {
    if (isTouchDragging.current) return;
    if (typeof window !== 'undefined' && window.getSelection()?.toString().trim()) {
      return;
    }

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

  const handleOpenHanViet = (text?: string) => {
    let q = text || selectedText;
    if (!q && typeof window !== 'undefined') {
      q = window.getSelection()?.toString().trim() || '';
    }
    setHanVietQuery(q);
    setShowHanVietModal(true);
    setFloatingToolbarPos(null);
  };

  const handleOpenQuoteModal = (text?: string) => {
    let q = text || selectedText;
    if (!q && typeof window !== 'undefined') {
      const sel = window.getSelection()?.toString().trim();
      if (sel) q = sel;
    }
    if (!q && sentences.length > 0) {
      q = sentences[activeSentenceIndex] || sentences[0] || '';
    }
    setSelectedQuoteText(q);
    setShowQuoteModal(true);
    setFloatingToolbarPos(null);
  };

  const handleCopySelectedText = async () => {
    const text = selectedText || (typeof window !== 'undefined' ? window.getSelection()?.toString().trim() : '') || '';
    if (text) {
      try {
        await navigator.clipboard.writeText(text);
        setCopiedToast(true);
        setTimeout(() => setCopiedToast(false), 2000);
      } catch (e) {
        console.error('Failed to copy text', e);
      }
    }
    setFloatingToolbarPos(null);
  };

  const handlePlaySelectedText = () => {
    if (selectedText) {
      const idx = sentences.findIndex(s => s.toLowerCase().includes(selectedText.toLowerCase()) || selectedText.toLowerCase().includes(s.toLowerCase()));
      if (idx !== -1) {
        handleSentenceClick(idx);
      } else {
        onStartTTS();
      }
    }
    setFloatingToolbarPos(null);
  };

  // Selection change listener for floating reader actions toolbar
  useEffect(() => {
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) {
        setFloatingToolbarPos(null);
        return;
      }
      const raw = sel.toString().trim();
      if (!raw || raw.length === 0) {
        setFloatingToolbarPos(null);
        return;
      }

      setSelectedText(raw);

      try {
        if (sel.rangeCount > 0) {
          const range = sel.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          if (rect.width > 0 && rect.height > 0) {
            let top = rect.top - 48;
            if (top < 60) {
              top = rect.bottom + 10;
            }
            const left = Math.max(12, Math.min(window.innerWidth - 260, rect.left + (rect.width / 2) - 120));
            setFloatingToolbarPos({ top, left });
          }
        }
      } catch {
        // Ignore range positioning issues
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange);
    };
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      const total = document.documentElement.scrollHeight - window.innerHeight;
      if (total > 0) {
        setScrollProgress(Math.min(100, Math.max(0, (window.scrollY / total) * 100)));
      }
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
      {/* Razor-thin Scroll Progress Bar at very top */}
      <div className="fixed top-0 left-0 right-0 h-[2.5px] z-50 pointer-events-none bg-black/10">
        <div 
          className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 transition-all duration-150"
          style={{ width: `${scrollProgress}%` }}
        />
      </div>

      {/* Top Floating Control Bar */}
      <div 
        className={`fixed top-0 left-0 right-0 z-30 transition-transform duration-300 ${
          showControls ? 'translate-y-0' : '-translate-y-full'
        } pt-[env(safe-area-inset-top,0px)] glass-panel border-b border-white/5 text-zinc-100 shadow-lg`}
      >
        <div className="max-w-4xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
          {/* Back & Chapter Info */}
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={onBackToLibrary}
              className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Quay lại tủ sách"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="min-w-0 flex-1 pr-1">
              <h2 className="text-xs font-semibold truncate text-zinc-200">
                {story.title}
              </h2>
              <p className="text-[11px] text-zinc-400 truncate">
                {currentChapter?.title || `Chương ${currentChapterNumber}`}
              </p>
            </div>
          </div>

          {/* Right Action Icons */}
          <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
            {/* TTS Toggle Button */}
            <button
              disabled={chapters.length === 0 || isComicChapter}
              onClick={() => {
                if (chapters.length === 0 || isComicChapter) return;
                if (ttsState === 'idle') {
                  onStartTTS();
                } else {
                  onToggleTTS();
                }
              }}
              className={`flex items-center gap-1 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-all shrink-0 ${
                chapters.length === 0 || isComicChapter
                  ? 'opacity-40 cursor-not-allowed bg-zinc-800 text-zinc-500 border border-zinc-700'
                  : ttsState === 'playing'
                  ? 'bg-amber-500 text-zinc-950 font-bold shadow-md shadow-amber-500/30 cursor-pointer'
                  : ttsState === 'paused'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 cursor-pointer'
                  : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 cursor-pointer'
              }`}
              title={
                isComicChapter
                  ? 'Truyện tranh hình ảnh không hỗ trợ đọc audio TTS'
                  : chapters.length === 0
                  ? 'Chưa có nội dung để đọc audio'
                  : 'Nghe audio chương này'
              }
            >
              <Headphones className="w-3.5 h-3.5" />
              <span className="text-[11px] hidden xs:inline sm:inline">
                {isComicChapter
                  ? 'Truyện tranh'
                  : ttsState === 'playing'
                  ? 'Đang nghe'
                  : (ttsState === 'paused' ? 'Tạm dừng' : 'Nghe')}
              </span>
            </button>

            {/* Desktop Quick Shortcuts (Visible on md+ screens) */}
            <div className="hidden md:flex items-center gap-1">
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

              {/* AI Story Companion (Anti-Spoiler Q&A) */}
              <button
                onClick={() => setShowAiCompanion(true)}
                className="p-2 rounded-lg hover:bg-zinc-800 text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                title="Đàm đạo cùng Trợ lý AI (Hỏi đáp cốt truyện & cảnh giới không sợ Spoil)"
              >
                <Bot className="w-5 h-5" />
              </button>

              {/* Han-Viet & Web Novel Dictionary */}
              <button
                onClick={() => handleOpenHanViet()}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                title="Từ điển Hán Việt & Tu Tiên (Tra từ offline)"
              >
                <BookOpen className="w-5 h-5" />
              </button>

              {/* Quote Card Generator */}
              <button
                onClick={() => handleOpenQuoteModal()}
                className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer"
                title="Tạo thẻ trích dẫn nghệ thuật"
              >
                <Quote className="w-5 h-5" />
              </button>
            </div>

            {/* Table of contents (All devices) */}
            <button
              disabled={chapters.length === 0}
              onClick={() => setShowTocDrawer(true)}
              className={`p-2 rounded-lg text-zinc-400 transition-colors shrink-0 ${
                chapters.length === 0 ? 'opacity-40 cursor-not-allowed' : 'hover:bg-zinc-800 hover:text-zinc-100 cursor-pointer'
              }`}
              title="Mục lục chương"
            >
              <List className="w-5 h-5" />
            </button>

            {/* Settings (All devices) */}
            <button
              onClick={() => setShowSettingsModal(!showSettingsModal)}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer shrink-0"
              title="Tùy chỉnh giao diện đọc"
            >
              <Settings2 className="w-5 h-5" />
            </button>

            {/* More Menu Dropdown for Mobile */}
            <button
              onClick={() => setShowMoreToolsModal(true)}
              className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-amber-400 transition-colors cursor-pointer shrink-0 md:hidden"
              title="Tiện ích & Tính năng mở rộng"
            >
              <MoreVertical className="w-5 h-5" />
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
          onTouchMove={(e) => {
            handleTouchMove(e);
            if (settings.readingRuler && e.touches[0]) {
              setRulerY(e.touches[0].clientY);
            }
          }}
          onMouseMove={(e) => {
            if (settings.readingRuler) {
              setRulerY(e.clientY);
            }
          }}
          className={`flex-1 max-w-3xl mx-auto w-full px-5 sm:px-8 pt-20 transition-all select-text cursor-default relative ${
            settings.paperTexture ? 'paper-texture-overlay' : ''
          } ${
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

          {/* Comic Viewer OR Text Sentences - Paged vs Continuous Scroll */}
          {isComicChapter && comicPages.length > 0 ? (
            settings.readerMode === 'paged' ? (
              <div className="perspective-container flex flex-col items-center justify-between min-h-[60vh]">
                <div 
                  key={currentPageIndex} 
                  className={`w-full max-w-2xl mx-auto flex flex-col items-center select-none ${pageFlipDirection === 'next' ? 'animate-page-flip-next' : 'animate-page-flip-prev'}`}
                >
                  <img
                    src={comicPages[currentPageIndex]}
                    alt={`Trang ${currentPageIndex + 1}`}
                    className="w-full h-auto max-h-[78vh] object-contain rounded-xl shadow-2xl bg-zinc-950 border border-zinc-800"
                  />
                </div>

                {/* Paged Navigation Bar */}
                <div className="w-full max-w-2xl mt-6 pt-4 border-t border-current opacity-30 flex items-center justify-between text-xs">
                  <button
                    disabled={currentPageIndex === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePageChange('prev');
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
                      handlePageChange('next');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 cursor-pointer flex items-center gap-1"
                  >
                    Trang sau <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ) : (
              <div className="comic-scroll-view space-y-4 max-w-3xl mx-auto select-none">
                {comicPages.map((imgSrc, pIdx) => (
                  <div key={pIdx} className="relative group rounded-xl overflow-hidden shadow-2xl bg-zinc-950 border border-zinc-800">
                    <img
                      src={imgSrc}
                      alt={`Trang ${pIdx + 1}`}
                      className="w-full h-auto object-contain mx-auto block"
                      loading={pIdx < 2 ? 'eager' : 'lazy'}
                    />
                    <div className="absolute bottom-2 right-2 px-2.5 py-1 rounded-full bg-black/75 backdrop-blur-xs text-[10px] font-mono text-zinc-300 opacity-60 group-hover:opacity-100 transition-opacity">
                      {pIdx + 1} / {comicPages.length}
                    </div>
                  </div>
                ))}
              </div>
            )
          ) : settings.readerMode === 'paged' ? (
            <div className="perspective-container flex flex-col min-h-[55vh] justify-between">
              <div 
                key={currentPageIndex} 
                className={`space-y-4 ${pageFlipDirection === 'next' ? 'animate-page-flip-next' : 'animate-page-flip-prev'}`}
              >
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
                        {settings.bionicReading ? (
                          sentence.split(' ').map((word, wIdx) => {
                            const { bold, rest } = renderBionicWord(word);
                            return (
                              <React.Fragment key={wIdx}>
                                <strong className="bionic-bold">{bold}</strong>{rest}{' '}
                              </React.Fragment>
                            );
                          })
                        ) : (
                          <>{sentence} </>
                        )}
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
                    handlePageChange('prev');
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
                    handlePageChange('next');
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
                    {settings.bionicReading ? (
                      sentence.split(' ').map((word, wIdx) => {
                        const { bold, rest } = renderBionicWord(word);
                        return (
                          <React.Fragment key={wIdx}>
                            <strong className="bionic-bold">{bold}</strong>{rest}{' '}
                          </React.Fragment>
                        );
                      })
                    ) : (
                      <>{sentence} </>
                    )}
                  </span>
                );
              })}
            </div>
          )}

          {/* Reading Ruler Focus Overlay */}
          {settings.readingRuler && rulerY !== null && (
            <div 
              className="fixed inset-x-0 h-12 reading-ruler-guide z-20 pointer-events-none"
              style={{ top: `${Math.max(60, rulerY - 24)}px` }}
            />
          )}

          {/* Warm Eye-Care Amber Filter */}
          {settings.warmthLevel && settings.warmthLevel > 0 ? (
            <div
              className="fixed inset-0 pointer-events-none z-30 transition-opacity"
              style={{
                backgroundColor: `rgba(251, 146, 60, ${Math.min(0.25, (settings.warmthLevel / 100) * 0.22)})`,
                mixBlendMode: 'multiply'
              }}
            />
          ) : null}

          {/* Chapter Bottom Navigation */}
          <div className="mt-16 pt-8 border-t border-current opacity-20 flex items-center justify-between gap-4">
            <button
              disabled={currentChapterNumber <= 1}
              onClick={(e) => {
                e.stopPropagation();
                handleChapterChange(currentChapterNumber - 1);
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
                handleChapterChange(currentChapterNumber + 1);
              }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-current opacity-80 hover:opacity-100 text-zinc-950 font-medium text-xs disabled:opacity-20 cursor-pointer"
            >
              Chương sau
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </main>
      )}

      {/* Floating Ergonomic Reading Dock (Apple Books / Kindle Style) */}
      <div 
        className={`fixed bottom-4 left-3 right-3 sm:left-auto sm:right-1/2 sm:translate-x-1/2 sm:w-[480px] z-30 transition-all duration-300 ${
          showControls ? 'translate-y-0 opacity-100 pointer-events-auto' : 'translate-y-24 opacity-0 pointer-events-none'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="glass-dock rounded-2xl p-2.5 border border-white/10 shadow-2xl flex flex-col gap-2">
          {/* Chapter Scrubber / Range slider */}
          <div className="flex items-center gap-2 px-2 text-[11px] text-zinc-400 select-none">
            <span className="font-mono text-zinc-300 font-semibold shrink-0">Ch.{currentChapterNumber}</span>
            <input 
              type="range"
              min={1}
              max={Math.max(1, chapters.length)}
              value={currentChapterNumber}
              onChange={(e) => {
                const num = parseInt(e.target.value, 10);
                if (!isNaN(num) && num !== currentChapterNumber) {
                  onSelectChapter(num);
                }
              }}
              className="flex-1 h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
            />
            <span className="font-mono text-zinc-400 font-semibold shrink-0">{chapters.length} ch.</span>
          </div>

          {/* Quick Control Pills */}
          <div className="flex items-center justify-between gap-1 pt-1.5 border-t border-white/5">
            <button
              disabled={currentChapterNumber <= 1}
              onClick={() => handleChapterChange(currentChapterNumber - 1)}
              className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-25 transition-all cursor-pointer"
              title="Chương trước"
            >
              <SkipBack className="w-4 h-4" />
            </button>

            <button
              disabled={chapters.length === 0}
              onClick={() => setShowTocDrawer(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer"
              title="Mục lục chương"
            >
              <List className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Mục lục</span>
            </button>

            {/* Audio Toggle Pill */}
            {!isComicChapter && (
              <button
                onClick={() => {
                  if (ttsState === 'idle') onStartTTS();
                  else onToggleTTS();
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-md active:scale-95 cursor-pointer ${
                  ttsState === 'playing'
                    ? 'bg-amber-500 text-zinc-950 shadow-amber-500/25'
                    : 'bg-zinc-800/90 hover:bg-zinc-700 text-amber-300 border border-amber-500/20'
                }`}
              >
                {ttsState === 'playing' ? (
                  <>
                    <Pause className="w-3.5 h-3.5 fill-current" />
                    <span>Tạm dừng</span>
                  </>
                ) : (
                  <>
                    <Play className="w-3.5 h-3.5 fill-current translate-x-0.5" />
                    <span>Nghe audio</span>
                  </>
                )}
              </button>
            )}

            <button
              onClick={() => setShowAiCompanion(true)}
              className="p-2 rounded-xl hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 transition-all cursor-pointer"
              title="Trợ lý AI đồng hành (Chống spoil)"
            >
              <Bot className="w-4 h-4" />
            </button>

            <button
              onClick={() => setShowSettingsModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl hover:bg-white/10 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer"
              title="Cài đặt cỡ chữ, font, màu nền"
            >
              <Type className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">Giao diện</span>
            </button>

            <button
              disabled={currentChapterNumber >= chapters.length}
              onClick={() => handleChapterChange(currentChapterNumber + 1)}
              className="p-2 rounded-xl text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-25 transition-all cursor-pointer"
              title="Chương sau"
            >
              <SkipForward className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

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

            {/* Tiện ích Đọc Cao Cấp */}
            <div className="pt-3 border-t border-zinc-800 space-y-2.5">
              <label className="text-[11px] font-bold text-amber-400 uppercase tracking-wider block">
                ✨ Trải Nghiệm Cao Cấp
              </label>

              {/* Bionic Reading Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-200 font-medium block">Đọc nhanh Bionic</span>
                  <span className="text-[10px] text-zinc-400">Tô đậm đầu từ giúp não lướt siêu tốc</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.bionicReading || false}
                  onChange={(e) => onUpdateSettings({ bionicReading: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Reading Ruler Toggle */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-200 font-medium block">Thước kẻ tập trung</span>
                  <span className="text-[10px] text-zinc-400">Dải dẫn hướng mắt không nhảy dòng</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.readingRuler || false}
                  onChange={(e) => onUpdateSettings({ readingRuler: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Page Turn Sound */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-200 font-medium block">Âm thanh lật trang</span>
                  <span className="text-[10px] text-zinc-400">Tiếng sột soạt giấy thật khi chuyển trang</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.pageTurnSound !== false}
                  onChange={(e) => onUpdateSettings({ pageTurnSound: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Paper Texture */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs text-zinc-200 font-medium block">Vân giấy thủ công</span>
                  <span className="text-[10px] text-zinc-400">Hiệu ứng xơ sợi tự nhiên, chống lóa mắt</span>
                </div>
                <input
                  type="checkbox"
                  checked={settings.paperTexture || false}
                  onChange={(e) => onUpdateSettings({ paperTexture: e.target.checked })}
                  className="w-4 h-4 rounded-sm accent-amber-500 cursor-pointer"
                />
              </div>

              {/* Eye-Care Warmth Slider */}
              <div>
                <div className="flex justify-between text-xs text-zinc-400 mb-1">
                  <span>Ánh nến ấm (Lọc ánh sáng xanh)</span>
                  <span className="font-semibold text-amber-400">{settings.warmthLevel || 0}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="100"
                  value={settings.warmthLevel || 0}
                  onChange={(e) => onUpdateSettings({ warmthLevel: Number(e.target.value) })}
                  className="w-full accent-amber-500"
                />
              </div>
            </div>

            {/* Offline Audio Download */}
            <div className="pt-2 border-t border-zinc-800">
              <button
                onClick={() => setShowOfflineAudioModal(true)}
                className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-medium hover:bg-amber-500/30 transition-all cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải Audio ngoại tuyến (AI Neural)</span>
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

      {/* Sino-Vietnamese & Web Novel Dictionary Modal */}
      {showHanVietModal && (
        <HanVietModal
          isOpen={showHanVietModal}
          onClose={() => setShowHanVietModal(false)}
          initialQuery={hanVietQuery}
        />
      )}

      {/* Floating Selection Toolbar */}
      {floatingToolbarPos && selectedText && (
        <div
          style={{
            top: `${floatingToolbarPos.top}px`,
            left: `${floatingToolbarPos.left}px`,
            position: 'fixed',
            zIndex: 60
          }}
          className="flex items-center gap-1 p-1 bg-zinc-900/95 border border-zinc-700/80 shadow-2xl rounded-xl backdrop-blur-md animate-fade-in text-zinc-200 select-none"
          onMouseDown={(e) => e.preventDefault()}
        >
          <button
            onClick={() => handleOpenHanViet(selectedText)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-amber-500/20 text-xs font-medium text-amber-300 hover:text-amber-200 transition-colors cursor-pointer"
            title="Tra cứu từ điển Hán Việt & Tu Tiên"
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Tra từ</span>
          </button>

          <div className="w-[1px] h-4 bg-zinc-700/80" />

          <button
            onClick={() => handleOpenQuoteModal(selectedText)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-emerald-500/20 text-xs font-medium text-emerald-300 hover:text-emerald-200 transition-colors cursor-pointer"
            title="Tạo ảnh trích dẫn nghệ thuật"
          >
            <Quote className="w-3.5 h-3.5" />
            <span>Trích dẫn</span>
          </button>

          <div className="w-[1px] h-4 bg-zinc-700/80" />

          <button
            onClick={handlePlaySelectedText}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-indigo-500/20 text-xs font-medium text-indigo-300 hover:text-indigo-200 transition-colors cursor-pointer"
            title="Đọc từ câu này bằng giọng AI"
          >
            <Volume2 className="w-3.5 h-3.5" />
            <span>Đọc</span>
          </button>

          <div className="w-[1px] h-4 bg-zinc-700/80" />

          <button
            onClick={handleCopySelectedText}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-zinc-800 text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
            title="Sao chép đoạn đã chọn"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>Chép</span>
          </button>
        </div>
      )}

      {/* Copied Toast */}
      {copiedToast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-zinc-900 border border-zinc-700 text-xs text-amber-300 rounded-full shadow-lg flex items-center gap-2 animate-fade-in pointer-events-none">
          <Check className="w-3.5 h-3.5 text-emerald-400" />
          <span>Đã sao chép vào bộ nhớ tạm!</span>
        </div>
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

      {/* Offline Audio Downloader Modal */}
      {showOfflineAudioModal && (
        <OfflineAudioModal
          isOpen={showOfflineAudioModal}
          onClose={() => setShowOfflineAudioModal(false)}
          story={story}
          currentChapterNumber={currentChapterNumber}
          chapters={chapters}
          onPlayChapter={(chNum) => onSelectChapter(chNum)}
        />
      )}

      {/* Reading Stats & Streak Modal */}
      {showStatsModal && (
        <ReadingStatsModal
          isOpen={showStatsModal}
          onClose={() => setShowStatsModal(false)}
        />
      )}

      {/* Interactive AI Story Companion Modal (Anti-Spoiler) */}
      <StoryAiCompanionModal
        isOpen={showAiCompanion}
        onClose={() => setShowAiCompanion(false)}
        story={story}
        currentChapter={currentChapter}
        recentChapters={chapters}
      />

      {/* Mobile Tools Drawer / Bottom Sheet */}
      {showMoreToolsModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => setShowMoreToolsModal(false)}
        >
          <div 
            className="w-full max-w-sm bg-zinc-900 border border-zinc-800 rounded-t-3xl sm:rounded-2xl p-5 space-y-2 text-zinc-100 shadow-2xl animate-in slide-in-from-bottom-4 duration-200 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400">Tiện ích chương truyện</h3>
              <button 
                onClick={() => setShowMoreToolsModal(false)}
                className="p-1 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-1 pt-1">
              {/* AI Novel Companion */}
              <button
                onClick={() => {
                  setShowMoreToolsModal(false);
                  setShowAiCompanion(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Bot className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-100 flex items-center gap-1.5">
                    Đàm đạo cùng Trợ lý AI
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">Anti-Spoiler</span>
                  </h4>
                  <p className="text-[11px] text-zinc-400">Hỏi đáp tình tiết, cảnh giới không sợ lộ nội dung sau</p>
                </div>
              </button>

              {/* AI Recap */}
              <button
                onClick={() => {
                  setShowMoreToolsModal(false);
                  setShowAiSummaryModal(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <Sparkles className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-100">Trợ lý AI Gemini</h4>
                  <p className="text-[11px] text-zinc-400">Tóm tắt chương & nhắc lại diễn biến cốt truyện</p>
                </div>
              </button>

              {/* Character Lore */}
              <button
                onClick={() => {
                  setShowMoreToolsModal(false);
                  setShowNotesDrawer(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                  <BookMarked className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-100">Sổ tay nhân vật & Cảnh giới</h4>
                  <p className="text-[11px] text-zinc-400">Ghi chép công pháp, nhân vật tu tiên</p>
                </div>
              </button>

              {/* Quote Card */}
              <button
                onClick={() => {
                  setShowMoreToolsModal(false);
                  handleOpenQuoteModal();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                  <Quote className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-100">Thẻ trích dẫn nghệ thuật</h4>
                  <p className="text-[11px] text-zinc-400">Tạo ảnh trích dẫn câu văn hay để chia sẻ</p>
                </div>
              </button>

              {/* Han-Viet Dictionary */}
              <button
                onClick={() => {
                  setShowMoreToolsModal(false);
                  handleOpenHanViet();
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
                  <BookOpen className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-100">Từ điển Hán Việt & Tu Tiên</h4>
                  <p className="text-[11px] text-zinc-400">Tra cứu cảnh giới, thuật ngữ tiên hiệp & chiết tự Hán Việt</p>
                </div>
              </button>

              {/* Reading Stats & Streak */}
              <button
                onClick={() => {
                  setShowMoreToolsModal(false);
                  setShowStatsModal(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/80 transition-colors text-left cursor-pointer"
              >
                <div className="w-9 h-9 rounded-xl bg-orange-500/10 border border-orange-500/20 flex items-center justify-center text-orange-400 shrink-0">
                  <Flame className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-100">Thống kê thói quen đọc</h4>
                  <p className="text-[11px] text-zinc-400">Theo dõi chuỗi ngày đọc (Streak) và thời gian đọc</p>
                </div>
              </button>

              {/* Check new chapters */}
              {story.sourceUrl && (
                <button
                  disabled={isCheckingNewChapters}
                  onClick={() => {
                    setShowMoreToolsModal(false);
                    handleCheckNewChapters();
                  }}
                  className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/80 transition-colors text-left cursor-pointer disabled:opacity-40"
                >
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
                    <RefreshCw className={`w-4.5 h-4.5 ${isCheckingNewChapters ? 'animate-spin' : ''}`} />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-100">Kiểm tra chương mới</h4>
                    <p className="text-[11px] text-zinc-400">Quét nguồn online tải các chương mới phát hành</p>
                  </div>
                </button>
              )}

              {/* Download chapter audio */}
              <button
                disabled={sentences.length === 0}
                onClick={() => {
                  setShowMoreToolsModal(false);
                  setShowOfflineAudioModal(true);
                }}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-zinc-800/80 transition-colors text-left cursor-pointer disabled:opacity-40"
              >
                <div className="w-9 h-9 rounded-xl bg-yellow-500/10 border border-yellow-500/20 flex items-center justify-center text-yellow-400 shrink-0">
                  <Download className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-zinc-100">Tải Audio ngoại tuyến</h4>
                  <p className="text-[11px] text-zinc-400">Tải sẵn giọng đọc cả chương để nghe không cần mạng</p>
                </div>
              </button>

              {/* Export EPUB / TXT */}
              <div className="pt-2 border-t border-zinc-800 grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setShowMoreToolsModal(false);
                    handleExportEpub();
                  }}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                >
                  <FileDown className="w-4 h-4 text-amber-400" />
                  Xuất EPUB
                </button>
                <button
                  onClick={() => {
                    setShowMoreToolsModal(false);
                    handleExportTxt();
                  }}
                  className="flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-300 transition-colors cursor-pointer"
                >
                  <FileDown className="w-4 h-4 text-amber-400" />
                  Xuất TXT
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
