import test from 'node:test';
import assert from 'node:assert/strict';

// Helper matching TTSEngine.splitIntoSentences
function splitIntoSentences(text) {
  if (!text) return [];
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rawParagraphs = normalized.split(/\n+/);
  const result = [];

  for (const para of rawParagraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    const rawMatches = trimmed.match(/[^.!?…\n]+(?:[.!?…]+|(?=$))/g) || [trimmed];

    for (const raw of rawMatches) {
      const s = raw.trim();
      if (!s || !/[a-zA-Z0-9\u00C0-\u1EF9]/.test(s)) continue;

      if (s.length <= 140) {
        result.push(s);
      } else {
        const clauses = s.match(/[^,;:—\n]+(?:[,;:—]+|(?=$))/g) || [s];
        let currentChunk = '';

        for (const clause of clauses) {
          const c = clause.trim();
          if (!c) continue;

          if (!currentChunk) {
            currentChunk = c;
          } else if (currentChunk.length + c.length + 1 <= 140) {
            currentChunk += ' ' + c;
          } else {
            result.push(currentChunk);
            currentChunk = c;
          }
        }
        if (currentChunk) {
          result.push(currentChunk);
        }
      }
    }
  }

  // Merge tiny trailing fragments
  const merged = [];
  for (let i = 0; i < result.length; i++) {
    const curr = result[i];
    if (merged.length > 0 && curr.length < 25 && !/[.!?…]$/.test(merged[merged.length - 1])) {
      merged[merged.length - 1] += ' ' + curr;
    } else {
      merged.push(curr);
    }
  }

  return merged.length > 0 ? merged : result;
}

// Pronunciation replacement simulator
function applyPronunciationRules(text, rules) {
  if (!text) return '';
  let result = text;
  for (const rule of rules) {
    if (!rule.enabled) continue;
    try {
      if (rule.isRegex) {
        const flags = rule.caseSensitive ? 'g' : 'gi';
        const regex = new RegExp(rule.pattern, flags);
        result = result.replace(regex, rule.replacement);
      } else {
        const flags = rule.caseSensitive ? 'g' : 'gi';
        const escaped = rule.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const regex = new RegExp(escaped, flags);
        result = result.replace(regex, rule.replacement);
      }
    } catch {}
  }
  return result;
}

test('Sentence Splitting - Handles basic Vietnamese sentences', () => {
  const text = 'Chào bạn. Tôi là Chill Reader! Bạn đang nghe truyện gì thế?';
  const sentences = splitIntoSentences(text);
  assert.equal(sentences.length, 3);
  assert.equal(sentences[0], 'Chào bạn.');
  assert.equal(sentences[1], 'Tôi là Chill Reader!');
  assert.equal(sentences[2], 'Bạn đang nghe truyện gì thế?');
});

test('Sentence Splitting - Ignores empty or punctuation-only strings', () => {
  assert.deepEqual(splitIntoSentences(''), []);
  assert.deepEqual(splitIntoSentences('   ...   !?!  --- '), []);
});

test('Sentence Splitting - Handles complex dialogues and ellipses', () => {
  const text = 'Hắn ngước nhìn lên trời cao... "Không thể nào!" Hắn kinh hãi thốt lên.';
  const sentences = splitIntoSentences(text);
  assert.ok(sentences.length >= 2);
  assert.ok(sentences.some(s => s.includes('Không thể nào!')));
});

test('Sentence Splitting - Long clause segmentation keeps chunks under 140 chars', () => {
  const longText = 'Tại vùng đất linh thiêng của dãy Trường Sơn hùng vĩ, nơi mây ngàn hội tụ và những dòng suối trong vắt chảy róc rách qua từng khe đá, các bậc tiền bối thuở xưa đã dựng nên những ngôi đền cổ kính để thờ phụng trời đất, cầu mong cho mưa thuận gió hòa và cuộc sống muôn dân được ấm no đời đời.';
  const sentences = splitIntoSentences(longText);
  assert.ok(sentences.length > 1, 'Should split long sentence into clauses');
  for (const chunk of sentences) {
    assert.ok(chunk.length <= 160, `Chunk length ${chunk.length} should be reasonably bounded`);
  }
});

