/**
 * Mana cost rendering.
 *
 * Scryfall hosts an SVG for every Magic symbol at:
 *   https://svgs.scryfall.io/card-symbols/<key>.svg
 *
 * Key convention (brace + slash stripped):
 *   {W}  → W       {2}  → 2       {T}  → T
 *   {W/U} → WU     {2/W} → 2W     {W/P} → WP   (Phyrexian)
 *   {C}  → C       {X}  → X       {S}  → S    (snow)
 *
 * The parser splits a cost string like "{2}{W/U}{B}" into ordered symbol
 * keys; <ManaCost> renders them inline as 1em-square images. Falls back
 * to the raw `{X}` text if Scryfall returns 404 or the image fails.
 */

import React, { useState } from 'react';

const SYMBOL_CDN = 'https://svgs.scryfall.io/card-symbols';

export function parseManaCost(cost) {
  if (!cost) return [];
  const matches = cost.match(/\{[^}]+\}/g) || [];
  return matches.map((m) => m.slice(1, -1).replace('/', ''));
}

export function ManaSymbol({ sym, size = '1em', title }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <span className="font-mono text-[0.85em]" title={title}>
        {`{${sym}}`}
      </span>
    );
  }
  return (
    <img
      src={`${SYMBOL_CDN}/${sym}.svg`}
      alt={title || sym}
      title={title || sym}
      onError={() => setErrored(true)}
      style={{
        width: size,
        height: size,
        display: 'inline-block',
        verticalAlign: '-0.15em',
        // Tiny horizontal breathing room so adjacent symbols inside
        // oracle text (e.g. "{R}{R}{R}") read as a sequence rather
        // than a blob. ManaCost's flex `gap` adds to this for the
        // dedicated cost row but the result is still tight enough to
        // read as a single mana cost.
        marginInline: '0.075em',
      }}
    />
  );
}

/**
 * Render a full mana cost string (e.g. "{2}{W}{U}") as a row of icons.
 * Passing `size` lets callers scale the symbols relative to surrounding
 * type — defaults to 1em so they sit nicely inline with text.
 */
export function ManaCost({ cost, size = '1em', gap = '0.1em' }) {
  const symbols = parseManaCost(cost);
  if (symbols.length === 0) return null;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap }}>
      {symbols.map((s, i) => (
        <ManaSymbol key={i} sym={s} size={size} />
      ))}
    </span>
  );
}
