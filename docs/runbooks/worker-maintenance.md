# Worker maintenance operations

## Scope

Worker maintenance runs as BullMQ Job Schedulers on `sales-ai-jobs`. No maintenance task uses
`setInterval`. Scheduler IDs and job names are stable and start with `maintenance:`.

## Reliability policy

- Each scheduler is upserted at Worker startup, so multiple Worker startups do not duplicate it.
- Each job has three attempts with exponential backoff.
- Completed history retains 100 jobs; failed history retains 1,000 jobs.
- Each task has an explicit execution timeout.
- A Redis lock prevents concurrent execution of the same maintenance task.
- Database mutations and cleanups are idempotent. Usage counters rebuild from `UsageLedger`.
- Exhausted jobs emit a sanitized structured error and create one deduplicated
  `maintenance_job_retry_exhausted` production incident when PostgreSQL is available.
- If PostgreSQL is unavailable, the incident write failure is itself emitted as a sanitized
  `maintenance_incident_write_failed` operational alert.

## Failure inspection

Inspect retained BullMQ failures using the queue API or an approved BullMQ operations console.
Filter job names by `maintenance:`. Compare the job ID with `ProductionIncident.dedupeKey`, which
uses `job:<job-name>:<job-id>`.

Never copy job payloads, connection strings, exception messages, or environment values into an
incident. The Worker records only job name, attempt count, and error class.

## PostgreSQL recovery

1. Restore PostgreSQL connectivity.
2. Confirm new scheduled jobs complete.
3. Confirm `maintenance:outbox-publish` repairs Outbox gaps and publishes pending events.
4. Confirm `maintenance:usage-counter-rebuild` completes before relying on repaired counters.
5. Resolve the incident with the database outage reference.

Jobs that fail while PostgreSQL is unavailable remain in BullMQ failed history, and future
scheduled occurrences continue automatically.

## Redis recovery

1. Restore Redis connectivity.
2. Confirm the Worker reconnects and the stable Job Schedulers are still present.
3. Restart the Worker only if the connection does not recover within the platform alert window;
   startup safely upserts the same scheduler IDs.
4. Confirm Worker health and Outbox jobs resume.

## Shutdown

Send `SIGTERM` or `SIGINT`. The Worker stops accepting jobs and waits for active jobs, closes the
queue, removes the health key, disconnects Prisma, and finally closes Redis. A shutdown failure is
reported as `worker_shutdown_failed` and sets a nonzero process exit code.
