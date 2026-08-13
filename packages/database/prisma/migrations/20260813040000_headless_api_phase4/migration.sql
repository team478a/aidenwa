ALTER TABLE "external_call_executions" ADD COLUMN "batch_id" UUID;
CREATE TABLE "external_call_batches" (
  "id" UUID NOT NULL, "public_id" TEXT NOT NULL, "organization_id" UUID NOT NULL,
  "integration_client_id" UUID NOT NULL, "call_profile_id" UUID NOT NULL,
  "external_batch_id" TEXT NOT NULL, "accepted_count" INTEGER NOT NULL DEFAULT 0,
  "rejected_count" INTEGER NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'accepted',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "external_call_batches_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "external_references" (
  "id" UUID NOT NULL, "integration_client_id" UUID NOT NULL, "resource_type" TEXT NOT NULL,
  "external_id" TEXT NOT NULL, "internal_id" UUID NOT NULL, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_references_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "integration_rate_limit_buckets" (
  "id" UUID NOT NULL, "integration_client_id" UUID NOT NULL, "operation" TEXT NOT NULL,
  "window_started_at" TIMESTAMP(3) NOT NULL, "request_count" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "integration_rate_limit_buckets_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_call_batches_public_id_key" ON "external_call_batches"("public_id");
CREATE UNIQUE INDEX "external_call_batches_integration_client_id_external_batch_id_key" ON "external_call_batches"("integration_client_id", "external_batch_id");
CREATE INDEX "external_call_batches_organization_id_created_at_idx" ON "external_call_batches"("organization_id", "created_at");
CREATE UNIQUE INDEX "external_references_integration_client_id_resource_type_external_id_key" ON "external_references"("integration_client_id", "resource_type", "external_id");
CREATE INDEX "external_references_integration_client_id_internal_id_idx" ON "external_references"("integration_client_id", "internal_id");
CREATE UNIQUE INDEX "integration_rate_limit_buckets_integration_client_id_operation_window_started_at_key" ON "integration_rate_limit_buckets"("integration_client_id", "operation", "window_started_at");
CREATE INDEX "integration_rate_limit_buckets_window_started_at_idx" ON "integration_rate_limit_buckets"("window_started_at");
ALTER TABLE "external_call_executions" ADD CONSTRAINT "external_call_executions_batch_id_fkey" FOREIGN KEY ("batch_id") REFERENCES "external_call_batches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_call_batches" ADD CONSTRAINT "external_call_batches_integration_client_id_fkey" FOREIGN KEY ("integration_client_id") REFERENCES "integration_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_references" ADD CONSTRAINT "external_references_integration_client_id_fkey" FOREIGN KEY ("integration_client_id") REFERENCES "integration_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "integration_rate_limit_buckets" ADD CONSTRAINT "integration_rate_limit_buckets_integration_client_id_fkey" FOREIGN KEY ("integration_client_id") REFERENCES "integration_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
