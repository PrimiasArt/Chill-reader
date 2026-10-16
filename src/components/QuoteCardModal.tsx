import React, { useState, useRef } from 'react';
import { X, Download, Share2, Sparkles, Check, Palette } from 'lucide-react';

interface QuoteCardModalProps {
  isOpen: boolean;
  onClose: () => void;
  quoteText: string;
  bookTitle: string;
  chapterTitle?: string;
  author: string;
}

type CardTheme = 'obsidian' | 'sepia' | 'midnight' | 'emerald';

interface ThemeConfig {
  id: CardTheme;
  name: string;
  bgGradient: string;
  canvasBg: string[];
  textColor: string;
  accentColor: string;
  borderClass: string;
}

const THEMES: ThemeConfig[] = [
  {
    id: 'obsidian',
    name: 'Hắc Thạch',
    bgGradient: 'from-zinc-950 via-zinc-900 to-black',
    canvasBg: ['#09090b', '#18181b', '#000000'],
    textColor: '#f4f4f5',
    accentColor: '#f59e0b',
    borderClass: 'border-amber-500/30'
  },
  {
    id: 'sepia',
    name: 'Cổ Điển',
    bgGradient: 'from-[#fbf0d9] via-[#f4e2b8] to-[#eed69f]',
    canvasBg: ['#fbf0d9', '#f4e2b8', '#ebd196'],
    textColor: '#422006',
    accentColor: '#92400e',
    borderClass: 'border-amber-700/30'
  },
  {
    id: 'midnight',
    name: 'Đêm Xanh',
    bgGradient: 'from-slate-950 via-indigo-950 to-slate-900',
    canvasBg: ['#020617', '#1e1b4b', '#0f172a'],
    textColor: '#f8fafc',
    accentColor: '#818cf8',
    borderClass: 'border-indigo-500/30'
  },
  {
    id: 'emerald',
    name: 'Trúc Lâm',
    bgGradient: 'from-emerald-950 via-teal-950 to-zinc-950',
    canvasBg: ['#022c22', '#042f2e', '#09090b'],
    textColor: '#ecfdf5',
    accentColor: '#34d399',
    borderClass: 'border-emerald-500/30'
  }
];

