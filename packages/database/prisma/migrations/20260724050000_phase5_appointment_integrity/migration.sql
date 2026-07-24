ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_status_check"
  CHECK ("status" IN (
    'held',
    'confirmed',
    'reschedule_requested',
    'cancelled',
    'completed',
    'no_show',
    'expired'
  ));

ALTER TABLE "appointments"
  DROP CONSTRAINT "appointments_no_overlap";

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_no_overlap"
  EXCLUDE USING gist (
    "organization_id" WITH =,
    "assignee_user_id" WITH =,
    tsrange("busy_start_at", "busy_end_at", '[)') WITH &&
  )
  WHERE ("status" IN ('held', 'confirmed', 'reschedule_requested'));

ALTER TABLE "appointments"
  ADD CONSTRAINT "appointments_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_campaign_id_fkey"
  FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "companies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_contact_id_fkey"
  FOREIGN KEY ("contact_id") REFERENCES "company_contacts"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_assignee_user_id_fkey"
  FOREIGN KEY ("assignee_user_id") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_policy_version_id_fkey"
  FOREIGN KEY ("policy_version_id") REFERENCES "appointment_policies"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_realtime_session_id_fkey"
  FOREIGN KEY ("realtime_session_id") REFERENCES "realtime_call_sessions"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_handoff_card_id_fkey"
  FOREIGN KEY ("handoff_card_id") REFERENCES "sales_handoff_cards"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointments_followup_task_id_fkey"
  FOREIGN KEY ("followup_task_id") REFERENCES "human_followup_tasks"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "appointment_events"
  ADD CONSTRAINT "appointment_events_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "appointment_events_appointment_id_fkey"
  FOREIGN KEY ("appointment_id") REFERENCES "appointments"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
