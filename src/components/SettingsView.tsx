import React, { useRef, useState, useEffect } from 'react';
import { 
  Download, 
  Upload, 
  Trash2, 
  Volume2, 
  Sparkles, 
  Type, 
  Cloud, 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Play, 
  Loader2, 
  User,
  Zap,
  QrCode,
  Share2,
  SpellCheck,
  CloudRain,
  Plus,
  Lock
} from 'lucide-react';
import { db } from '../services/db';
import { supabaseSync, type SupabaseConfig } from '../services/sync/supabaseSync';
import { ttsEngine, type VoiceOption } from '../services/tts/ttsEngine';
import { pronunciationService, type PronunciationRule } from '../services/tts/pronunciation';
import { ambientAudioService, AMBIENT_SOUND_OPTIONS, type AmbientSoundType } from '../services/tts/ambientAudio';
import { appUpdater, type UpdateState } from '../services/appUpdater';
import { UpdateModal } from './UpdateModal';
import type { ReaderSettings, TTSSettings } from '../types';

interface SettingsViewProps {
  readerSettings: ReaderSettings;
  onUpdateReaderSettings: (settings: Partial<ReaderSettings>) => void;
  ttsSettings: TTSSettings;
  onUpdateTtsSettings: (settings: Partial<TTSSettings>) => void;
  onLibraryReload: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  readerSettings,
  onUpdateReaderSettings,
  ttsSettings,
  onUpdateTtsSettings,
  onLibraryReload
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Cloud Sync state
  const [cloudConfig, setCloudConfig] = useState<SupabaseConfig>(supabaseSync.getConfig());
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatusMsg, setSyncStatusMsg] = useState<string | null>(null);
  const [showSqlGuide, setShowSqlGuide] = useState(false);
  const [copiedSql, setCopiedSql] = useState(false);

  // 1-Click Quick Pairing state
  const [pairingInputCode, setPairingInputCode] = useState('');
  const [isApplyingPairing, setIsApplyingPairing] = useState(false);
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [copiedPairingCode, setCopiedPairingCode] = useState(false);
  const [pairingMessage, setPairingMessage] = useState<{ success: boolean; message: string } | null>(null);
  const [showManualCloudConfig, setShowManualCloudConfig] = useState(false);

  // TTS Voice state
  const [testingVoiceId, setTestingVoiceId] = useState<string | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);

  // Pronunciation Dictionary state
  const [pronRules, setPronRules] = useState<PronunciationRule[]>([]);
  const [newPattern, setNewPattern] = useState('');
  const [newReplacement, setNewReplacement] = useState('');
  const [showAddRule, setShowAddRule] = useState(false);

  // Ambient sound state
  const [ambientType, setAmbientType] = useState<AmbientSoundType>(ambientAudioService.getType());
  const [ambientVol, setAmbientVol] = useState<number>(ambientAudioService.getVolume());
  const [clearedAudioMsg, setClearedAudioMsg] = useState<string | null>(null);

  // In-App Auto Update state
  const [updateState, setUpdateState] = useState<UpdateState>(() => appUpdater.getState());
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateCheckMsg, setUpdateCheckMsg] = useState<string | null>(null);

  // Collapsible accordion sections state (collapsed by default for clean view)
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const expandAll = () => {
    setOpenSections({
      cloud: true,
      backup: true,
      appearance: true,
      audio: true,
      ambient: true,
      dictionary: true,
      update: true,
      storage: true
    });
  };

  const collapseAll = () => {
    setOpenSections({});
  };

  useEffect(() => {
    supabaseSync.init().then(() => {
      setCloudConfig(supabaseSync.getConfig());
    });

    pronunciationService.init().then((rules) => {
      setPronRules(rules);
    });

    setVoices(ttsEngine.getAllAvailableVoices());
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.onvoiceschanged = () => {
        setVoices(ttsEngine.getAllAvailableVoices());
      };
    }

    const unsubUpdater = appUpdater.subscribe((st) => {
      setUpdateState({ ...st });
    });

    return () => {
      unsubUpdater();
    };
  }, []);

  const handleCheckUpdate = async () => {
    setUpdateCheckMsg(null);
    const res = await appUpdater.checkForUpdates(true);
    if (res.hasUpdate) {
      setIsUpdateModalOpen(true);
    } else if (res.error) {
      setUpdateCheckMsg(res.error);
    } else {
      setUpdateCheckMsg(`Bạn đang dùng phiên bản mới nhất (${res.currentVersion.versionName})!`);
      setTimeout(() => setUpdateCheckMsg(null), 4000);
    }
  };

  const handleAddRule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPattern.trim() || !newReplacement.trim()) return;
    const updated = await pronunciationService.saveRule({
      pattern: newPattern.trim(),
      replacement: newReplacement.trim(),
      enabled: true
    });
    setPronRules(updated);
    setNewPattern('');
    setNewReplacement('');
    setShowAddRule(false);
  };

  const handleToggleRule = async (id: string) => {
    const updated = await pronunciationService.toggleRule(id);
    setPronRules(updated);
  };

  const handleDeleteRule = async (id: string) => {
    const updated = await pronunciationService.deleteRule(id);
    setPronRules(updated);
  };

  const handleResetRules = async () => {
    const updated = await pronunciationService.resetDefaults();
    setPronRules(updated);
  };

  const handleClearAudioCache = async () => {
    try {
      await db.offlineAudioCache.clear();
      setClearedAudioMsg('Đã giải phóng bộ nhớ Cache Audio!');
      setTimeout(() => setClearedAudioMsg(null), 3000);
    } catch {
      setClearedAudioMsg('Lỗi khi xóa cache.');
    }
  };

  const handleTestVoice = async (voiceId: string) => {
    if (testingVoiceId) return;
    setTestingVoiceId(voiceId);
    try {
      await ttsEngine.testVoice(voiceId);
    } catch (e) {
      console.warn('Test voice error:', e);
    } finally {
      setTestingVoiceId(null);
    }
  };

  const handleApplyPairing = async () => {
    if (!pairingInputCode.trim()) return;
    setIsApplyingPairing(true);
    setPairingMessage(null);
    try {
      const res = await supabaseSync.applyPairingCode(pairingInputCode.trim());
      setPairingMessage(res);
      if (res.success) {
        setCloudConfig(supabaseSync.getConfig());
        onLibraryReload();
      }
    } finally {
      setIsApplyingPairing(false);
    }
  };

  const currentPairingCode = supabaseSync.generatePairingCode();

  const handleCopyPairingCode = () => {
    if (!currentPairingCode) return;
    navigator.clipboard.writeText(currentPairingCode);
    setCopiedPairingCode(true);
    setTimeout(() => setCopiedPairingCode(false), 2500);
  };

  const handleTestConnection = async () => {
    if (!cloudConfig.url || !cloudConfig.anonKey) {
      setTestResult({ success: false, message: 'Vui lòng nhập đầy đủ Supabase URL và Anon Key.' });
      return;
    }
    setIsTesting(true);
    setTestResult(null);
    try {
      const res = await supabaseSync.testConnection(cloudConfig.url, cloudConfig.anonKey);
      setTestResult(res);
      if (res.success) {
        const newCfg = { ...cloudConfig, enabled: true };
        await supabaseSync.updateConfig(newCfg);
        setCloudConfig(newCfg);
      }
    } finally {
      setIsTesting(false);
    }
  };

  const handleSaveCloudConfig = async () => {
    if (!cloudConfig.url || !cloudConfig.anonKey) {
      alert('Vui lòng nhập Supabase Project URL và Anon Key.');
      return;
    }
    const newCfg = { ...cloudConfig, enabled: true };
    await supabaseSync.updateConfig(newCfg);
    setCloudConfig(newCfg);
    alert('Đã lưu cấu hình Cloud thành công!');
  };

  const handleSyncNow = async () => {
    if (!cloudConfig.url || !cloudConfig.anonKey) {
      alert('Vui lòng nhập Supabase Project URL và Anon Key trước khi đồng bộ.');
      return;
    }

    setIsSyncing(true);
    setSyncStatusMsg(null);
    try {
      if (!supabaseSync.isConnected()) {
        const newCfg = { ...cloudConfig, enabled: true };
        await supabaseSync.updateConfig(newCfg);
        setCloudConfig(newCfg);
      }
      const result = await supabaseSync.syncAll();
      setSyncStatusMsg(`Đồng bộ thành công! (Tải lên: ${result.pushed} mục, Kéo về: ${result.pulled} mục)`);
      onLibraryReload();
    } catch (err: any) {
      console.error('Sync error:', err);
      setSyncStatusMsg(`Lỗi đồng bộ: ${err?.message || 'Không thể đồng bộ'}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // Export full library backup (JSON)
  const handleExportBackup = async () => {
    try {
      const stories = await db.stories.toArray();
      const chapters = await db.chapters.toArray();
      const backupData = {
        app: 'ChillReader',
        version: '1.0',
        exportedAt: new Date().toISOString(),
        stories,
        chapters,
        readerSettings,
        ttsSettings
      };

      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `chill_reader_backup_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export error:', err);
      alert('Có lỗi xảy ra khi sao lưu dữ liệu.');
    }
  };

  // Import library backup (JSON)
  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);

      if (data.app !== 'ChillReader' || !Array.isArray(data.stories) || !Array.isArray(data.chapters)) {
        throw new Error('File sao lưu không hợp lệ của Chill Reader.');
      }

      await db.transaction('rw', db.stories, db.chapters, async () => {
        await db.stories.bulkPut(data.stories);
        await db.chapters.bulkPut(data.chapters);
      });

      alert(`Đã khôi phục thành công ${data.stories.length} bộ truyện!`);
      onLibraryReload();
    } catch (err: any) {
      console.error('Import error:', err);
      alert(err?.message || 'Lỗi khi khôi phục dữ liệu.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleClearAll = async () => {
    if (confirm('Bạn có chắc chắn muốn xóa TOÀN BỘ tủ sách và dữ liệu đọc trên thiết bị này?')) {
      await db.stories.clear();
      await db.chapters.clear();
      alert('Đã xóa toàn bộ tủ sách.');
      onLibraryReload();
    }
  };

  const sqlSchemaText = `-- 1. Bảng lưu tủ truyện và tiến độ đọc đồng bộ đa thiết bị
create table if not exists user_stories (
  id text primary key,
  user_id text not null,
  title text not null,
  author text,
  cover_url text,
  description text,
  total_chapters int default 1,
  current_chapter_number int default 1,
  current_progress_percent float default 0,
  current_sentence_index int default 0,
  source text,
  source_url text,
  is_favorite boolean default false,
  last_read_at bigint,
  created_at bigint
);

-- Bổ sung cột source_url nếu bảng user_stories đã được tạo trước đó
alter table user_stories add column if not exists source_url text;

-- 2. Bảng lưu nội dung chữ của các chương truyện
create table if not exists user_chapters (
  id text primary key,
  story_id text not null references user_stories(id) on delete cascade,
  chapter_number int not null,
  title text,
  content text,
  word_count int default 0,
  source_url text,
  created_at bigint
);

-- 3. Phân quyền bảo mật RLS để bạn dùng cá nhân qua Anon Key đơn giản nhất
alter table user_stories enable row level security;
drop policy if exists "Allow all personal operations on stories" on user_stories;
create policy "Allow all personal operations on stories" on user_stories for all using (true);

alter table user_chapters enable row level security;
drop policy if exists "Allow all personal operations on chapters" on user_chapters;
create policy "Allow all personal operations on chapters" on user_chapters for all using (true);`;

  const copySqlToClipboard = () => {
    navigator.clipboard.writeText(sqlSchemaText);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2000);
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      <div className="border-b border-zinc-800 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-zinc-100 flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg overflow-hidden bg-white p-0.5 border border-zinc-700/60 shadow-sm shrink-0 flex items-center justify-center">
              <img src="/icon-192.png" alt="NKI Chill Reader" className="w-full h-full object-contain" />
            </div>
            Cài đặt & Đồng bộ cá nhân
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Quản lý đồng bộ Cloud, cấu hình đọc, bộ đọc giọng nói và chuyển đổi dữ liệu giữa các thiết bị
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={expandAll}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium transition-colors cursor-pointer border border-zinc-700/60"
          >
            Mở tất cả
          </button>
          <button
            type="button"
            onClick={collapseAll}
            className="px-3 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-xs text-zinc-300 font-medium transition-colors cursor-pointer border border-zinc-700/60"
          >
            Thu gọn tất cả
          </button>
        </div>
      </div>

      {/* 1. CLOUD SYNC (SUPABASE) CARD */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('cloud')}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Cloud className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm text-zinc-100">Đồng bộ Online (Supabase Cloud)</h3>
                {supabaseSync.isConnected() || (cloudConfig.enabled && Boolean(cloudConfig.url && cloudConfig.anonKey)) ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1 font-medium">
                    <CheckCircle2 className="w-3 h-3" /> Đã kết nối
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium">
                    Chưa kích hoạt
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                Tự động đồng bộ chương và câu đang đọc dở giữa Máy tính (Web) và Điện thoại (App Android)
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-3">
            <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${openSections.cloud ? 'rotate-180 text-amber-400' : ''}`} />
          </div>
        </button>

        {openSections.cloud && (
          <div className="p-5 pt-0 border-t border-zinc-800/80 space-y-5 animate-in fade-in duration-200">
            <div className="flex items-center justify-end pt-4">
              <button
                onClick={handleSyncNow}
                disabled={isSyncing}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-zinc-950 font-semibold text-xs transition-all cursor-pointer shrink-0 shadow-md shadow-amber-500/20"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Đang đồng bộ...' : 'Đồng bộ ngay'}
              </button>
            </div>

        {syncStatusMsg && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-amber-400" />
            <span>{syncStatusMsg}</span>
          </div>
        )}

        {/* 1-Click Quick Pairing Section */}
        {supabaseSync.isConnected() ? (
          <div className="bg-gradient-to-r from-amber-500/10 via-zinc-800/80 to-zinc-900 border border-amber-500/25 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h4 className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wide">
                  <Share2 className="w-4 h-4 text-amber-400" />
                  Ghép nối với điện thoại / máy khác (1-chạm)
                </h4>
                <p className="text-xs text-zinc-300 mt-1">
                  Không cần nhập URL hay Key rườm rà. Lấy mã hoặc quét QR để app trên điện thoại tự đồng bộ tức thì.
                </p>
              </div>

              <button
                onClick={() => setShowPairingModal(!showPairingModal)}
                className="flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 text-zinc-950 font-bold text-xs transition-all shrink-0 cursor-pointer shadow-md shadow-amber-500/20"
              >
                <QrCode className="w-4 h-4" />
                {showPairingModal ? 'Đóng mã ghép nối' : 'Lấy mã ghép nối'}
              </button>
            </div>

            {showPairingModal && currentPairingCode && (
              <div className="mt-3 pt-3 border-t border-zinc-700/60 flex flex-col md:flex-row items-center gap-5 p-2 bg-zinc-950/60 rounded-xl">
                {/* QR Code image */}
                <div className="w-36 h-36 bg-white p-2 rounded-xl shrink-0 shadow-lg flex items-center justify-center">
                  <img
                    src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(currentPairingCode)}`}
                    alt="Mã QR Ghép nối Chill Reader"
                    className="w-full h-full object-contain"
                  />
                </div>

                <div className="space-y-2 flex-1 min-w-0 w-full">
                  <label className="text-xs text-zinc-400 block font-medium">
                    Mã ghép nối 1-chạm (Copy gửi qua Zalo / Note vào điện thoại):
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={currentPairingCode}
                      className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-[11px] text-zinc-300 font-mono select-all truncate"
                    />
                    <button
                      onClick={handleCopyPairingCode}
                      className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs transition-all shrink-0 cursor-pointer shadow-sm"
                    >
                      {copiedPairingCode ? <Check className="w-4 h-4 text-emerald-950" /> : <Copy className="w-4 h-4" />}
                      {copiedPairingCode ? 'Đã chép!' : 'Sao chép'}
                    </button>
                  </div>
                  <p className="text-[11px] text-zinc-400 leading-relaxed">
                    👉 Trên điện thoại, bạn chỉ cần mở <strong>Cài đặt</strong> và dán mã này vào là app tự kết nối và đồng bộ toàn bộ tủ truyện ngay!
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-gradient-to-r from-amber-500/15 via-zinc-800 to-zinc-900 border border-amber-500/30 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wide">
              <Zap className="w-4 h-4 text-amber-400" />
              Ghép nối nhanh 1-chạm từ máy tính (Khuyên dùng)
            </div>
            <p className="text-xs text-zinc-300 leading-relaxed">
              Nếu bạn đã có cấu hình trên máy tính, chỉ cần dán mã ghép nối vào đây để app tự động kết nối và tải toàn bộ sách về:
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                value={pairingInputCode}
                onChange={(e) => setPairingInputCode(e.target.value)}
                placeholder="Dán mã CRSYNC:... vào đây"
                className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500 font-mono"
              />
              <button
                onClick={handleApplyPairing}
                disabled={isApplyingPairing || !pairingInputCode.trim()}
                className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-95 disabled:opacity-50 text-zinc-950 font-bold text-xs transition-all cursor-pointer shrink-0 shadow-md shadow-amber-500/20"
              >
                {isApplyingPairing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                {isApplyingPairing ? 'Đang ghép...' : 'Ghép nối ngay'}
              </button>
            </div>
            {pairingMessage && (
              <div className={`p-2.5 rounded-lg text-xs flex items-center gap-2 ${
                pairingMessage.success ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30' : 'bg-red-500/10 text-red-300 border border-red-500/30'
              }`}>
                {pairingMessage.success ? <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" /> : <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />}
                <span>{pairingMessage.message}</span>
              </div>
            )}
          </div>
        )}

        {/* Auto Sync Toggle */}
        <div className="flex items-center gap-2 pt-1 border-t border-zinc-800/80">
          <input
            type="checkbox"
            id="autoSyncToggle"
            checked={cloudConfig.autoSync}
            onChange={(e) => {
              const val = e.target.checked;
              setCloudConfig(prev => ({ ...prev, autoSync: val }));
              supabaseSync.updateConfig({ autoSync: val });
            }}
            className="w-4 h-4 accent-amber-500 rounded cursor-pointer"
          />
          <label htmlFor="autoSyncToggle" className="text-xs text-zinc-300 cursor-pointer">
            <strong>Tự động đồng bộ ngầm:</strong> Tự đồng bộ tủ sách khi mở app, chuyển chương hoặc đổi thiết bị (không cần bấm nút thủ công)
          </label>
        </div>

        {/* Manual Advanced Configuration (Collapsible) */}
        <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40">
          <button
            onClick={() => setShowManualCloudConfig(!showManualCloudConfig)}
            className="w-full flex items-center justify-between p-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <span className="flex items-center gap-1.5 font-medium">
              ⚙️ Cấu hình Supabase thủ công (Dành cho nhà phát triển)
            </span>
            {showManualCloudConfig ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showManualCloudConfig && (
            <div className="p-4 border-t border-zinc-800 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Supabase Project URL
                  </label>
                  <input
                    type="text"
                    value={cloudConfig.url}
                    onChange={(e) => setCloudConfig(prev => ({ ...prev, url: e.target.value.trim() }))}
                    placeholder="https://xxxxxxxx.supabase.co"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>

                <div>
                  <label className="text-xs text-zinc-400 block mb-1">
                    Supabase Anon Key (Public Key)
                  </label>
                  <input
                    type="password"
                    value={cloudConfig.anonKey}
                    onChange={(e) => setCloudConfig(prev => ({ ...prev, anonKey: e.target.value.trim() }))}
                    placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6..."
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={isTesting}
                  className="px-3.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 text-xs font-medium transition-colors cursor-pointer"
                >
                  {isTesting ? 'Đang thử...' : 'Kiểm tra kết nối'}
                </button>
                <button
                  onClick={handleSaveCloudConfig}
                  className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-bold transition-colors cursor-pointer"
                >
                  Lưu cấu hình
                </button>
              </div>

              {testResult && (
                <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                  testResult.success 
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300' 
                    : 'bg-red-500/10 border-red-500/30 text-red-300'
                }`}>
                  {testResult.success ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                  <span>{testResult.message}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Collapsible SQL Schema Guide */}
        <div className="border border-zinc-800 rounded-xl overflow-hidden bg-zinc-950/40">
          <button
            onClick={() => setShowSqlGuide(!showSqlGuide)}
            className="w-full flex items-center justify-between p-3 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <span className="flex items-center gap-1.5 font-medium">
              💡 Hướng dẫn tạo bảng Supabase miễn phí (1 phút)
            </span>
            {showSqlGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showSqlGuide && (
            <div className="p-4 border-t border-zinc-800 space-y-3 text-xs text-zinc-300">
              <ol className="list-decimal list-inside space-y-1 text-zinc-400">
                <li>Truy cập <a href="https://supabase.com" target="_blank" rel="noreferrer" className="text-amber-400 underline">supabase.com</a> và tạo một Project miễn phí.</li>
                <li>Vào mục <strong>SQL Editor</strong> ở thanh menu bên trái.</li>
                <li>Dán đoạn mã SQL bên dưới rồi bấm <strong>Run</strong>:</li>
              </ol>

              <div className="relative">
                <pre className="bg-zinc-900 border border-zinc-800 rounded-lg p-3 text-[11px] font-mono text-zinc-300 overflow-x-auto">
                  {sqlSchemaText}
                </pre>
                <button
                  onClick={copySqlToClipboard}
                  className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] border border-zinc-700 transition-all"
                >
                  {copiedSql ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  {copiedSql ? 'Đã copy' : 'Sao chép'}
                </button>
              </div>

              <p className="text-[11px] text-zinc-500">
                Vào <strong>Project Settings &gt; API</strong> để lấy <code>Project URL</code> và <code>anon public key</code> điền vào 2 ô ở trên.
              </p>
            </div>
          )}
        </div>
      </div>
    )}
  </div>

      {/* 2. MANUAL BACKUP & RESTORE (OFFLINE FILE) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('backup')}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <Download className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm text-zinc-100">Sao lưu & Khôi phục Ngoại tuyến</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium">
                  File JSON
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                Xuất file lưu trữ toàn bộ tủ sách hoặc khôi phục dữ liệu ngoại tuyến
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${openSections.backup ? 'rotate-180 text-amber-400' : ''}`} />
          </div>
        </button>

        {openSections.backup && (
          <div className="p-5 pt-0 border-t border-zinc-800/80 space-y-4 animate-in fade-in duration-200">
            <p className="text-xs text-zinc-300 leading-relaxed pt-3">
              Nếu không muốn dùng Cloud, bạn có thể xuất toàn bộ sách và tiến độ đọc ra file <code className="text-amber-400 font-mono">.json</code> nhẹ tênh để lưu trữ hoặc gửi qua Zalo/Drive nạp vào máy khác.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleExportBackup}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-zinc-950 font-semibold text-xs shadow-md shadow-amber-500/20 transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                Xuất file sao lưu tủ sách (Backup JSON)
              </button>

              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 font-medium text-xs transition-all cursor-pointer"
              >
                <Upload className="w-4 h-4 text-amber-400" />
                Khôi phục từ file sao lưu
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={handleImportBackup}
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. READER APPEARANCE DEFAULTS */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('appearance')}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <Type className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm text-zinc-100">Giao diện đọc mặc định</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 border border-zinc-700 font-medium capitalize">
                  {readerSettings.theme} • {readerSettings.fontFamily}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                Tùy chỉnh màu nền Sepia, Dark, AMOLED và phông chữ đọc tiểu thuyết
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${openSections.appearance ? 'rotate-180 text-amber-400' : ''}`} />
          </div>
        </button>

        {openSections.appearance && (
          <div className="p-5 pt-0 border-t border-zinc-800/80 space-y-4 animate-in fade-in duration-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3">
              <div>
                <label className="text-xs text-zinc-400 block mb-1">Màu nền ưa thích</label>
                <select
                  value={readerSettings.theme}
                  onChange={(e) => onUpdateReaderSettings({ theme: e.target.value as any })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="sepia">Vàng giấy Sepia (Bảo vệ mắt)</option>
                  <option value="dark">Ban đêm Dark (Dịu nhẹ)</option>
                  <option value="amoled">OLED Đen kịt (Tiết kiệm pin)</option>
                  <option value="light">Sáng trắng cổ điển</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-zinc-400 block mb-1">Kiểu phông chữ</label>
                <select
                  value={readerSettings.fontFamily}
                  onChange={(e) => onUpdateReaderSettings({ fontFamily: e.target.value as any })}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="lora">Lora (Chữ có chân tiểu thuyết)</option>
                  <option value="merriweather">Merriweather (Sách báo)</option>
                  <option value="sans">Không chân (Hiện đại, dễ đọc)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. TTS AUDIO & VOICE SETTINGS */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('audio')}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 shrink-0">
              <Volume2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm text-zinc-100">Cấu hình Giọng đọc Audio (TTS)</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium truncate max-w-[130px]">
                  {ttsSettings.voiceURI?.replace('edge:vi-VN-', '').replace('google:vi', 'Google') || 'Nam Minh'}
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                Tốc độ {ttsSettings.rate}x • Cao độ {ttsSettings.pitch} • Giọng AI Neural & Native Android
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${openSections.audio ? 'rotate-180 text-amber-400' : ''}`} />
          </div>
        </button>

        {openSections.audio && (
          <div className="p-5 pt-0 border-t border-zinc-800/80 space-y-5 animate-in fade-in duration-200">
            <p className="text-xs text-zinc-400 pt-3">
              Hỗ trợ giọng AI Neural truyền cảm tự nhiên, giọng Google và giọng có sẵn trên thiết bị
            </p>

        {/* Voice Selector with preview */}
        <div className="space-y-3">
          <label className="text-xs font-semibold text-zinc-300 block">
            Chọn giọng đọc ưa thích:
          </label>

          <div className="space-y-2">
            {voices.map((v) => {
              const isSelected = (ttsSettings.voiceURI || 'edge:vi-VN-NamMinhNeural') === v.id;
              const isTesting = testingVoiceId === v.id;

              return (
                <div
                  key={v.id}
                  onClick={() => {
                    onUpdateTtsSettings({ voiceURI: v.id, engine: v.category });
                    ttsEngine.updateSettings({ voiceURI: v.id, engine: v.category });
                  }}
                  className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                    isSelected
                      ? 'bg-amber-500/10 border-amber-500/50 shadow-sm'
                      : 'bg-zinc-800/50 border-zinc-700/60 hover:bg-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isSelected 
                        ? 'bg-amber-500 text-zinc-950 font-bold' 
                        : 'bg-zinc-700 text-zinc-300'
                    }`}>
                      <User className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs font-bold ${isSelected ? 'text-amber-300' : 'text-zinc-200'}`}>
                          {v.name}
                        </span>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                          v.category === 'ai' 
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : v.category === 'google'
                            ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                            : v.category === 'native'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-semibold'
                            : 'bg-zinc-700 text-zinc-300'
                        }`}>
                          {v.badge}
                        </span>
                      </div>
                      <p className="text-[11px] text-zinc-400 mt-0.5 line-clamp-1">
                        {v.description}
                      </p>
                    </div>
                  </div>

                  {/* Audition / Test Button */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleTestVoice(v.id);
                    }}
                    disabled={isTesting}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                      isTesting
                        ? 'bg-amber-500 text-zinc-950'
                        : isSelected
                        ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500 hover:text-zinc-950'
                        : 'bg-zinc-700 hover:bg-zinc-600 text-zinc-200'
                    }`}
                  >
                    {isTesting ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Đang phát...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Nghe thử
                      </>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        {/* Speed, Pitch, and Behavior Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <div className="flex justify-between items-center text-xs text-zinc-400 mb-1.5">
              <span>Tốc độ đọc (0.5x - 4.0x)</span>
              <span className="font-bold text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                {ttsSettings.rate || 1.0}x
              </span>
            </div>
            <input
              type="range"
              min="0.5"
              max="4.0"
              step="0.1"
              value={ttsSettings.rate || 1.0}
              onChange={(e) => {
                const rate = parseFloat(e.target.value);
                onUpdateTtsSettings({ rate });
                ttsEngine.updateSettings({ rate });
              }}
              className="w-full h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500 mb-2.5"
            />
            <div className="grid grid-cols-5 gap-1.5">
              {[0.8, 1.0, 1.25, 1.5, 1.75, 2.0, 2.25, 2.5, 3.0, 4.0].map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => {
                    onUpdateTtsSettings({ rate });
                    ttsEngine.updateSettings({ rate });
                  }}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    (ttsSettings.rate || 1.0) === rate
                      ? 'bg-amber-500 text-zinc-950 font-bold shadow-sm'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {rate}x
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="flex justify-between text-xs text-zinc-400 mb-1.5">
              <span>Cao độ giọng (Pitch)</span>
              <span className="font-bold text-amber-400">
                {(ttsSettings.pitch || 1.0) < 1.0 ? 'Trầm' : (ttsSettings.pitch || 1.0) > 1.0 ? 'Cao' : 'Chuẩn'}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { label: 'Trầm ấm', val: 0.9 },
                { label: 'Chuẩn', val: 1.0 },
                { label: 'Trong trẻo', val: 1.1 }
              ].map((p) => (
                <button
                  key={p.val}
                  type="button"
                  onClick={() => {
                    onUpdateTtsSettings({ pitch: p.val });
                    ttsEngine.updateSettings({ pitch: p.val });
                  }}
                  className={`py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    (ttsSettings.pitch || 1.0) === p.val
                      ? 'bg-amber-500 text-zinc-950 font-bold shadow-sm'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Feature Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-zinc-800/80">
          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={ttsSettings.autoNextChapter}
              onChange={(e) => {
                onUpdateTtsSettings({ autoNextChapter: e.target.checked });
                ttsEngine.updateSettings({ autoNextChapter: e.target.checked });
              }}
              className="w-4 h-4 accent-amber-500 rounded"
            />
            <span>Tự động chuyển chương khi nghe xong</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none text-xs text-zinc-300">
            <input
              type="checkbox"
              checked={ttsSettings.highlightSentence !== false}
              onChange={(e) => {
                onUpdateTtsSettings({ highlightSentence: e.target.checked });
                ttsEngine.updateSettings({ highlightSentence: e.target.checked });
              }}
              className="w-4 h-4 accent-amber-500 rounded"
            />
            <span>Bôi sáng câu đang đọc trong văn bản</span>
          </label>

          <label className="flex items-start sm:items-center gap-2.5 cursor-pointer select-none text-xs text-zinc-300 sm:col-span-2 bg-zinc-950/50 p-2.5 rounded-xl border border-amber-500/20 hover:border-amber-500/40 transition-colors">
            <input
              type="checkbox"
              checked={ttsSettings.playAlongOtherApps !== false}
              onChange={(e) => {
                const val = e.target.checked;
                onUpdateTtsSettings({ playAlongOtherApps: val });
                ttsEngine.updateSettings({ playAlongOtherApps: val });
              }}
              className="w-4 h-4 accent-amber-500 rounded mt-0.5 sm:mt-0 shrink-0"
            />
            <div className="min-w-0">
              <span className="font-semibold text-amber-300">Nghe cùng lúc với ứng dụng khác &amp; Game:</span>{' '}
              <span className="text-zinc-400">Đọc truyện xuyên suốt kể cả khi mở game, làm việc hay lướt mạng xã hội. <strong>Luôn ưu tiên nhường cho Chuông báo thức &amp; Cuộc gọi (Điện thoại, Zalo, Instagram, Messenger)</strong> để không bao giờ bị lỡ việc.</span>
            </div>
          </label>
        </div>

        {/* BACKGROUND & LOCK SCREEN PLAYBACK OPTIMIZATION */}
        <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Lock className="w-5 h-5 text-amber-400" />
              <h3 className="font-semibold text-sm text-zinc-100">Phát âm thanh khi khóa màn hình (Màn hình khóa)</h3>
            </div>
            <span className="text-xs text-emerald-400 font-bold bg-emerald-500/10 px-2.5 py-0.5 rounded-full border border-emerald-500/20">
              Foreground Service
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-relaxed">
            Đã kích hoạt <strong>Dịch vụ chạy ngầm ưu tiên (Foreground Media Service)</strong> kèm khóa xung nhịp CPU (WakeLock) và mạng Wi-Fi (WifiLock) giúp nghe truyện trơn tru suốt đêm, không bị tạm dừng khi tắt màn hình và hiển thị đầy đủ bộ điều khiển trên Màn hình khóa của Android.
          </p>

          {typeof window !== 'undefined' && Boolean((window as any).AndroidMedia) && (
            <div className="pt-2 border-t border-zinc-800/80 space-y-3">
              <div className="text-xs text-zinc-300">
                <span className="font-semibold text-amber-300">Cấu hình chạy nền khi tắt màn hình (Fix tắt app trên Tecno / Xiaomi / Samsung):</span>
                <p className="text-zinc-400 mt-1 leading-relaxed">
                  Trên một số dòng máy như <strong>TECNO (HiOS / Power Marathon)</strong>, <strong>Xiaomi (MIUI/HyperOS)</strong> hoặc <strong>Samsung</strong>, hệ điều hành thường tự động đóng ứng dụng khi màn hình tắt lâu. Bạn hãy cấp quyền <em>Không hạn chế</em> theo 2 bước:
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const androidMedia = (window as any).AndroidMedia;
                    if (androidMedia && typeof androidMedia.requestBatteryOptimizationExemption === 'function') {
                      androidMedia.requestBatteryOptimizationExemption();
                    }
                  }}
                  className="px-3.5 py-2 bg-zinc-800 hover:bg-zinc-700 text-amber-400 border border-amber-500/30 rounded-xl text-xs font-semibold transition-all cursor-pointer shadow-xs"
                >
                  1. Bỏ qua Tối ưu pin (Doze Mode)
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const androidMedia = (window as any).AndroidMedia;
                    if (androidMedia && typeof androidMedia.openAppBatterySettings === 'function') {
                      androidMedia.openAppBatterySettings();
                    }
                  }}
                  className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold rounded-xl text-xs transition-all cursor-pointer shadow-sm"
                >
                  2. Cài đặt Pin ứng dụng (Không hạn chế)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )}
  </div>

      {/* 5. AMBIENT BACKGROUND SOUNDS */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden transition-all shadow-sm">
        <button
          type="button"
          onClick={() => toggleSection('ambient')}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
              <CloudRain className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm text-zinc-100">Âm thanh nền thư giãn</h3>
                {ambientType !== 'off' ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium">
                    Đang bật: {Math.round(ambientVol * 100)}%
                  </span>
                ) : (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium">
                    Đang tắt
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                Tự động phối tiếng mưa rơi, củi lửa tí tách hoặc gió rừng trúc cùng giọng đọc truyện
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${openSections.ambient ? 'rotate-180 text-amber-400' : ''}`} />
          </div>
        </button>

        {openSections.ambient && (
          <div className="p-5 pt-0 border-t border-zinc-800/80 space-y-4 animate-in fade-in duration-200">
            <p className="text-xs text-zinc-400 pt-3">
              Tự động phối tiếng mưa rơi, củi lửa tí tách hoặc gió rừng trúc cùng giọng đọc truyện giúp ngủ ngon và thư giãn sâu.
            </p>

            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
              {AMBIENT_SOUND_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => {
                    setAmbientType(opt.id);
                    ambientAudioService.setSound(opt.id);
                  }}
                  className={`p-2.5 rounded-xl border text-xs font-medium transition-all text-left flex flex-col gap-1 cursor-pointer ${
                    ambientType === opt.id
                      ? 'border-amber-500 bg-amber-500/10 text-amber-300 font-bold shadow-xs'
                      : 'border-zinc-800 bg-zinc-950/60 text-zinc-300 hover:border-zinc-700'
                  }`}
                >
                  <span className="font-semibold text-xs">{opt.name}</span>
                  <span className="text-[10px] text-zinc-400 line-clamp-1">{opt.description}</span>
                </button>
              ))}
            </div>

            {ambientType !== 'off' && (
              <div className="space-y-1.5 pt-2 border-t border-zinc-800">
                <div className="flex justify-between text-xs text-zinc-400">
                  <span>Âm lượng âm nền</span>
                  <span className="font-semibold text-zinc-200">{Math.round(ambientVol * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={ambientVol}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    setAmbientVol(v);
                    ambientAudioService.setVolume(v);
                  }}
                  className="w-full h-1.5 bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* 6. PRONUNCIATION DICTIONARY */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => toggleSection('dictionary')}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 shrink-0">
              <SpellCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm text-zinc-100">Từ điển phát âm tuỳ chỉnh (TTS)</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono border border-zinc-700">
                  {pronRules.filter(r => r.enabled).length}/{pronRules.length} từ
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                Tự động sửa các từ viết tắt, từ lóng (ko ➔ không, main ➔ nhân vật chính...)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${openSections.dictionary ? 'rotate-180 text-amber-400' : ''}`} />
          </div>
        </button>

        {openSections.dictionary && (
          <div className="p-5 pt-0 border-t border-zinc-800/80 space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center justify-between pt-3">
              <p className="text-xs text-zinc-400">
                Tự động thay thế các từ viết tắt, từ ngọng (vd: <code className="bg-zinc-800 px-1 py-0.5 rounded text-amber-300">ko</code> ➔ <code className="bg-zinc-800 px-1 py-0.5 rounded text-amber-300">không</code>, <code className="bg-zinc-800 px-1 py-0.5 rounded text-amber-300">main</code> ➔ <code className="bg-zinc-800 px-1 py-0.5 rounded text-amber-300">nhân vật chính</code>) để giọng đọc phát âm chuẩn xác nhất.
              </p>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button
                  onClick={handleResetRules}
                  className="text-[11px] text-zinc-400 hover:text-zinc-200 underline cursor-pointer"
                >
                  Mặc định
                </button>
                <button
                  onClick={() => setShowAddRule(!showAddRule)}
                  className="flex items-center gap-1 px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-lg transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm từ</span>
                </button>
              </div>
            </div>

            {showAddRule && (
              <form onSubmit={handleAddRule} className="p-3 bg-zinc-950 border border-zinc-800 rounded-xl space-y-2.5 animate-in fade-in">
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Từ gốc trong truyện (vd: ad, cv, bl...)"
                    value={newPattern}
                    onChange={(e) => setNewPattern(e.target.value)}
                    required
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                  <input
                    type="text"
                    placeholder="Từ đọc thay thế (vd: admin, dịch, bình luận...)"
                    value={newReplacement}
                    onChange={(e) => setNewReplacement(e.target.value)}
                    required
                    className="bg-zinc-900 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowAddRule(false)}
                    className="px-2.5 py-1 text-xs text-zinc-400 hover:text-zinc-200"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-3 py-1 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-bold text-xs rounded-lg cursor-pointer"
                  >
                    Lưu quy tắc
                  </button>
                </div>
              </form>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1 custom-scrollbar">
              {pronRules.map((r) => (
                <div
                  key={r.id}
                  className={`p-2.5 rounded-xl border flex items-center justify-between text-xs transition-all ${
                    r.enabled
                      ? 'bg-zinc-950/70 border-zinc-800'
                      : 'bg-zinc-950/30 border-zinc-800/40 opacity-50'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <input
                      type="checkbox"
                      checked={r.enabled}
                      onChange={() => handleToggleRule(r.id)}
                      className="w-3.5 h-3.5 accent-amber-500 rounded cursor-pointer"
                    />
                    <span className="font-mono text-zinc-300 font-semibold">{r.pattern.replace(/\\b/g, '')}</span>
                    <span className="text-zinc-500">➔</span>
                    <span className="text-amber-400 font-medium truncate">{r.replacement}</span>
                  </div>
                  <button
                    onClick={() => handleDeleteRule(r.id)}
                    className="text-zinc-500 hover:text-red-400 p-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 7. APP UPDATES (AUTO UPDATE & CHECK FOR UPDATES) */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => toggleSection('update')}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-5 h-5 text-amber-400" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm text-zinc-100">Cập nhật ứng dụng</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono border border-zinc-700">
                  {updateState?.currentVersion?.versionName || '1.0'}
                </span>
                {updateState?.updateAvailable?.hasUpdate && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500 text-zinc-950 font-bold animate-pulse">
                    Có bản mới {updateState.updateAvailable.latestVersion?.versionName}
                  </span>
                )}
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                Kiểm tra và tự động nâng cấp ứng dụng Chill Reader trực tiếp không cần gỡ bản cũ
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${openSections.update ? 'rotate-180 text-amber-400' : ''}`} />
          </div>
        </button>

        {openSections.update && (
          <div className="p-5 pt-0 border-t border-zinc-800/80 space-y-4 animate-in fade-in duration-200">
            <p className="text-xs text-zinc-400 pt-3">
              Kiểm tra và tự động nâng cấp ứng dụng Chill Reader trực tiếp không cần gỡ bản cũ. Tự động kiểm tra file APK từ kho phát hành GitHub.
            </p>

            {/* Status message */}
            {updateCheckMsg && (
              <div className="text-xs p-3 rounded-xl bg-zinc-800/80 border border-zinc-700/60 flex items-center gap-2 text-zinc-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{updateCheckMsg}</span>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {updateState.updateAvailable?.hasUpdate ? (
                <button
                  type="button"
                  onClick={() => setIsUpdateModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 active:scale-98 text-zinc-950 text-xs font-bold transition-all shadow-md shadow-amber-500/20 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>Cập nhật ngay ({updateState.updateAvailable.latestVersion?.versionName})</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={updateState.isChecking}
                  onClick={handleCheckUpdate}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 active:scale-98 text-zinc-200 text-xs font-semibold border border-zinc-700 transition-all cursor-pointer disabled:opacity-50"
                >
                  {updateState.isChecking ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span>Đang kiểm tra...</span>
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 text-amber-400" />
                      <span>Kiểm tra cập nhật</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                onClick={() => {
                  const url = updateState.updateAvailable?.latestVersion?.downloadUrl || 
                    'https://github.com/PrimiasArt/Chill-reader/releases/download/android-apk-latest/ChillReader-v1.0.apk';
                  window.open(url, '_blank');
                }}
                className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-zinc-800/60 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 text-xs font-medium border border-zinc-800 transition-colors cursor-pointer"
                title="Tải tệp APK trực tiếp từ trình duyệt"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Tải file APK trực tiếp</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 8. DATA RESET & STORAGE */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => toggleSection('storage')}
          className="w-full p-4 sm:p-5 flex items-center justify-between text-left hover:bg-zinc-800/40 transition-colors cursor-pointer"
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-sm text-zinc-100">Quản lý bộ nhớ & Dữ liệu</h3>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-400 border border-zinc-700 font-medium">
                  Cache & Dọn dẹp
                </span>
              </div>
              <p className="text-xs text-zinc-400 mt-0.5 truncate">
                Dọn bộ nhớ đệm audio đã tải hoặc xóa toàn bộ dữ liệu truyện offline
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <ChevronDown className={`w-5 h-5 text-zinc-400 transition-transform duration-200 ${openSections.storage ? 'rotate-180 text-amber-400' : ''}`} />
          </div>
        </button>

        {openSections.storage && (
          <div className="p-5 pt-0 border-t border-zinc-800/80 space-y-4 animate-in fade-in duration-200">
            <div className="pt-3 space-y-3">
              {/* Offline Audio Cache Reset */}
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-xs text-zinc-200">Bộ nhớ Cache Audio ngoại tuyến</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Xóa toàn bộ các tệp âm thanh đã tải về để nghe offline nhằm giải phóng dung lượng máy</p>
                  {clearedAudioMsg && (
                    <span className="text-xs text-emerald-400 font-medium mt-1 block">{clearedAudioMsg}</span>
                  )}
                </div>
                <button
                  onClick={handleClearAudioCache}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 text-xs font-medium transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa Audio Cache
                </button>
              </div>

              {/* Full Stories Reset */}
              <div className="bg-zinc-950/60 border border-zinc-800 rounded-xl p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="font-semibold text-xs text-zinc-200">Dọn dẹp toàn bộ dữ liệu truyện</h4>
                  <p className="text-[11px] text-zinc-400 mt-0.5">Xóa toàn bộ các truyện và chương đã lưu trong IndexedDB của máy</p>
                </div>
                <button
                  onClick={handleClearAll}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/40 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs font-medium transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa toàn bộ
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* App Info */}
      <div className="text-center text-xs text-zinc-500 pt-8 pb-4 space-y-2 border-t border-zinc-800/80">
        <div className="flex items-center justify-center gap-2">
          <div className="w-6 h-6 rounded-md overflow-hidden bg-white p-0.5 border border-zinc-700/60 shadow-xs">
            <img src="/icon-192.png" alt="NKI Logo" className="w-full h-full object-contain" />
          </div>
          <span className="font-bold text-zinc-300">Chill Reader</span>
          <span className="text-[9px] uppercase font-bold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
            NKI Ecosystem
          </span>
        </div>
        <p className="font-medium text-zinc-400">Ứng dụng đọc truyện chữ & nghe audio cá nhân</p>
        <p>Phiên bản {updateState?.currentVersion?.versionName || '1.0'} • Hoàn toàn riêng tư, không quảng cáo, đồng bộ Supabase Cloud đa nền tảng</p>
      </div>

      {/* Update Modal */}
      <UpdateModal 
        isOpen={isUpdateModalOpen} 
        onClose={() => setIsUpdateModalOpen(false)} 
      />
    </div>
  );
};
