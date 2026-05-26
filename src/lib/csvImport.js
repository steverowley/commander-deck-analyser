/**
 * Moxfield collection CSV importer.
 *
 * Moxfield exports your "haves" as CSV with columns:
 *   Count, Tradelist Count, Name, Edition, Condition, Language, Foil,
 *   Tags, Last Modified, Collector Number, Alter, Proxy, Purchase Price
 *
 * We only care about Count + Name + Foil for the Vault; the rest is
 * preserved as future hooks (printing_id lookup via Edition + Collector
 * Number is a follow-up — for now the user can pick a printing per
 * card via the Art chip after import).
 *
 * detectMoxfieldCsv(text) returns true if the first line looks like a
 * Moxfield export header. parseMoxfieldCsv(text) returns
 * [{ name, count, foil, set, collectorNumber }] rows.
 */

// Map Moxfield's foil enum to our internal style ids.
const FOIL_MAP = {
  '': null,
  foil: 'rainbow',
  etched: 'etched',
};

export function detectMoxfieldCsv(text) {
  const firstLine = (text || '').split(/\r?\n/, 1)[0]?.trim() || '';
  // Check for the signature column headers — order has been stable
  // across Moxfield exports for a while.
  return /["']?Count["']?\s*,\s*["']?Tradelist Count["']?\s*,\s*["']?Name["']?/.test(firstLine);
}

function parseCsvRow(line) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') inQuotes = false;
      else cur += c;
    } else {
      if (c === ',') { out.push(cur); cur = ''; }
      else if (c === '"') inQuotes = true;
      else cur += c;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function parseMoxfieldCsv(text) {
  if (!text) return [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = parseCsvRow(lines[0]).map((h) => h.toLowerCase());
  const idx = (key) => header.indexOf(key.toLowerCase());
  const iCount = idx('Count');
  const iName = idx('Name');
  const iFoil = idx('Foil');
  const iSet = idx('Edition');
  const iCN = idx('Collector Number');
  if (iCount < 0 || iName < 0) return [];

  const out = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = parseCsvRow(lines[r]);
    const name = cells[iName];
    const count = parseInt(cells[iCount], 10);
    if (!name || !Number.isFinite(count) || count <= 0) continue;
    const foilRaw = (iFoil >= 0 ? cells[iFoil] : '').toLowerCase();
    out.push({
      name,
      count,
      foil: FOIL_MAP[foilRaw] !== undefined ? FOIL_MAP[foilRaw] : null,
      set: iSet >= 0 ? cells[iSet] : null,
      collectorNumber: iCN >= 0 ? cells[iCN] : null,
    });
  }
  return out;
}
