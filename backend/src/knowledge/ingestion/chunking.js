export function chunkSource(source, { unit = 'paragraph', maxChars = 3500 } = {}) {
  if (!['verse', 'passage', 'paragraph', 'section', 'commentary'].includes(unit)
      || !Number.isInteger(maxChars) || maxChars < 1 || maxChars > 4000) throw new Error('Invalid chunk policy.');
  // Verse records must be supplied one verse per line; other units are separated by blank lines.
  const separator = unit === 'verse' ? /\n/g : /\n\s*\n/g;
  const chunks = []; let start = 0;
  function add(end) {
    const raw = source.text.slice(start, end);
    const text = raw.trim();
    if (text) {
      if (text.length > maxChars) throw new Error('Semantic unit too long; provide smaller annotated units.');
      const offset = start + raw.indexOf(text);
      chunks.push({ text, location: { unit, index: chunks.length, start: offset, end: offset + text.length } });
    }
  }
  for (const match of source.text.matchAll(separator)) { add(match.index); start = match.index + match[0].length; }
  add(source.text.length);
  if (!chunks.length || chunks.length > 256) throw new Error('Invalid chunk count.');
  return chunks;
}
