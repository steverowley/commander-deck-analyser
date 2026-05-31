/**
 * Decklist export — plain text, Moxfield, Archidekt formats.
 *
 * All three formats are essentially "one card per line, optional section
 * headers" — the wire format is almost identical across the major
 * deckbuilders. The exporter encodes the same data three ways so users
 * can paste into whichever tool they're using next.
 *
 * Round-trips with `parseTextDecklist` in `deckImport.js` — exporting
 * a Vault deck and reimporting through the paste-box reconstructs the
 * same card list (commander + 99).
 */

/* ─── Sort helper ──────────────────────────────────────────────────────── */

function sortByName(a, b) {
  return a.name.localeCompare(b.name);
}

function nonBasics(cards) {
  return cards.filter((c) => !c.scryfall?.type_line?.match(/Basic Land/i));
}
function basics(cards) {
  return cards.filter((c) => c.scryfall?.type_line?.match(/Basic Land/i));
}

/**
 * Render the deck's mainboard in canonical `<count> <name>` form, with
 * basics grouped at the bottom so the cardboard you'd actually shuffle
 * stays at the top of the list — matches Moxfield's own export
 * conventions.
 */
function mainboardLines(cards) {
  const sortedNon = nonBasics(cards).slice().sort(sortByName);
  const sortedBasics = basics(cards).slice().sort(sortByName);
  const lines = [];
  for (const c of sortedNon) lines.push(`${c.count} ${c.name}`);
  for (const c of sortedBasics) lines.push(`${c.count} ${c.name}`);
  return lines;
}

/* ─── Plain text ───────────────────────────────────────────────────────── */

/**
 * Plain text export — `// Commander` comment header instead of a
 * section block. Compatible with MTGO/Arena paste-import, Tappedout,
 * and the Vault paste-box (`parseTextDecklist` round-trips it).
 */
export function toPlainText(deck) {
  const lines = [];
  if (deck.commander) {
    lines.push('// Commander');
    lines.push(`1 ${deck.commander.name}`);
    lines.push('');
  }
  if (deck.cards?.length) {
    // Emit a `// Deck` reset so a re-parse routes the body lines into
    // the mainboard. Without it, parseTextDecklist would carry the
    // commander section forward and every spell would be tagged as
    // a commander entry.
    if (deck.commander) lines.push('// Deck');
    for (const line of mainboardLines(deck.cards)) lines.push(line);
  }
  if (deck.wishlist?.length) {
    lines.push('');
    lines.push('// Maybeboard');
    for (const c of deck.wishlist.slice().sort(sortByName)) lines.push(`${c.count} ${c.name}`);
  }
  return lines.join('\n');
}

/* ─── Moxfield ─────────────────────────────────────────────────────────── */

/**
 * Moxfield import format. Same body as plain text but uses explicit
 * `Commander` / `Deck` / `Maybeboard` section headers — Moxfield's
 * import box prefers these for unambiguous routing.
 */
export function toMoxfield(deck) {
  const lines = [];
  if (deck.commander) {
    lines.push('Commander');
    lines.push(`1 ${deck.commander.name}`);
    lines.push('');
  }
  if (deck.cards?.length) {
    lines.push('Deck');
    for (const line of mainboardLines(deck.cards)) lines.push(line);
  }
  if (deck.wishlist?.length) {
    lines.push('');
    lines.push('Maybeboard');
    for (const c of deck.wishlist.slice().sort(sortByName)) lines.push(`${c.count} ${c.name}`);
  }
  return lines.join('\n');
}

/* ─── Archidekt ────────────────────────────────────────────────────────── */

/**
 * Archidekt's text-import format. Archidekt parses the same Moxfield-
 * shaped block but additionally accepts `(SET) <num>` printing tags
 * after the card name — we emit them when the card has a known set +
 * collector number so the importer can pin the exact printing on the
 * far side.
 */
export function toArchidekt(deck) {
  const lines = [];
  const formatLine = (c) => {
    const setCode = (c.scryfall?.set || '').toUpperCase();
    const cn = c.scryfall?.collector_number || '';
    const suffix = setCode && cn ? ` (${setCode}) ${cn}` : '';
    return `${c.count} ${c.name}${suffix}`;
  };
  if (deck.commander) {
    lines.push('Commander');
    const c = { count: 1, name: deck.commander.name, scryfall: deck.commander };
    lines.push(formatLine(c));
    lines.push('');
  }
  if (deck.cards?.length) {
    lines.push('Deck');
    const sortedNon = nonBasics(deck.cards).slice().sort(sortByName);
    const sortedBasics = basics(deck.cards).slice().sort(sortByName);
    for (const c of sortedNon) lines.push(formatLine(c));
    for (const c of sortedBasics) lines.push(formatLine(c));
  }
  if (deck.wishlist?.length) {
    lines.push('');
    lines.push('Maybeboard');
    for (const c of deck.wishlist.slice().sort(sortByName)) {
      lines.push(formatLine({ count: c.count, name: c.name, scryfall: c.scryfall }));
    }
  }
  return lines.join('\n');
}

/* ─── Dispatch + URL helpers ───────────────────────────────────────────── */

export const EXPORT_FORMATS = [
  { id: 'text',      label: 'Plain text',  builder: toPlainText, ext: 'txt' },
  { id: 'moxfield',  label: 'Moxfield',    builder: toMoxfield,  ext: 'txt' },
  { id: 'archidekt', label: 'Archidekt',   builder: toArchidekt, ext: 'txt' },
];

export function exportAs(deck, formatId) {
  const fmt = EXPORT_FORMATS.find((f) => f.id === formatId) || EXPORT_FORMATS[0];
  return fmt.builder(deck);
}

/**
 * Moxfield's import box lives at this URL. We can't pre-fill it via
 * URL params (their importer requires a paste), so callers should
 * copy the text to the clipboard, then open this URL in a new tab so
 * the user can paste straight in.
 */
export const MOXFIELD_IMPORT_URL = 'https://www.moxfield.com/decks/personal/import';
export const ARCHIDEKT_IMPORT_URL = 'https://archidekt.com/new_deck';
