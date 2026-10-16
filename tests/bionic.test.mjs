import test from 'node:test';
import assert from 'node:assert/strict';

export function splitBionicWord(word) {
  if (!word || word.length <= 1) {
    return { bold: word, rest: '' };
  }
  // Strip punctuation from end of word
  const match = word.match(/^([a-zA-ZÀ-ỹ0-9_]+)(.*)$/);
  if (!match) {
    return { bold: '', rest: word };
  }
  const clean = match[1];
  const trailing = match[2];

  let splitPoint = 1;
  if (clean.length <= 3) {
    splitPoint = 1;
  } else if (clean.length <= 5) {
    splitPoint = 2;
  } else {
    splitPoint = Math.ceil(clean.length * 0.45);
  }

  return {
    bold: clean.slice(0, splitPoint),
    rest: clean.slice(splitPoint) + trailing
  };
}

test('Bionic Reading - Splits short and long Vietnamese words accurately', () => {
  assert.deepEqual(splitBionicWord('ta'), { bold: 't', rest: 'a' });
  assert.deepEqual(splitBionicWord('người,'), { bold: 'ng', rest: 'ười,' });
  assert.deepEqual(splitBionicWord('Chương'), { bold: 'Chư', rest: 'ơng' });
  assert.deepEqual(splitBionicWord('huyền'), { bold: 'hu', rest: 'yền' });
});