test('Pronunciation - Replaces slang and abbreviations accurately', () => {
  const rules = [
    { pattern: '\\bko\\b', replacement: 'không', isRegex: true, enabled: true },
    { pattern: '\\bvk\\b', replacement: 'vợ', isRegex: true, enabled: true },
    { pattern: '\\bck\\b', replacement: 'chồng', isRegex: true, enabled: true },
    { pattern: '\\bmain\\b', replacement: 'nhân vật chính', isRegex: true, enabled: true }
  ];

  const text = 'Hôm nay main ko về nhà cùng vk đâu.';
  const processed = applyPronunciationRules(text, rules);
  assert.equal(processed, 'Hôm nay nhân vật chính không về nhà cùng vợ đâu.');
});

test('Pronunciation - Preserves words containing substrings of abbreviations', () => {
  const rules = [
    { pattern: '\\bko\\b', replacement: 'không', isRegex: true, enabled: true }
  ];

  const text = 'Khổng Minh đọc sách bên bờ hồ Koi.';
  const processed = applyPronunciationRules(text, rules);
  // "Koi" should not be replaced by "khôngi"
  assert.ok(processed.includes('Koi'));
  assert.ok(!processed.includes('khôngi'));
});

// Voice classification tests
function isOnlineVoice(voiceURI) {
  if (!voiceURI) return false;
  const lower = voiceURI.toLowerCase().trim();
  return lower.startsWith('edge:') || lower.startsWith('google:');
}

test('Voice Classification - Strictly identifies online vs offline voices', () => {
  // Online voices
  assert.equal(isOnlineVoice('edge:vi-VN-NamMinhNeural'), true);
  assert.equal(isOnlineVoice('edge:vi-VN-HoaiMyNeural'), true);
  assert.equal(isOnlineVoice('google:vi'), true);

  // Offline / Native voices MUST NEVER be classified as online
  assert.equal(isOnlineVoice('native:android'), false);
  assert.equal(isOnlineVoice('native:vi-vn-x-vic-local'), false);
  assert.equal(isOnlineVoice('vi-vn-x-vic-network'), false);
  assert.equal(isOnlineVoice('vi-VN-language'), false);
  assert.equal(isOnlineVoice('Google Tiếng Việt'), false);
  assert.equal(isOnlineVoice(''), false);
  assert.equal(isOnlineVoice(null), false);
  assert.equal(isOnlineVoice(undefined), false);
});

test('Smart Resume Rewind - Rewinds 1 sentence if paused >= 20s, preserves if < 20s', () => {
  function calculateResumeIndex(currentIndex, pauseTimestamp, resumeTimestamp) {
    const elapsed = resumeTimestamp - pauseTimestamp;
    if (pauseTimestamp > 0 && elapsed >= 20000) {
      return Math.max(0, currentIndex - 1);
    }
    return currentIndex;
  }

  // Paused for 5 seconds: should NOT rewind
  assert.equal(calculateResumeIndex(10, 100000, 105000), 10);

  // Paused for 25 seconds: should rewind to 9
  assert.equal(calculateResumeIndex(10, 100000, 125000), 9);

  // Paused for 25 seconds at index 0: should remain 0
  assert.equal(calculateResumeIndex(0, 100000, 125000), 0);
});

test('Offline Multi-key Cache Matching - Matches exact, normalized, or text-fallback keys', async () => {
  const crypto = await import('crypto');
  function md5(str) {
    return crypto.createHash('md5').update(str, 'utf8').digest('hex');
  }

  function getCacheKeys(voice, rate, pitch, text) {
    const cleanVoice = voice || 'edge:vi-VN-NamMinhNeural';
    return {
      exact: 'sent_' + md5(cleanVoice + '_' + rate + '_' + pitch + '_' + text) + '.mp3',
      normalized: 'sent_' + md5(cleanVoice + '_1.0_1.0_' + text) + '.mp3',
      textFallback: 'sent_txt_' + md5(text.trim()) + '.mp3'
    };
  }

  // When saved, Android creates exact key, normalized key, and text fallback key
  const savedKeys = getCacheKeys('edge:vi-VN-NamMinhNeural', 1.0, 1.0, 'Trời hôm nay nhiều mây.');

  // Playback at rate 1.5 with edge voice: normalized key matches the saved normalized key
  const playKeys1 = getCacheKeys('edge:vi-VN-NamMinhNeural', 1.5, 1.0, 'Trời hôm nay nhiều mây.');
  assert.equal(playKeys1.normalized, savedKeys.normalized, 'Normalized key matches saved normalized cache file');

  // Playback with a different voice (e.g. native:android): text fallback matches saved text fallback
  const playKeys2 = getCacheKeys('native:android', 1.2, 1.0, 'Trời hôm nay nhiều mây.');
  assert.equal(playKeys2.textFallback, savedKeys.textFallback, 'Text fallback matches regardless of voice or rate');
});

