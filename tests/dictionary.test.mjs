import test from 'node:test';
import assert from 'node:assert/strict';
import { lookupHanViet, NOVEL_TERMS, HAN_VIET_SYLLABLES } from '../src/services/dictionary/hanVietDict.ts';

test('Han-Viet & Web Novel Dictionary - Exact Novel Term Match', () => {
  const result = lookupHanViet('Nguyên Anh');
  assert.ok(result.termMatch, 'Should find Nguyên Anh in novel terms');
  assert.equal(result.termMatch.category, 'Cảnh giới');
  assert.equal(result.termMatch.hanzi, '元婴');
  assert.ok(result.termMatch.detailDesc.includes('Kim Đan'));
  assert.equal(result.characterMatches.length, 2, 'Should break down both syllables');
  assert.equal(result.characterMatches[0].hanzi, '元');
  assert.equal(result.characterMatches[1].hanzi, '婴');
});

test('Han-Viet & Web Novel Dictionary - Case and Punctuation Insensitivity', () => {
  const result = lookupHanViet('  "kim đan"! ');
  assert.ok(result.termMatch, 'Should find Kim Đan regardless of quotes and case');
  assert.equal(result.termMatch.term, 'Kim Đan');
  assert.equal(result.termMatch.hanzi, '金丹');
});

test('Han-Viet & Web Novel Dictionary - Syllable-by-syllable Breakdown for Unknown Terms', () => {
  const result = lookupHanViet('Hư Không Kiếm');
  assert.equal(result.characterMatches.length, 3, 'Should find 3 syllables');
  assert.equal(result.characterMatches[0].syllable, 'hư');
  assert.equal(result.characterMatches[0].hanzi, '虚');
  assert.equal(result.characterMatches[2].syllable, 'kiếm');
  assert.equal(result.characterMatches[2].hanzi, '剑');
});

test('Han-Viet & Web Novel Dictionary - Related Terms Lookup', () => {
  const result = lookupHanViet('Kiếm');
  assert.ok(result.relatedTerms.length > 0, 'Should find related novel terms with Kiếm');
  const termNames = result.relatedTerms.map(t => t.term);
  assert.ok(termNames.includes('Kiếm Ý') || termNames.includes('Kiếm Khí'));
});
