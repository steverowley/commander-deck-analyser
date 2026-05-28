import { describe, it, expect } from 'vitest';
import {
  regionForCountry,
  detectRegionFromTimezoneLocale,
  detectRegionViaIp,
  detectRegion,
  REGION_DEFAULTS,
} from './geo.js';

describe('regionForCountry', () => {
  it('maps GB/UK → uk, US → us, EU members → eu', () => {
    expect(regionForCountry('GB')).toBe('uk');
    expect(regionForCountry('uk')).toBe('uk');
    expect(regionForCountry('US')).toBe('us');
    expect(regionForCountry('DE')).toBe('eu');
    expect(regionForCountry('fr')).toBe('eu');
  });

  it('returns null for unmapped or empty codes', () => {
    expect(regionForCountry('JP')).toBe(null);
    expect(regionForCountry('')).toBe(null);
    expect(regionForCountry(null)).toBe(null);
  });
});

describe('detectRegionFromTimezoneLocale', () => {
  it('maps UK timezones to uk', () => {
    expect(detectRegionFromTimezoneLocale({ timeZone: 'Europe/London' })).toBe('uk');
  });

  it('maps other European timezones to eu and American ones to us', () => {
    expect(detectRegionFromTimezoneLocale({ timeZone: 'Europe/Berlin' })).toBe('eu');
    expect(detectRegionFromTimezoneLocale({ timeZone: 'America/New_York' })).toBe('us');
  });

  it('falls back to the locale country code when the timezone is unknown', () => {
    expect(detectRegionFromTimezoneLocale({ timeZone: 'Pacific/Auckland', language: 'en-GB' })).toBe('uk');
    expect(detectRegionFromTimezoneLocale({ timeZone: null, language: 'de-DE' })).toBe('eu');
  });

  it('returns null when nothing matches', () => {
    expect(detectRegionFromTimezoneLocale({ timeZone: 'Asia/Tokyo', language: 'ja-JP' })).toBe(null);
  });
});

const okResponse = (country_code) => ({ ok: true, json: async () => ({ country_code }) });

describe('detectRegionViaIp', () => {
  it('maps the IP country_code to a region', async () => {
    const fetchImpl = async () => okResponse('GB');
    expect(await detectRegionViaIp({ fetchImpl })).toBe('uk');
  });

  it('returns null on a non-ok response', async () => {
    const fetchImpl = async () => ({ ok: false });
    expect(await detectRegionViaIp({ fetchImpl })).toBe(null);
  });

  it('returns null when the fetch rejects', async () => {
    const fetchImpl = async () => { throw new Error('network'); };
    expect(await detectRegionViaIp({ fetchImpl })).toBe(null);
  });

  it('returns null when no fetch is available', async () => {
    expect(await detectRegionViaIp({ fetchImpl: null })).toBe(null);
  });
});

describe('detectRegion', () => {
  it('prefers the IP result', async () => {
    const fetchImpl = async () => okResponse('FR');
    expect(await detectRegion({ fetchImpl, timeZone: 'America/New_York' })).toBe('eu');
  });

  it('falls back to timezone/locale when IP detection fails', async () => {
    const fetchImpl = async () => { throw new Error('blocked'); };
    expect(await detectRegion({ fetchImpl, timeZone: 'Europe/London' })).toBe('uk');
  });

  it('resolves to null when both signals are inconclusive', async () => {
    const fetchImpl = async () => okResponse('JP');
    expect(await detectRegion({ fetchImpl, timeZone: 'Asia/Tokyo', language: 'ja-JP' })).toBe(null);
  });
});

describe('REGION_DEFAULTS', () => {
  it('uses GBP + Cardmarket for UK, EUR + Cardmarket for EU, USD + TCGplayer for US', () => {
    expect(REGION_DEFAULTS.uk).toMatchObject({ currency: 'gbp', prefRetailer: 'cardmarket', prefPriceSource: 'cardmarket' });
    expect(REGION_DEFAULTS.eu).toMatchObject({ currency: 'eur', prefRetailer: 'cardmarket', prefPriceSource: 'cardmarket' });
    expect(REGION_DEFAULTS.us).toMatchObject({ currency: 'usd', prefRetailer: 'tcgplayer', prefPriceSource: 'tcgplayer' });
  });
});
