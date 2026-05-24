/**
 * Canned Scryfall + EDHREC responses for the e2e suite.
 *
 * Tests use page.route() to intercept outbound API calls and reply with
 * these payloads, so the suite runs anywhere without depending on the
 * live APIs (and is deterministic — no rate limits, no version drift).
 */

export const SCRYFALL_AUTOCOMPLETE = {
  data: ['Edgar Markov', 'Edgar, Charmed Groom', 'Bedlam Reveler'],
};

const card = (overrides) => ({
  name: overrides.name,
  type_line: overrides.type_line || 'Creature — Vampire',
  oracle_text: overrides.oracle_text || '',
  mana_cost: overrides.mana_cost || '{2}{B}',
  cmc: overrides.cmc ?? 3,
  colors: overrides.colors || ['B'],
  color_identity: overrides.color_identity || ['B'],
  prices: { usd: overrides.usd ?? '1.50' },
  image_uris: { small: 'data:image/svg+xml,%3Csvg/%3E', normal: 'data:image/svg+xml,%3Csvg/%3E' },
  ...overrides,
});

export const EDGAR_MARKOV = card({
  name: 'Edgar Markov',
  type_line: 'Legendary Creature — Vampire Knight',
  oracle_text: 'Eminence — Whenever you cast another Vampire spell, create a 1/1 black Vampire creature token.\nFirst strike, haste.',
  mana_cost: '{3}{R}{W}{B}',
  cmc: 6,
  colors: ['W', 'B', 'R'],
  color_identity: ['W', 'B', 'R'],
  power: '4',
  toughness: '4',
  usd: '12.00',
});

export const SAMPLE_CARDS = {
  'sol ring':            card({ name: 'Sol Ring', type_line: 'Artifact', mana_cost: '{1}', cmc: 1, color_identity: [], colors: [], oracle_text: '{T}: Add {C}{C}.', usd: '2.00' }),
  'bloodghast':          card({ name: 'Bloodghast', oracle_text: 'Bloodghast can\'t block. Landfall.', usd: '5.50' }),
  'arcane signet':       card({ name: 'Arcane Signet', type_line: 'Artifact', mana_cost: '{2}', cmc: 2, color_identity: [], colors: [], usd: '1.20' }),
  'captivating vampire': card({ name: 'Captivating Vampire', usd: '0.80' }),
  'phyrexian altar':     card({ name: 'Phyrexian Altar', type_line: 'Artifact', mana_cost: '{3}', cmc: 3, color_identity: [], colors: [], oracle_text: 'Sacrifice a creature: Add one mana of any color.', usd: '40.00' }),
};

/** Wires page routes for Scryfall + EDHREC into the given Playwright page. */
export async function mockApis(page) {
  await page.route('**/api.scryfall.com/cards/autocomplete*', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SCRYFALL_AUTOCOMPLETE) })
  );

  await page.route('**/api.scryfall.com/cards/named*', (route) => {
    const url = new URL(route.request().url());
    const name = (url.searchParams.get('exact') || url.searchParams.get('fuzzy') || '').toLowerCase();
    if (name.includes('edgar markov')) {
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EDGAR_MARKOV) });
    }
    const hit = SAMPLE_CARDS[name];
    if (hit) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(hit) });
    return route.fulfill({ status: 404 });
  });

  await page.route('**/api.scryfall.com/cards/collection', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const ids = body.identifiers || [];
    const data = [];
    const not_found = [];
    for (const id of ids) {
      const k = (id.name || '').toLowerCase();
      const hit = k.includes('edgar markov') ? EDGAR_MARKOV : SAMPLE_CARDS[k];
      if (hit) data.push(hit);
      else not_found.push(id);
    }
    return route.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({ object: 'list', data, not_found }),
    });
  });

  // EDHREC is optional for the smoke tests — return an empty page so the
  // Recs tab renders without recommendations rather than blocking.
  await page.route('**/json.edhrec.com/**', (route) =>
    route.fulfill({ status: 404 })
  );

  // Don't fetch real fonts or images.
  await page.route('**/fonts.googleapis.com/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('**/images.weserv.nl/**', (route) => route.fulfill({ status: 200, body: '' }));
  await page.route('**/svgs.scryfall.io/**', (route) => route.fulfill({ status: 200, body: '<svg/>' }));
}
