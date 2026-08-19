CREATE TYPE "OrganizationPlan" AS ENUM ('trial', 'standard', 'enterprise');

ALTER TABLE "organizations"
  ADD COLUMN "plan" "OrganizationPlan" NOT NULL DEFAULT 'trial',
  ADD COLUMN "monthly_call_limit" INTEGER NOT NULL DEFAULT 1000,
  ADD COLUMN "concurrent_call_limit" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "users"
  ADD COLUMN "must_change_password" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "organizations"
  ADD CONSTRAINT "organizations_monthly_call_limit_nonnegative"
    CHECK ("monthly_call_limit" >= 0),
  ADD CONSTRAINT "organizations_concurrent_call_limit_positive"
    CHECK ("concurrent_call_limit" >= 1);
