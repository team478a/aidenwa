-- CreateEnum
CREATE TYPE "LimitedTestStatus" AS ENUM ('draft', 'approved', 'active', 'suspended', 'completed', 'cancelled', 'expired');

-- CreateEnum
CREATE TYPE "RealCallState" AS ENUM ('reserved', 'provider_unknown', 'queued', 'initiated', 'ringing', 'in_progress', 'completed', 'busy', 'no_answer', 'failed', 'canceled');

-- CreateTable
CREATE TABLE "production_test_authorizations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    "status" "LimitedTestStatus" NOT NULL DEFAULT 'draft',
    "release_commit" TEXT NOT NULL,
    "written_approval_commit" TEXT NOT NULL,
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3) NOT NULL,
    "max_calls" INTEGER NOT NULL DEFAULT 5,
    "max_destinations" INTEGER NOT NULL DEFAULT 5,
    "max_call_seconds" INTEGER NOT NULL DEFAULT 120,
    "recording_enabled" BOOLEAN NOT NULL DEFAULT false,
    "transcription_enabled" BOOLEAN NOT NULL DEFAULT false,
    "media_streams_enabled" BOOLEAN NOT NULL DEFAULT false,
    "human_transfer_enabled" BOOLEAN NOT NULL DEFAULT false,
    "approved_allowlist_ids" JSONB NOT NULL DEFAULT '[]',
    "budget_limit_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "activated_by" UUID,
    "activated_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "rollback_status" TEXT NOT NULL DEFAULT 'not_started',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_test_authorizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "real_call_executions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "authorization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "phone_number_id" UUID NOT NULL,
    "allowlist_id" UUID NOT NULL,
    "call_attempt_id" UUID,
    "idempotency_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    "provider_call_id" TEXT,
    "provider_call_id_fingerprint" TEXT,
    "state" "RealCallState" NOT NULL DEFAULT 'reserved',
    "dtmf_result" TEXT,
    "estimated_cost_minor" INTEGER NOT NULL,
    "final_cost_minor" INTEGER,
    "reserved_cost_minor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "provider_unknown" BOOLEAN NOT NULL DEFAULT false,
    "emergency_cancel_status" TEXT,
    "started_at" TIMESTAMP(3),
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "real_call_executions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_test_authorizations_organization_id_status_start_idx" ON "production_test_authorizations"("organization_id", "status", "starts_at", "ends_at");

-- CreateIndex
CREATE UNIQUE INDEX "real_call_executions_call_attempt_id_key" ON "real_call_executions"("call_attempt_id");

-- CreateIndex
CREATE UNIQUE INDEX "real_call_executions_idempotency_key_key" ON "real_call_executions"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "real_call_executions_provider_call_id_key" ON "real_call_executions"("provider_call_id");

-- CreateIndex
CREATE INDEX "real_call_executions_organization_id_state_created_at_idx" ON "real_call_executions"("organization_id", "state", "created_at");

-- CreateIndex
CREATE INDEX "real_call_executions_authorization_id_created_at_idx" ON "real_call_executions"("authorization_id", "created_at");
