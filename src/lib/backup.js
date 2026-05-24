/**
 * Full-archive backup + restore.
 *
 * Pure JSON of every deck. Scryfall card data lives inside each deck
 * entry, so a restored backup doesn't need network access to be usable
 * (images and prices still come from Scryfall lazily, but the deck
 * structure + tags + notes survive unchanged).
 *
 * Format (versioned so future changes can migrate):
 *   {
 *     vault: "v1",
 *     exportedAt: 1716552000000,
 *     appVersion: "0.3.0",
 *     decks: Deck[]
 *   }
 */

export const BACKUP_VERSION = 'v1';

export function buildBackup(decks, appVersion = 'unknown') {
  return {
    vault: BACKUP_VERSION,
    exportedAt: Date.now(),
    appVersion,
    decks,
  };
}

/**
 * Parse a backup JSON string into a normalised payload. Throws on
 * malformed input. Callers catch + surface the error.
 */
export function parseBackup(json) {
  let data;
  try {
    data = JSON.parse(json);
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`);
  }
  if (!data || typeof data !== 'object') {
    throw new Error('Backup root must be an object.');
  }
  if (data.vault !== BACKUP_VERSION) {
    throw new Error(`Unknown backup version "${data.vault}" — this Vault expects "${BACKUP_VERSION}".`);
  }
  if (!Array.isArray(data.decks)) {
    throw new Error('Backup is missing a `decks` array.');
  }
  // Sanity-check each deck shape; drop any that look totally wrong rather
  // than failing the whole restore.
  const valid = data.decks.filter((d) => d && typeof d.id === 'string' && typeof d.name === 'string' && Array.isArray(d.cards));
  return {
    ...data,
    decks: valid,
    invalidCount: data.decks.length - valid.length,
  };
}

/**
 * Default filename for the downloaded JSON. Includes date stamp so
 * multiple backups don't collide.
 */
export function backupFilename(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  const y = date.getFullYear();
  const m = pad(date.getMonth() + 1);
  const d = pad(date.getDate());
  return `vault-backup-${y}${m}${d}.json`;
}