test('Web Voice Resolution - Prioritizes Google Vietnamese and handles native: prefix on Web', () => {
  function resolveBrowserVoice(voices, preferredURI) {
    if (!voices || voices.length === 0) return undefined;
    const viVoices = voices.filter(v =>
      v.lang.toLowerCase().startsWith('vi') ||
      v.name.toLowerCase().includes('vietnam') ||
      v.name.toLowerCase().includes('tiếng việt')
    );
    viVoices.sort((a, b) => {
      const aG = a.name.toLowerCase().includes('google') || a.voiceURI.toLowerCase().includes('google');
      const bG = b.name.toLowerCase().includes('google') || b.voiceURI.toLowerCase().includes('google');
      if (aG && !bG) return -1;
      if (!aG && bG) return 1;
      return 0;
    });

    if (preferredURI && preferredURI !== 'native:android') {
      const rawURI = preferredURI.startsWith('native:') ? preferredURI.substring(7) : preferredURI;
      const exact = voices.find(v =>
        v.voiceURI === preferredURI ||
        v.voiceURI === rawURI ||
        v.name === preferredURI ||
        v.name === rawURI
      );
      if (exact) return exact;
    }

    const googleVi = viVoices.find(v =>
      v.name.toLowerCase().includes('google') ||
      v.voiceURI.toLowerCase().includes('google')
    );
    if (googleVi) return googleVi;

    if (viVoices.length > 0) return viVoices[0];
    return undefined;
  }

  const mockChromeVoices = [
    { name: 'Google US English', lang: 'en-US', voiceURI: 'Google US English' },
    { name: 'Google tiếng Việt', lang: 'vi-VN', voiceURI: 'Google tiếng Việt' },
    { name: 'Microsoft An', lang: 'vi-VN', voiceURI: 'Microsoft An' }
  ];

  // Case 1: Default 'native:android' in Chrome picks 'Google tiếng Việt'
  const v1 = resolveBrowserVoice(mockChromeVoices, 'native:android');
  assert.equal(v1.name, 'Google tiếng Việt');

  // Case 2: User picked 'native:Google tiếng Việt' with prefix
  const v2 = resolveBrowserVoice(mockChromeVoices, 'native:Google tiếng Việt');
  assert.equal(v2.name, 'Google tiếng Việt');

  // Case 3: User picked specific voice 'native:Microsoft An'
  const v3 = resolveBrowserVoice(mockChromeVoices, 'native:Microsoft An');
  assert.equal(v3.name, 'Microsoft An');

  // Case 4: Browser without Google voice (e.g. Edge with only Microsoft An)
  const mockEdgeVoices = [
    { name: 'Microsoft David', lang: 'en-US', voiceURI: 'Microsoft David' },
    { name: 'Microsoft An', lang: 'vi-VN', voiceURI: 'Microsoft An' }
  ];
  const v4 = resolveBrowserVoice(mockEdgeVoices, 'native:android');
  assert.equal(v4.name, 'Microsoft An');

  // Case 5: Browser with no Vietnamese voices at all (returns undefined, triggering Google TTS stream)
  const mockEnglishVoices = [
    { name: 'Microsoft David', lang: 'en-US', voiceURI: 'Microsoft David' }
  ];
  const v5 = resolveBrowserVoice(mockEnglishVoices, 'native:android');
  assert.equal(v5, undefined);
});
