CREATE TYPE "ExternalWebhookDeliveryStatus" AS ENUM ('pending', 'delivering', 'delivered', 'retrying', 'failed');
ALTER TABLE "integration_clients" ADD COLUMN "webhook_endpoint" TEXT, ADD COLUMN "webhook_secret_hash" TEXT;
CREATE TABLE "external_webhook_events" (
  "id" UUID NOT NULL, "public_id" TEXT NOT NULL, "organization_id" UUID NOT NULL,
  "integration_client_id" UUID NOT NULL, "external_call_execution_id" UUID,
  "event_type" TEXT NOT NULL, "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "external_webhook_events_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "external_webhook_deliveries" (
  "id" UUID NOT NULL, "webhook_event_id" UUID NOT NULL,
  "status" "ExternalWebhookDeliveryStatus" NOT NULL DEFAULT 'pending',
  "attempt_count" INTEGER NOT NULL DEFAULT 0, "last_attempt_at" TIMESTAMP(3),
  "next_attempt_at" TIMESTAMP(3), "delivered_at" TIMESTAMP(3), "response_status" INTEGER,
  "failure_code" TEXT, "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL, CONSTRAINT "external_webhook_deliveries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "external_webhook_events_public_id_key" ON "external_webhook_events"("public_id");
CREATE UNIQUE INDEX "external_webhook_events_integration_client_id_event_type_external_call_execution_id_key" ON "external_webhook_events"("integration_client_id", "event_type", "external_call_execution_id");
CREATE INDEX "external_webhook_events_organization_id_created_at_idx" ON "external_webhook_events"("organization_id", "created_at");
CREATE UNIQUE INDEX "external_webhook_deliveries_webhook_event_id_key" ON "external_webhook_deliveries"("webhook_event_id");
CREATE INDEX "external_webhook_deliveries_status_next_attempt_at_idx" ON "external_webhook_deliveries"("status", "next_attempt_at");
ALTER TABLE "external_webhook_events" ADD CONSTRAINT "external_webhook_events_integration_client_id_fkey" FOREIGN KEY ("integration_client_id") REFERENCES "integration_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_webhook_events" ADD CONSTRAINT "external_webhook_events_external_call_execution_id_fkey" FOREIGN KEY ("external_call_execution_id") REFERENCES "external_call_executions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "external_webhook_deliveries" ADD CONSTRAINT "external_webhook_deliveries_webhook_event_id_fkey" FOREIGN KEY ("webhook_event_id") REFERENCES "external_webhook_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
