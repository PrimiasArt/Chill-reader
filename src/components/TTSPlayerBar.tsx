import React, { useState } from 'react';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  SkipBack,
  SkipForward,
  Timer, 
  Volume2, 
  Maximize2, 
  Minimize2, 
  X,
  Download,
  Loader2,
  Smartphone,
  CloudRain,
  Gauge,
  Mic
} from 'lucide-react';
import { ttsEngine, type TTSState } from '../services/tts/ttsEngine';
import { ambientAudioService, AMBIENT_SOUND_OPTIONS, type AmbientSoundType } from '../services/tts/ambientAudio';
import type { TTSSettings } from '../types';

interface TTSPlayerBarProps {
  ttsState: TTSState;
  bookTitle: string;
  author: string;
  chapterTitle: string;
  coverUrl?: string;
  currentSentenceText: string;
  sentenceIndex: number;
  totalSentences: number;
  countdownSeconds: number | null;
  settings: TTSSettings;
  onUpdateSettings: (newSettings: Partial<TTSSettings>) => void;
  onClosePlayer: () => void;
  isOpenFullModal: boolean;
  onSetOpenFullModal: (open: boolean) => void;
  isInsideReader?: boolean;
  storyId?: string;
  chapterNumber?: number;
  onPreviousChapter?: () => void;
  onNextChapter?: () => void;
  hasPreviousChapter?: boolean;
  hasNextChapter?: boolean;
}

