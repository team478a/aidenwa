# Production environment validation

The API and Worker parse their environment through the shared
`@sales-ai/validation/env` schemas before opening a database, Redis connection, HTTP listener or job
consumer. A production validation error terminates startup.

## Always required in production

- `DATABASE_URL`
- `REDIS_URL`
- `WEB_ORIGIN`
- `SOURCE_NUMBER_FINGERPRINT_KEY` (at least 16 characters)
- `MOCK_WEBHOOK_SECRET` (at least 16 characters)
- `APPOINTMENT_SLOT_TOKEN_SECRET` (at least 32 characters)
- a non-placeholder `RELEASE_COMMIT`

The development defaults, loopback hosts, `.example.local`, `replace-with-...`, `uncommitted` and
known repository placeholder secrets are rejected in production. `API_HOST` must not be a loopback
address. Validation issues identify only the environment variable; they never include its value.

## Conditional requirements

- Twilio: when the voice provider, production calls or Media Streams are enabled, configure the
  account/API key identifiers, API key secret, Auth Token, originating number and public TwiML and
  callback URLs.
- Realtime AI: when Realtime AI or Media Streams are enabled, configure `OPENAI_API_KEY`,
  `REALTIME_SESSION_TOKEN_SECRET` and the public Media Stream base URL.
- Zoom Phone: when inbound integration or outbound follow-up is enabled, configure the account and
  client identifiers, client secret, webhook secret and phone fingerprint secret.

Provider values must come from the production secret manager. Do not copy values into logs, support
tickets, screenshots, repository files or audit payloads.

## Deployment check

1. Keep every external integration disabled until its separate approval and activation procedure is
   complete.
2. Inject secrets and endpoints through the deployment platform.
3. Start the API and Worker. Any environment validation error blocks the release.
4. Confirm both services become healthy before enabling traffic or job consumption.

Development and test retain local defaults so automated tests never require real credentials or
make external calls.
