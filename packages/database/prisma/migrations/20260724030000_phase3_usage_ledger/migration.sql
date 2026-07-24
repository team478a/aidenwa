CREATE TABLE "usage_ledger" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "execution_type" TEXT NOT NULL,
  "execution_id" TEXT NOT NULL,
  "occurred_at" TIMESTAMP(3) NOT NULL,
  "call_count" INTEGER NOT NULL DEFAULT 1,
  "amount_minor" INTEGER NOT NULL DEFAULT 0,
  "currency" TEXT NOT NULL DEFAULT 'JPY',
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "usage_ledger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "usage_ledger_execution_type_execution_id_key"
  ON "usage_ledger"("execution_type", "execution_id");
CREATE INDEX "usage_ledger_organization_id_occurred_at_idx"
  ON "usage_ledger"("organization_id", "occurred_at");
