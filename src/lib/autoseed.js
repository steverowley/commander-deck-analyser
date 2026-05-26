/**
 * Auto-seed deck construction. Glues together EDHREC's "people who play
 * this commander also play..." data with Scryfall's bulk card lookup to
 * produce a 99-card deck ready to drop into a new archive entry.
 *
 * Returns { commander, cards, missing } — the cards array uses the
 * same shape the rest of the app expects ({ name, count, scryfall }).
 */

import { fetchRecommendations, topRecommendations } from './edhrec.js';
import { fetchCardsByName } from './scryfall.js';

export async function buildSeededDeck(commander, onProgress) {
  if (!commander?.name) {
    return { commander: null, cards: [], missing: ['no commander'] };
  }
  onProgress?.(`Fetching EDHREC recs for ${commander.name}...`);
  const recs = await fetchRecommendations(commander.name);
  if (!recs) {
    return { commander, cards: [], missing: ['EDHREC has no page for this commander'] };
  }
  const top = topRecommendations(recs, new Set([commander.name.toLowerCase()]), 99);
  const names = top.map((r) => r.name);
  if (names.length === 0) {
    return { commander, cards: [], missing: ['no recommendations'] };
  }
  onProgress?.(`Fetching ${names.length} cards from Scryfall...`);
  const { results, notFound } = await fetchCardsByName(names, onProgress);
  const cards = names
    .map((n) => {
      const card = results[n.toLowerCase()];
      return card ? { name: card.name, count: 1, scryfall: card } : null;
    })
    .filter(Boolean);
  return { commander, cards, missing: notFound };
}
