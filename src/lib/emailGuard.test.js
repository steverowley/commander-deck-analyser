import { describe, it, expect } from 'vitest';
import { emailDomain, disposableEmailError, DISPOSABLE_DOMAINS } from './emailGuard.js';

describe('emailDomain', () => {
  it('extracts and lowercases the domain', () => {
    expect(emailDomain('Foo@Example.COM')).toBe('example.com');
  });
  it('trims surrounding whitespace', () => {
    expect(emailDomain('  a@b.com  ')).toBe('b.com');
  });
  it('returns null for malformed / empty input', () => {
    expect(emailDomain('not-an-email')).toBe(null);
    expect(emailDomain('')).toBe(null);
    expect(emailDomain(null)).toBe(null);
    expect(emailDomain('a@b@c')).toBe(null);
  });
});

describe('disposableEmailError', () => {
  it('rejects a known disposable domain', () => {
    expect(disposableEmailError('throwaway@mailinator.com')).toMatch(/disposable/i);
  });
  it('is case-insensitive on the domain', () => {
    expect(disposableEmailError('x@Mailinator.com')).toMatch(/disposable/i);
  });
  it('allows normal providers', () => {
    expect(disposableEmailError('real.person@gmail.com')).toBe(null);
    expect(disposableEmailError('user@outlook.com')).toBe(null);
    expect(disposableEmailError('me@proton.me')).toBe(null);
  });
  it('allows malformed / empty (validated elsewhere)', () => {
    expect(disposableEmailError('')).toBe(null);
    expect(disposableEmailError('nope')).toBe(null);
  });
  it('rejects every domain in the blocklist', () => {
    for (const d of DISPOSABLE_DOMAINS) {
      expect(disposableEmailError(`a@${d}`)).toMatch(/disposable/i);
    }
  });
});
