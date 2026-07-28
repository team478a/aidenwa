ALTER TABLE "provider_webhook_events"
ADD COLUMN "processing_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "last_attempt_at" TIMESTAMP(3);

ALTER TABLE "real_call_executions"
ADD COLUMN "last_webhook_sequence" INTEGER NOT NULL DEFAULT -1;

ALTER TABLE "production_incidents"
ADD COLUMN "dedupe_key" TEXT;

CREATE UNIQUE INDEX "production_incidents_dedupe_key_key"
ON "production_incidents"("dedupe_key");
