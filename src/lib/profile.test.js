import { describe, it, expect } from 'vitest';
// Import from the pure module, not profile.js — profile.js pulls in the
// Supabase client, which throws at load on Node < 22 (the CI runner).
import { validateUsername } from './profileValidation.js';

describe('validateUsername', () => {
  it('accepts a simple valid handle', () => {
    expect(validateUsername('edgar')).toBeNull();
    expect(validateUsername('Edgar_Markov-99')).toBeNull();
  });

  it('accepts handles starting with a digit or underscore', () => {
    expect(validateUsername('1up')).toBeNull();
    expect(validateUsername('_hidden')).toBeNull();
  });

  it('requires a value', () => {
    expect(validateUsername('')).toMatch(/required/i);
    expect(validateUsername(null)).toMatch(/required/i);
    expect(validateUsername(undefined)).toMatch(/required/i);
  });

  it('rejects handles shorter than 2 characters', () => {
    expect(validateUsername('a')).toMatch(/at least 2/i);
  });

  it('rejects handles longer than 24 characters', () => {
    expect(validateUsername('a'.repeat(25))).toMatch(/24 characters or fewer/i);
  });

  it('accepts the boundary lengths (2 and 24)', () => {
    expect(validateUsername('ab')).toBeNull();
    expect(validateUsername('a'.repeat(24))).toBeNull();
  });

  it('rejects a leading hyphen', () => {
    expect(validateUsername('-nope')).toMatch(/letters, digits/i);
  });

  it('rejects spaces and disallowed punctuation', () => {
    expect(validateUsername('has space')).toMatch(/letters, digits/i);
    expect(validateUsername('bang!')).toMatch(/letters, digits/i);
    expect(validateUsername('dot.dot')).toMatch(/letters, digits/i);
  });

  it('trims surrounding whitespace before validating', () => {
    expect(validateUsername('  edgar  ')).toBeNull();
  });
});
