import { describe, it, expect } from 'vitest';
import { getLatestRelease } from './changelog.js';
import pkg from '../../package.json';

describe('getLatestRelease', () => {
  it('parses the top-most release block', () => {
    const release = getLatestRelease();
    expect(release.version).toBeTruthy();
    expect(release.title).toBeTruthy();
    expect(Array.isArray(release.sections)).toBe(true);
    expect(release.sections.length).toBeGreaterThan(0);
  });

  it('keeps the CHANGELOG top version in lock-step with package.json', () => {
    // Release discipline: every shippable PR bumps package.json AND adds the
    // matching CHANGELOG section. The version chip hover-renders this entry,
    // so a drift here means the landing page advertises the wrong version.
    expect(getLatestRelease().version).toBe(pkg.version);
  });

  it('strips inline markdown (bold, code, links) from bullet text', () => {
    const release = getLatestRelease();
    const allItems = release.sections.flatMap((s) => s.items);
    expect(allItems.length).toBeGreaterThan(0);
    for (const item of allItems) {
      expect(item).not.toContain('**');
      expect(item).not.toContain('`');
      expect(item).not.toMatch(/\]\(/); // no leftover [text](url)
    }
  });

  it('gives every section a heading string and an items array', () => {
    for (const section of getLatestRelease().sections) {
      expect(typeof section.heading).toBe('string');
      expect(Array.isArray(section.items)).toBe(true);
    }
  });

  it('memoises the parsed result (returns the same object reference)', () => {
    expect(getLatestRelease()).toBe(getLatestRelease());
  });
});
