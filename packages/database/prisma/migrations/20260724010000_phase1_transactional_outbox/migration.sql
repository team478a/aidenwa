CREATE TABLE "outbox_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "event_type" TEXT NOT NULL,
  "aggregate_type" TEXT NOT NULL,
  "aggregate_id" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "available_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "locked_at" TIMESTAMP(3),
  "published_at" TIMESTAMP(3),
  "last_error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "outbox_events_status_check"
    CHECK ("status" IN ('pending', 'publishing', 'published', 'failed'))
);

CREATE UNIQUE INDEX "outbox_events_event_type_aggregate_id_key"
  ON "outbox_events"("event_type", "aggregate_id");
CREATE INDEX "outbox_events_status_available_at_idx"
  ON "outbox_events"("status", "available_at");
CREATE INDEX "outbox_events_organization_id_created_at_idx"
  ON "outbox_events"("organization_id", "created_at");
