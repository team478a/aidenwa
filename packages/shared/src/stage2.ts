const CORPORATE_MARKERS =
  /(?:株式会社|有限会社|合同会社|合資会社|合名会社|一般社団法人|一般財団法人|公益社団法人|公益財団法人|特定非営利活動法人|NPO法人|（株）|\(株\)|㈱|（有）|\(有\)|㈲)/giu;

export function normalizeCompanyName(value: string): string {
  return value
    .normalize('NFKC')
    .replace(CORPORATE_MARKERS, '')
    .replace(/[\s・･._-]+/gu, '')
    .toLowerCase();
}

export type NormalizedPhone = {
  rawNumber: string;
  normalizedNumber: string;
  e164Number: string | null;
  isValid: boolean;
};
export function normalizePhoneNumber(value: string): NormalizedPhone {
  const rawNumber = value.trim();
  const normalizedNumber = rawNumber
    .normalize('NFKC')
    .replace(/[^\d+]/gu, '')
    .replace(/(?!^)\+/gu, '');
  const digits = normalizedNumber.replace(/^\+/u, '');
  const isValid = /^\d{10,11}$/u.test(digits) || /^81\d{9,10}$/u.test(digits);
  let e164Number: string | null = null;
  if (normalizedNumber.startsWith('+81')) e164Number = isValid ? normalizedNumber : null;
  else if (digits.startsWith('81')) e164Number = isValid ? `+${digits}` : null;
  else if (digits.startsWith('0') && isValid) e164Number = `+81${digits.slice(1)}`;
  return { rawNumber, normalizedNumber: digits, e164Number, isValid };
}

export function normalizeDomain(value: string | null | undefined): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.includes('://') ? value : `https://${value}`);
    return url.hostname.toLowerCase().replace(/^www\./u, '');
  } catch {
    return null;
  }
}

export function normalizeEmail(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLowerCase();
  return normalized || null;
}

export function neutralizeCsvFormula(value: string): string {
  return /^[=+\-@\t\r]/u.test(value) ? `'${value}` : value;
}

export const SALES_STATUSES = [
  'uncontacted',
  'planned',
  'contacting',
  'gatekeeper_reached',
  'decision_contact_reached',
  'retry',
  'material_sent',
  'qualified',
  'appointment',
  'negotiating',
  'won',
  'lost',
  'excluded',
  'opt_out',
  'on_hold',
] as const;
