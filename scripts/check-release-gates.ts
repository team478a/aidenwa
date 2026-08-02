import { readFile } from 'node:fs/promises';

const disabledFlags = [
  'PRODUCTION_CALLS_ENABLED',
  'REALTIME_AI_ENABLED',
  'TWILIO_MEDIA_STREAMS_ENABLED',
  'ZOOM_PHONE_INTEGRATION_ENABLED',
  'ZOOM_PHONE_OUTBOUND_ENABLED',
  'AI_HANDOFF_ENABLED',
  'CALENDAR_INTEGRATION_ENABLED',
  'AI_APPOINTMENT_BOOKING_ENABLED',
] as const;

const blankSecrets = [
  'TWILIO_ACCOUNT_SID',
  'TWILIO_API_KEY_SID',
  'TWILIO_API_KEY_SECRET',
  'TWILIO_AUTH_TOKEN',
  'TWILIO_FROM_NUMBER',
  'OPENAI_API_KEY',
  'ZOOM_ACCOUNT_ID',
  'ZOOM_CLIENT_ID',
  'ZOOM_CLIENT_SECRET',
  'ZOOM_WEBHOOK_SECRET_TOKEN',
] as const;

async function main() {
  const [example, workflow, railwayExample] = await Promise.all([
    readFile(new URL('../.env.example', import.meta.url), 'utf8'),
    readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8'),
    readFile(new URL('../deploy/railway/mock-only.env.example', import.meta.url), 'utf8'),
  ]);

  const failures: string[] = [];
  for (const flag of disabledFlags) {
    if (!example.includes(`${flag}=false`)) failures.push(`.env.example must disable ${flag}`);
    if (!workflow.includes(`${flag}: 'false'`)) failures.push(`CI must disable ${flag}`);
    if (!railwayExample.includes(`${flag}=false`))
      failures.push(`Railway template must disable ${flag}`);
  }
  if (!example.includes('VOICE_PROVIDER=mock'))
    failures.push('.env.example must use Mock VoiceProvider');
  if (!workflow.includes('VOICE_PROVIDER: mock')) failures.push('CI must use Mock VoiceProvider');
  if (!railwayExample.includes('VOICE_PROVIDER=mock'))
    failures.push('Railway template must use Mock VoiceProvider');
  for (const secret of blankSecrets)
    if (!new RegExp(`^${secret}=\\s*$`, 'm').test(example))
      failures.push(`.env.example must keep ${secret} blank`);
  for (const secret of blankSecrets)
    if (new RegExp(`^${secret}=`, 'm').test(railwayExample))
      failures.push(`Railway template must omit external credential ${secret}`);

  if (failures.length) {
    for (const failure of failures) console.error(`release_gate_failed: ${failure}`);
    process.exitCode = 1;
  } else {
    console.log(
      JSON.stringify({
        result: 'pass',
        externalIntegrationsEnabled: 0,
        realCallsStarted: 0,
        checkedDisabledFlags: disabledFlags.length,
        checkedBlankSecrets: blankSecrets.length,
      }),
    );
  }
}

void main();
