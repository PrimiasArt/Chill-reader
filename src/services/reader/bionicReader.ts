/**
 * Bionic Reading Word Splitting Algorithm:
 * Guides the reader's eye through text with artificial fixation points (bolded initial letters).
 */
export function renderBionicWord(word: string): { bold: string; rest: string } {
  if (!word || word.length <= 1) {
    return { bold: word, rest: '' };
  }
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
