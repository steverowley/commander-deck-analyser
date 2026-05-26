/**
 * Parses the bundled CHANGELOG.md (loaded at build time via Vite's
 * `?raw` import) and returns the latest release entry as structured
 * data so the UI can render it inline — used by the version chip's
 * hover popover.
 */

import raw from '../../CHANGELOG.md?raw';

let cached = null;

export function getLatestRelease() {
  if (cached) return cached;
  cached = parse(raw);
  return cached;
}

function parse(md) {
  const lines = md.split('\n');
  // Find first ## (top-most version block — most recent).
  const startIdx = lines.findIndex((l) => /^##\s/.test(l));
  if (startIdx < 0) return { version: '', title: '', sections: [] };

  const header = lines[startIdx].replace(/^##\s+/, '').trim();
  // Header is "vX.Y.Z — Title".
  const m = header.match(/^v?(\S+)\s*(?:—|-)\s*(.+)$/);
  const version = m ? m[1] : header;
  const title = m ? m[2] : '';

  // Slice until the next ## (next release) or end.
  let endIdx = lines.findIndex((l, i) => i > startIdx && /^##\s/.test(l));
  if (endIdx < 0) endIdx = lines.length;
  const body = lines.slice(startIdx + 1, endIdx);

  const sections = [];
  let current = null;
  for (const line of body) {
    if (/^###\s/.test(line)) {
      if (current) sections.push(current);
      current = { heading: line.replace(/^###\s+/, '').trim(), items: [] };
    } else if (/^\s*[-*]\s+/.test(line)) {
      if (!current) current = { heading: '', items: [] };
      const text = line.replace(/^\s*[-*]\s+/, '').trim();
      current.items.push(stripMarkdown(text));
    }
  }
  if (current) sections.push(current);

  return { version, title, sections };
}

function stripMarkdown(s) {
  return s
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1');
}
