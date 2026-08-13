CREATE TABLE "external_idempotency_records" (
  "id" UUID NOT NULL,
  "integration_client_id" UUID NOT NULL,
  "idempotency_key" UUID NOT NULL,
  "operation" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "status_code" INTEGER NOT NULL,
  "response_body" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_idempotency_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "external_idempotency_records_integration_client_id_idempotency_key_key"
  ON "external_idempotency_records"("integration_client_id", "idempotency_key");
CREATE INDEX "external_idempotency_records_integration_client_id_created_at_idx"
  ON "external_idempotency_records"("integration_client_id", "created_at");

ALTER TABLE "external_idempotency_records"
  ADD CONSTRAINT "external_idempotency_records_integration_client_id_fkey"
  FOREIGN KEY ("integration_client_id") REFERENCES "integration_clients"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
