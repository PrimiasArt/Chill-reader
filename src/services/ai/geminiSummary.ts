import { db } from '../db';

export interface AISummaryResult {
  summary: string;
  characters?: string[];
  keyEvents?: string[];
  rawText: string;
}

export class GeminiSummaryService {
  private memoryCache: Map<string, AISummaryResult> = new Map();

  async getApiKey(): Promise<string> {
    try {
      const fromDb = await db.getSetting<string>('geminiApiKey', '');
      if (fromDb && fromDb.trim()) return fromDb.trim();
    } catch {}

    if (typeof window !== 'undefined') {
      const fromLocal = localStorage.getItem('chill_reader_gemini_key');
      if (fromLocal && fromLocal.trim()) return fromLocal.trim();
    }
    return '';
  }

  async saveApiKey(key: string): Promise<void> {
    const trimmed = key.trim();
    try {
      await db.saveSetting('geminiApiKey', trimmed);
    } catch {}
    if (typeof window !== 'undefined') {
      localStorage.setItem('chill_reader_gemini_key', trimmed);
    }
  }

  /**
   * Summarize current chapter using Gemini API
   */
  async summarizeChapter(
    bookTitle: string,
    chapterTitle: string,
    chapterContent: string
  ): Promise<AISummaryResult> {
    const cacheKey = `ch_${bookTitle}_${chapterTitle}`;
    if (this.memoryCache.has(cacheKey)) {
      return this.memoryCache.get(cacheKey)!;
    }

    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Chưa thiết lập Google Gemini API Key. Vui lòng nhập API Key miễn phí của bạn để sử dụng tính năng AI.');
    }

    // Truncate chapter to ~12,000 characters to keep latency fast while having full context
    const cleanText = chapterContent.slice(0, 12000);

    const prompt = `Bạn là trợ lý AI chuyên tóm tắt tiểu thuyết và truyện chữ cho ứng dụng Chill Reader.
Hãy tóm tắt chương truyện sau đây của tác phẩm "${bookTitle}":
Tiêu đề chương: "${chapterTitle}"

Nội dung chương:
"""
${cleanText}
"""

Yêu cầu định dạng kết quả bằng Tiếng Việt thân thiện, lôi cuốn, súc tích:
### 📌 Tóm tắt cốt truyện (3 - 4 ý chính)
(Mỗi ý là một gạch đầu dòng rõ ràng, mạch lạc)

### 👥 Nhân vật & Động thái
(Tên các nhân vật xuất hiện trong chương và hành động nổi bật của họ)

### ⚡ Điểm nhấn đáng chú ý
(Cảnh giới đột phá, bảo vật, chiêu thức, bí mật được hé lộ, hoặc tình huống bất ngờ)`;

    const text = await this.callGeminiApi(apiKey, prompt);
    const result: AISummaryResult = {
      summary: text,
      rawText: text
    };

    this.memoryCache.set(cacheKey, result);
    return result;
  }

  /**
   * Recap story across recent chapters (for readers returning after a while)
   */
  async recapRecentChapters(
    bookTitle: string,
    recentChapters: { title: string; content: string }[]
  ): Promise<AISummaryResult> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Chưa thiết lập Google Gemini API Key. Vui lòng nhập API Key miễn phí để tiếp tục.');
    }

    const chaptersExcerpt = recentChapters
      .map((c) => `--- ${c.title} ---\n${c.content.slice(0, 3000)}`)
      .join('\n\n');

    const prompt = `Bạn là trợ lý đọc truyện AI của ứng dụng Chill Reader.
Người đọc đã tạm dừng đọc tác phẩm "${bookTitle}" một thời gian và muốn bắt nhịp lại câu chuyện.
Dưới đây là nội dung tóm lược của các chương gần nhất trước thời điểm hiện tại:
"""
${chaptersExcerpt}
"""

Hãy viết một bản "Nhắc lại diễn biến (Story Recap)" cô đọng khoảng 200 - 300 từ:
1. 📍 Bối cảnh và tình thế hiện tại của nhân vật chính là gì?
2. ⚔️ Các sự kiện quan trọng nhất vừa xảy ra?
3. 🎯 Mục tiêu hoặc nguy cơ sắp tới nhân vật chính phải đối mặt?

Định dạng văn phong sinh động, cuốn hút, giúp người đọc nắm trọn bối cảnh trong 30 giây!`;

    const text = await this.callGeminiApi(apiKey, prompt);
    return {
      summary: text,
      rawText: text
    };
  }

  private async callGeminiApi(apiKey: string, prompt: string): Promise<string> {
    // Attempt gemini-2.5-flash first, fallback to gemini-1.5-flash
    const models = ['gemini-2.5-flash', 'gemini-1.5-flash'];
    let lastError: any = null;

    for (const model of models) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            contents: [
              {
                parts: [{ text: prompt }]
              }
            ],
            generationConfig: {
              temperature: 0.7,
              maxOutputTokens: 1024
            }
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error?.message || `HTTP ${response.status} ${response.statusText}`;
          throw new Error(errMsg);
        }

        const data = await response.json();
        const candidateText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (candidateText && candidateText.trim()) {
          return candidateText.trim();
        }
      } catch (err) {
        lastError = err;
        console.warn(`Gemini model ${model} failed, trying fallback...`, err);
      }
    }

    throw new Error(lastError?.message || 'Không nhận được phản hồi từ AI Gemini. Vui lòng kiểm tra lại API Key và kết nối mạng.');
  }
}

export const geminiSummaryService = new GeminiSummaryService();
