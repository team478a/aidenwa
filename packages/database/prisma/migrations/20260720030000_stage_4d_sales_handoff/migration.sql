CREATE TABLE "sales_handoff_cards" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "campaign_id" UUID NOT NULL,
  "execution_id" UUID,
  "realtime_session_id" UUID NOT NULL,
  "followup_task_id" UUID,
  "company_id" UUID NOT NULL,
  "contact_id" UUID,
  "source" TEXT NOT NULL DEFAULT 'fake',
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "version" INTEGER NOT NULL DEFAULT 1,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "interest_level" TEXT NOT NULL DEFAULT 'unknown',
  "interest_codes" JSONB NOT NULL DEFAULT '[]',
  "pain_point_codes" JSONB NOT NULL DEFAULT '[]',
  "objection_codes" JSONB NOT NULL DEFAULT '[]',
  "decision_role" TEXT NOT NULL DEFAULT 'unknown',
  "timeline_code" TEXT NOT NULL DEFAULT 'unknown',
  "budget_signal" TEXT NOT NULL DEFAULT 'not_discussed',
  "callback_requested" BOOLEAN NOT NULL DEFAULT false,
  "callback_window_code" TEXT,
  "human_question_codes" JSONB NOT NULL DEFAULT '[]',
  "recommended_next_action" TEXT NOT NULL,
  "confidence_band" TEXT NOT NULL,
  "evidence_event_fingerprints" JSONB NOT NULL DEFAULT '[]',
  "customer_need_summary" VARCHAR(200),
  "objection_summary" VARCHAR(200),
  "next_conversation_hint" VARCHAR(200),
  "unanswered_question_summary" VARCHAR(200),
  "lead_score" INTEGER,
  "score_reason_codes" JSONB NOT NULL DEFAULT '[]',
  "score_rule_version" INTEGER NOT NULL DEFAULT 1,
  "finalized_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "sales_handoff_cards_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "sales_handoff_cards_realtime_session_id_version_key" ON "sales_handoff_cards"("realtime_session_id", "version");
CREATE INDEX "sales_handoff_cards_organization_id_status_created_at_idx" ON "sales_handoff_cards"("organization_id", "status", "created_at" DESC);
CREATE INDEX "sales_handoff_cards_organization_id_followup_task_id_idx" ON "sales_handoff_cards"("organization_id", "followup_task_id");
CREATE INDEX "sales_handoff_cards_expires_at_idx" ON "sales_handoff_cards"("expires_at");

CREATE TABLE "sales_handoff_feedback" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "card_id" UUID NOT NULL,
  "user_id" UUID NOT NULL,
  "verdict" TEXT NOT NULL,
  "field_code" TEXT,
  "corrected_code" TEXT,
  "reason_code" TEXT NOT NULL,
  "note" VARCHAR(200),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sales_handoff_feedback_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "sales_handoff_feedback_organization_id_card_id_created_at_idx" ON "sales_handoff_feedback"("organization_id", "card_id", "created_at");

CREATE TABLE "handoff_settings" (
  "id" UUID NOT NULL,
  "organization_id" UUID NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'draft',
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "score_rule_version" INTEGER NOT NULL DEFAULT 1,
  "allowed_codes" JSONB NOT NULL DEFAULT '{}',
  "score_rules" JSONB NOT NULL DEFAULT '{}',
  "created_by" UUID NOT NULL,
  "published_by" UUID,
  "published_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "handoff_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "handoff_settings_organization_id_version_key" ON "handoff_settings"("organization_id", "version");
CREATE INDEX "handoff_settings_organization_id_status_idx" ON "handoff_settings"("organization_id", "status");
