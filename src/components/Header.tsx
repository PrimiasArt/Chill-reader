import React from 'react';
import { BookOpen, Headphones, PlusCircle, Compass, Settings } from 'lucide-react';
import type { TTSState } from '../services/tts/ttsEngine';

interface HeaderProps {
  currentTab: 'library' | 'crawler' | 'settings';
  onSelectTab: (tab: 'library' | 'crawler' | 'settings') => void;
  onOpenImport: () => void;
  ttsState: TTSState;
  onOpenTTSPlayer: () => void;
  activeStoryTitle?: string;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  onOpenImport,
  ttsState,
  onOpenTTSPlayer,
  activeStoryTitle
}) => {
  return (
    <header className="sticky top-0 z-30 glass-panel border-b border-white/5 text-zinc-100 shadow-md">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
        {/* Logo & App Name */}
        <div 
          onClick={() => onSelectTab('library')}
          className="flex items-center gap-3 cursor-pointer group select-none"
        >
          <div className="w-10 h-10 rounded-xl overflow-hidden border border-zinc-700/80 shadow-md shadow-amber-500/10 shrink-0 bg-white flex items-center justify-center p-0.5 group-hover:scale-105 transition-transform duration-200">
            <img 
              src="/icon-192.png" 
              alt="Chill Reader NKI" 
              className="w-full h-full object-contain rounded-lg"
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-lg tracking-tight bg-gradient-to-r from-zinc-100 via-amber-100 to-amber-400 bg-clip-text text-transparent">
                Chill Reader
              </span>
              <span className="text-[9px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                PRO
              </span>
            </div>
            <p className="text-[11px] text-zinc-400 hidden sm:block">Đọc & Nghe truyện thông minh</p>
          </div>
        </div>

        {/* Navigation Tabs (Desktop Segmented Control) */}
        <nav className="hidden md:flex items-center bg-zinc-900/80 p-1 rounded-xl border border-white/5 shadow-inner">
          <button
            onClick={() => onSelectTab('library')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              currentTab === 'library'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <BookOpen className="w-4 h-4" />
            <span>Tủ sách</span>
          </button>

          <button
            onClick={() => onSelectTab('crawler')}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
              currentTab === 'crawler'
                ? 'bg-amber-500 text-zinc-950 shadow-md shadow-amber-500/20'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/5'
            }`}
          >
            <Compass className="w-4 h-4" />
            <span>Khám phá</span>
          </button>

          <button
            onClick={onOpenImport}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-amber-400 hover:bg-amber-500/10 transition-all cursor-pointer ml-1"
          >
            <PlusCircle className="w-4 h-4 text-amber-400" />
            <span>Nạp file</span>
          </button>
        </nav>

        {/* Right Action Controls: TTS Status & Settings */}
        <div className="flex items-center gap-2.5 shrink-0">
          {ttsState !== 'idle' && (
            <button
              onClick={onOpenTTSPlayer}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all cursor-pointer ${
                ttsState === 'playing'
                  ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 shadow-md shadow-amber-500/10'
                  : 'bg-zinc-800/80 border-zinc-700 text-zinc-300'
              }`}
            >
              {/* Equalizer Animated Sound Bars */}
              {ttsState === 'playing' ? (
                <div className="flex items-end gap-0.5 h-3.5 w-3.5 justify-center shrink-0">
                  <span className="w-0.5 bg-amber-400 rounded-full audio-bar-1" />
                  <span className="w-0.5 bg-amber-300 rounded-full audio-bar-2" />
                  <span className="w-0.5 bg-amber-400 rounded-full audio-bar-3" />
                </div>
              ) : (
                <Headphones className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
              )}
              <span className="max-w-[100px] truncate hidden sm:inline font-medium">
                {activeStoryTitle || 'Audio'}
              </span>
            </button>
          )}

          <button
            onClick={() => onSelectTab('settings')}
            className={`p-2 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 ${
              currentTab === 'settings' 
                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm' 
                : 'text-zinc-300 hover:text-amber-400 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-800'
            }`}
            title="Cài đặt & Đồng bộ"
            aria-label="Cài đặt"
          >
            <Settings className="w-4.5 h-4.5 text-amber-400" />
            <span className="text-xs font-semibold hidden sm:inline">Cài đặt</span>
          </button>
        </div>
      </div>
    </header>
  );
};
