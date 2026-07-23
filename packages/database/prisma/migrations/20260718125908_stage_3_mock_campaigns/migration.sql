-- CreateEnum
CREATE TYPE "VersionStatus" AS ENUM ('draft', 'published', 'archived');

-- CreateEnum
CREATE TYPE "ResourceStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'ready', 'running', 'paused', 'completed', 'cancelled', 'archived');

-- CreateEnum
CREATE TYPE "CampaignTargetStatus" AS ENUM ('pending', 'reserved', 'queued', 'in_progress', 'retry_wait', 'completed', 'excluded', 'cancelled');

-- CreateEnum
CREATE TYPE "EligibilityStatus" AS ENUM ('eligible', 'excluded');

-- CreateEnum
CREATE TYPE "CallJobStatus" AS ENUM ('queued', 'reserved', 'dispatching', 'in_progress', 'completed', 'failed', 'cancelled', 'skipped');

-- CreateEnum
CREATE TYPE "ScenarioNodeType" AS ENUM ('start', 'speak', 'listen', 'branch', 'faq_lookup', 'qualify', 'schedule_request', 'transfer_request', 'opt_out', 'end');

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "category" TEXT,
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "owner_user_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "summary" TEXT NOT NULL DEFAULT '',
    "target_customer" TEXT NOT NULL DEFAULT '',
    "customer_problems" JSONB NOT NULL DEFAULT '[]',
    "value_propositions" JSONB NOT NULL DEFAULT '[]',
    "differentiators" JSONB NOT NULL DEFAULT '[]',
    "pricing_summary" TEXT NOT NULL DEFAULT '',
    "qualification_conditions" JSONB NOT NULL DEFAULT '[]',
    "disqualification_conditions" JSONB NOT NULL DEFAULT '[]',
    "required_disclosures" JSONB NOT NULL DEFAULT '[]',
    "prohibited_claims" JSONB NOT NULL DEFAULT '[]',
    "appointment_goal" TEXT NOT NULL DEFAULT '',
    "source_metadata" JSONB NOT NULL DEFAULT '{}',
    "published_by" UUID,
    "published_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "owner_user_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "ai_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_agent_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "ai_agent_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "display_name" TEXT NOT NULL,
    "role_description" TEXT NOT NULL DEFAULT '',
    "language" TEXT NOT NULL DEFAULT 'ja',
    "speaking_style" TEXT NOT NULL DEFAULT 'professional',
    "politeness_level" INTEGER NOT NULL DEFAULT 3,
    "speaking_speed" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "interruption_policy" TEXT NOT NULL DEFAULT 'listen',
    "silence_timeout_seconds" INTEGER NOT NULL DEFAULT 10,
    "max_turns" INTEGER NOT NULL DEFAULT 20,
    "max_call_duration_seconds" INTEGER NOT NULL DEFAULT 600,
    "opening_policy" TEXT NOT NULL DEFAULT '',
    "identity_disclosure" TEXT NOT NULL DEFAULT '',
    "ai_disclosure" TEXT NOT NULL DEFAULT '',
    "recording_disclosure" TEXT NOT NULL DEFAULT '',
    "prohibited_topics" JSONB NOT NULL DEFAULT '[]',
    "escalation_rules" JSONB NOT NULL DEFAULT '[]',
    "fallback_message" TEXT NOT NULL DEFAULT '',
    "closing_message" TEXT NOT NULL DEFAULT '',
    "published_by" UUID,
    "published_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_agent_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversation_scenarios" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "conversation_scenarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_versions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scenario_id" UUID NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "product_version_id" UUID,
    "start_node_key" TEXT,
    "validation_status" TEXT NOT NULL DEFAULT 'unvalidated',
    "validation_errors" JSONB NOT NULL DEFAULT '[]',
    "published_by" UUID,
    "published_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_nodes" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scenario_version_id" UUID NOT NULL,
    "node_key" TEXT NOT NULL,
    "node_type" "ScenarioNodeType" NOT NULL,
    "title" TEXT NOT NULL,
    "instruction" TEXT NOT NULL DEFAULT '',
    "message_template" TEXT NOT NULL DEFAULT '',
    "expected_intents" JSONB NOT NULL DEFAULT '[]',
    "extraction_schema" JSONB NOT NULL DEFAULT '{}',
    "timeout_seconds" INTEGER NOT NULL DEFAULT 15,
    "retry_limit" INTEGER NOT NULL DEFAULT 1,
    "position_x" INTEGER NOT NULL DEFAULT 0,
    "position_y" INTEGER NOT NULL DEFAULT 0,
    "config" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scenario_edges" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "scenario_version_id" UUID NOT NULL,
    "from_node_key" TEXT NOT NULL,
    "to_node_key" TEXT NOT NULL,
    "condition_type" TEXT NOT NULL,
    "condition_value" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "label" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "scenario_edges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_bases" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "archived_at" TIMESTAMP(3),

    CONSTRAINT "knowledge_bases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_documents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "knowledge_base_id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "source_type" TEXT NOT NULL DEFAULT 'manual',
    "source_url" TEXT,
    "status" "VersionStatus" NOT NULL DEFAULT 'draft',
    "version_number" INTEGER NOT NULL DEFAULT 1,
    "content_hash" TEXT NOT NULL DEFAULT '',
    "published_by" UUID,
    "published_at" TIMESTAMP(3),
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "knowledge_entries" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "knowledge_document_id" UUID NOT NULL,
    "entry_type" TEXT NOT NULL DEFAULT 'faq',
    "question" TEXT NOT NULL DEFAULT '',
    "answer" TEXT NOT NULL,
    "keywords" JSONB NOT NULL DEFAULT '[]',
    "category" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 100,
    "status" "ResourceStatus" NOT NULL DEFAULT 'active',
    "valid_from" TIMESTAMP(3),
    "valid_until" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "knowledge_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "product_version_id" UUID NOT NULL,
    "ai_agent_version_id" UUID NOT NULL,
    "scenario_version_id" UUID NOT NULL,
    "knowledge_base_id" UUID,
    "sales_list_id" UUID NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
    "callable_weekdays" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
    "callable_start_time" TEXT NOT NULL DEFAULT '09:00',
    "callable_end_time" TEXT NOT NULL DEFAULT '18:00',
    "max_attempts_per_target" INTEGER NOT NULL DEFAULT 3,
    "retry_interval_minutes" INTEGER NOT NULL DEFAULT 60,
    "max_concurrent_calls" INTEGER NOT NULL DEFAULT 1,
    "daily_call_limit" INTEGER NOT NULL DEFAULT 100,
    "duplicate_window_hours" INTEGER NOT NULL DEFAULT 24,
    "created_by" UUID NOT NULL,
    "approved_by" UUID,
    "approved_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "paused_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_targets" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "phone_number_id" UUID,
    "contact_id" UUID,
    "owner_user_id_snapshot" UUID,
    "status" "CampaignTargetStatus" NOT NULL DEFAULT 'pending',
    "eligibility_status" "EligibilityStatus" NOT NULL DEFAULT 'eligible',
    "exclusion_reason" TEXT,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "attempt_count" INTEGER NOT NULL DEFAULT 0,
    "last_attempt_at" TIMESTAMP(3),
    "next_attempt_at" TIMESTAMP(3),
    "reserved_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaign_targets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "campaign_target_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'mock',
    "provider_job_id" TEXT,
    "status" "CallJobStatus" NOT NULL DEFAULT 'queued',
    "fixture" TEXT NOT NULL DEFAULT 'qualified',
    "scheduled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reserved_at" TIMESTAMP(3),
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "error_code" TEXT,
    "error_message" TEXT,
    "retry_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_attempts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "call_job_id" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "provider_attempt_id" TEXT,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answered_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "result_code" TEXT,
    "disposition" TEXT,
    "qualification" TEXT,
    "next_action_type" TEXT,
    "next_action_at" TIMESTAMP(3),
    "summary" TEXT,
    "structured_result" JSONB NOT NULL DEFAULT '{}',
    "scenario_snapshot" JSONB NOT NULL DEFAULT '{}',
    "agent_snapshot" JSONB NOT NULL DEFAULT '{}',
    "product_snapshot" JSONB NOT NULL DEFAULT '{}',
    "knowledge_snapshot" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "call_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "call_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "call_attempt_id" UUID NOT NULL,
    "sequence_number" INTEGER NOT NULL,
    "event_type" TEXT NOT NULL,
    "event_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL DEFAULT 'mock',
    "payload" JSONB NOT NULL DEFAULT '{}',
    "provider_event_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "call_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "products_organization_id_status_idx" ON "products"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "products_organization_id_code_key" ON "products"("organization_id", "code");