export const TTSPlayerBar: React.FC<TTSPlayerBarProps> = ({
  ttsState,
  bookTitle,
  author,
  chapterTitle,
  coverUrl,
  currentSentenceText,
  sentenceIndex,
  totalSentences,
  countdownSeconds,
  settings,
  onUpdateSettings,
  onClosePlayer,
  isOpenFullModal,
  onSetOpenFullModal,
  isInsideReader,
  storyId,
  chapterNumber,
  onPreviousChapter,
  onNextChapter,
  hasPreviousChapter,
  hasNextChapter
}) => {
  const [ambientType, setAmbientType] = useState<AmbientSoundType>(ambientAudioService.getType());
  const [ambientVolume, setAmbientVolume] = useState<number>(ambientAudioService.getVolume());
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null);
  const [activeSettingTab, setActiveSettingTab] = useState<'speed' | 'voice' | 'ambient' | 'timer' | null>(null);

  if (ttsState === 'idle') return null;

  const formatCountdown = (secs: number | null) => {
    if (secs === null) return null;
    const mins = Math.floor(secs / 60);
    const remainder = secs % 60;
    return `${mins}:${remainder < 10 ? '0' : ''}${remainder}`;
  };

  const handleDownloadAudio = async () => {
    if (!storyId || chapterNumber === undefined) return;
    setIsDownloading(true);
    try {
      await ttsEngine.downloadChapterAudio(storyId, chapterNumber, (done, total) => {
        setDownloadProgress({ done, total });
      });
    } catch (e) {
      console.warn('Download chapter audio error:', e);
    } finally {
      setIsDownloading(false);
      setDownloadProgress(null);
    }
  };

  const allVoices = ttsEngine.getAllAvailableVoices();

  const progressPercent = totalSentences > 0 
    ? Math.min(100, Math.round(((sentenceIndex + 1) / totalSentences) * 100)) 
    : 0;

  return (
    <>
      {/* 1. Floating Mini Player Capsule (stacked above BottomNav on mobile) */}
      <div 
        className={`fixed z-40 transition-all duration-300 ${
          isInsideReader 
            ? 'left-3 right-3 max-w-xl mx-auto bottom-3' 
            : 'left-3 right-3 max-w-xl mx-auto bottom-20 md:bottom-5'
        }`}
      >
        <div className="glass-dock rounded-2xl border border-white/10 shadow-2xl px-3.5 py-2.5 relative overflow-hidden group">
          {/* Hairline Progress Indicator at Top */}
          <div className="absolute top-0 left-0 right-0 h-[2px] bg-zinc-800/80">
            <div 
              className="h-full bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-300 transition-all duration-300"
              style={{ width: `${progressPercent}%` }}
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            {/* Story & Chapter Info with Animated Wave */}
            <div 
              onClick={() => onSetOpenFullModal(true)}
              className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer select-none"
            >
              <div className="relative w-10 h-10 rounded-xl overflow-hidden bg-zinc-800 border border-zinc-700/80 shrink-0 flex items-center justify-center shadow-md">
                {coverUrl ? (
                  <img src={coverUrl} alt={bookTitle} className="w-full h-full object-cover" />
                ) : (
                  <Volume2 className="w-5 h-5 text-amber-400" />
                )}

                {/* Animated sound wave overlay when playing */}
                {ttsState === 'playing' && (
                  <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] flex items-center justify-center gap-0.5">
                    <span className="w-0.5 bg-amber-400 rounded-full audio-bar-1" />
                    <span className="w-0.5 bg-amber-300 rounded-full audio-bar-2" />
                    <span className="w-0.5 bg-amber-400 rounded-full audio-bar-3" />
                  </div>
                )}
              </div>

              <div className="min-w-0 flex-1">
                <h4 className="text-xs font-bold text-zinc-100 truncate group-hover:text-amber-300 transition-colors">
                  {chapterTitle}
                </h4>
                <div className="flex items-center gap-2 text-[11px] text-zinc-400 mt-0.5 truncate">
                  <span className="truncate">{bookTitle}</span>
                  <span className="text-zinc-600">•</span>
                  <span className="text-amber-400 font-mono font-semibold shrink-0">{progressPercent}%</span>
                  {countdownSeconds !== null && (
                    <>
                      <span className="text-zinc-600">•</span>
                      <span className="text-zinc-400 text-[10px] flex items-center gap-0.5 shrink-0">
                        <Timer className="w-2.5 h-2.5 text-amber-400" />
                        {formatCountdown(countdownSeconds)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Playback Controls */}
            <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
              {/* Rewind 1 sentence */}
              <button
                onClick={() => ttsEngine.previousSentence()}
                className="p-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                title="Tua lùi 1 câu"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Play/Pause */}
              <button
                onClick={() => ttsEngine.togglePlayPause()}
                className="w-9 h-9 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 hover:from-amber-400 hover:to-amber-300 text-zinc-950 font-bold flex items-center justify-center transition-all shadow-lg shadow-amber-500/25 active:scale-95 cursor-pointer shrink-0"
                title={ttsState === 'playing' ? 'Tạm dừng' : 'Đọc tiếp'}
              >
                {ttsState === 'playing' ? (
                  <Pause className="w-4.5 h-4.5 fill-current" />
                ) : (
                  <Play className="w-4.5 h-4.5 fill-current translate-x-0.5" />
                )}
              </button>

              {/* Forward 1 sentence */}
              <button
                onClick={() => ttsEngine.nextSentence()}
                className="p-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                title="Tua tiến 1 câu"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              {/* Expand Full Player Modal */}
              <button
                onClick={() => onSetOpenFullModal(true)}
                className="p-2 rounded-xl hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                title="Mở rộng khung nghe"
              >
                <Maximize2 className="w-4 h-4" />
              </button>

              {/* Close Player */}
              <button
                onClick={onClosePlayer}
                className="p-2 rounded-xl hover:bg-white/10 text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                title="Tắt trình nghe"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Fullscreen Responsive Audio Player Modal (Bottom Sheet on Mobile) */}
      {isOpenFullModal && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex flex-col justify-end sm:justify-center items-center p-0 sm:p-4 animate-in fade-in duration-200"
          onClick={() => onSetOpenFullModal(false)}
        >
          <div 
            className="w-full max-w-md bg-zinc-900 border-t sm:border border-zinc-800 rounded-t-3xl sm:rounded-3xl shadow-2xl p-5 sm:p-6 flex flex-col items-center gap-4 text-zinc-100 max-h-[92dvh] overflow-y-auto overscroll-contain relative custom-scrollbar"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Mobile Drag Handle Indicator */}
            <div className="w-12 h-1 bg-zinc-700/80 rounded-full -mt-2 mb-1 sm:hidden shrink-0" />

            {/* Modal Top Bar */}
            <div className="w-full flex items-center justify-between">
              <span className="text-xs font-semibold text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
                <Volume2 className="w-4 h-4 text-amber-400" />
                Trình Nghe Truyện
              </span>
              <button 
                onClick={() => onSetOpenFullModal(false)}
                className="p-1.5 rounded-full hover:bg-zinc-800 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>

            {/* Story Artwork & Title */}
            <div className="flex flex-col items-center text-center space-y-1.5 w-full">
              <div className="w-24 h-32 sm:w-28 sm:h-40 rounded-2xl overflow-hidden shadow-2xl border border-zinc-700/60 bg-zinc-800 shrink-0 flex items-center justify-center">
                {coverUrl ? (
                  <img src={coverUrl} alt={bookTitle} className="w-full h-full object-cover" />
                ) : (
                  <Volume2 className="w-10 h-10 text-amber-400" />
                )}
              </div>
              <h3 className="font-bold text-sm sm:text-base text-zinc-100 line-clamp-1">{chapterTitle}</h3>
              <p className="text-xs text-zinc-400 line-clamp-1 mt-0.5">{bookTitle}{author ? ` • ${author}` : ''}</p>
            </div>

            {/* Currently Read Sentence Box */}
            <div className="w-full bg-zinc-950/60 border border-zinc-800 rounded-2xl p-4 min-h-[72px] flex items-center justify-center text-center">
              <p className="text-xs text-zinc-300 font-medium italic leading-relaxed line-clamp-3">
                "{currentSentenceText || 'Đang sẵn sàng đọc...'}"
              </p>
            </div>

            {/* Sentence Progress */}
            <div className="w-full space-y-1.5">
              <div className="flex justify-between text-[11px] text-zinc-400">
                <span>Câu {sentenceIndex + 1} / {totalSentences}</span>
                <span className="font-semibold text-amber-400">{progressPercent}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-zinc-800 overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-200"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Main Audio Buttons */}
            <div className="flex items-center justify-center gap-3 sm:gap-5 w-full">
              {/* Previous Chapter */}
              <button
                onClick={async () => {
                  if (onPreviousChapter) {
                    onPreviousChapter();
                  } else {
                    await ttsEngine.advanceToPreviousChapter();
                  }
                }}
                disabled={hasPreviousChapter === false}
                className="p-2.5 sm:p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-amber-400 transition-all active:scale-95 cursor-pointer"
                title="Chương trước"
              >
                <SkipBack className="w-5 h-5" />
              </button>

              {/* Rewind 1 sentence */}
              <button
                onClick={() => ttsEngine.previousSentence()}
                className="p-2.5 sm:p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors active:scale-95 cursor-pointer"
                title="Lùi 1 câu"
              >
                <RotateCcw className="w-5 h-5" />
              </button>

              {/* Play / Pause */}
              <button
                onClick={() => ttsEngine.togglePlayPause()}
                className="p-4 sm:p-5 rounded-full bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold shadow-lg shadow-amber-500/25 active:scale-95 transition-all cursor-pointer"
                title={ttsState === 'playing' ? 'Tạm dừng' : 'Đọc tiếp'}
              >
                {ttsState === 'playing' ? (
                  <Pause className="w-6 h-6 sm:w-7 sm:h-7 fill-current" />
                ) : (
                  <Play className="w-6 h-6 sm:w-7 sm:h-7 fill-current translate-x-0.5" />
                )}
              </button>

              {/* Forward 1 sentence */}
              <button
                onClick={() => ttsEngine.nextSentence()}
                className="p-2.5 sm:p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors active:scale-95 cursor-pointer"
                title="Tiến 1 câu"
              >
                <RotateCw className="w-5 h-5" />
              </button>

              {/* Next Chapter */}
              <button
                onClick={async () => {
                  if (onNextChapter) {
                    onNextChapter();
                  } else {
                    await ttsEngine.advanceToNextChapter();
                  }
                }}
                disabled={hasNextChapter === false}
                className="p-2.5 sm:p-3 rounded-full bg-zinc-800 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed text-zinc-300 hover:text-amber-400 transition-all active:scale-95 cursor-pointer"
                title="Chương sau"
              >
                <SkipForward className="w-5 h-5" />
              </button>
            </div>

            {/* Setting Icons Grid / Toolbar */}
            <div className="w-full grid grid-cols-4 gap-2 pt-2 border-t border-zinc-800/80">
              {/* Tab 1: Speed */}
              <button
                onClick={() => setActiveSettingTab(activeSettingTab === 'speed' ? null : 'speed')}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
                  activeSettingTab === 'speed'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'bg-zinc-800/70 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50'
                }`}
                title="Tùy chỉnh tốc độ đọc"
              >
                <Gauge className="w-4.5 h-4.5 mb-1" />
                <span className="text-[11px] font-bold">{settings.rate}x</span>
                <span className="text-[9px] text-zinc-400">Tốc độ</span>
              </button>

              {/* Tab 2: Voice */}
              <button
                onClick={() => setActiveSettingTab(activeSettingTab === 'voice' ? null : 'voice')}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer ${
                  activeSettingTab === 'voice'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'bg-zinc-800/70 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50'
                }`}
                title="Chọn giọng đọc"
              >
                <Mic className="w-4.5 h-4.5 mb-1" />
                <span className="text-[11px] font-bold truncate max-w-[68px]">
                  {allVoices.find(v => v.id === settings.voiceURI)?.name.split(' ')[0] || 'Giọng đọc'}
                </span>
                <span className="text-[9px] text-zinc-400">Giọng đọc</span>
              </button>

              {/* Tab 3: Ambient */}
              <button
                onClick={() => setActiveSettingTab(activeSettingTab === 'ambient' ? null : 'ambient')}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer relative ${
                  activeSettingTab === 'ambient'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'bg-zinc-800/70 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50'
                }`}
                title="Âm nền thư giãn"
              >
                {ambientType !== 'off' && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
                <CloudRain className="w-4.5 h-4.5 mb-1" />
                <span className="text-[11px] font-bold">
                  {ambientType !== 'off' ? `${Math.round(ambientVolume * 100)}%` : 'Tắt'}
                </span>
                <span className="text-[9px] text-zinc-400">Âm nền</span>
              </button>

              {/* Tab 4: Sleep Timer */}
              <button
                onClick={() => setActiveSettingTab(activeSettingTab === 'timer' ? null : 'timer')}
                className={`flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all cursor-pointer relative ${
                  activeSettingTab === 'timer'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                    : 'bg-zinc-800/70 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border border-zinc-700/50'
                }`}
                title="Hẹn giờ tắt"
              >
                {countdownSeconds !== null && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                )}
                <Timer className="w-4.5 h-4.5 mb-1" />
                <span className="text-[11px] font-bold">
                  {countdownSeconds !== null ? formatCountdown(countdownSeconds) : 'Tắt'}
                </span>
                <span className="text-[9px] text-zinc-400">Hẹn giờ</span>
              </button>
            </div>

            {/* Collapsible Setting Detail Drawer */}
            {activeSettingTab && (
              <div className="w-full bg-zinc-950/70 border border-zinc-800 rounded-2xl p-4 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
                {/* Drawer Header */}
                <div className="flex items-center justify-between border-b border-zinc-800/80 pb-2.5">
                  <span className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    {activeSettingTab === 'speed' && <><Gauge className="w-4 h-4" /> Tốc độ đọc audio ({settings.rate}x)</>}
                    {activeSettingTab === 'voice' && <><Mic className="w-4 h-4" /> Giọng đọc Audio</>}
                    {activeSettingTab === 'ambient' && <><CloudRain className="w-4 h-4" /> Âm nền thư giãn</>}
                    {activeSettingTab === 'timer' && <><Timer className="w-4 h-4" /> Hẹn giờ tắt & Lắc máy gia hạn</>}
                  </span>
                  <button
                    onClick={() => setActiveSettingTab(null)}
                    className="p-1 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 cursor-pointer"
                    title="Đóng bảng cài đặt"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Speed Details */}
                {activeSettingTab === 'speed' && (
                  <div className="space-y-3">
                    <input
                      type="range"
                      min="0.5"
                      max="4.0"
                      step="0.1"
                      value={settings.rate || 1.0}
                      onChange={(e) => {
                        const rate = parseFloat(e.target.value);
                        onUpdateSettings({ rate });
                        ttsEngine.updateSettings({ rate });
                      }}
                      className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                    />
                    <div className="grid grid-cols-5 gap-1.5">
                      {[0.8, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 3.0, 4.0].map((rate) => (
                        <button
                          key={rate}
                          onClick={() => {
                            onUpdateSettings({ rate });
                            ttsEngine.updateSettings({ rate });
                          }}
                          className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                            settings.rate === rate
                              ? 'bg-amber-500 text-zinc-950 font-bold shadow-sm'
                              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                          }`}
                        >
                          {rate}x
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Voice Details */}
                {activeSettingTab === 'voice' && (
                  <div className="space-y-2">
                    <select
                      value={settings.voiceURI || 'edge:vi-VN-NamMinhNeural'}
                      onChange={(e) => {
                        const voiceURI = e.target.value;
                        const v = allVoices.find(x => x.id === voiceURI);
                        onUpdateSettings({ voiceURI, engine: v?.category });
                        ttsEngine.updateSettings({ voiceURI, engine: v?.category });
                      }}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                    >
                      {allVoices.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} • {v.badge}
                        </option>
                      ))}
                    </select>
                    <p className="text-[11px] text-zinc-400">
                      Hỗ trợ giọng AI Edge chất lượng cao và giọng máy Android đọc 100% không cần mạng.
                    </p>
                  </div>
                )}

                {/* Ambient Details */}
                {activeSettingTab === 'ambient' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-5 gap-1.5">
                      {AMBIENT_SOUND_OPTIONS.map((opt) => (
                        <button
                          key={opt.id}
                          onClick={() => {
                            setAmbientType(opt.id);
                            ambientAudioService.setSound(opt.id);
                          }}
                          className={`py-2 px-1 rounded-lg text-[10px] font-medium transition-all cursor-pointer text-center ${
                            ambientType === opt.id
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          <span className="truncate">{opt.name}</span>
                        </button>
                      ))}
                    </div>
                    {ambientType !== 'off' && (
                      <div className="space-y-1.5 pt-1">
                        <div className="flex justify-between text-[11px] text-zinc-400">
                          <span>Âm lượng âm nền</span>
                          <span className="text-amber-400 font-semibold">{Math.round(ambientVolume * 100)}%</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.05"
                          value={ambientVolume}
                          onChange={(e) => {
                            const v = parseFloat(e.target.value);
                            setAmbientVolume(v);
                            ambientAudioService.setVolume(v);
                          }}
                          className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Sleep Timer Details */}
                {activeSettingTab === 'timer' && (
                  <div className="space-y-3">
                    <div className="grid grid-cols-4 gap-1.5">
                      {[15, 30, 45, null].map((mins, idx) => (
                        <button
                          key={idx}
                          onClick={() => {
                            onUpdateSettings({ sleepTimerMinutes: mins });
                            ttsEngine.setSleepTimer(mins);
                          }}
                          className={`py-2 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                            settings.sleepTimerMinutes === mins
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold'
                              : 'bg-zinc-800 text-zinc-400 hover:text-zinc-200'
                          }`}
                        >
                          {mins ? `${mins} phút` : 'Không hẹn'}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-zinc-400 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
                      <span className="flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5 text-amber-400" /> Lắc nhẹ máy gia hạn thêm 15 phút
                      </span>
                      <span className="font-semibold text-amber-400">
                        {countdownSeconds !== null ? formatCountdown(countdownSeconds) : 'Đang tắt'}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 1-Click Offline Audio Download Button */}
            {storyId && (
              <div className="w-full pt-1">
                <button
                  disabled={isDownloading || totalSentences === 0}
                  onClick={handleDownloadAudio}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-zinc-800/80 hover:bg-zinc-700 active:scale-98 border border-zinc-700 text-xs text-zinc-200 font-medium transition-all cursor-pointer disabled:opacity-50"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span>Đang tải audio ({downloadProgress ? `${downloadProgress.done}/${downloadProgress.total}` : '...'})</span>
                    </>
                  ) : (
                    <>
                      <Download className="w-3.5 h-3.5 text-amber-400" />
                      <span>Tải Audio ngoại tuyến cả chương ({totalSentences} câu)</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* Safe bottom spacer for Android gesture navigation */}
            <div className="w-full h-6 sm:h-2 shrink-0 pb-[env(safe-area-inset-bottom,0px)]" />
          </div>
        </div>
      )}
    </>
  );
};
