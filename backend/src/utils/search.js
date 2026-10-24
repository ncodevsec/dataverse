/** Splits a search box into #tags and plain words: "ali #bd #news" -> { tags: ['bd','news'], words: ['ali'] }. */
export function parseSearch(q = '') {
  const tags = []; const words = [];
  for (const t of String(q).split(/\s+/).filter(Boolean).slice(0, 8)) {
    if (t.startsWith('#')) { const tag = t.replace(/^#+/, '').toLowerCase(); if (tag) tags.push(tag); } else words.push(t);
  }
  return { tags: [...new Set(tags)], words: words.slice(0, 6) };
}
