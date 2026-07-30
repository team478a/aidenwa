import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const serviceSource = readFileSync(
  fileURLToPath(new URL('./mock-call.service.ts', import.meta.url)),
  'utf8',
);
const compatibilitySource = readFileSync(
  fileURLToPath(new URL('../../mock-call.ts', import.meta.url)),
  'utf8',
);

describe('mock call module boundary', () => {
  it('keeps production providers unreachable from mock execution', () => {
    expect(serviceSource).toContain('MockVoiceProvider');
    expect(serviceSource).not.toMatch(
      /TwilioVoiceProvider|ProductionVoiceProvider|providerFromEnv/,
    );
  });

  it('keeps the legacy entry point free of execution logic', () => {
    expect(compatibilitySource).toContain("from './modules/mock-calls/");
    expect(compatibilitySource).not.toContain('createCall(');
    expect(compatibilitySource).not.toContain('$transaction(');
  });
});
