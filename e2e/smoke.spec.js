/**
 * Smoke test — boot the app, build a small deck, walk every tab without
 * triggering an error boundary. Catches the regressions that unit tests
 * can't: integration glue, render-time crashes, missing exports.
 *
 * APIs are mocked via fixtures.js — runs anywhere.
 */

import { test, expect } from '@playwright/test';
import { mockApis } from './fixtures.js';

const TABS = ['Cards', 'Packages', 'Stages', 'Recs', 'Stats', 'Bracket', 'Probability'];

test.beforeEach(async ({ page }) => {
  await mockApis(page);
  // Clear localStorage so each test runs against a fresh archive.
  await page.addInitScript(() => {
    try {
      window.localStorage.clear();
    } catch {}
  });
});

test('landing page renders the Vault hero', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /deck builder/i })).toBeVisible();
  await expect(page.getByPlaceholder(/enter deck name/i)).toBeVisible();
});

test('create + commander + bulk import walks all 7 tabs without crashing', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(`PAGE: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`CON: ${m.text()}`);
  });

  await page.goto('/');
  await page.getByPlaceholder(/enter deck name/i).fill('Smoke Edgar');
  await page.keyboard.press('Enter');

  // Set commander via the picker
  await page.getByPlaceholder(/card name/i).fill('Edgar Markov');
  await page.waitForTimeout(300);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Edgar Markov' })).toBeVisible({ timeout: 8000 });

  // Bulk import a few cards
  await page.getByRole('button', { name: /bulk import/i }).click();
  const ta = page.locator('textarea').first();
  await ta.fill('1 Sol Ring\n1 Arcane Signet\n1 Bloodghast\n1 Captivating Vampire\n1 Phyrexian Altar');
  await page.getByRole('button', { name: /execute/i }).click();
  await page.waitForTimeout(2000);
  // Close the bulk modal if still open
  const close = page.getByRole('button', { name: /^close$/i }).first();
  if (await close.isVisible().catch(() => false)) await close.click();

  // Walk every tab
  for (const label of TABS) {
    await page.getByRole('button', { name: new RegExp(`^${label}(\\s|$)`) }).first().click();
    await page.waitForTimeout(250);
    // No error boundary should be visible
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page.getByText(/crashed/i)).toHaveCount(0);
  }

  // The mocked Scryfall returns 404s for Google Fonts and Weserv — they're
  // expected. Filter those out before failing.
  const meaningful = errors.filter(
    (e) => !/fonts\.googleapis|weserv|svgs\.scryfall|status of 404|404/.test(e)
  );
  expect(meaningful).toEqual([]);
});

test('renames a deck via inline title edit', async ({ page }) => {
  await page.goto('/');
  await page.getByPlaceholder(/enter deck name/i).fill('Old Name');
  await page.keyboard.press('Enter');

  // Title button shows uppercased name
  await page.getByRole('button', { name: 'OLD NAME', exact: false }).first().click();
  const input = page.locator('input').filter({ hasText: '' }).first();
  // The autofocused input has the deck name as value — clear and retype.
  await page.keyboard.press('Control+A');
  await page.keyboard.type('Renamed Deck');
  await page.keyboard.press('Enter');

  await expect(page.getByText('RENAMED DECK', { exact: false })).toBeVisible();
});

test('share modal copies a link', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.getByPlaceholder(/enter deck name/i).fill('Shareable');
  await page.keyboard.press('Enter');

  await page.getByRole('button', { name: /^share/i }).click();
  await expect(page.getByRole('heading', { name: /share deck/i })).toBeVisible();
  // The link textarea should contain "#d=" with the encoded payload
  const link = await page.locator('textarea').first().inputValue();
  expect(link).toContain('#d=');
});
