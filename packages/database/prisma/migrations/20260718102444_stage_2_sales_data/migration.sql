-- CreateEnum
CREATE TYPE "SalesStatus" AS ENUM ('uncontacted', 'planned', 'contacting', 'gatekeeper_reached', 'decision_contact_reached', 'retry', 'material_sent', 'qualified', 'appointment', 'negotiating', 'won', 'lost', 'excluded', 'opt_out', 'on_hold');

-- CreateEnum
CREATE TYPE "ContactDecisionRole" AS ENUM ('unknown', 'contact', 'champion', 'decision_maker');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('unverified', 'ai_extracted', 'verified');

-- CreateEnum
CREATE TYPE "PhoneNumberType" AS ENUM ('representative', 'department', 'store', 'direct', 'mobile', 'fax', 'unknown');

-- CreateEnum
CREATE TYPE "RecordStatus" AS ENUM ('active', 'archived');

-- CreateEnum
CREATE TYPE "AssignedSource" AS ENUM ('manual', 'import', 'system');

-- CreateEnum
CREATE TYPE "SalesListType" AS ENUM ('static', 'dynamic');

-- CreateEnum
CREATE TYPE "OptOutScope" AS ENUM ('company', 'phone', 'contact', 'channel');

-- CreateEnum
CREATE TYPE "OptOutChannel" AS ENUM ('all', 'phone', 'email', 'form', 'sms');

-- CreateEnum
CREATE TYPE "OptOutStatus" AS ENUM ('active', 'released');

-- CreateEnum
CREATE TYPE "OptOutReasonCode" AS ENUM ('customer_request', 'complaint', 'existing_customer', 'competitor', 'internal_block', 'invalid_number', 'closed_business', 'duplicate', 'out_of_scope', 'other');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('uploaded', 'mapping_required', 'preview_ready', 'queued', 'processing', 'completed', 'completed_with_errors', 'failed', 'cancelled');

-- CreateEnum
CREATE TYPE "DuplicatePolicy" AS ENUM ('create', 'update', 'fill_blank', 'skip', 'review');

-- CreateEnum
CREATE TYPE "ImportRowAction" AS ENUM ('create', 'update', 'fill_blank', 'skip', 'review', 'error');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "corporate_number" TEXT,
    "name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "name_kana" TEXT,
    "trade_name" TEXT,
    "website_url" TEXT,
    "inquiry_url" TEXT,
    "industry_code" TEXT,
    "industry_name" TEXT,
    "employee_range" TEXT,
    "annual_sales_range" TEXT,
    "established_year" INTEGER,
    "postal_code" TEXT,
    "prefecture" TEXT,
    "city" TEXT,
    "address" TEXT,
    "business_hours" TEXT,
    "closed_days" TEXT,
    "sales_status" "SalesStatus" NOT NULL DEFAULT 'uncontacted',
    "owner_user_id" UUID,
    "source_type" TEXT,
    "source_url" TEXT,
    "source_metadata" JSONB NOT NULL DEFAULT '{}',
    "last_contacted_at" TIMESTAMP(3),
    "next_action_at" TIMESTAMP(3),
    "next_action_type" TEXT,
    "is_customer" BOOLEAN NOT NULL DEFAULT false,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_contacts" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "name_kana" TEXT,
    "department" TEXT,
    "position" TEXT,
    "email" TEXT,
    "decision_role" "ContactDecisionRole" NOT NULL DEFAULT 'unknown',
    "verification_status" "VerificationStatus" NOT NULL DEFAULT 'unverified',
    "source_type" TEXT,
    "verified_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "company_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "phone_numbers" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "contact_id" UUID,
    "raw_number" TEXT NOT NULL,
    "normalized_number" TEXT NOT NULL,
    "e164_number" TEXT,
    "type" "PhoneNumberType" NOT NULL DEFAULT 'unknown',
    "label" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "is_valid" BOOLEAN NOT NULL DEFAULT true,
    "is_callable" BOOLEAN NOT NULL DEFAULT true,
    "last_called_at" TIMESTAMP(3),
    "last_call_result" TEXT,
    "total_call_count" INTEGER NOT NULL DEFAULT 0,
    "next_callable_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "phone_numbers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tags" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#64748b',
    "description" TEXT,
    "status" "RecordStatus" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_tags" (
    "company_id" UUID NOT NULL,
    "tag_id" UUID NOT NULL,
    "assigned_by" UUID,
    "assigned_source" "AssignedSource" NOT NULL DEFAULT 'manual',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_tags_pkey" PRIMARY KEY ("company_id","tag_id")
);

-- CreateTable
CREATE TABLE "sales_lists" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "list_type" "SalesListType" NOT NULL DEFAULT 'static',
    "filter_conditions" JSONB NOT NULL DEFAULT '{}',
    "status" "RecordStatus" NOT NULL DEFAULT 'active',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "is_deleted" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "sales_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sales_list_companies" (
    "sales_list_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "added_by" UUID,
    "added_source" "AssignedSource" NOT NULL DEFAULT 'manual',
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "sales_list_companies_pkey" PRIMARY KEY ("sales_list_id","company_id")
);

