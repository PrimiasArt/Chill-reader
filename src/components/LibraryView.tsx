import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  BookOpen, 
  Headphones, 
  Heart, 
  Trash2, 
  Search, 
  FolderPlus, 
  Compass, 
  Clock, 
  Layers,
  Sparkles, 
  Cloud, 
  Flame,
  LayoutGrid,
  Library,
  HardDrive,
  Download,
  Upload,
  CheckCircle2,
  X,
  Loader2,
  Bookmark,
  ArrowUpDown
} from 'lucide-react';
import { supabaseSync } from '../services/sync/supabaseSync';
import { readingStatsService } from '../services/stats/readingStatsService';
import { vaultService } from '../services/backup/vaultService';
import { ReadingStatsModal } from './ReadingStatsModal';
import type { Story } from '../types';

interface LibraryViewProps {
  stories: Story[];
  onOpenStory: (story: Story, mode: 'read' | 'listen') => void;
  onToggleFavorite: (storyId: string) => void;
  onDeleteStory: (storyId: string) => void;
  onOpenImport: () => void;
  onOpenCrawler: () => void;
  onOpenSettings?: () => void;
  onReloadStories?: () => void;
}

type FilterCategory = 'all' | 'reading' | 'favorites' | 'comics' | 'finished';
type SortOption = 'recent' | 'title' | 'progress' | 'chapters';

