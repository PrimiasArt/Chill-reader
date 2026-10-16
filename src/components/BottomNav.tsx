import React from 'react';
import { BookOpen, Compass, PlusCircle, Settings } from 'lucide-react';

interface BottomNavProps {
  currentTab: 'library' | 'crawler' | 'settings';
  onSelectTab: (tab: 'library' | 'crawler' | 'settings') => void;
  onOpenImport: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
  onOpenImport
}) => {
  return (
    <nav className="fixed bottom-3 left-4 right-4 z-40 max-w-sm mx-auto glass-dock rounded-2xl p-1.5 flex items-center justify-around md:hidden shadow-2xl safe-area-bottom">
      {/* 1. Library Tab */}
      <button
        onClick={() => onSelectTab('library')}
        className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all cursor-pointer ${
          currentTab === 'library'
            ? 'bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30 shadow-xs scale-105'
            : 'text-zinc-400 hover:text-zinc-200 active:scale-95'
        }`}
      >
        <BookOpen className="w-4.5 h-4.5" />
        <span className="text-[10px] mt-0.5 tracking-tight font-medium">Tủ sách</span>
      </button>

      {/* 2. Crawler Tab */}
      <button
        onClick={() => onSelectTab('crawler')}
        className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all cursor-pointer ${
          currentTab === 'crawler'
            ? 'bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30 shadow-xs scale-105'
            : 'text-zinc-400 hover:text-zinc-200 active:scale-95'
        }`}
      >
        <Compass className="w-4.5 h-4.5" />
        <span className="text-[10px] mt-0.5 tracking-tight font-medium">Khám phá</span>
      </button>

      {/* 3. Quick Import Button */}
      <button
        onClick={onOpenImport}
        className="flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer text-zinc-300 hover:text-amber-400 active:scale-95"
      >
        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-amber-600 to-amber-400 text-zinc-950 font-bold flex items-center justify-center shadow-lg shadow-amber-500/25">
          <PlusCircle className="w-4.5 h-4.5" />
        </div>
        <span className="text-[9px] mt-0.5 tracking-tight text-amber-400/90 font-medium">Nạp file</span>
      </button>

      {/* 4. Settings Tab */}
      <button
        onClick={() => onSelectTab('settings')}
        className={`flex flex-col items-center justify-center py-1.5 px-3 rounded-xl transition-all cursor-pointer ${
          currentTab === 'settings'
            ? 'bg-amber-500/15 text-amber-400 font-bold border border-amber-500/30 shadow-xs scale-105'
            : 'text-zinc-400 hover:text-zinc-200 active:scale-95'
        }`}
      >
        <Settings className="w-4.5 h-4.5" />
        <span className="text-[10px] mt-0.5 tracking-tight font-medium">Cài đặt</span>
      </button>
    </nav>
  );
};
