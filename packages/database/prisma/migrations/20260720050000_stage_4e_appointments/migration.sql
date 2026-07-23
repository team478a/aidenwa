CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "human_followup_tasks" ADD COLUMN "appointment_id" UUID;
ALTER TABLE "sales_handoff_cards" ADD COLUMN "appointment_id" UUID;

CREATE TABLE "appointment_policies" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "name" TEXT NOT NULL,
  "timezone" TEXT NOT NULL, "meeting_type_code" TEXT NOT NULL, "duration_minutes" INTEGER NOT NULL,
  "buffer_before_minutes" INTEGER NOT NULL DEFAULT 0, "buffer_after_minutes" INTEGER NOT NULL DEFAULT 0,
  "minimum_notice_minutes" INTEGER NOT NULL DEFAULT 60, "maximum_advance_days" INTEGER NOT NULL DEFAULT 30,
  "hold_ttl_minutes" INTEGER NOT NULL DEFAULT 10, "cancellation_deadline_minutes" INTEGER NOT NULL DEFAULT 60,
  "assignment_mode" TEXT NOT NULL DEFAULT 'manual', "status" TEXT NOT NULL DEFAULT 'draft', "version" INTEGER NOT NULL,
  "valid_from" TIMESTAMP(3), "valid_until" TIMESTAMP(3), "created_by" UUID NOT NULL, "published_by" UUID,
  "published_at" TIMESTAMP(3), "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appointment_policies_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "appointment_policy_bounds" CHECK (duration_minutes BETWEEN 15 AND 240 AND buffer_before_minutes BETWEEN 0 AND 120 AND buffer_after_minutes BETWEEN 0 AND 120 AND hold_ttl_minutes BETWEEN 1 AND 30)
);
CREATE UNIQUE INDEX "appointment_policies_organization_id_name_version_key" ON "appointment_policies"("organization_id", "name", "version");
CREATE INDEX "appointment_policies_organization_id_status_idx" ON "appointment_policies"("organization_id", "status");

CREATE TABLE "availability_rules" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "user_id" UUID NOT NULL, "timezone" TEXT NOT NULL,
  "weekday" INTEGER NOT NULL, "start_local_time" TEXT NOT NULL, "end_local_time" TEXT NOT NULL,
  "effective_from" DATE, "effective_until" DATE, "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "availability_rules_pkey" PRIMARY KEY ("id"), CONSTRAINT "availability_weekday" CHECK (weekday BETWEEN 0 AND 6)
);
CREATE INDEX "availability_rules_organization_id_user_id_weekday_active_idx" ON "availability_rules"("organization_id", "user_id", "weekday", "active");

CREATE TABLE "availability_exceptions" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "user_id" UUID NOT NULL, "date" DATE NOT NULL,
  "type" TEXT NOT NULL, "start_at" TIMESTAMP(3), "end_at" TIMESTAMP(3), "reason_code" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "availability_exceptions_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "availability_exceptions_organization_id_user_id_date_idx" ON "availability_exceptions"("organization_id", "user_id", "date");

CREATE TABLE "appointments" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "campaign_id" UUID NOT NULL, "company_id" UUID NOT NULL,
  "contact_id" UUID, "execution_id" UUID, "realtime_session_id" UUID, "handoff_card_id" UUID, "followup_task_id" UUID,
  "assignee_user_id" UUID NOT NULL, "policy_version_id" UUID NOT NULL, "status" TEXT NOT NULL DEFAULT 'held',
  "start_at" TIMESTAMP(3) NOT NULL, "end_at" TIMESTAMP(3) NOT NULL, "busy_start_at" TIMESTAMP(3) NOT NULL, "busy_end_at" TIMESTAMP(3) NOT NULL,
  "display_timezone" TEXT NOT NULL, "hold_expires_at" TIMESTAMP(3), "confirmation_source" TEXT NOT NULL,
  "meeting_type_code" TEXT NOT NULL, "location_type" TEXT NOT NULL DEFAULT 'undecided', "external_provider" TEXT NOT NULL DEFAULT 'none',
  "external_event_fingerprint" TEXT, "idempotency_key" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 0,
  "confirmed_at" TIMESTAMP(3), "cancelled_at" TIMESTAMP(3), "completed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"), CONSTRAINT "appointment_time_order" CHECK (start_at < end_at AND busy_start_at < busy_end_at)
);
CREATE UNIQUE INDEX "appointments_organization_id_idempotency_key_key" ON "appointments"("organization_id", "idempotency_key");
CREATE INDEX "appointments_organization_id_assignee_user_id_start_at_idx" ON "appointments"("organization_id", "assignee_user_id", "start_at");
CREATE INDEX "appointments_organization_id_status_hold_expires_at_idx" ON "appointments"("organization_id", "status", "hold_expires_at");
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_no_overlap" EXCLUDE USING gist (
  "organization_id" WITH =, "assignee_user_id" WITH =, tsrange("busy_start_at", "busy_end_at", '[)') WITH &&
) WHERE ("status" IN ('held', 'confirmed'));

CREATE TABLE "appointment_events" (
  "id" UUID NOT NULL, "organization_id" UUID NOT NULL, "appointment_id" UUID NOT NULL, "type" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL, "actor_id" UUID, "reason_code" TEXT NOT NULL, "before_status" TEXT, "after_status" TEXT,
  "sanitized_metadata" JSONB NOT NULL DEFAULT '{}', "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "appointment_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appointment_events_organization_id_appointment_id_occurred_at_idx" ON "appointment_events"("organization_id", "appointment_id", "occurred_at");
