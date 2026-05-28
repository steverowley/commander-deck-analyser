/**
 * Zero-dep PNG export for the Rule Zero card.
 *
 * Draws the card onto an HTMLCanvasElement using nothing but the
 * standard 2D context, then returns a `data:image/png` URL the
 * caller can drop into an <a download> or copy to the clipboard
 * via the Clipboard API.
 *
 * Layout is deliberately compact (768×~700 logical px, 2× device
 * pixels for retina) so the PNG reads cleanly even at the thumbnail
 * size Discord / WhatsApp render.
 */

import { BRACKET_LABELS, flagsLine } from './ruleZero.js';

const W = 768;
const PAD = 40;
const SCALE = 2; // 2× device pixels

const BG = '#0c0a09';        // matches the app's dark palette
const FG = '#f3eedf';        // cream
const FG_DIM = '#7a7466';    // cream/2
const ACCENT = '#d97757';    // warm accent
const RULE = '#3a342b';      // border tone

function wrap(ctx, text, maxWidth) {
  const words = String(text || '').split(/\s+/);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(trial).width > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else {
      cur = trial;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

/**
 * Render the card and return both the canvas and its data URL.
 * Returns null in non-DOM environments (server / unit tests).
 */
export function ruleZeroToPng(card) {
  if (!card || typeof document === 'undefined') return null;

  // First pass — measure so we can size the canvas to the content.
  const measure = document.createElement('canvas').getContext('2d');
  measure.font = '14px ui-serif, Georgia, serif';
  const innerW = W - PAD * 2;

  const winLineHeight = 22;
  let winLines = 0;
  for (const w of card.winCons || []) winLines += wrap(measure, `• ${w}`, innerW).length;

  let reasonLines = 0;
  for (const r of card.bracketReasons || []) reasonLines += wrap(measure, `• ${r}`, innerW).length;

  const headerH = 120;
  const subStatsH = 100;
  const winH = 60 + winLines * winLineHeight;
  const flagsH = 80;
  const reasonsH = card.bracketReasons?.length ? 50 + reasonLines * winLineHeight : 0;
  const footerH = 50;
  const H = PAD * 2 + headerH + subStatsH + winH + flagsH + reasonsH + footerH;

  // Real canvas at 2× device pixels for crispness.
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  const ctx = canvas.getContext('2d');
  ctx.scale(SCALE, SCALE);

  // Background
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, W, H);

  // Outer border
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.strokeRect(PAD - 12, PAD - 12, W - (PAD - 12) * 2, H - (PAD - 12) * 2);

  let y = PAD;

  // Vault watermark
  ctx.fillStyle = FG_DIM;
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('VAULT · RULE ZERO CARD', PAD, y);
  y += 28;

  // Deck name
  ctx.fillStyle = FG;
  ctx.font = 'bold 30px ui-serif, Georgia, serif';
  ctx.fillText(card.deckName || 'Untitled', PAD, y);
  y += 36;

  // Commander + colors
  if (card.commanderName) {
    ctx.fillStyle = FG_DIM;
    ctx.font = '15px ui-serif, Georgia, serif';
    ctx.fillText(`${card.commanderName} · ${card.colors || 'C'}`, PAD, y);
    y += 28;
  }

  // Stats row — bracket / archetype / avg cmc / threat turn
  y += 16;
  const stats = [
    ['Bracket', card.bracket ? `${card.bracket}  ${BRACKET_LABELS[card.bracket] || ''}` : '—'],
    ['Archetype', card.archetype?.name || '—'],
    ['Avg CMC', Number.isFinite(card.avgCmc) ? card.avgCmc.toFixed(2) : '—'],
    ['Threat turn', Number.isFinite(card.fastestWinTurn) ? `T${card.fastestWinTurn}` : '—'],
  ];
  const cellW = innerW / stats.length;
  for (let i = 0; i < stats.length; i++) {
    const [label, value] = stats[i];
    const x = PAD + i * cellW;
    ctx.fillStyle = FG_DIM;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText(label.toUpperCase(), x, y);
    ctx.fillStyle = FG;
    ctx.font = 'bold 18px ui-serif, Georgia, serif';
    ctx.fillText(value, x, y + 22);
  }
  y += 60;

  // Divider
  ctx.strokeStyle = RULE;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
  y += 24;

  // Win conditions
  ctx.fillStyle = FG_DIM;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('WIN CONDITIONS', PAD, y);
  y += 20;
  ctx.font = '14px ui-serif, Georgia, serif';
  ctx.fillStyle = FG;
  for (const w of card.winCons || []) {
    const lines = wrap(ctx, `• ${w}`, innerW);
    for (const line of lines) {
      ctx.fillText(line, PAD, y);
      y += winLineHeight;
    }
  }
  y += 14;

  // Flags
  ctx.fillStyle = FG_DIM;
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillText('AUTO-DERIVED FLAGS', PAD, y);
  y += 20;
  ctx.fillStyle = ACCENT;
  ctx.font = 'bold 16px ui-serif, Georgia, serif';
  ctx.fillText(flagsLine(card.flags || {}), PAD, y);
  y += 40;

  // Bracket reasons
  if (card.bracketReasons?.length) {
    ctx.fillStyle = FG_DIM;
    ctx.font = '10px ui-monospace, monospace';
    ctx.fillText('BRACKET NOTES', PAD, y);
    y += 20;
    ctx.fillStyle = FG;
    ctx.font = '13px ui-serif, Georgia, serif';
    for (const r of card.bracketReasons) {
      const lines = wrap(ctx, `• ${r}`, innerW);
      for (const line of lines) {
        ctx.fillText(line, PAD, y);
        y += winLineHeight - 2;
      }
    }
    y += 14;
  }

  // Footer
  ctx.fillStyle = FG_DIM;
  ctx.font = 'italic 11px ui-serif, Georgia, serif';
  ctx.fillText('Generated by Vault. Flags are auto-derived from the deck.', PAD, H - PAD + 6);

  return { canvas, dataUrl: canvas.toDataURL('image/png') };
}

/**
 * Trigger a download of the card as a PNG file. No-op in
 * non-DOM environments.
 */
export function downloadRuleZeroPng(card, filename = 'rule-zero.png') {
  const out = ruleZeroToPng(card);
  if (!out) return false;
  const a = document.createElement('a');
  a.href = out.dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}