-- CreateIndex
CREATE INDEX "product_versions_organization_id_status_idx" ON "product_versions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "product_versions_product_id_version_number_key" ON "product_versions"("product_id", "version_number");

-- CreateIndex
CREATE INDEX "ai_agents_organization_id_status_idx" ON "ai_agents"("organization_id", "status");

-- CreateIndex
CREATE INDEX "ai_agent_versions_organization_id_status_idx" ON "ai_agent_versions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ai_agent_versions_ai_agent_id_version_number_key" ON "ai_agent_versions"("ai_agent_id", "version_number");

-- CreateIndex
CREATE INDEX "conversation_scenarios_organization_id_status_idx" ON "conversation_scenarios"("organization_id", "status");

-- CreateIndex
CREATE INDEX "scenario_versions_organization_id_status_idx" ON "scenario_versions"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_versions_scenario_id_version_number_key" ON "scenario_versions"("scenario_id", "version_number");

-- CreateIndex
CREATE UNIQUE INDEX "scenario_nodes_scenario_version_id_node_key_key" ON "scenario_nodes"("scenario_version_id", "node_key");

-- CreateIndex
CREATE INDEX "scenario_edges_scenario_version_id_from_node_key_priority_idx" ON "scenario_edges"("scenario_version_id", "from_node_key", "priority");