export const LibraryView: React.FC<LibraryViewProps> = ({
  stories,
  onOpenStory,
  onToggleFavorite,
  onDeleteStory,
  onOpenImport,
  onOpenCrawler,
  onOpenSettings,
  onReloadStories
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTab, setFilterTab] = useState<FilterCategory>('all');
  const [sortOption, setSortOption] = useState<SortOption>('recent');
  const [viewMode, setViewMode] = useState<'grid' | 'bookshelf'>('grid');
  const [showStatsModal, setShowStatsModal] = useState(false);
  const [showVaultModal, setShowVaultModal] = useState(false);
  const [streakDays, setStreakDays] = useState(1);

  // Vault state
  const [isExportingVault, setIsExportingVault] = useState(false);
  const [isImportingVault, setIsImportingVault] = useState(false);
  const [vaultMsg, setVaultMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const vaultFileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Load saved view mode
    const saved = localStorage.getItem('chill_reader_view_mode');
    if (saved === 'bookshelf' || saved === 'grid') {
      setViewMode(saved);
    }

    readingStatsService.getStats().then(s => setStreakDays(s.currentStreakDays));
    const unsub = readingStatsService.subscribe(s => setStreakDays(s.currentStreakDays));
    return unsub;
  }, []);

  const handleToggleViewMode = (mode: 'grid' | 'bookshelf') => {
    setViewMode(mode);
    localStorage.setItem('chill_reader_view_mode', mode);
  };

  const handleExportVault = async () => {
    try {
      setIsExportingVault(true);
      const filename = await vaultService.downloadVaultBackup();
      setVaultMsg({ type: 'success', text: `Đã xuất bản sao lưu: ${filename}` });
    } catch (e: any) {
      setVaultMsg({ type: 'error', text: e.message || 'Lỗi xuất sao lưu' });
    } finally {
      setIsExportingVault(false);
    }
  };

  const handleImportVault = async (file: File) => {
    try {
      setIsImportingVault(true);
      setVaultMsg(null);
      const res = await vaultService.importVaultData(file);
      setVaultMsg({
        type: 'success',
        text: `Khôi phục thành công ${res.storiesCount} truyện, ${res.chaptersCount} chương và ${res.notesCount} ghi chú!`
      });
      if (onReloadStories) {
        onReloadStories();
      }
    } catch (e: any) {
      setVaultMsg({ type: 'error', text: e.message || 'Lỗi khôi phục sao lưu' });
    } finally {
      setIsImportingVault(false);
    }
  };

  const continueReadingStory = useMemo(() => {
    const inProgress = [...stories]
      .filter(s => (s.lastReadAt || 0) > 0 || (s.currentProgressPercent > 0 && s.currentProgressPercent < 100))
      .sort((a, b) => (b.lastReadAt || 0) - (a.lastReadAt || 0));
    return inProgress[0] || (stories.length > 0 ? stories[0] : null);
  }, [stories]);

  const filteredStories = useMemo(() => {
    const list = stories.filter(story => {
      const matchesSearch = 
        story.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        story.author.toLowerCase().includes(searchQuery.toLowerCase());

      if (!matchesSearch) return false;

      if (filterTab === 'reading') return story.currentProgressPercent > 0 && story.currentProgressPercent < 100;
      if (filterTab === 'favorites') return story.isFavorite;
      if (filterTab === 'comics') return story.source === 'local_comic';
      if (filterTab === 'finished') return story.currentProgressPercent >= 100;
      return true;
    });

    return list.sort((a, b) => {
      switch (sortOption) {
        case 'title':
          return a.title.localeCompare(b.title);
        case 'progress':
          return (b.currentProgressPercent || 0) - (a.currentProgressPercent || 0);
        case 'chapters':
          return (b.totalChapters || 0) - (a.totalChapters || 0);
        case 'recent':
        default:
          return (b.lastReadAt || 0) - (a.lastReadAt || 0);
      }
    });
  }, [stories, searchQuery, filterTab, sortOption]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Top Banner & Stats */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex flex-wrap items-center gap-2">
            Tủ sách của bạn
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-normal">
              {stories.length} cuốn
            </span>
            <button
              onClick={() => setShowStatsModal(true)}
              className="text-xs px-2.5 py-0.5 rounded-full bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 font-medium flex items-center gap-1 cursor-pointer transition-all shadow-xs"
              title="Xem thống kê đọc truyện & chuỗi ngày đọc (Streak)"
            >
              <Flame className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              <span>{streakDays} ngày</span>
            </button>
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1.5 transition-all cursor-pointer font-medium"
                title="Cài đặt & Đồng bộ Cloud"
              >
                <Cloud className="w-3.5 h-3.5" />
                <span>{supabaseSync.isConnected() ? 'Đã bật Cloud' : 'Ghép nối Cloud'}</span>
              </button>
            )}
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Không gian đọc & nghe truyện riêng tư, mượt mà và không quảng cáo
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowVaultModal(true)}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-zinc-800/90 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all cursor-pointer shadow-xs"
            title="Sao lưu & Khôi phục toàn bộ tủ sách (Offline Vault)"
          >
            <HardDrive className="w-3.5 h-3.5 text-amber-400" />
            <span>Sao lưu Vault</span>
          </button>
          <button
            onClick={onOpenImport}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-sm shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" />
            Nạp file
          </button>
          <button
            onClick={onOpenCrawler}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm border border-zinc-700 transition-all cursor-pointer"
          >
            <Compass className="w-4 h-4 text-amber-400" />
            Tìm online
          </button>
        </div>
      </div>

      {/* Cinematic Hero: Continue Reading (Shown when not searching and on "all" tab) */}
      {continueReadingStory && !searchQuery && filterTab === 'all' && (
        <div className="mb-8 relative rounded-3xl overflow-hidden glass-panel border border-white/10 shadow-2xl p-5 sm:p-6 group">
          {/* Subtle Blurred Background Cover Ambient Glow */}
          {continueReadingStory.coverUrl && (
            <div 
              className="absolute -right-10 -bottom-10 w-96 h-96 rounded-full opacity-15 blur-3xl pointer-events-none"
              style={{ backgroundImage: `url(${continueReadingStory.coverUrl})`, backgroundSize: 'cover' }}
            />
          )}

          <div className="relative z-10 flex flex-col sm:flex-row items-center sm:items-stretch gap-5">
            {/* Book Cover with 3D drop shadow */}
            <div 
              onClick={() => onOpenStory(continueReadingStory, 'read')}
              className="relative w-28 h-40 sm:w-32 sm:h-48 rounded-xl overflow-hidden bg-gradient-to-br from-zinc-800 to-zinc-950 border border-white/10 shadow-2xl shrink-0 cursor-pointer group-hover:scale-105 transition-transform duration-300"
            >
              {continueReadingStory.coverUrl ? (
                <img 
                  src={continueReadingStory.coverUrl} 
                  alt={continueReadingStory.title} 
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full p-3 flex flex-col justify-between bg-zinc-900 border-l-4 border-amber-500">
                  <Sparkles className="w-5 h-5 text-amber-400" />
                  <span className="font-serif font-bold text-xs text-zinc-100 line-clamp-3">
                    {continueReadingStory.title}
                  </span>
                </div>
              )}
              {/* Progress pill on cover */}
              <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-mono font-bold text-amber-300 border border-white/10">
                {Math.round(continueReadingStory.currentProgressPercent || 0)}%
              </div>
            </div>

            {/* Info & Action Buttons */}
            <div className="flex-1 flex flex-col justify-between text-center sm:text-left min-w-0">
              <div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
                  <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <Sparkles className="w-3 h-3 text-amber-400" /> Tiếp tục đọc
                  </span>
                  <span className="text-xs text-zinc-400">
                    Chương {continueReadingStory.currentChapterNumber || 1} / {continueReadingStory.totalChapters}
                  </span>
                </div>

                <h2 className="text-lg sm:text-2xl font-bold text-zinc-100 line-clamp-2 leading-snug group-hover:text-amber-300 transition-colors">
                  {continueReadingStory.title}
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  {continueReadingStory.author}
                </p>

                {/* Progress bar */}
                <div className="mt-4 max-w-md mx-auto sm:mx-0 space-y-1.5">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span>Tiến độ đọc</span>
                    <span className="font-mono text-amber-400 font-bold">{Math.round(continueReadingStory.currentProgressPercent || 0)}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-zinc-800/80 overflow-hidden border border-white/5">
                    <div 
                      className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-500 glow-amber"
                      style={{ width: `${Math.min(100, Math.max(3, continueReadingStory.currentProgressPercent || 0))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3 mt-5">
                <button
                  onClick={() => onOpenStory(continueReadingStory, 'read')}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-amber-500/20 active:scale-95 transition-all cursor-pointer"
                >
                  <BookOpen className="w-4 h-4" />
                  Đọc tiếp Chương {continueReadingStory.currentChapterNumber || 1}
                </button>
                {continueReadingStory.source !== 'local_comic' && (
                  <button
                    onClick={() => onOpenStory(continueReadingStory, 'listen')}
                    className="px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-amber-300 font-semibold text-xs sm:text-sm flex items-center gap-2 border border-amber-500/25 active:scale-95 transition-all cursor-pointer"
                  >
                    <Headphones className="w-4 h-4" />
                    Nghe Audio
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter Tabs, View Mode Switch & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between mb-6">
        {/* Smart Shelf Tabs */}
        <div className="flex items-center gap-1 p-1 bg-zinc-800/80 rounded-xl border border-zinc-700/60 overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'all'
                ? 'bg-zinc-700 text-amber-400 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Tất cả ({stories.length})
          </button>
          <button
            onClick={() => setFilterTab('reading')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'reading'
                ? 'bg-zinc-700 text-amber-400 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Đang đọc ({stories.filter(s => s.currentProgressPercent > 0 && s.currentProgressPercent < 100).length})
          </button>
          <button
            onClick={() => setFilterTab('favorites')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'favorites'
                ? 'bg-zinc-700 text-amber-400 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Yêu thích ({stories.filter(s => s.isFavorite).length})
          </button>
          <button
            onClick={() => setFilterTab('comics')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              filterTab === 'comics'
                ? 'bg-zinc-700 text-amber-400 shadow-sm font-semibold'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Truyện tranh ({stories.filter(s => s.source === 'local_comic').length})
          </button>
        </div>

        {/* View Switcher, Sort & Search Bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Sort Selector */}
          <div className="flex items-center gap-1 px-2.5 py-1.5 bg-zinc-800/80 rounded-xl border border-zinc-700/60 text-xs text-zinc-300">
            <ArrowUpDown className="w-3.5 h-3.5 text-amber-400" />
            <select
              value={sortOption}
              onChange={(e) => setSortOption(e.target.value as SortOption)}
              className="bg-transparent text-xs text-zinc-200 focus:outline-none cursor-pointer"
            >
              <option value="recent" className="bg-zinc-900 text-zinc-200">Mới đọc</option>
              <option value="title" className="bg-zinc-900 text-zinc-200">Tên A-Z</option>
              <option value="progress" className="bg-zinc-900 text-zinc-200">Tiến độ</option>
              <option value="chapters" className="bg-zinc-900 text-zinc-200">Số chương</option>
            </select>
          </div>

          {/* View Mode Toggle */}
          <div className="flex items-center p-1 bg-zinc-800/80 rounded-xl border border-zinc-700/60 shrink-0">
            <button
              onClick={() => handleToggleViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-zinc-700 text-amber-400 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Xem dạng Lưới Thẻ Hiện Đại"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => handleToggleViewMode('bookshelf')}
              className={`p-1.5 rounded-lg transition-all cursor-pointer ${
                viewMode === 'bookshelf' ? 'bg-zinc-700 text-amber-400 shadow-xs' : 'text-zinc-400 hover:text-zinc-200'
              }`}
              title="Xem dạng Kệ Sách Gỗ Quý Tộc"
            >
              <Library className="w-4 h-4" />
            </button>
          </div>

          {/* Search Input with Clear Button */}
          <div className="relative min-w-[180px] flex-1 sm:flex-initial">
            <Search className="w-4 h-4 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm tên truyện hoặc tác giả..."
              className="w-full bg-zinc-800/80 border border-zinc-700 rounded-xl pl-9 pr-8 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 transition-colors"
            />
            {searchQuery && (
              <button 
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredStories.length === 0 ? (
        <div className="bg-zinc-800/40 border border-dashed border-zinc-800 rounded-2xl p-12 text-center">
          <div className="w-16 h-16 rounded-2xl bg-white p-1 border border-zinc-700/60 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-500/10">
            <img src="/icon-192.png" alt="Chill Reader NKI" className="w-full h-full object-contain rounded-xl" />
          </div>
          <h3 className="text-lg font-semibold text-zinc-200 mb-1">
            {searchQuery ? 'Không tìm thấy truyện phù hợp' : 'Tủ sách của bạn còn trống'}
          </h3>
          <p className="text-sm text-zinc-400 max-w-md mx-auto mb-6">
            {searchQuery
              ? 'Hãy thử tìm kiếm với từ khóa khác hoặc chuyển sang danh mục khác.'
              : 'Hãy nạp file truyện (.txt, .epub, .pdf, .cbz) từ máy hoặc tìm kiếm truyện online.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={onOpenImport}
              className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium text-sm transition-all cursor-pointer"
            >
              Nạp file truyện
            </button>
            <button
              onClick={onOpenCrawler}
              className="px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-medium text-sm border border-zinc-700 transition-all cursor-pointer"
            >
              Khám phá truyện online
            </button>
          </div>
        </div>
      ) : viewMode === 'bookshelf' ? (
        /* Boutique Wooden Bookshelf View */
        <div className="space-y-10 py-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 sm:gap-8 items-end">
            {filteredStories.map((story) => (
              <div key={story.id} className="flex flex-col items-center group relative">
                {/* 3D Realistic Book Standing on Shelf */}
                <div 
                  onClick={() => onOpenStory(story, 'read')}
                  className="book-spine-3d w-28 sm:w-36 h-40 sm:h-52 rounded-r-lg rounded-l-xs overflow-hidden relative cursor-pointer bg-gradient-to-r from-zinc-900 to-zinc-800 border-r-2 border-zinc-700 shadow-2xl"
                >
                  {story.coverUrl ? (
                    <img 
                      src={story.coverUrl} 
                      alt={story.title} 
                      className="w-full h-full object-cover select-none"
                    />
                  ) : (
                    <div className="w-full h-full p-3 flex flex-col justify-between bg-gradient-to-br from-zinc-800 via-zinc-900 to-black border-l-4 border-amber-600/60">
                      <div>
                        <Sparkles className="w-4 h-4 text-amber-400/80 mb-2" />
                        <h4 className="font-serif font-bold text-xs sm:text-sm text-zinc-100 line-clamp-3 leading-tight tracking-tight">
                          {story.title}
                        </h4>
                      </div>
                      <p className="text-[10px] text-zinc-400 truncate font-mono">
                        {story.author}
                      </p>
                    </div>
                  )}

                  {/* Bookmark Ribbon Hanging Down */}
                  <div className="absolute top-0 right-3 w-3 h-8 bg-amber-500 shadow-md flex items-end justify-center pb-0.5">
                    <Bookmark className="w-2.5 h-2.5 text-zinc-950 fill-zinc-950" />
                  </div>

                  {/* Progress Badge */}
                  <div className="absolute bottom-1.5 left-1.5 px-2 py-0.5 rounded-md bg-black/80 backdrop-blur-xs text-[10px] font-mono text-amber-300 font-bold border border-zinc-700/60">
                    {Math.round(story.currentProgressPercent || 0)}%
                  </div>

                  {/* Quick Action Floating Overlay on Hover */}
                  <div className="absolute inset-0 bg-black/85 backdrop-blur-xs opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2 z-10">
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenStory(story, 'read'); }}
                      className="w-full py-1.5 px-2 rounded-lg bg-amber-500 text-zinc-950 font-bold text-xs flex items-center justify-center gap-1 hover:bg-amber-400 transition-all cursor-pointer"
                    >
                      <BookOpen className="w-3.5 h-3.5" /> Đọc
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onOpenStory(story, 'listen'); }}
                      className="w-full py-1.5 px-2 rounded-lg bg-zinc-800 text-amber-300 font-semibold text-xs flex items-center justify-center gap-1 hover:bg-zinc-700 border border-amber-500/30 transition-all cursor-pointer"
                    >
                      <Headphones className="w-3.5 h-3.5" /> Nghe
                    </button>
                    <button
                      onClick={(e) => { e.stopPropagation(); onToggleFavorite(story.id); }}
                      className={`text-xs p-1 rounded-md ${story.isFavorite ? 'text-rose-400' : 'text-zinc-400 hover:text-white'}`}
                    >
                      <Heart className="w-4 h-4" fill={story.isFavorite ? 'currentColor' : 'none'} />
                    </button>
                  </div>
                </div>

                {/* Wooden Plank Beneath Book */}
                <div className="w-full h-3 bookshelf-shelf rounded-sm mt-1" />

                {/* Title & Chapter beneath plank */}
                <div className="w-full text-center mt-2 px-1">
                  <h4 className="font-semibold text-xs text-zinc-200 truncate group-hover:text-amber-400 transition-colors">
                    {story.title}
                  </h4>
                  <p className="text-[10px] text-zinc-500 font-mono">
                    Chương {story.currentChapterNumber || 1}/{story.totalChapters}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        /* Modern Card Grid View */
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filteredStories.map((story) => (
            <div
              key={story.id}
              className="group relative book-card-pro bg-zinc-900/75 hover:bg-zinc-800/80 border border-white/5 rounded-2xl p-4 flex flex-col justify-between transition-all duration-300"
            >
              {/* Cover & Main Info */}
              <div>
                <div className="flex gap-3.5 mb-3.5">
                  {/* Book Cover */}
                  <div 
                    onClick={() => onOpenStory(story, 'read')}
                    className="relative w-20 h-28 rounded-xl overflow-hidden bg-gradient-to-br from-zinc-700 to-zinc-900 border border-zinc-700/80 shadow-md shrink-0 flex items-center justify-center cursor-pointer group-hover:scale-105 transition-transform duration-300"
                  >
                    {story.coverUrl ? (
                      <img
                        src={story.coverUrl}
                        alt={story.title}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <div className="p-2 text-center">
                        <Sparkles className="w-5 h-5 text-amber-400/60 mx-auto mb-1" />
                        <span className="text-[10px] font-bold text-zinc-300 line-clamp-3 leading-tight">
                          {story.title}
                        </span>
                      </div>
                    )}
                    {/* Source Badge */}
                    <span className="absolute bottom-1 right-1 px-1.5 py-0.5 rounded text-[8px] uppercase font-bold bg-zinc-950/85 text-amber-300 border border-white/5 backdrop-blur-xs">
                      {story.source.replace('local_', '')}
                    </span>
                  </div>

                  {/* Title & Author */}
                  <div className="flex-1 min-w-0 flex flex-col justify-between">
                    <div>
                      <h3 
                        onClick={() => onOpenStory(story, 'read')}
                        className="font-bold text-sm text-zinc-100 line-clamp-2 leading-snug group-hover:text-amber-300 transition-colors cursor-pointer"
                      >
                        {story.title}
                      </h3>
                      <p className="text-xs text-zinc-400 mt-1 truncate">
                        {story.author}
                      </p>
                    </div>

                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-2">
                      <Layers className="w-3.5 h-3.5 text-zinc-500" />
                      <span>{story.totalChapters} chương</span>
                    </div>
                  </div>
                </div>

                {/* Progress bar */}
                <div className="space-y-1.5 mb-3.5">
                  <div className="flex justify-between text-[11px] text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      Chương {story.currentChapterNumber || 1}/{story.totalChapters}
                    </span>
                    <span className="font-mono font-semibold text-amber-400">
                      {Math.round(story.currentProgressPercent || 0)}%
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-zinc-800 overflow-hidden border border-white/5">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, Math.max(2, story.currentProgressPercent || 0))}%` }}
                    />
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-1.5 pt-2.5 border-t border-white/5">
                <button
                  onClick={() => onOpenStory(story, 'read')}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-zinc-950 text-xs font-bold shadow-md shadow-amber-500/15 active:scale-95 transition-all cursor-pointer"
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  Đọc tiếp
                </button>

                {story.source !== 'local_comic' && (
                  <button
                    onClick={() => onOpenStory(story, 'listen')}
                    className="flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 text-amber-300 border border-amber-500/20 text-xs font-semibold active:scale-95 transition-all cursor-pointer"
                  >
                    <Headphones className="w-3.5 h-3.5" />
                    Nghe
                  </button>
                )}

                <button
                  onClick={() => onToggleFavorite(story.id)}
                  className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                    story.isFavorite
                      ? 'bg-rose-500/20 border-rose-500/40 text-rose-400'
                      : 'border-zinc-700 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200'
                  }`}
                  title={story.isFavorite ? 'Bỏ yêu thích' : 'Yêu thích'}
                >
                  <Heart className="w-3.5 h-3.5" fill={story.isFavorite ? 'currentColor' : 'none'} />
                </button>

                <button
                  onClick={() => {
                    if (confirm(`Bạn có chắc muốn xóa truyện "${story.title}" khỏi tủ sách?`)) {
                      onDeleteStory(story.id);
                    }
                  }}
                  className="p-1.5 rounded-lg border border-zinc-700/50 hover:bg-red-500/20 hover:border-red-500/40 text-zinc-500 hover:text-red-400 transition-colors cursor-pointer"
                  title="Xóa truyện"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Reading Stats & Streak Modal */}
      {showStatsModal && (
        <ReadingStatsModal
          isOpen={showStatsModal}
          onClose={() => setShowStatsModal(false)}
        />
      )}

      {/* Vault Backup & Restore Modal */}
      {showVaultModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-xs animate-in fade-in duration-200">
          <div 
            className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-amber-500/10 text-amber-400 flex items-center justify-center">
                  <HardDrive className="w-4.5 h-4.5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm text-zinc-100">Sao Lưu & Khôi Phục Vault</h3>
                  <p className="text-[11px] text-zinc-400">Bảo toàn toàn bộ tủ sách & ghi chú sang thiết bị khác</p>
                </div>
              </div>
              <button
                onClick={() => { setShowVaultModal(false); setVaultMsg(null); }}
                className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {vaultMsg && (
              <div className={`p-3 rounded-xl text-xs flex items-start gap-2 ${
                vaultMsg.type === 'success' 
                  ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300' 
                  : 'bg-red-500/10 border border-red-500/30 text-red-300'
              }`}>
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{vaultMsg.text}</span>
              </div>
            )}

            <div className="space-y-3 pt-1">
              {/* Export Button */}
              <button
                onClick={handleExportVault}
                disabled={isExportingVault}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800 hover:border-amber-500/60 transition-all cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    {isExportingVault ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Download className="w-4.5 h-4.5" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">Xuất bản sao lưu (.chillvault)</h4>
                    <p className="text-[11px] text-zinc-400">Lưu trọn vẹn truyện, chương offline & ghi chú</p>
                  </div>
                </div>
              </button>

              {/* Import Button */}
              <input
                ref={vaultFileInputRef}
                type="file"
                accept=".chillvault,.json"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleImportVault(e.target.files[0]);
                  }
                }}
              />
              <button
                onClick={() => vaultFileInputRef.current?.click()}
                disabled={isImportingVault}
                className="w-full flex items-center justify-between p-3.5 rounded-xl border border-zinc-700 bg-zinc-800/40 hover:bg-zinc-800 hover:border-amber-500/60 transition-all cursor-pointer text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                    {isImportingVault ? <Loader2 className="w-4.5 h-4.5 animate-spin" /> : <Upload className="w-4.5 h-4.5" />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-zinc-200">Khôi phục từ file .chillvault</h4>
                    <p className="text-[11px] text-zinc-400">Nạp lại dữ liệu sao lưu trước đó</p>
                  </div>
                </div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
