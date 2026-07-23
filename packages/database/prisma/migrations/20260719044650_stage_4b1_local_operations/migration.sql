-- AlterTable
ALTER TABLE "production_test_authorizations" ADD COLUMN     "source_number_approval_id" UUID;

-- AlterTable
ALTER TABLE "real_call_executions" ADD COLUMN     "cost_settlement_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "cost_settlement_next_at" TIMESTAMP(3),
ADD COLUMN     "cost_settlement_status" TEXT NOT NULL DEFAULT 'pending',
ADD COLUMN     "source_number_approval_id" UUID;

-- CreateTable
CREATE TABLE "source_number_approvals" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'twilio',
    "number_fingerprint" TEXT NOT NULL,
    "number_last_four" TEXT NOT NULL,
    "verification_status" TEXT NOT NULL DEFAULT 'pending',
    "ownership_evidence_ref" TEXT NOT NULL DEFAULT '',
    "verified_by" UUID,
    "verified_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "source_number_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "production_incidents" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'high',
    "status" TEXT NOT NULL DEFAULT 'open',
    "entity_type" TEXT NOT NULL,
    "entity_id" TEXT,
    "summary" TEXT NOT NULL,
    "sanitized_details" JSONB NOT NULL DEFAULT '{}',
    "assigned_to" UUID,
    "due_at" TIMESTAMP(3),
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "resolution_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "production_incidents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "source_number_approvals_organization_id_provider_active_exp_idx" ON "source_number_approvals"("organization_id", "provider", "active", "expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "source_number_approvals_organization_id_provider_number_fin_key" ON "source_number_approvals"("organization_id", "provider", "number_fingerprint");

-- CreateIndex
CREATE INDEX "production_incidents_organization_id_status_severity_create_idx" ON "production_incidents"("organization_id", "status", "severity", "created_at" DESC);

-- CreateIndex
CREATE INDEX "production_incidents_organization_id_category_entity_id_idx" ON "production_incidents"("organization_id", "category", "entity_id");
