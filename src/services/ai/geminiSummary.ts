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

  async getModel(): Promise<string> {
    try {
      const fromDb = await db.getSetting<string>('geminiModel', '');
      if (fromDb && fromDb.trim()) return fromDb.trim();
    } catch {}

    if (typeof window !== 'undefined') {
      const fromLocal = localStorage.getItem('chill_reader_gemini_model');
      if (fromLocal && fromLocal.trim()) return fromLocal.trim();
    }
    return 'gemini-2.0-flash';
  }

  async saveModel(model: string): Promise<void> {
    const trimmed = model.trim() || 'gemini-2.0-flash';
    try {
      await db.saveSetting('geminiModel', trimmed);
    } catch {}
    if (typeof window !== 'undefined') {
      localStorage.setItem('chill_reader_gemini_model', trimmed);
    }
  }

  async fetchAvailableModels(providedKey?: string): Promise<string[]> {
    const key = (providedKey || await this.getApiKey()).trim();
    if (!key) {
      return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-2.5-flash'];
    }

    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = await res.json();
      if (Array.isArray(data.models) && data.models.length > 0) {
        const supported = data.models
          .filter((m: any) => Array.isArray(m.supportedGenerationMethods) && m.supportedGenerationMethods.includes('generateContent'))
          .map((m: any) => (m.name || '').replace(/^models\//, ''))
          .filter((name: string) => name && !name.includes('embedding') && !name.includes('aqa'));

        if (supported.length > 0) {
          supported.sort((a: string, b: string) => {
            const score = (name: string) => {
              if (name === 'gemini-2.0-flash') return 100;
              if (name === 'gemini-2.0-flash-lite') return 90;
              if (name === 'gemini-1.5-flash') return 80;
              if (name === 'gemini-1.5-flash-latest') return 75;
              if (name === 'gemini-1.5-pro') return 70;
              if (name.includes('flash')) return 60;
              if (name.includes('pro')) return 50;
              return 10;
            };
            return score(b) - score(a);
          });
          return supported;
        }
      }
    } catch (e) {
      console.warn('Failed to fetch available models from Gemini API:', e);
    }

    return ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-2.5-flash'];
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

  /**
   * Interactive AI Novel Companion: Answer reader's questions about plot, characters, cultivation realms
   * without spoiling future chapters!
   */
  async askStoryQuestion(
    bookTitle: string,
    currentChapterNumber: number,
    currentChapterTitle: string,
    currentChapterContent: string,
    question: string,
    recentChaptersExcerpt?: string
  ): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Chưa thiết lập Google Gemini API Key. Vui lòng nhập API Key miễn phí của bạn để trò chuyện cùng Trợ lý AI.');
    }

    const prompt = `Bạn là Trợ Lý Đọc Truyện AI Cao Cấp của ứng dụng Chill Reader.
Người đọc đang đọc tác phẩm: "${bookTitle}".
Người đọc ĐANG ĐỌC ĐẾN CHƯƠNG ${currentChapterNumber}: "${currentChapterTitle}".

Nội dung trích yếu của chương hiện tại và các chương gần đây:
"""
${currentChapterContent.slice(0, 8000)}
${recentChaptersExcerpt ? '\nBối cảnh các chương trước:\n' + recentChaptersExcerpt.slice(0, 4000) : ''}
"""

Câu hỏi của độc giả: "${question}"

QUY TẮC BẢO MẬT & ĐẠO ĐỨC ĐỌC SÁCH TUYỆT ĐỐI (ANTI-SPOILER):
1. Bạn CHỈ ĐƯỢC PHÉP trả lời dựa trên những gì đã xảy ra TỪ ĐẦU TRUYỆN ĐẾN CHƯƠNG ${currentChapterNumber}.
2. TUYỆT ĐỐI KHÔNG tiết lộ (SPOIL) bất kỳ diễn biến nào ở các chương SAU chương ${currentChapterNumber}.
3. Nếu câu hỏi liên quan đến bí mật chưa được giải đáp tính đến chương ${currentChapterNumber}, hãy khéo léo gợi mở: "Tính đến chương ${currentChapterNumber}, chi tiết này vẫn là một bí mật/chưa hé lộ, đạo hữu hãy tiếp tục đọc các chương tiếp theo để khám phá nhé!".
4. Trả lời bằng tiếng Việt thân thiện, thông thái, giọng điệu đàm đạo văn chương hoặc kiếm hiệp/tiên hiệp phù hợp với tác phẩm, súc tích và mạch lạc (khoảng 120 - 250 từ).`;

    const text = await this.callGeminiApi(apiKey, prompt);
    return text;
  }

  private async callGeminiApi(apiKey: string, prompt: string, modelOverride?: string): Promise<string> {
    const preferredModel = (modelOverride || await this.getModel()).trim() || 'gemini-2.0-flash';
    
    // Candidate list: user's chosen model first, then safe fallbacks
    const candidateModels: string[] = [preferredModel];
    const fallbackList = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-2.5-flash'];
    for (const f of fallbackList) {
      if (!candidateModels.includes(f)) {
        candidateModels.push(f);
      }
    }

    let lastError: any = null;

    for (const model of candidateModels) {
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
      } catch (err: any) {
        lastError = err;
        console.warn(`Gemini model ${model} failed, trying next candidate...`, err);
        const msg = String(err?.message || '');
        if (msg.includes('API_KEY_INVALID') || msg.includes('API key not valid')) {
          throw new Error('API Key không hợp lệ. Vui lòng kiểm tra lại Google Gemini API Key.');
        }
      }
    }

    throw new Error(lastError?.message || `Không nhận được phản hồi từ AI Gemini (Model: ${preferredModel}). Vui lòng kiểm tra lại API Key hoặc đổi Model khác trong cài đặt.`);
  }

  /**
   * OCR text from image using Gemini Vision AI (supports camera photos, book scans, screenshots)
   */
  async ocrImageToText(imageBase64: string, mimeType: string = 'image/jpeg', modelOverride?: string): Promise<string> {
    const apiKey = await this.getApiKey();
    if (!apiKey) {
      throw new Error('Chưa thiết lập Google Gemini API Key. Vui lòng nhập API Key miễn phí của bạn để sử dụng tính năng OCR chụp ảnh nhận diện chữ.');
    }

    // Strip data URL prefix if present
    const cleanBase64 = imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
    if (!cleanBase64) {
      throw new Error('Dữ liệu hình ảnh không hợp lệ hoặc bị trống.');
    }

    const prompt = `Bạn là chuyên gia OCR văn bản tiếng Việt và đa ngôn ngữ cho ứng dụng Chill Reader.
Nhiệm vụ: Hãy trích xuất TOÀN BỘ chữ viết trong hình ảnh này (có thể là trang sách in, truyện chữ, tài liệu hoặc chụp màn hình).

Yêu cầu định dạng:
1. Giữ nguyên độ chính xác từng câu chữ, dấu câu tiếng Việt, thứ tự đoạn văn từ trên xuống dưới.
2. Tách các đoạn văn bằng một dòng trống để dễ đọc và tương thích tốt với trình đọc âm thanh Text-To-Speech (TTS).
3. Tự động sửa các lỗi chính tả hiển nhiên do chụp nghiêng, mờ nét hoặc bóng đổ (nếu có căn cứ ngữ cảnh câu từ rõ ràng).
4. TUYỆT ĐỐI KHÔNG thêm lời giải thích, KHÔNG thêm lời chào, KHÔNG bọc trong khối code markdown (như \`\`\`text), CHỈ TRẢ VỀ DUY NHẤT nội dung văn bản đã được bóc tách từ ảnh.`;

    const preferredModel = (modelOverride || await this.getModel()).trim() || 'gemini-2.0-flash';
    const candidateModels: string[] = [preferredModel];
    const fallbackList = ['gemini-2.0-flash', 'gemini-1.5-flash-latest', 'gemini-1.5-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-pro', 'gemini-2.5-flash'];
    for (const f of fallbackList) {
      if (!candidateModels.includes(f)) {
        candidateModels.push(f);
      }
    }

    let lastError: any = null;

    for (const model of candidateModels) {
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
                parts: [
                  {
                    inlineData: {
                      mimeType: mimeType || 'image/jpeg',
                      data: cleanBase64
                    }
                  },
                  {
                    text: prompt
                  }
                ]
              }
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 4096
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
          // Clean up any accidental markdown code fence wrapping
          let text = candidateText.trim();
          text = text.replace(/^```[a-zA-Z]*\n?/, '').replace(/\n?```$/, '').trim();
          return text;
        }
      } catch (err) {
        lastError = err;
        console.warn(`Gemini OCR model ${model} failed, trying fallback...`, err);
      }
    }

    throw new Error(lastError?.message || `Không thể trích xuất văn bản từ ảnh qua AI Gemini (Model: ${preferredModel}). Vui lòng kiểm tra lại hoặc đổi Model trong cài đặt.`);
  }

  /**
   * Batch OCR for multiple book pages/photos
   */
  async ocrMultipleImages(
    images: { base64: string; mimeType?: string }[],
    onProgress?: (current: number, total: number) => void
  ): Promise<string[]> {
    const results: string[] = [];
    for (let i = 0; i < images.length; i++) {
      if (onProgress) {
        onProgress(i + 1, images.length);
      }
      const text = await this.ocrImageToText(images[i].base64, images[i].mimeType || 'image/jpeg');
      results.push(text);
    }
    return results;
  }
}

export const geminiSummaryService = new GeminiSummaryService();
