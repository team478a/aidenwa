CREATE TYPE "ImportRowProcessingStatus" AS ENUM (
  'pending',
  'processing',
  'success',
  'skipped',
  'failed'
);

ALTER TABLE "import_rows"
  ADD COLUMN "processing_status" "ImportRowProcessingStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "last_error_code" TEXT,
  ADD COLUMN "last_error_message" TEXT;

UPDATE "import_rows"
SET "processing_status" = CASE
  WHEN "processed_at" IS NULL THEN 'pending'::"ImportRowProcessingStatus"
  WHEN "result_company_id" IS NOT NULL THEN 'success'::"ImportRowProcessingStatus"
  WHEN "action" = 'error' THEN 'failed'::"ImportRowProcessingStatus"
  ELSE 'skipped'::"ImportRowProcessingStatus"
END;

CREATE INDEX "import_rows_import_job_id_processing_status_row_number_idx"
  ON "import_rows"("import_job_id", "processing_status", "row_number");
