import React, { useState, useEffect, useRef } from 'react';
import { X, Send, Sparkles, ShieldCheck, Loader2, Bot, User, Key, Settings, RotateCw, ExternalLink } from 'lucide-react';
import { geminiSummaryService } from '../services/ai/geminiSummary';
import type { Story, Chapter } from '../types';

interface Message {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  time: string;
  isError?: boolean;
}

interface StoryAiCompanionModalProps {
  isOpen: boolean;
  onClose: () => void;
  story: Story;
  currentChapter: Chapter;
  recentChapters?: Chapter[];
}

const PRESET_QUESTIONS = [
  'Tình thế hiện tại của nhân vật chính là gì?',
  'Cảnh giới và công pháp nổi bật tính đến nay?',
  'Mối quan hệ giữa các nhân vật chính và phe phái?',
  'Những bí mật hoặc manh mối quan trọng vừa xuất hiện?'
];

export const StoryAiCompanionModal: React.FC<StoryAiCompanionModalProps> = ({
  isOpen,
  onClose,
  story,
  currentChapter,
  recentChapters = []
}) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [showKeySetup, setShowKeySetup] = useState(false);
  const [currentModel, setCurrentModel] = useState('gemini-2.0-flash');
  const [modelInput, setModelInput] = useState('gemini-2.0-flash');
  const [availableModels, setAvailableModels] = useState<string[]>([
    'gemini-2.0-flash',
    'gemini-1.5-flash',
    'gemini-2.0-flash-lite',
    'gemini-1.5-pro',
    'gemini-2.5-flash'
  ]);
  const [isFetchingModels, setIsFetchingModels] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      geminiSummaryService.getApiKey().then((k) => {
        if (k && k.trim()) {
          setHasApiKey(true);
          setApiKeyInput(k);
          geminiSummaryService.fetchAvailableModels(k).then((mods) => {
            if (mods && mods.length > 0) setAvailableModels(mods);
          });
        } else {
          setHasApiKey(false);
          setShowKeySetup(true);
        }
      });
      geminiSummaryService.getModel().then((m) => {
        if (m) {
          setCurrentModel(m);
          setModelInput(m);
        }
      });

      // Greet reader if first time opening in session
      if (messages.length === 0) {
        setMessages([
          {
            id: 'welcome',
            sender: 'ai',
            text: `Chào đạo hữu! Ta là Trợ Lý Độc Giả của "${story.title}". Ngươi đang đọc tới Chương ${currentChapter.chapterNumber}: "${currentChapter.title}".\n\nNgươi có điều gì băn khoăn về tình tiết, cảnh giới hoặc nhân vật không? Ta xin hầu chuyện và cam đoan KHÔNG TIẾT LỘ (SPOIL) bất kỳ nội dung nào ở các chương sau!`,
            time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
          }
        ]);
      }
    }
  }, [isOpen, currentChapter.chapterNumber]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  if (!isOpen) return null;

  const handleSaveConfig = async () => {
    if (!apiKeyInput.trim()) return;
    const finalModel = modelInput.trim() || 'gemini-2.0-flash';
    await geminiSummaryService.saveApiKey(apiKeyInput.trim());
    await geminiSummaryService.saveModel(finalModel);
    setCurrentModel(finalModel);
    setHasApiKey(true);
    setShowKeySetup(false);
  };

  const handleRefreshModels = async () => {
    if (!apiKeyInput.trim()) return;
    setIsFetchingModels(true);
    try {
      const models = await geminiSummaryService.fetchAvailableModels(apiKeyInput.trim());
      if (models && models.length > 0) {
        setAvailableModels(models);
        if (!models.includes(modelInput)) {
          setModelInput(models[0]);
        }
      }
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSend = async (questionToSend?: string) => {
    const q = (questionToSend || inputText).trim();
    if (!q || isLoading) return;

    if (!hasApiKey) {
      setShowKeySetup(true);
      return;
    }

    const userMsg: Message = {
      id: 'usr_' + Date.now(),
      sender: 'user',
      text: q,
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    setMessages((prev) => [...prev, userMsg]);
    setInputText('');
    setIsLoading(true);

    try {
      const excerpt = recentChapters
        .filter((c) => c.chapterNumber < currentChapter.chapterNumber)
        .slice(-3)
        .map((c) => `Chương ${c.chapterNumber} (${c.title}): ${c.content.slice(0, 1500)}`)
        .join('\n\n');

      const answer = await geminiSummaryService.askStoryQuestion(
        story.title,
        currentChapter.chapterNumber,
        currentChapter.title,
        currentChapter.content,
        q,
        excerpt
      );

      const aiMsg: Message = {
        id: 'ai_' + Date.now(),
        sender: 'ai',
        text: answer,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages((prev) => [...prev, aiMsg]);
    } catch (err: any) {
      const errorMsg: Message = {
        id: 'err_' + Date.now(),
        sender: 'ai',
        text: `⚠️ Không thể phản hồi: ${err.message || 'Lỗi kết nối AI Gemini'}. Bạn có thể bấm nút đổi Model hoặc kiểm tra lại API Key bên dưới!`,
        time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        isError: true
      };
      setMessages((prev) => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div 
        className="bg-zinc-900 border border-zinc-700/80 rounded-2xl w-full max-w-xl h-[88vh] max-h-[700px] flex flex-col shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-zinc-800 bg-zinc-950/60 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-amber-600 to-yellow-400 p-0.5 shadow-md flex items-center justify-center text-zinc-950">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-bold text-sm text-zinc-100">Đàm Đạo Cùng Trợ Lý AI</h3>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  {currentModel}
                </span>
                <button
                  type="button"
                  onClick={() => setShowKeySetup(!showKeySetup)}
                  className="p-1 rounded-md text-zinc-400 hover:text-amber-400 hover:bg-zinc-800 transition-colors cursor-pointer"
                  title="Cài đặt Model & API Key"
                >
                  <Settings className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-[11px] text-zinc-400 truncate max-w-[280px] sm:max-w-md">
                Chương {currentChapter.chapterNumber}: {currentChapter.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Anti-Spoiler Guarantee Badge */}
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2 flex items-center gap-2 text-emerald-400 text-[11px]">
          <ShieldCheck className="w-4 h-4 shrink-0" />
          <span>Cam kết Anti-Spoiler: AI chỉ trả lời dựa trên diễn biến đến <strong>Chương {currentChapter.chapterNumber}</strong>, không tiết lộ tương lai!</span>
        </div>

        {/* API Key & Model Setup Banner */}
        {showKeySetup && (
          <div className="p-3.5 bg-zinc-900 border-b border-amber-500/30 flex flex-col gap-2.5 text-xs text-zinc-300 animate-in fade-in duration-200">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-amber-400 flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" /> Cài đặt Google Gemini AI
              </span>
              {hasApiKey && (
                <button onClick={() => setShowKeySetup(false)} className="text-zinc-400 hover:text-zinc-200 cursor-pointer">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* API Key Input */}
            <div>
              <label className="text-[11px] text-zinc-400 mb-1 block">Google Gemini API Key:</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  placeholder="Dán Gemini API Key của bạn (AIzaSy...)"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  className="flex-1 bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                />
                <a
                  href="https://aistudio.google.com/app/apikey"
                  target="_blank"
                  rel="noreferrer"
                  className="px-2.5 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-amber-400 rounded-lg text-[11px] flex items-center gap-1 shrink-0 font-medium"
                >
                  <span>Lấy Key</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Model Selection & Custom Model Input */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-zinc-400 block">Mô hình AI (Tự do chọn hoặc tự gõ tên model mới):</label>
                <button
                  type="button"
                  onClick={handleRefreshModels}
                  disabled={isFetchingModels || !apiKeyInput.trim()}
                  className="text-[10px] text-amber-400 hover:underline flex items-center gap-1 disabled:opacity-50 cursor-pointer"
                >
                  <RotateCw className={`w-3 h-3 ${isFetchingModels ? 'animate-spin' : ''}`} />
                  <span>Quét model từ Google</span>
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {/* Select from list */}
                <select
                  value={availableModels.includes(modelInput) ? modelInput : 'custom'}
                  onChange={(e) => {
                    if (e.target.value !== 'custom') {
                      setModelInput(e.target.value);
                    }
                  }}
                  className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
                >
                  {availableModels.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="custom">✏️ Tự gõ tên model khác...</option>
                </select>

                {/* Custom / direct edit text input */}
                <input
                  type="text"
                  placeholder="Tên model (VD: gemini-2.0-flash, gemini-1.5-pro...)"
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
                  className="bg-zinc-950 border border-zinc-700 rounded-lg px-2.5 py-1.5 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={handleSaveConfig}
                disabled={!apiKeyInput.trim() || !modelInput.trim()}
                className="px-4 py-1.5 rounded-lg bg-amber-500 text-zinc-950 text-xs font-bold hover:bg-amber-400 disabled:opacity-50 cursor-pointer shadow-md"
              >
                Lưu cài đặt AI
              </button>
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-zinc-900/40">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex gap-2.5 max-w-[90%] sm:max-w-[85%] ${
                msg.sender === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
              }`}
            >
              <div
                className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold ${
                  msg.sender === 'user'
                    ? 'bg-amber-500 text-zinc-950'
                    : 'bg-zinc-800 border border-zinc-700 text-amber-400'
                }`}
              >
                {msg.sender === 'user' ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              <div
                className={`p-3 rounded-2xl text-xs sm:text-[13px] leading-relaxed whitespace-pre-wrap ${
                  msg.sender === 'user'
                    ? 'bg-amber-500 text-zinc-950 font-medium rounded-tr-none'
                    : msg.isError
                    ? 'bg-red-500/10 text-red-200 border border-red-500/30 rounded-tl-none shadow-sm'
                    : 'bg-zinc-800/90 text-zinc-200 border border-zinc-700/60 rounded-tl-none shadow-sm'
                }`}
              >
                {msg.text}

                {msg.isError && (
                  <button
                    type="button"
                    onClick={() => setShowKeySetup(true)}
                    className="mt-2.5 px-3 py-1.5 rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 flex items-center gap-1.5 cursor-pointer font-medium text-xs transition-colors"
                  >
                    <Settings className="w-3.5 h-3.5 text-amber-400" />
                    <span>Đổi Model AI hoặc API Key</span>
                  </button>
                )}

                <div
                  className={`text-[9px] mt-1 text-right opacity-60 ${
                    msg.sender === 'user' ? 'text-zinc-900' : 'text-zinc-400'
                  }`}
                >
                  {msg.time}
                </div>
              </div>
            </div>
          ))}

          {isLoading && (
            <div className="flex gap-2.5 mr-auto max-w-[80%]">
              <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                <Bot className="w-4 h-4" />
              </div>
              <div className="p-3 rounded-2xl rounded-tl-none bg-zinc-800/90 border border-zinc-700/60 flex items-center gap-2 text-zinc-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                <span>Trợ lý AI đang tra cứu chương truyện...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Preset Prompt Suggestions */}
        <div className="px-4 py-2 border-t border-zinc-800/80 bg-zinc-950/40 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
          <span className="text-[10px] text-zinc-500 shrink-0 font-medium flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-amber-400" /> Gợi ý:
          </span>
          {PRESET_QUESTIONS.map((q, idx) => (
            <button
              key={idx}
              disabled={isLoading}
              onClick={() => handleSend(q)}
              className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-800 hover:bg-zinc-700 hover:text-amber-300 text-zinc-300 border border-zinc-700/60 whitespace-nowrap cursor-pointer transition-colors shrink-0 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div className="p-3 border-t border-zinc-800 bg-zinc-950/80 flex items-center gap-2">
          <input
            type="text"
            placeholder="Hỏi về tình tiết, cảnh giới, võ công, nhân vật..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isLoading}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded-xl px-3.5 py-2 text-xs text-zinc-100 focus:outline-none focus:border-amber-500 disabled:opacity-50"
          />
          <button
            onClick={() => handleSend()}
            disabled={!inputText.trim() || isLoading}
            className="p-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-zinc-950 font-bold transition-all cursor-pointer shadow-md shadow-amber-500/20"
            title="Gửi câu hỏi"
          >
            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
