/**
 * Dialogue & Character Voice Detection Service
 * Analyzes sentences in web novels to distinguish narration from character dialogues (male / female)
 */

export type CharacterRole = 'narrator' | 'male' | 'female';

export interface SentenceRoleAnalysis {
  isDialogue: boolean;
  role: CharacterRole;
  extractedDialogue?: string;
}

const FEMALE_CUES = [
  'nàng', 'nữ tử', 'cô nương', 'tiểu thư', 'sư muội', 'sư tỷ', 'mẫu thân',
  'hoàng hậu', 'công chúa', 'muội muội', 'thê tử', 'nữ hài', 'nha đầu',
  'mỹ phụ', 'thiếu nữ', 'cô ấy', 'nàng ấy', 'mụ', 'bà lão', 'tiểu muội',
  'tiểu nha đầu', 'thánh nữ', 'nữ vương', 'sư phụ nàng', 'nương tử',
  'phu nhân', 'nữ hiệp', 'cô ta', 'nhi', 'nữ nhân'
];

const MALE_CUES = [
  'hắn', 'chàng', 'tiểu tử', 'sư huynh', 'sư đệ', 'lão giả', 'đại hiệp',
  'thiếu gia', 'phụ thân', 'tông chủ', 'hoàng đế', 'nam tử', 'thiếu niên',
  'anh ấy', 'tiên sinh', 'hán tử', 'lão đầu', 'huynh đệ', 'bản tọa',
  'lão phu', 'bản vương', 'trẫm', 'thế tử', 'đại hán', 'lão tổ', 'sư tôn'
];

// Dialogue punctuation patterns
const DIALOGUE_REGEX = /(?:["“「『]([^"”」』]+)["”」』])|^(?:[-—–]\s*(.+))/;

/**
 * Check if sentence represents dialogue or narration, and infer the speaker's gender
 */
export function analyzeSentenceRole(
  sentence: string,
  prevSentence?: string
): SentenceRoleAnalysis {
  const trimmed = sentence.trim();
  if (!trimmed) {
    return { isDialogue: false, role: 'narrator' };
  }

  // 1. Detect dialogue format: Quotes or leading dash
  const match = trimmed.match(DIALOGUE_REGEX);
  const startsWithDash = /^[—–-]\s*/.test(trimmed);
  const containsQuotes = /["“「『]/.test(trimmed) && /["”」』]/.test(trimmed);

  const isDialogue = startsWithDash || containsQuotes || Boolean(match);

  if (!isDialogue) {
    return { isDialogue: false, role: 'narrator' };
  }

  const extractedDialogue = match ? (match[1] || match[2] || trimmed) : trimmed;

  // 2. Identify gender cues in current sentence (dialogue tags like "nàng nói", "hắn cười đáp")
  const lowerSentence = trimmed.toLowerCase();
  
  let femaleScore = 0;
  let maleScore = 0;

  for (const cue of FEMALE_CUES) {
    if (lowerSentence.includes(cue)) {
      femaleScore++;
    }
  }

  for (const cue of MALE_CUES) {
    if (lowerSentence.includes(cue)) {
      maleScore++;
    }
  }

  // 3. If tied or zero, look back at the previous sentence for context (e.g. "Tiêu Viêm lạnh lùng nhìn:")
  if (femaleScore === 0 && maleScore === 0 && prevSentence) {
    const lowerPrev = prevSentence.toLowerCase();
    for (const cue of FEMALE_CUES) {
      if (lowerPrev.includes(cue)) {
        femaleScore += 1.5;
      }
    }
    for (const cue of MALE_CUES) {
      if (lowerPrev.includes(cue)) {
        maleScore += 1.5;
      }
    }
  }

  let role: CharacterRole = 'male'; // Default male voice for dialogue in xianxia
  if (femaleScore > maleScore) {
    role = 'female';
  } else if (maleScore > femaleScore) {
    role = 'male';
  }

  return {
    isDialogue: true,
    role,
    extractedDialogue
  };
}
