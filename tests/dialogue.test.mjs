import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeSentenceRole } from '../src/services/tts/dialogueDetector.ts';

test('Dialogue Detector - Narration detection', () => {
  const sentence = 'Gió thu xào xạc thổi qua đỉnh núi, lá vàng rụng đầy đất.';
  const res = analyzeSentenceRole(sentence);
  assert.equal(res.isDialogue, false);
  assert.equal(res.role, 'narrator');
});

test('Dialogue Detector - Female dialogue with quotation and cue', () => {
  const sentence = '“Tiêu Viêm ca ca, muội nhất định sẽ đợi huynh trở về!” - Nàng mỉm cười nói.';
  const res = analyzeSentenceRole(sentence);
  assert.equal(res.isDialogue, true);
  assert.equal(res.role, 'female');
});

test('Dialogue Detector - Male dialogue with dash and cue', () => {
  const sentence = '- Lũ giun dế các ngươi dám động đến tông môn ta sao? - Lão giả quát lớn.';
  const res = analyzeSentenceRole(sentence);
  assert.equal(res.isDialogue, true);
  assert.equal(res.role, 'male');
});

test('Dialogue Detector - Contextual previous sentence cue', () => {
  const prev = 'Vân Vận cô nương nhẹ nhàng bước tới, ánh mắt phức tạp:';
  const curr = '“Ngươi đi đi, đừng bao giờ quay lại đây nữa.”';
  const res = analyzeSentenceRole(curr, prev);
  assert.equal(res.isDialogue, true);
  assert.equal(res.role, 'female');
});
