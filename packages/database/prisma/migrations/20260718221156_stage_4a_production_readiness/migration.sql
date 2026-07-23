-- CreateEnum
CREATE TYPE "ProductionApprovalStatus" AS ENUM ('draft', 'reviewing', 'approved', 'rejected', 'suspended', 'expired');

-- CreateEnum
CREATE TYPE "EmergencyStopScope" AS ENUM ('system', 'organization', 'campaign', 'product', 'provider');

-- CreateEnum
CREATE TYPE "ReadinessState" AS ENUM ('complete', 'incomplete', 'expired', 'review_required', 'unavailable');

-- AlterEnum
ALTER TYPE "UserRole" ADD VALUE 'system_admin';

-- CreateTable
CREATE TABLE "production_call_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "status" "ProductionApprovalStatus" NOT NULL DEFAULT 'draft',
    "target_regions" JSONB NOT NULL DEFAULT '[]',
    "product_ids" JSONB NOT NULL DEFAULT '[]',
    "purpose" TEXT NOT NULL DEFAULT '',
    "ai_disclosure" TEXT NOT NULL DEFAULT '',
    "recording_enabled" BOOLEAN NOT NULL DEFAULT false,
    "recording_consent_method" TEXT NOT NULL DEFAULT '',
    "transcription_enabled" BOOLEAN NOT NULL DEFAULT false,
    "personal_data_retention_days" INTEGER,
    "callable_weekdays" JSONB NOT NULL DEFAULT '[]',
    "callable_start_time" TEXT NOT NULL DEFAULT '',
    "callable_end_time" TEXT NOT NULL DEFAULT '',
    "daily_call_limit" INTEGER,
    "hourly_call_limit" INTEGER,
    "concurrent_call_limit" INTEGER,
    "max_attempts_per_company" INTEGER,
    "min_retry_interval_minutes" INTEGER,
    "opt_out_owner" TEXT NOT NULL DEFAULT '',
    "emergency_stop_owner" TEXT NOT NULL DEFAULT '',
    "privacy_owner" TEXT NOT NULL DEFAULT '',
    "planned_provider" TEXT NOT NULL DEFAULT '',
    "data_residency" TEXT NOT NULL DEFAULT '',
    "cross_border_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "human_transfer_method" TEXT NOT NULL DEFAULT '',
    "limited_test_call_limit" INTEGER,
    "expires_at" TIMESTAMP(3),
    "approval_basis" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "requested_by" UUID,
    "requested_at" TIMESTAMP(3),
    "decided_by" UUID,
    "decided_at" TIMESTAMP(3),
    "decision_reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_call_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_call_policies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "daily_call_limit" INTEGER NOT NULL DEFAULT 10,
    "hourly_call_limit" INTEGER NOT NULL DEFAULT 5,
    "concurrent_call_limit" INTEGER NOT NULL DEFAULT 1,
    "max_call_duration_seconds" INTEGER NOT NULL DEFAULT 600,
    "daily_duration_limit_seconds" INTEGER NOT NULL DEFAULT 3600,
    "monthly_budget_minor" INTEGER NOT NULL DEFAULT 0,
    "daily_budget_minor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "limited_test_call_limit" INTEGER NOT NULL DEFAULT 1,
    "mock_cost_per_call_minor" INTEGER NOT NULL DEFAULT 10,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_call_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "emergency_stops" (
    "id" UUID NOT NULL,
    "organization_id" UUID,
    "scope" "EmergencyStopScope" NOT NULL,
    "scope_id" TEXT,
    "reason" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "activated_by" UUID NOT NULL,
    "activated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_by" UUID,
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,

    CONSTRAINT "emergency_stops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_configurations" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL DEFAULT false,
    "production_enabled" BOOLEAN NOT NULL DEFAULT false,
    "secret_reference_key" TEXT,
    "updated_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provider_configurations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "test_call_allowlists" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "normalized_phone_number" TEXT NOT NULL,
    "phone_last_four" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "owner_name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "consent_confirmed" BOOLEAN NOT NULL DEFAULT false,
    "registered_by" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "test_call_allowlists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "provider_webhook_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "provider_event_id" TEXT NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_timestamp" TIMESTAMP(3) NOT NULL,
    "call_attempt_id" UUID,
    "campaign_id" UUID,
    "sequence_number" INTEGER,
    "normalized_data" JSONB NOT NULL DEFAULT '{}',
    "processing_status" TEXT NOT NULL DEFAULT 'received',
    "failure_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "provider_webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_usage_counters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "period_type" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "call_count" INTEGER NOT NULL DEFAULT 0,
    "active_calls" INTEGER NOT NULL DEFAULT 0,
    "duration_seconds" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_usage_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_budget_counters" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "period_type" TEXT NOT NULL,
    "period_start" TIMESTAMP(3) NOT NULL,
    "amount_minor" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'JPY',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_budget_counters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_gate_decisions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID,
    "company_id" UUID,
    "phone_number_id" UUID,
    "provider" TEXT NOT NULL,
    "allowed" BOOLEAN NOT NULL,
    "reason_codes" JSONB NOT NULL DEFAULT '[]',
    "evaluated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "production_gate_decisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "production_call_approvals_organization_id_status_idx" ON "production_call_approvals"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "production_call_policies_organization_id_key" ON "production_call_policies"("organization_id");

-- CreateIndex
CREATE INDEX "emergency_stops_active_scope_organization_id_scope_id_idx" ON "emergency_stops"("active", "scope", "organization_id", "scope_id");

-- CreateIndex
CREATE UNIQUE INDEX "provider_configurations_organization_id_provider_key" ON "provider_configurations"("organization_id", "provider");

-- CreateIndex
CREATE INDEX "test_call_allowlists_organization_id_active_expires_at_idx" ON "test_call_allowlists"("organization_id", "active", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "test_call_allowlists_organization_id_normalized_phone_numbe_key" ON "test_call_allowlists"("organization_id", "normalized_phone_number");

-- CreateIndex
CREATE INDEX "provider_webhook_events_organization_id_created_at_idx" ON "provider_webhook_events"("organization_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "provider_webhook_events_provider_provider_event_id_key" ON "provider_webhook_events"("provider", "provider_event_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_usage_counters_organization_id_period_type_period_star_key" ON "call_usage_counters"("organization_id", "period_type", "period_start");

-- CreateIndex
CREATE UNIQUE INDEX "call_budget_counters_organization_id_period_type_period_sta_key" ON "call_budget_counters"("organization_id", "period_type", "period_start");

-- CreateIndex
CREATE INDEX "production_gate_decisions_organization_id_evaluated_at_idx" ON "production_gate_decisions"("organization_id", "evaluated_at" DESC);
