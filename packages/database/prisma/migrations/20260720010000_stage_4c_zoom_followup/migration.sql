ALTER TABLE "human_followup_tasks"
  ADD COLUMN "company_id" UUID,
  ADD COLUMN "contact_id" UUID,
  ADD COLUMN "source" TEXT NOT NULL DEFAULT 'ai_realtime',
  ADD COLUMN "reason_code" TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN "due_at" TIMESTAMP(3),
  ADD COLUMN "assigned_at" TIMESTAMP(3),
  ADD COLUMN "first_opened_at" TIMESTAMP(3),
  ADD COLUMN "first_attempted_at" TIMESTAMP(3),
  ADD COLUMN "first_connected_at" TIMESTAMP(3),
  ADD COLUMN "snoozed_until" TIMESTAMP(3),
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "next_action_code" TEXT,
  ADD COLUMN "next_action_at" TIMESTAMP(3),
  ADD COLUMN "zoom_call_fingerprint" TEXT,
  ADD COLUMN "note" TEXT,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "human_followup_tasks_organization_id_contact_id_reason_code_status_idx"
  ON "human_followup_tasks"("organization_id", "contact_id", "reason_code", "status");
CREATE INDEX "human_followup_tasks_organization_id_phone_number_id_reason_code_status_idx"
  ON "human_followup_tasks"("organization_id", "phone_number_id", "reason_code", "status");
CREATE INDEX "human_followup_tasks_organization_id_due_at_status_idx"
  ON "human_followup_tasks"("organization_id", "due_at", "status");

CREATE TABLE "followup_assignment_rules" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "mode" TEXT NOT NULL DEFAULT 'none',
  "team_id" UUID,
  "campaign_id" UUID,
  "fixed_assignee_id" UUID,
  "round_robin_cursor" INTEGER NOT NULL DEFAULT 0,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "followup_assignment_rules_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "followup_assignment_rules_organization_id_campaign_id_key"
  ON "followup_assignment_rules"("organization_id", "campaign_id");

CREATE TABLE "followup_notifications" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "user_id" UUID,
  "task_id" UUID,
  "type" TEXT NOT NULL,
  "dedupe_key" TEXT NOT NULL,
  "read_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "followup_notifications_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "followup_notifications_dedupe_key_key" ON "followup_notifications"("dedupe_key");
CREATE INDEX "followup_notifications_organization_id_user_id_read_at_created_at_idx"
  ON "followup_notifications"("organization_id", "user_id", "read_at", "created_at" DESC);

CREATE TABLE "zoom_phone_events" (
  "id" UUID NOT NULL,
  "organization_id" UUID,
  "event_fingerprint" TEXT NOT NULL,
  "zoom_call_fingerprint" TEXT,
  "zoom_user_fingerprint" TEXT,
  "destination_fingerprint" TEXT,
  "direction" TEXT,
  "normalized_result" TEXT,
  "status" TEXT NOT NULL DEFAULT 'received',
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "sanitized_metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "zoom_phone_events_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "zoom_phone_events_event_fingerprint_key" ON "zoom_phone_events"("event_fingerprint");
CREATE INDEX "zoom_phone_events_organization_id_status_occurred_at_idx"
  ON "zoom_phone_events"("organization_id", "status", "occurred_at");

CREATE TABLE "followup_attempts" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "task_id" UUID NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "result_code" TEXT NOT NULL,
  "attempted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "followup_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "followup_attempts_organization_id_idempotency_key_key"
  ON "followup_attempts"("organization_id", "idempotency_key");
CREATE INDEX "followup_attempts_organization_id_task_id_attempted_at_idx"
  ON "followup_attempts"("organization_id", "task_id", "attempted_at");