-- CreateTable
CREATE TABLE "opt_outs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "company_id" UUID,
    "phone_number_id" UUID,
    "contact_id" UUID,
    "normalized_phone_snapshot" TEXT,
    "email_snapshot" TEXT,
    "scope" "OptOutScope" NOT NULL,
    "channel" "OptOutChannel" NOT NULL,
    "reason_code" "OptOutReasonCode" NOT NULL,
    "reason_text" TEXT,
    "evidence_text" TEXT,
    "status" "OptOutStatus" NOT NULL DEFAULT 'active',
    "registered_by" UUID NOT NULL,
    "registered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "released_by" UUID,
    "released_at" TIMESTAMP(3),
    "release_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opt_outs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "import_type" TEXT NOT NULL DEFAULT 'companies',
    "original_file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "encoding" TEXT NOT NULL,
    "mapping" JSONB NOT NULL DEFAULT '{}',
    "duplicate_policy" "DuplicatePolicy" NOT NULL DEFAULT 'review',
    "status" "ImportStatus" NOT NULL DEFAULT 'uploaded',
    "total_rows" INTEGER NOT NULL DEFAULT 0,
    "valid_rows" INTEGER NOT NULL DEFAULT 0,
    "error_rows" INTEGER NOT NULL DEFAULT 0,
    "imported_rows" INTEGER NOT NULL DEFAULT 0,
    "skipped_rows" INTEGER NOT NULL DEFAULT 0,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "expires_at" TIMESTAMP(3) NOT NULL,
    "error_message" TEXT,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_rows" (
    "id" UUID NOT NULL,
    "import_job_id" UUID NOT NULL,
    "row_number" INTEGER NOT NULL,
    "raw_data" JSONB NOT NULL,
    "normalized_data" JSONB NOT NULL,
    "validation_errors" JSONB NOT NULL DEFAULT '[]',
    "duplicate_candidates" JSONB NOT NULL DEFAULT '[]',
    "action" "ImportRowAction" NOT NULL DEFAULT 'review',
    "result_company_id" UUID,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "import_rows_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "companies_organization_id_is_deleted_updated_at_idx" ON "companies"("organization_id", "is_deleted", "updated_at" DESC);

-- CreateIndex
CREATE INDEX "companies_organization_id_normalized_name_idx" ON "companies"("organization_id", "normalized_name");

-- CreateIndex
CREATE INDEX "companies_organization_id_sales_status_idx" ON "companies"("organization_id", "sales_status");

-- CreateIndex
CREATE INDEX "companies_organization_id_owner_user_id_idx" ON "companies"("organization_id", "owner_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_organization_id_corporate_number_key" ON "companies"("organization_id", "corporate_number");

-- CreateIndex
CREATE INDEX "company_contacts_organization_id_company_id_is_deleted_idx" ON "company_contacts"("organization_id", "company_id", "is_deleted");

-- CreateIndex
CREATE INDEX "company_contacts_organization_id_email_idx" ON "company_contacts"("organization_id", "email");

-- CreateIndex
CREATE INDEX "phone_numbers_organization_id_normalized_number_idx" ON "phone_numbers"("organization_id", "normalized_number");

-- CreateIndex
CREATE INDEX "phone_numbers_organization_id_company_id_is_deleted_idx" ON "phone_numbers"("organization_id", "company_id", "is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "tags_organization_id_name_key" ON "tags"("organization_id", "name");

-- CreateIndex
CREATE INDEX "sales_lists_organization_id_is_deleted_idx" ON "sales_lists"("organization_id", "is_deleted");

-- CreateIndex
CREATE UNIQUE INDEX "sales_lists_organization_id_name_key" ON "sales_lists"("organization_id", "name");

-- CreateIndex
CREATE INDEX "sales_list_companies_company_id_idx" ON "sales_list_companies"("company_id");

-- CreateIndex
CREATE INDEX "opt_outs_organization_id_status_company_id_idx" ON "opt_outs"("organization_id", "status", "company_id");

-- CreateIndex
CREATE INDEX "opt_outs_organization_id_status_normalized_phone_snapshot_idx" ON "opt_outs"("organization_id", "status", "normalized_phone_snapshot");

-- CreateIndex
CREATE INDEX "opt_outs_organization_id_status_email_snapshot_idx" ON "opt_outs"("organization_id", "status", "email_snapshot");

-- CreateIndex
CREATE INDEX "import_jobs_organization_id_created_at_idx" ON "import_jobs"("organization_id", "created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "import_rows_import_job_id_row_number_key" ON "import_rows"("import_job_id", "row_number");

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "companies" ADD CONSTRAINT "companies_owner_user_id_fkey" FOREIGN KEY ("owner_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "phone_numbers" ADD CONSTRAINT "phone_numbers_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tags" ADD CONSTRAINT "tags_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_tags" ADD CONSTRAINT "company_tags_assigned_by_fkey" FOREIGN KEY ("assigned_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lists" ADD CONSTRAINT "sales_lists_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_lists" ADD CONSTRAINT "sales_lists_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_list_companies" ADD CONSTRAINT "sales_list_companies_sales_list_id_fkey" FOREIGN KEY ("sales_list_id") REFERENCES "sales_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_list_companies" ADD CONSTRAINT "sales_list_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales_list_companies" ADD CONSTRAINT "sales_list_companies_added_by_fkey" FOREIGN KEY ("added_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_phone_number_id_fkey" FOREIGN KEY ("phone_number_id") REFERENCES "phone_numbers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_contact_id_fkey" FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_registered_by_fkey" FOREIGN KEY ("registered_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opt_outs" ADD CONSTRAINT "opt_outs_released_by_fkey" FOREIGN KEY ("released_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_job_id_fkey" FOREIGN KEY ("import_job_id") REFERENCES "import_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_result_company_id_fkey" FOREIGN KEY ("result_company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
