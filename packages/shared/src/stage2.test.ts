import { describe, expect, it } from 'vitest';
import {
  neutralizeCsvFormula,
  normalizeCompanyName,
  normalizeDomain,
  normalizeEmail,
  normalizePhoneNumber,
} from './stage2';

describe('Stage 2 normalization', () => {
  it('normalizes corporate markers, whitespace, and full-width characters', () =>
    expect(normalizeCompanyName(' 株式会社　ＡＩ・テレアポ ')).toBe('aiテレアポ'));
  it.each([
    ['０３－１２３４－５６７８', '0312345678', '+81312345678'],
    ['090-1234-5678', '09012345678', '+819012345678'],
  ])('normalizes Japanese phones', (input, normalized, e164) =>
    expect(normalizePhoneNumber(input)).toMatchObject({
      normalizedNumber: normalized,
      e164Number: e164,
      isValid: true,
    }),
  );
  it('normalizes URL domains and email', () => {
    expect(normalizeDomain('HTTPS://WWW.Example.COM/path')).toBe('example.com');
    expect(normalizeEmail(' User@Example.COM ')).toBe('user@example.com');
  });
  it('neutralizes spreadsheet formulas', () =>
    expect(neutralizeCsvFormula('=HYPERLINK("bad")')).toBe('\'=HYPERLINK("bad")'));
});
