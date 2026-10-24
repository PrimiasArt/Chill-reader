import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { LibraryView } from './components/LibraryView';
import { TTSPlayerBar } from './components/TTSPlayerBar';

// Code-split heavy views to drastically reduce initial bundle size (< 150KB)
const ReaderView = lazy(() => import('./components/ReaderView').then(m => ({ default: m.ReaderView })));
const CrawlView = lazy(() => import('./components/CrawlView').then(m => ({ default: m.CrawlView })));
const SettingsView = lazy(() => import('./components/SettingsView').then(m => ({ default: m.SettingsView })));
const ImportModal = lazy(() => import('./components/ImportModal').then(m => ({ default: m.ImportModal })));
const UpdateModal = lazy(() => import('./components/UpdateModal').then(m => ({ default: m.UpdateModal })));
import { db, DEFAULT_READER_SETTINGS, DEFAULT_TTS_SETTINGS } from './services/db';
import { ttsEngine, type TTSState } from './services/tts/ttsEngine';
import { supabaseSync } from './services/sync/supabaseSync';
import { appUpdater } from './services/appUpdater';
import { INITIAL_SAMPLE_STORY } from './services/sampleData';
import type { Story, Chapter, ReaderSettings, TTSSettings } from './types';

export const App: React.FC = () => {
  // Navigation & View States
  const [currentTab, setCurrentTab] = useState<'library' | 'crawler' | 'settings'>('library');
  const [activeStory, setActiveStory] = useState<Story | null>(null);
  const [playingStory, setPlayingStory] = useState<{ title: string; author: string; coverUrl?: string } | null>(null);
  const [activeStoryChapters, setActiveStoryChapters] = useState<Chapter[]>([]);
  const [currentChapterNumber, setCurrentChapterNumber] = useState<number>(1);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [isFullTTSModalOpen, setIsFullTTSModalOpen] = useState(false);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateNotification, setUpdateNotification] = useState<string | null>(null);

  // Data
  const [stories, setStories] = useState<Story[]>([]);
  const [readerSettings, setReaderSettings] = useState<ReaderSettings>(DEFAULT_READER_SETTINGS);
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(DEFAULT_TTS_SETTINGS);

  // TTS State
  const [ttsState, setTtsState] = useState<TTSState>('idle');
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number>(0);
  const [currentSentenceText, setCurrentSentenceText] = useState<string>('');
  const [countdownSeconds, setCountdownSeconds] = useState<number | null>(null);

  // Load Library & Settings from Dexie IndexedDB
  const loadLibrary = useCallback(async () => {
    try {
      const storedStories = await db.stories.orderBy('lastReadAt').reverse().toArray();
      if (storedStories.length === 0) {
        // Seed initial sample story
        await db.stories.add(INITIAL_SAMPLE_STORY.story);
        await db.chapters.bulkAdd(INITIAL_SAMPLE_STORY.chapters);
        setStories([INITIAL_SAMPLE_STORY.story]);
      } else {
        setStories(storedStories);
      }

      // Load Settings
      const savedReaderSettings = await db.getSetting<ReaderSettings>('readerSettings', DEFAULT_READER_SETTINGS);
      let savedTtsSettings = await db.getSetting<TTSSettings>('ttsSettings', DEFAULT_TTS_SETTINGS);
      if (savedTtsSettings) {
        let changed = false;
        if (!savedTtsSettings.voiceURI || savedTtsSettings.voiceURI.startsWith('edge:') || savedTtsSettings.voiceURI.startsWith('google:')) {
          savedTtsSettings.voiceURI = 'native:android';
          savedTtsSettings.engine = 'native';
          changed = true;
        }
        if (savedTtsSettings.autoNextChapter === undefined) {
          savedTtsSettings.autoNextChapter = true;
          changed = true;
        }
        if (changed) {
          await db.saveSetting('ttsSettings', savedTtsSettings);
        }
      }
      setReaderSettings(savedReaderSettings);
      setTtsSettings(savedTtsSettings);
      ttsEngine.updateSettings(savedTtsSettings);
      await supabaseSync.init();
    } catch (err) {
      console.error('Failed to load library:', err);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
    // Run smart LRU audio cache purge silently in background
    db.purgeOldAudioCache().catch(() => {});

    // Listen to background sync events to silently update UI
    const unsubSync = supabaseSync.addListener((isSyncing, lastSyncTime) => {
      if (!isSyncing && lastSyncTime) {
        db.stories.orderBy('lastReadAt').reverse().toArray().then(items => {
          if (items && items.length > 0) {
            setStories(items);
          }
        });
      }
    });

    return () => {
      unsubSync();
    };
  }, [loadLibrary]);

  // Check for App updates in background
  useEffect(() => {
    const timer = setTimeout(() => {
      appUpdater.checkForUpdates(false).then((res) => {
        if (res.hasUpdate && res.latestVersion) {
          setUpdateNotification(res.latestVersion.versionName);
        }
      }).catch(() => {});
    }, 2500);

    return () => clearTimeout(timer);
  }, []);

  // Android Hardware / Gesture Back Button Handler
  useEffect(() => {
    (window as any).handleAndroidBack = (): boolean => {
      // 1. If Update Modal is open, close it
      if (isUpdateModalOpen) {
        setIsUpdateModalOpen(false);
        return true;
      }

      // 2. If Import Modal is open, close it
      if (isImportModalOpen) {
        setIsImportModalOpen(false);
        return true;
      }

      // 3. If Fullscreen Audio Player Modal is open, close it (audio continues in mini player)
      if (isFullTTSModalOpen) {
        setIsFullTTSModalOpen(false);
        return true;
      }

      // 4. If reading a story, return to Library
      if (activeStory) {
        setActiveStory(null);
        return true;
      }

      // 5. If in Settings or Crawler, return to Library
      if (currentTab !== 'library') {
        setCurrentTab('library');
        return true;
      }

      // 6. At root of app -> let Android show exit prompt
      return false;
    };

    return () => {
      delete (window as any).handleAndroidBack;
    };
  }, [
    isUpdateModalOpen,
    isImportModalOpen,
    isFullTTSModalOpen,
    activeStory,
    currentTab
  ]);

  // Hook up TTS Engine Listeners
  useEffect(() => {
    const unsubscribe = ttsEngine.addListener({
      onStateChange: (state) => setTtsState(state),
      onSentenceChange: (idx, text) => {
        setActiveSentenceIndex(idx);
        setCurrentSentenceText(text);
      },
      onTimeRemainingUpdate: (seconds) => setCountdownSeconds(seconds),
      onChapterChange: (chapterNum) => {
        const num = Number(chapterNum);
        if (num > 0) {
          setCurrentChapterNumber(num);
          setActiveStory(prev => prev ? { ...prev, currentChapterNumber: num } : null);
        }
      },
      onChapterComplete: async () => {
        if (ttsSettings.autoNextChapter !== false) {
          await ttsEngine.advanceToNextChapter();
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [ttsSettings.autoNextChapter, activeStory, activeStoryChapters, currentChapterNumber]);

  // Handle open a story in reader or directly in audio mode
  const handleOpenStory = async (story: Story, mode: 'read' | 'listen') => {
    try {
      const chapters = await db.getStoryChapters(story.id);
      setActiveStory(story);
      setActiveStoryChapters(chapters);
      const startChapterNumber = story.currentChapterNumber || 1;
      setCurrentChapterNumber(startChapterNumber);

      // Update last read time
      await db.stories.update(story.id, { lastReadAt: Date.now() });

      if (mode === 'listen') {
        setPlayingStory({ title: story.title, author: story.author, coverUrl: story.coverUrl });
        let chapter = chapters.find(c => c.chapterNumber === startChapterNumber) || chapters[0];
        if (chapter && (!chapter.content || chapter.content.trim().length === 0)) {
          const full = await db.getChapter(story.id, chapter.chapterNumber);
          if (full && full.content) chapter = full;
        }
        if (chapter) {
          ttsEngine.loadChapter(
            chapter.content || '',
            {
              title: story.title,
              author: story.author,
              chapterTitle: chapter.title,
              coverUrl: story.coverUrl,
              storyId: story.id,
              chapterNumber: chapter.chapterNumber
            },
            story.currentSentenceIndex || 0
          );
          ttsEngine.play();
          setIsFullTTSModalOpen(true);
        }
      }
    } catch (err) {
      console.error('Failed to open story:', err);
    }
  };

  // Change chapter in reader
  const handleSelectChapter = async (chapterNumber: number, autoStartListen: boolean = false) => {
    const chNum = Number(chapterNumber);
    setCurrentChapterNumber(chNum);
    if (!activeStory) return;

    // Calculate progress
    const progressPercent = activeStoryChapters.length > 0
      ? Math.round((chNum / activeStoryChapters.length) * 100)
      : 0;

    await db.stories.update(activeStory.id, {
      currentChapterNumber: chNum,
      currentProgressPercent: progressPercent,
      lastReadAt: Date.now()
    });

    const updatedStory: Story = {
      ...activeStory,
      currentChapterNumber: chNum,
      currentProgressPercent: progressPercent,
      lastReadAt: Date.now()
    };

    setStories(prev => prev.map(s => s.id === activeStory.id ? updatedStory : s));
    supabaseSync.pushStoryProgress(updatedStory);

    let chapter = activeStoryChapters.find(c => Number(c.chapterNumber) === chNum);
    if (!chapter || !chapter.content || chapter.content.trim().length === 0) {
      const full = await db.getChapter(activeStory.id, chNum);
      if (full && full.content) {
        chapter = full;
      }
    }
    if (chapter && (autoStartListen || ttsState === 'playing')) {
      ttsEngine.loadChapter(
        chapter.content || '',
        {
          title: activeStory.title,
          author: activeStory.author,
          chapterTitle: chapter.title,
          coverUrl: activeStory.coverUrl,
          storyId: activeStory.id,
          chapterNumber: Number(chapter.chapterNumber)
        },
        0,
        true
      );
      ttsEngine.play();
    }
  };

  // Start TTS for current chapter
  const handleStartTTS = async () => {
    if (!activeStory) return;
    setPlayingStory({ title: activeStory.title, author: activeStory.author, coverUrl: activeStory.coverUrl });
    let chapter = activeStoryChapters.find(c => c.chapterNumber === currentChapterNumber) || activeStoryChapters[0];
    if (chapter && (!chapter.content || chapter.content.trim().length === 0)) {
      const full = await db.getChapter(activeStory.id, chapter.chapterNumber);
      if (full && full.content) {
        chapter = full;
      }
    }
    if (chapter) {
      ttsEngine.loadChapter(
        chapter.content || '',
        {
          title: activeStory.title,
          author: activeStory.author,
          chapterTitle: chapter.title,
          coverUrl: activeStory.coverUrl,
          storyId: activeStory.id,
          chapterNumber: chapter.chapterNumber
        },
        activeSentenceIndex || 0
      );
      ttsEngine.play();
    }
  };

  const handleToggleFavorite = async (storyId: string) => {
    const story = stories.find(s => s.id === storyId);
    if (!story) return;
    const isFav = !story.isFavorite;
    await db.stories.update(storyId, { isFavorite: isFav });
    setStories(prev => prev.map(s => s.id === storyId ? { ...s, isFavorite: isFav } : s));
  };

  const handleDeleteStory = async (storyId: string) => {
    if (activeStory?.id === storyId) {
      ttsEngine.stop();
      setActiveStory(null);
    }
    await db.deleteStoryWithChapters(storyId);
    setStories(prev => prev.filter(s => s.id !== storyId));
    await supabaseSync.deleteStory(storyId);
  };

  const handleImportComplete = async (story: Story, chapters: Chapter[]) => {
    let finalStory: Story = story;
    await db.transaction('rw', db.stories, db.chapters, async () => {
      const existing = await db.stories.get(story.id);
      if (existing) {
        const existingChapters = await db.getStoryChapters(story.id);
        const allDistinctNumbers = new Set([
          ...existingChapters.map(c => c.chapterNumber),
          ...chapters.map(c => c.chapterNumber)
        ]);

        finalStory = {
          ...existing,
          title: story.title || existing.title,
          coverUrl: story.coverUrl || existing.coverUrl,
          totalChapters: allDistinctNumbers.size,
          sourceUrl: story.sourceUrl || existing.sourceUrl,
          // Preserve user reading progress so reading position is kept!
          currentChapterNumber: existing.currentChapterNumber || 1,
          currentProgressPercent: existing.currentProgressPercent || 0,
          currentSentenceIndex: existing.currentSentenceIndex || 0,
          lastReadAt: Date.now()
        };
        await db.stories.put(finalStory);
      } else {
        await db.stories.put(story);
      }
      await db.chapters.bulkPut(chapters);
    });

    setStories(prev => {
      const idx = prev.findIndex(s => s.id === finalStory.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = finalStory;
        return next;
      }
      return [finalStory, ...prev];
    });

    await supabaseSync.unmarkDeletedStory(finalStory.id);
    supabaseSync.pushStoryProgress(finalStory);
    supabaseSync.pushStoryChapters(finalStory.id, chapters);
    // Immediately open the newly imported or updated story
    handleOpenStory(finalStory, 'read');
  };

  const handleReloadActiveStoryChapters = async () => {
    if (!activeStory) return;
    const [chs, refreshedStory] = await Promise.all([
      db.getStoryChapters(activeStory.id),
      db.stories.get(activeStory.id)
    ]);
    if (refreshedStory) {
      setActiveStory(refreshedStory);
      setStories(prev => prev.map(s => s.id === refreshedStory.id ? refreshedStory : s));
    }
    setActiveStoryChapters(chs);
    if (chs.length > 0) {
      const targetChapter = chs.find(c => c.chapterNumber === currentChapterNumber) || chs[0];
      setCurrentChapterNumber(targetChapter.chapterNumber);
    }
  };

  const handleUpdateReaderSettings = async (newSettings: Partial<ReaderSettings>) => {
    const updated = { ...readerSettings, ...newSettings };
    setReaderSettings(updated);
    await db.saveSetting('readerSettings', updated);
  };

  const handleUpdateTtsSettings = async (newSettings: Partial<TTSSettings>) => {
    const updated = { ...ttsSettings, ...newSettings };
    setTtsSettings(updated);
    ttsEngine.updateSettings(updated);
    await db.saveSetting('ttsSettings', updated);
  };

  const currentChapter = activeStoryChapters.find(c => c.chapterNumber === currentChapterNumber) || activeStoryChapters[0];

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans selection:bg-amber-500/30 selection:text-amber-200">
      {/* If reading a story, show ReaderView, otherwise show Main App with Header */}
      {activeStory ? (
        <Suspense fallback={
          <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center gap-3 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin text-emerald-500" />
            <span className="text-sm font-medium">Đang mở trình đọc sách...</span>
          </div>
        }>
          <ReaderView
            story={activeStory}
            chapters={activeStoryChapters}
            currentChapterNumber={currentChapterNumber}
            onSelectChapter={handleSelectChapter}
            onBackToLibrary={() => {
              setActiveStory(null);
              loadLibrary();
            }}
            onReloadChapters={handleReloadActiveStoryChapters}
            settings={readerSettings}
            onUpdateSettings={handleUpdateReaderSettings}
            ttsState={ttsState}
            onStartTTS={handleStartTTS}
            onToggleTTS={() => ttsEngine.togglePlayPause()}
            activeSentenceIndex={activeSentenceIndex}
          />
        </Suspense>
      ) : (
        <>
          <Header
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            onOpenImport={() => setIsImportModalOpen(true)}
            ttsState={ttsState}
            onOpenTTSPlayer={() => setIsFullTTSModalOpen(true)}
            activeStoryTitle={playingStory?.title}
          />

          <main className="flex-1 pb-32 md:pb-24">
            {currentTab === 'library' && (
              <LibraryView
                stories={stories}
                onOpenStory={handleOpenStory}
                onToggleFavorite={handleToggleFavorite}
                onDeleteStory={handleDeleteStory}
                onOpenImport={() => setIsImportModalOpen(true)}
                onOpenCrawler={() => setCurrentTab('crawler')}
                onOpenSettings={() => setCurrentTab('settings')}
                onReloadStories={loadLibrary}
              />
            )}

            {currentTab === 'crawler' && (
              <Suspense fallback={
                <div className="p-16 flex flex-col items-center justify-center gap-3 text-zinc-400">
                  <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
                  <span className="text-sm">Đang tải kho truyện trực tuyến...</span>
                </div>
              }>
                <CrawlView
                  onStoryCrawled={handleImportComplete}
                />
              </Suspense>
            )}

            {currentTab === 'settings' && (
              <Suspense fallback={
                <div className="p-16 flex flex-col items-center justify-center gap-3 text-zinc-400">
                  <Loader2 className="w-8 h-8 animate-spin text-zinc-400" />
                  <span className="text-sm">Đang nạp cài đặt...</span>
                </div>
              }>
                <SettingsView
                  readerSettings={readerSettings}
                  onUpdateReaderSettings={handleUpdateReaderSettings}
                  ttsSettings={ttsSettings}
                  onUpdateTtsSettings={handleUpdateTtsSettings}
                  onLibraryReload={loadLibrary}
                />
              </Suspense>
            )}
          </main>

          {/* Mobile Bottom Navigation Bar (Guarantees Settings is always 1 tap away) */}
          <BottomNav
            currentTab={currentTab}
            onSelectTab={setCurrentTab}
            onOpenImport={() => setIsImportModalOpen(true)}
          />
        </>
      )}

      {/* Floating Bottom TTS Player & Fullscreen Audio Modal */}
      <TTSPlayerBar
        ttsState={ttsState}
        bookTitle={playingStory?.title || activeStory?.title || 'Chill Reader'}
        author={playingStory?.author || activeStory?.author || 'Tác giả'}
        chapterTitle={currentChapter?.title || 'Chương truyện'}
        coverUrl={playingStory?.coverUrl || activeStory?.coverUrl}
        currentSentenceText={currentSentenceText}
        sentenceIndex={activeSentenceIndex}
        totalSentences={ttsEngine.getTotalSentences()}
        countdownSeconds={countdownSeconds}
        settings={ttsSettings}
        onUpdateSettings={handleUpdateTtsSettings}
        onClosePlayer={() => ttsEngine.stop()}
        isOpenFullModal={isFullTTSModalOpen}
        onSetOpenFullModal={setIsFullTTSModalOpen}
        isInsideReader={!!activeStory}
        storyId={activeStory?.id}
        chapterNumber={currentChapterNumber}
        onPreviousChapter={async () => {
          if (activeStory && activeStoryChapters.length > 0) {
            if (currentChapterNumber > 1) {
              await handleSelectChapter(currentChapterNumber - 1, true);
            }
          } else {
            await ttsEngine.advanceToPreviousChapter();
          }
        }}
        onNextChapter={async () => {
          if (activeStory && activeStoryChapters.length > 0) {
            if (currentChapterNumber < activeStoryChapters.length) {
              await handleSelectChapter(currentChapterNumber + 1, true);
            }
          } else {
            await ttsEngine.advanceToNextChapter();
          }
        }}
        hasPreviousChapter={activeStory ? currentChapterNumber > 1 : (ttsEngine.getCurrentChapterNumber() > 1)}
        hasNextChapter={activeStory && activeStoryChapters.length > 0 ? currentChapterNumber < activeStoryChapters.length : true}
      />

      {/* File Import Modal (.txt, .epub, .pdf) */}
      {isImportModalOpen && (
        <Suspense fallback={null}>
          <ImportModal
            isOpen={isImportModalOpen}
            onClose={() => setIsImportModalOpen(false)}
            onImportComplete={handleImportComplete}
          />
        </Suspense>
      )}

      {/* Floating Update Notification Pill */}
      {updateNotification && (
        <div 
          onClick={() => {
            setIsUpdateModalOpen(true);
            setUpdateNotification(null);
          }}
          className="fixed top-3 left-4 right-4 sm:left-auto sm:right-6 sm:w-auto z-50 bg-gradient-to-r from-amber-500 to-amber-400 text-zinc-950 px-4 py-2.5 rounded-2xl font-bold text-xs shadow-2xl shadow-amber-500/25 flex items-center justify-between gap-3 cursor-pointer hover:brightness-105 active:scale-98 transition-all animate-in slide-in-from-top-4 border border-amber-300/40"
        >
          <div className="flex items-center gap-2 truncate">
            <Sparkles className="w-4 h-4 shrink-0 fill-current text-zinc-950" />
            <span className="truncate">Đã có bản cập nhật mới {updateNotification}!</span>
          </div>
          <span className="px-2.5 py-1 bg-zinc-950 text-amber-400 rounded-xl text-[10px] uppercase font-bold shrink-0 shadow-sm">
            Nâng cấp
          </span>
        </div>
      )}

      {/* In-App Auto Update Modal */}
      {isUpdateModalOpen && (
        <Suspense fallback={null}>
          <UpdateModal
            isOpen={isUpdateModalOpen}
            onClose={() => setIsUpdateModalOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};

export default App;