-- CreateIndex
CREATE INDEX "knowledge_bases_organization_id_status_idx" ON "knowledge_bases"("organization_id", "status");

-- CreateIndex
CREATE INDEX "knowledge_documents_organization_id_status_idx" ON "knowledge_documents"("organization_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_knowledge_base_id_title_version_number_key" ON "knowledge_documents"("knowledge_base_id", "title", "version_number");

-- CreateIndex
CREATE INDEX "knowledge_entries_organization_id_status_idx" ON "knowledge_entries"("organization_id", "status");

-- CreateIndex
CREATE INDEX "campaigns_organization_id_status_idx" ON "campaigns"("organization_id", "status");

-- CreateIndex
CREATE INDEX "campaign_targets_organization_id_campaign_id_status_idx" ON "campaign_targets"("organization_id", "campaign_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "campaign_targets_campaign_id_phone_number_id_key" ON "campaign_targets"("campaign_id", "phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "call_jobs_idempotency_key_key" ON "call_jobs"("idempotency_key");

-- CreateIndex
CREATE INDEX "call_jobs_organization_id_status_scheduled_at_idx" ON "call_jobs"("organization_id", "status", "scheduled_at");

-- CreateIndex
CREATE UNIQUE INDEX "call_attempts_call_job_id_attempt_number_key" ON "call_attempts"("call_job_id", "attempt_number");

-- CreateIndex
CREATE UNIQUE INDEX "call_events_provider_event_id_key" ON "call_events"("provider_event_id");

-- CreateIndex
CREATE INDEX "call_events_organization_id_event_at_idx" ON "call_events"("organization_id", "event_at");

-- CreateIndex
CREATE UNIQUE INDEX "call_events_call_attempt_id_sequence_number_key" ON "call_events"("call_attempt_id", "sequence_number");

-- AddForeignKey
ALTER TABLE "product_versions" ADD CONSTRAINT "product_versions_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_agent_versions" ADD CONSTRAINT "ai_agent_versions_ai_agent_id_fkey" FOREIGN KEY ("ai_agent_id") REFERENCES "ai_agents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_versions" ADD CONSTRAINT "scenario_versions_scenario_id_fkey" FOREIGN KEY ("scenario_id") REFERENCES "conversation_scenarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_nodes" ADD CONSTRAINT "scenario_nodes_scenario_version_id_fkey" FOREIGN KEY ("scenario_version_id") REFERENCES "scenario_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scenario_edges" ADD CONSTRAINT "scenario_edges_scenario_version_id_fkey" FOREIGN KEY ("scenario_version_id") REFERENCES "scenario_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_documents" ADD CONSTRAINT "knowledge_documents_knowledge_base_id_fkey" FOREIGN KEY ("knowledge_base_id") REFERENCES "knowledge_bases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "knowledge_entries" ADD CONSTRAINT "knowledge_entries_knowledge_document_id_fkey" FOREIGN KEY ("knowledge_document_id") REFERENCES "knowledge_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_targets" ADD CONSTRAINT "campaign_targets_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_jobs" ADD CONSTRAINT "call_jobs_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_jobs" ADD CONSTRAINT "call_jobs_campaign_target_id_fkey" FOREIGN KEY ("campaign_target_id") REFERENCES "campaign_targets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_attempts" ADD CONSTRAINT "call_attempts_call_job_id_fkey" FOREIGN KEY ("call_job_id") REFERENCES "call_jobs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "call_events" ADD CONSTRAINT "call_events_call_attempt_id_fkey" FOREIGN KEY ("call_attempt_id") REFERENCES "call_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
