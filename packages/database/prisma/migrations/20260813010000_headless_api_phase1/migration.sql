CREATE TYPE "IntegrationEnvironment" AS ENUM ('sandbox', 'production');
CREATE TYPE "IntegrationStatus" AS ENUM ('active', 'suspended');
CREATE TYPE "CallProfileStatus" AS ENUM ('draft', 'active', 'suspended', 'archived');
CREATE TYPE "ExternalCallStatus" AS ENUM ('accepted', 'validating', 'scheduled', 'queued', 'calling', 'in_progress', 'completed', 'rejected', 'cancelled', 'stopped', 'failed', 'skipped', 'provider_unknown');

CREATE TABLE "integration_clients" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "environment" "IntegrationEnvironment" NOT NULL,
  "status" "IntegrationStatus" NOT NULL DEFAULT 'active',
  "api_key_hash" TEXT NOT NULL,
  "api_key_prefix" TEXT NOT NULL,
  "allowed_scopes" JSONB NOT NULL DEFAULT '[]',
  "allowed_call_profiles" JSONB NOT NULL DEFAULT '[]',
  "allowed_ips" JSONB NOT NULL DEFAULT '[]',
  "rate_limit_per_minute" INTEGER NOT NULL DEFAULT 120,
  "daily_call_limit" INTEGER NOT NULL DEFAULT 100,
  "concurrent_call_limit" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "integration_clients_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "call_profiles" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "public_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "environment" "IntegrationEnvironment" NOT NULL,
  "status" "CallProfileStatus" NOT NULL DEFAULT 'draft',
  "product_version_id" UUID NOT NULL,
  "ai_agent_version_id" UUID NOT NULL,
  "scenario_version_id" UUID NOT NULL,
  "knowledge_base_id" UUID,
  "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo',
  "callable_weekdays" JSONB NOT NULL DEFAULT '[1,2,3,4,5]',
  "callable_start_time" TEXT NOT NULL DEFAULT '09:00',
  "callable_end_time" TEXT NOT NULL DEFAULT '18:00',
  "daily_call_limit" INTEGER NOT NULL DEFAULT 100,
  "concurrent_call_limit" INTEGER NOT NULL DEFAULT 1,
  "created_by" UUID NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "call_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "external_call_executions" (
  "id" UUID NOT NULL,
  "public_id" TEXT NOT NULL,
  "organization_id" UUID NOT NULL,
  "integration_client_id" UUID NOT NULL,
  "call_profile_id" UUID NOT NULL,
  "external_call_id" TEXT NOT NULL,
  "external_customer_id" TEXT NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "request_hash" TEXT NOT NULL,
  "phone_fingerprint" TEXT NOT NULL,
  "phone_last4" VARCHAR(4) NOT NULL,
  "company_name_snapshot" TEXT,
  "contact_name_snapshot" TEXT,
  "context_snapshot" JSONB NOT NULL DEFAULT '{}',
  "status" "ExternalCallStatus" NOT NULL DEFAULT 'accepted',
  "result" TEXT,
  "scheduled_at" TIMESTAMP(3),
  "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "started_at" TIMESTAMP(3),
  "completed_at" TIMESTAMP(3),
  "error_code" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_call_executions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "integration_clients_api_key_hash_key" ON "integration_clients"("api_key_hash");
CREATE INDEX "integration_clients_organization_id_status_environment_idx" ON "integration_clients"("organization_id", "status", "environment");
CREATE UNIQUE INDEX "call_profiles_organization_id_public_id_key" ON "call_profiles"("organization_id", "public_id");
CREATE INDEX "call_profiles_organization_id_environment_status_idx" ON "call_profiles"("organization_id", "environment", "status");
CREATE UNIQUE INDEX "external_call_executions_public_id_key" ON "external_call_executions"("public_id");
CREATE UNIQUE INDEX "external_call_executions_integration_client_id_idempotency_key_key" ON "external_call_executions"("integration_client_id", "idempotency_key");
CREATE UNIQUE INDEX "external_call_executions_integration_client_id_external_call_id_key" ON "external_call_executions"("integration_client_id", "external_call_id");
CREATE INDEX "external_call_executions_organization_id_status_scheduled_at_idx" ON "external_call_executions"("organization_id", "status", "scheduled_at");

ALTER TABLE "integration_clients" ADD CONSTRAINT "integration_clients_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "call_profiles" ADD CONSTRAINT "call_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_call_executions" ADD CONSTRAINT "external_call_executions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_call_executions" ADD CONSTRAINT "external_call_executions_integration_client_id_fkey" FOREIGN KEY ("integration_client_id") REFERENCES "integration_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_call_executions" ADD CONSTRAINT "external_call_executions_call_profile_id_fkey" FOREIGN KEY ("call_profile_id") REFERENCES "call_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
