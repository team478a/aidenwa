ALTER TABLE "appointment_policies"
  ADD CONSTRAINT "appointment_policies_valid_period"
  CHECK ("valid_from" IS NULL OR "valid_until" IS NULL OR "valid_from" <= "valid_until");

ALTER TABLE "availability_rules"
  ADD CONSTRAINT "availability_rules_effective_period"
  CHECK (
    "effective_from" IS NULL
    OR "effective_until" IS NULL
    OR "effective_from" <= "effective_until"
  );
