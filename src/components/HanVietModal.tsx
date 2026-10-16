import React, { useState, useEffect } from 'react';
import { X, Search, Sparkles, BookOpen, Layers, Info, Hash } from 'lucide-react';
import { lookupHanViet, type HanVietLookupResult } from '../services/dictionary/hanVietDict';

interface HanVietModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialQuery?: string;
}

const QUICK_TAGS = [
  'Kim Đan',
  'Nguyên Anh',
  'Đan Điền',
  'Thần Thức',
  'Đoạt Xá',
  'Đạo Lữ',
  'Linh Căn',
  'Càn Khôn',
  'Hỗn Độn',
  'Tâm Ma',
  'Trận Pháp',
  'Kiếm Ý'
];

export const HanVietModal: React.FC<HanVietModalProps> = ({
  isOpen,
  onClose,
  initialQuery = ''
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [lookupResult, setLookupResult] = useState<HanVietLookupResult | null>(null);

  useEffect(() => {
    if (isOpen) {
      const q = initialQuery.trim() || 'Kim Đan';
      setQuery(q);
      setLookupResult(lookupHanViet(q));
    }
  }, [isOpen, initialQuery]);

  if (!isOpen) return null;

  const handleSearch = (text: string) => {
    setQuery(text);
    if (!text.trim()) {
      setLookupResult(null);
      return;
    }
    setLookupResult(lookupHanViet(text));
  };

  const getCategoryColor = (cat: string) => {
    switch (cat) {
      case 'Cảnh giới':
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'Khái niệm Tu Chân':
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20';
      case 'Võ học & Pháp thuật':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'Vật phẩm & Linh dược':
        return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'Thuật ngữ Hán Việt':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      default:
        return 'bg-zinc-800 text-zinc-300 border-zinc-700';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
      <div 
        className="w-full max-w-xl max-h-[90vh] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden text-zinc-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-zinc-800/80 bg-zinc-900/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <BookOpen className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-zinc-100 flex items-center gap-1.5">
                Từ Điển Hán Việt & Tu Tiên
                <span className="text-[10px] font-normal px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                  Offline
                </span>
              </h3>
              <p className="text-[11px] text-zinc-400">Giải nghĩa thuật ngữ tiên hiệp, kiếm hiệp & chiết tự Hán Việt</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search input bar */}
        <div className="p-4 border-b border-zinc-800/50 bg-zinc-950/40 shrink-0 space-y-3">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Nhập từ cần tra (vd: Kim Đan, Càn Khôn, Đoạt Xá, Kiếm Ý...)"
              className="w-full bg-zinc-900/90 border border-zinc-700/80 rounded-xl pl-10 pr-9 py-2.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500/30 transition-all"
              autoFocus
            />
            {query && (
              <button
                onClick={() => handleSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Quick preset chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none py-0.5">
            <span className="text-[11px] text-zinc-500 shrink-0 flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-400" /> Gợi ý:
            </span>
            {QUICK_TAGS.map((tag) => (
              <button
                key={tag}
                onClick={() => handleSearch(tag)}
                className={`text-[11px] px-2.5 py-1 rounded-full whitespace-nowrap transition-colors border cursor-pointer ${
                  query.toLowerCase() === tag.toLowerCase()
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/40 font-medium'
                    : 'bg-zinc-800/80 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 border-zinc-700/50'
                }`}
              >
                {tag}
              </button>
            ))}
          </div>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {lookupResult?.termMatch ? (
            /* Exact novel term card */
            <div className="p-4 sm:p-5 rounded-2xl bg-zinc-800/40 border border-zinc-700/60 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-baseline gap-2.5">
                    <h2 className="text-xl sm:text-2xl font-bold text-amber-400 font-serif tracking-wide">
                      {lookupResult.termMatch.term}
                    </h2>
                    {lookupResult.termMatch.hanzi && (
                      <span className="text-lg text-zinc-400 font-serif">
                        [{lookupResult.termMatch.hanzi}]
                      </span>
                    )}
                    {lookupResult.termMatch.pinyin && (
                      <span className="text-xs text-zinc-500 italic">
                        ({lookupResult.termMatch.pinyin})
                      </span>
                    )}
                  </div>
                  <span
                    className={`inline-block mt-1 text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full border ${getCategoryColor(
                      lookupResult.termMatch.category
                    )}`}
                  >
                    {lookupResult.termMatch.category}
                  </span>
                </div>
              </div>

              {/* Short summary */}
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/15 text-sm text-amber-200/90 leading-relaxed font-medium">
                {lookupResult.termMatch.shortDesc}
              </div>

              {/* Detailed explanation */}
              <div className="space-y-1.5 text-xs sm:text-sm text-zinc-300 leading-relaxed">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                  <Info className="w-3.5 h-3.5 text-amber-400" /> Ý nghĩa chi tiết trong truyện:
                </h4>
                <p className="whitespace-pre-line text-zinc-300">
                  {lookupResult.termMatch.detailDesc}
                </p>
              </div>

              {/* Example usages */}
              {lookupResult.termMatch.examples && lookupResult.termMatch.examples.length > 0 && (
                <div className="pt-2 border-t border-zinc-700/50 space-y-1">
                  <h4 className="text-[11px] font-semibold text-zinc-400">Ví dụ trong ngữ cảnh:</h4>
                  {lookupResult.termMatch.examples.map((ex, idx) => (
                    <p key={idx} className="text-xs italic text-zinc-400 pl-3 border-l-2 border-amber-500/40">
                      "{ex}"
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : query.trim() ? (
            /* Not an exact compound term match, but show notice */
            <div className="p-3.5 rounded-xl bg-zinc-800/40 border border-zinc-700/50 text-xs text-zinc-400 flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Không có định nghĩa trọn cụm từ "{query}", hiển thị giải nghĩa chiết tự từng từ Hán Việt bên dưới:
              </span>
            </div>
          ) : null}

          {/* Morpheme & Syllable Breakdown */}
          {lookupResult?.characterMatches && lookupResult.characterMatches.length > 0 && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-amber-400" /> Chiết tự từng âm Hán Việt:
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {lookupResult.characterMatches.map((char) => (
                  <div
                    key={char.syllable}
                    className="p-3 rounded-xl bg-zinc-800/60 border border-zinc-700/60 hover:border-amber-500/40 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-baseline gap-2">
                        <span className="text-base font-bold text-amber-300 capitalize font-serif">
                          {char.syllable}
                        </span>
                        <span className="text-lg font-serif text-zinc-200">
                          {char.hanzi}
                        </span>
                        {char.pinyin && (
                          <span className="text-[11px] text-zinc-500 italic">
                            ({char.pinyin})
                          </span>
                        )}
                      </div>
                    </div>
                    <ul className="text-xs text-zinc-300 space-y-1">
                      {char.meanings.map((m, idx) => (
                        <li key={idx} className="flex items-start gap-1.5">
                          <span className="text-amber-400 font-bold">•</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related novel terms */}
          {lookupResult?.relatedTerms && lookupResult.relatedTerms.length > 0 && (
            <div className="space-y-2 pt-2 border-t border-zinc-800/80">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400 flex items-center gap-1.5">
                <Hash className="w-3.5 h-3.5 text-amber-400" /> Thuật ngữ liên quan:
              </h4>
              <div className="flex flex-wrap gap-2">
                {lookupResult.relatedTerms.map((term) => (
                  <button
                    key={term.term}
                    onClick={() => handleSearch(term.term)}
                    className="px-3 py-1.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-700/80 border border-zinc-700 text-xs text-zinc-200 hover:text-amber-300 transition-colors flex items-center gap-1.5 cursor-pointer text-left"
                  >
                    <span className="font-medium">{term.term}</span>
                    {term.hanzi && <span className="text-zinc-400 text-[10px]">[{term.hanzi}]</span>}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Empty search state */}
          {(!lookupResult || (!lookupResult.termMatch && lookupResult.characterMatches.length === 0)) && query.trim() && (
            <div className="text-center py-10 space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-zinc-800/80 border border-zinc-700/60 flex items-center justify-center text-zinc-400 mx-auto">
                <Search className="w-6 h-6" />
              </div>
              <p className="text-sm text-zinc-300">Không tìm thấy kết quả phù hợp cho "{query}"</p>
              <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                Hãy thử tra các từ đơn lẻ hoặc thuật ngữ phổ biến như "Kim Đan", "Càn Khôn", "Đan Điền", "Nguyên Anh".
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-zinc-800/80 bg-zinc-950/60 flex items-center justify-between text-xs text-zinc-500 shrink-0">
          <span>Hỗ trợ tra cứu nhanh khi bôi đen chữ trong truyện</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition-colors cursor-pointer font-medium"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
