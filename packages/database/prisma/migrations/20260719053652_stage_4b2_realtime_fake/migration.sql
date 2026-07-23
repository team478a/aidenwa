-- CreateTable
CREATE TABLE "realtime_call_sessions" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "execution_id" UUID,
    "provider" TEXT NOT NULL DEFAULT 'fake',
    "provider_session_fingerprint" TEXT,
    "stream_fingerprint" TEXT,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "last_inbound_sequence" INTEGER NOT NULL DEFAULT -1,
    "last_outbound_sequence" INTEGER NOT NULL DEFAULT -1,
    "active_generation_id" TEXT,
    "result_code" TEXT,
    "failure_code" TEXT,
    "input_audio_bytes" INTEGER NOT NULL DEFAULT 0,
    "output_audio_bytes" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_seconds" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "realtime_call_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "realtime_call_events" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "provider_event_fingerprint" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "monotonic_sequence" INTEGER NOT NULL,
    "sanitized_metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "realtime_call_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "human_followup_tasks" (
    "id" UUID NOT NULL,
    "organization_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "execution_id" UUID,
    "realtime_session_id" UUID NOT NULL,
    "phone_number_id" UUID NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'zoom_phone',
    "status" TEXT NOT NULL DEFAULT 'open',
    "priority" TEXT NOT NULL DEFAULT 'normal',
    "requested_time_window_code" TEXT NOT NULL,
    "note_code" TEXT NOT NULL,
    "assignee_user_id" UUID,
    "outcome_code" TEXT,
    "masked_destination" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "human_followup_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "realtime_call_sessions_organization_id_status_created_at_idx" ON "realtime_call_sessions"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "realtime_call_sessions_execution_id_idx" ON "realtime_call_sessions"("execution_id");

-- CreateIndex
CREATE INDEX "realtime_call_events_organization_id_session_id_monotonic_s_idx" ON "realtime_call_events"("organization_id", "session_id", "monotonic_sequence");

-- CreateIndex
CREATE INDEX "realtime_call_events_received_at_idx" ON "realtime_call_events"("received_at");

-- CreateIndex
CREATE UNIQUE INDEX "realtime_call_events_session_id_provider_event_fingerprint_key" ON "realtime_call_events"("session_id", "provider_event_fingerprint");

-- CreateIndex
CREATE INDEX "human_followup_tasks_organization_id_status_created_at_idx" ON "human_followup_tasks"("organization_id", "status", "created_at" DESC);

-- CreateIndex
CREATE INDEX "human_followup_tasks_assignee_user_id_status_idx" ON "human_followup_tasks"("assignee_user_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "human_followup_tasks_realtime_session_id_channel_key" ON "human_followup_tasks"("realtime_session_id", "channel");
