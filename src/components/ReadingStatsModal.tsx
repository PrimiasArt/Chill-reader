import React, { useState, useEffect } from 'react';
import { X, Flame, Clock, BookOpen, Trophy, Award, Calendar, Sparkles } from 'lucide-react';
import { readingStatsService, type ReadingStats, getTodayDateString } from '../services/stats/readingStatsService';

interface ReadingStatsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ReadingStatsModal: React.FC<ReadingStatsModalProps> = ({ isOpen, onClose }) => {
  const [stats, setStats] = useState<ReadingStats | null>(null);

  useEffect(() => {
    if (isOpen) {
      readingStatsService.getStats().then(setStats);
      const unsub = readingStatsService.subscribe(setStats);
      return unsub;
    }
  }, [isOpen]);

  if (!isOpen || !stats) return null;

  const todayMinutes = Math.round((stats.todaySeconds || 0) / 60);
  const totalHours = ((stats.totalSeconds || 0) / 3600).toFixed(1);
  const wordsFormatted = stats.totalWordsRead > 1000000 
    ? `${(stats.totalWordsRead / 1000000).toFixed(1)}M`
    : stats.totalWordsRead > 1000 
    ? `${Math.round(stats.totalWordsRead / 1000)}k`
    : stats.totalWordsRead;

  // Rank title according to total reading hours
  const hoursNum = parseFloat(totalHours);
  let rank = { title: 'Sơ Nhập Thư Hải', desc: 'Mới bắt đầu bước chân vào thế giới truyện chữ', color: 'text-zinc-300', bg: 'bg-zinc-800' };
  if (hoursNum >= 50) {
    rank = { title: 'Nguyên Anh Tông Sư', desc: 'Đại năng đọc truyện, kiến thức uyên bác ngập tràn', color: 'text-amber-400', bg: 'bg-amber-500/20' };
  } else if (hoursNum >= 20) {
    rank = { title: 'Kim Đan Độc Giả', desc: 'Đạo tâm vững vàng, ngày đêm đắm mình cùng tiểu thuyết', color: 'text-yellow-400', bg: 'bg-yellow-500/20' };
  } else if (hoursNum >= 5) {
    rank = { title: 'Trúc Cơ Mọt Sách', desc: 'Thói quen đọc đã thành nền tảng vững chắc', color: 'text-blue-400', bg: 'bg-blue-500/20' };
  }

  // Generate last 7 days chart data
  const daysOfWeek = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
  const last7Days: { label: string; date: string; minutes: number }[] = [];

  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const dayLabel = daysOfWeek[d.getDay()];
    const sec = stats.dailyHistory?.[dateStr] || 0;
    last7Days.push({
      label: dayLabel,
      date: dateStr,
      minutes: Math.round(sec / 60)
    });
  }

  const maxMinutes = Math.max(30, ...last7Days.map(d => d.minutes));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl shadow-2xl flex flex-col overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800 bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <Flame className="w-4 h-4 fill-amber-400 text-amber-400" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100">Thống Kê Thói Quen Đọc</h3>
              <p className="text-[11px] text-zinc-400">Theo dõi thời gian đọc và duy trì thói quen mỗi ngày</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-4 overflow-y-auto max-h-[75vh]">
          {/* Streak Banner */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/20 via-orange-500/15 to-transparent border border-amber-500/30 flex items-center justify-between">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-2xl sm:text-3xl font-extrabold text-amber-400 font-serif">
                  {stats.currentStreakDays} ngày
                </span>
                <Flame className="w-6 h-6 fill-amber-400 text-amber-400 animate-pulse" />
              </div>
              <p className="text-xs text-zinc-300 font-medium">Chuỗi ngày đọc liên tục</p>
              <p className="text-[11px] text-zinc-400">Kỷ lục dài nhất: {stats.longestStreakDays} ngày</p>
            </div>

            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
              <Trophy className="w-7 h-7" />
            </div>
          </div>

          {/* Key Stat Metrics */}
          <div className="grid grid-cols-3 gap-2">
            <div className="p-3 rounded-2xl bg-zinc-800/40 border border-zinc-700/60 text-center">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 mx-auto mb-1">
                <Clock className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-bold text-zinc-100">{todayMinutes} phút</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Hôm nay</div>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-800/40 border border-zinc-700/60 text-center">
              <div className="w-7 h-7 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mx-auto mb-1">
                <BookOpen className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-bold text-zinc-100">{totalHours} giờ</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Tổng tích lũy</div>
            </div>

            <div className="p-3 rounded-2xl bg-zinc-800/40 border border-zinc-700/60 text-center">
              <div className="w-7 h-7 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mx-auto mb-1">
                <Award className="w-3.5 h-3.5" />
              </div>
              <div className="text-base font-bold text-zinc-100">{stats.totalChaptersCompleted}</div>
              <div className="text-[10px] text-zinc-400 mt-0.5">Chương xong</div>
            </div>
          </div>

          {/* 7 Days Bar Chart */}
          <div className="p-4 rounded-2xl bg-zinc-800/30 border border-zinc-700/60 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-zinc-300 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" /> Hoạt động 7 ngày gần đây
              </span>
              <span className="text-[11px] text-zinc-500">Mục tiêu: 30p / ngày</span>
            </div>

            <div className="flex items-end justify-between gap-2 pt-2 h-28">
              {last7Days.map((d) => {
                const heightPercent = Math.max(8, Math.round((d.minutes / maxMinutes) * 100));
                const isToday = d.date === getTodayDateString();
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className="text-[9px] text-zinc-400 font-mono">
                      {d.minutes > 0 ? `${d.minutes}p` : ''}
                    </span>
                    <div 
                      className={`w-full rounded-lg transition-all duration-300 ${
                        isToday
                          ? 'bg-amber-400 shadow-xs'
                          : d.minutes > 0
                          ? 'bg-amber-500/40 hover:bg-amber-500/60'
                          : 'bg-zinc-800'
                      }`}
                      style={{ height: `${heightPercent}%` }}
                    />
                    <span className={`text-[10px] ${isToday ? 'font-bold text-amber-300' : 'text-zinc-500'}`}>
                      {d.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Reader Cultivation Rank */}
          <div className="p-3.5 rounded-2xl bg-zinc-800/40 border border-zinc-700/60 flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${rank.bg} border border-amber-500/30 flex items-center justify-center ${rank.color} shrink-0`}>
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className={`text-xs font-bold ${rank.color}`}>{rank.title}</h4>
                <span className="text-[10px] text-zinc-500 font-medium">({wordsFormatted} chữ đã đọc)</span>
              </div>
              <p className="text-[11px] text-zinc-400 mt-0.5">{rank.desc}</p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800 bg-zinc-950/60 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-zinc-200 transition-colors cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