export const QuoteCardModal: React.FC<QuoteCardModalProps> = ({
  isOpen,
  onClose,
  quoteText: initialQuote,
  bookTitle,
  chapterTitle,
  author
}) => {
  const [quote, setQuote] = useState(initialQuote);
  const [selectedTheme, setSelectedTheme] = useState<CardTheme>('obsidian');
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);
  const cardPreviewRef = useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (isOpen) {
      setQuote(initialQuote);
    }
  }, [initialQuote, isOpen]);

  if (!isOpen) return null;

  const currentTheme = THEMES.find(t => t.id === selectedTheme) || THEMES[0];

  /**
   * High-Resolution 2X Canvas rendering for crisp typography on all retina screens
   */
  const generateCanvasImage = async (): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const scale = 2; // 2x Retina resolution
      const width = 640;
      const height = 800;

      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;
      const ctx = canvas.getContext('2d');
      if (!ctx) return resolve(null);

      ctx.scale(scale, scale);

      // 1. Background gradient
      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, currentTheme.canvasBg[0]);
      gradient.addColorStop(0.5, currentTheme.canvasBg[1]);
      gradient.addColorStop(1, currentTheme.canvasBg[2]);
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      // 2. Subtle decorative border
      ctx.strokeStyle = currentTheme.accentColor + '40';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(24, 24, width - 48, height - 48);

      // Inner corner accents
      const cornerSize = 16;
      ctx.strokeStyle = currentTheme.accentColor;
      ctx.lineWidth = 3;
      // Top-left
      ctx.beginPath();
      ctx.moveTo(24, 24 + cornerSize); ctx.lineTo(24, 24); ctx.lineTo(24 + cornerSize, 24);
      ctx.stroke();
      // Top-right
      ctx.beginPath();
      ctx.moveTo(width - 24 - cornerSize, 24); ctx.lineTo(width - 24, 24); ctx.lineTo(width - 24, 24 + cornerSize);
      ctx.stroke();
      // Bottom-left
      ctx.beginPath();
      ctx.moveTo(24, height - 24 - cornerSize); ctx.lineTo(24, height - 24); ctx.lineTo(24 + cornerSize, height - 24);
      ctx.stroke();
      // Bottom-right
      ctx.beginPath();
      ctx.moveTo(width - 24 - cornerSize, height - 24); ctx.lineTo(width - 24, height - 24); ctx.lineTo(width - 24, height - 24 - cornerSize);
      ctx.stroke();

      // 3. Large Decorative Opening Quote Mark
      ctx.fillStyle = currentTheme.accentColor + '30';
      ctx.font = 'italic bold 72px Georgia, serif';
      ctx.fillText('“', 44, 110);

      // 4. Quote Body Text with smart line wrap
      ctx.fillStyle = currentTheme.textColor;
      ctx.font = 'italic 21px Georgia, serif';
      const maxLineWidth = width - 110;
      const lineHeight = 36;
      const startX = 55;
      let startY = 145;

      const words = quote.trim().split(/\s+/);
      let currentLine = '';

      for (let n = 0; n < words.length; n++) {
        const testLine = currentLine + words[n] + ' ';
        const metrics = ctx.measureText(testLine);
        if (metrics.width > maxLineWidth && n > 0) {
          ctx.fillText(currentLine.trim(), startX, startY);
          currentLine = words[n] + ' ';
          startY += lineHeight;
          if (startY > height - 220) {
            currentLine += '...';
            break;
          }
        } else {
          currentLine = testLine;
        }
      }
      ctx.fillText(currentLine.trim(), startX, startY);

      // 5. Divider Line
      const dividerY = height - 165;
      ctx.strokeStyle = currentTheme.accentColor + '60';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(55, dividerY);
      ctx.lineTo(width - 55, dividerY);
      ctx.stroke();

      // 6. Book & Chapter Info
      ctx.fillStyle = currentTheme.accentColor;
      ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText(bookTitle, 55, dividerY + 36);

      ctx.fillStyle = currentTheme.textColor + 'b3';
      ctx.font = '13px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      const subInfo = [chapterTitle, author ? `Tác giả: ${author}` : ''].filter(Boolean).join(' • ');
      ctx.fillText(subInfo, 55, dividerY + 60);

      // 7. App Branding Watermark
      ctx.fillStyle = currentTheme.textColor + '66';
      ctx.font = 'italic 11px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Chill Reader · Đọc & Nghe Truyện', 55, dividerY + 95);

      canvas.toBlob((blob) => {
        resolve(blob);
      }, 'image/png');
    });
  };

  const handleDownload = async () => {
    setIsExporting(true);
    try {
      const blob = await generateCanvasImage();
      if (!blob) throw new Error('Không thể tạo ảnh');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `quote_${bookTitle.slice(0, 15).replace(/\s+/g, '_')}_${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('Lỗi khi tải ảnh thẻ trích dẫn:', e);
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    try {
      const blob = await generateCanvasImage();
      if (!blob) return;
      const file = new File([blob], 'quote_card.png', { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Trích dẫn từ ${bookTitle}`,
          text: `"${quote}" - ${bookTitle}`,
          files: [file]
        });
      } else {
        // Fallback: Copy quote text to clipboard
        await navigator.clipboard.writeText(`"${quote}"\n— ${bookTitle} (${author})`);
        setCopied(true);
        setTimeout(() => setCopied(false), 2500);
      }
    } catch {
      // Ignored
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-zinc-900 border border-zinc-800 rounded-3xl p-5 shadow-2xl flex flex-col max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-zinc-800">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="font-bold text-base text-zinc-100">Tạo Thẻ Trích Dẫn Nghệ Thuật</h3>
          </div>
          <button 
            onClick={onClose}
            className="p-1 rounded-xl text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Card Preview */}
        <div className="my-4">
          <div 
            ref={cardPreviewRef}
            className={`relative rounded-2xl p-6 bg-gradient-to-br ${currentTheme.bgGradient} border ${currentTheme.borderClass} shadow-xl transition-all duration-300 min-h-[220px] flex flex-col justify-between`}
          >
            {/* Opening Quote Icon */}
            <span 
              className="text-5xl font-serif leading-none select-none opacity-40 font-bold block mb-2"
              style={{ color: currentTheme.accentColor }}
            >
              “
            </span>

            {/* Editable Quote */}
            <textarea
              value={quote}
              onChange={(e) => setQuote(e.target.value)}
              rows={4}
              className="w-full bg-transparent border-none focus:outline-none resize-none font-serif italic text-sm sm:text-base leading-relaxed"
              style={{ color: currentTheme.textColor }}
              placeholder="Nhập nội dung trích dẫn..."
            />

            {/* Footer Book Info */}
            <div className="mt-4 pt-3 border-t border-white/10 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p 
                  className="font-bold text-xs sm:text-sm truncate"
                  style={{ color: currentTheme.accentColor }}
                >
                  {bookTitle}
                </p>
                <p className="text-[11px] opacity-70 truncate" style={{ color: currentTheme.textColor }}>
                  {[chapterTitle, author ? `Tác giả: ${author}` : ''].filter(Boolean).join(' • ')}
                </p>
              </div>
              <span className="text-[9px] opacity-50 shrink-0 italic" style={{ color: currentTheme.textColor }}>
                Chill Reader
              </span>
            </div>
          </div>
        </div>

        {/* Theme Picker */}
        <div className="mb-4">
          <label className="text-xs text-zinc-400 font-medium flex items-center gap-1.5 mb-2">
            <Palette className="w-3.5 h-3.5 text-amber-400" />
            <span>Chọn phong cách hiển thị:</span>
          </label>
          <div className="grid grid-cols-4 gap-2">
            {THEMES.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedTheme(t.id)}
                className={`py-2 px-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                  selectedTheme === t.id
                    ? 'border-amber-500 bg-amber-500/15 text-amber-300 shadow-sm'
                    : 'border-zinc-800 bg-zinc-800/60 text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <span>{t.name}</span>
                {selectedTheme === t.id && <Check className="w-3 h-3 text-amber-400" />}
              </button>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2 pt-2 border-t border-zinc-800">
          <button
            onClick={handleShare}
            className="flex-1 py-2.5 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-400" />
                <span>Đã sao chép!</span>
              </>
            ) : (
              <>
                <Share2 className="w-4 h-4 text-zinc-400" />
                <span>Chia sẻ</span>
              </>
            )}
          </button>

          <button
            onClick={handleDownload}
            disabled={isExporting || !quote.trim()}
            className="flex-1 py-2.5 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-zinc-950 text-xs font-bold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-lg shadow-amber-500/20 disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            <span>{isExporting ? 'Đang xuất ảnh...' : 'Lưu Ảnh Thẻ HD'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
