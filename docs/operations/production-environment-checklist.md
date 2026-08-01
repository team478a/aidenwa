# Production environment checklist — Gate A Mock-only

`TBD` or unchecked required items mean No-Go. Record evidence links without secret or customer
data.

## Decisions and ownership

- [ ] AWS account and `ap-northeast-1` approved.
- [ ] Release, Infrastructure, Database, Security and Privacy owners named.
- [ ] Emergency Stop and Rollback operators named with substitutes.
- [ ] On-call Primary/Secondary and Legal Approver named with contact routes.
- [ ] AWS Pricing Calculator estimate and monthly budget approved.

## Network and compute

- [ ] Two-AZ VPC has public ALB subnets, private application subnets and isolated DB subnets.
- [ ] Route 53 DNS and ACM certificate validate the approved production domain.
- [ ] WAF managed baseline and rate limit are enabled and tested.
- [ ] Web/API have only ALB inbound; Worker has no public endpoint.
- [ ] RDS/Valkey have no public access and accept only owning ECS security groups.
- [ ] Provider egress is absent; all external flags are false.

## Data and secrets

- [ ] RDS PostgreSQL Multi-AZ, encryption, automated backup and PITR configured.
- [ ] Valkey private TLS endpoint and persistence/eviction alarms configured.
- [ ] S3 import/evidence buckets use KMS, versioning, public-access block and lifecycle policies.
- [ ] Secrets Manager inventory and service-scoped IAM policies approved.
- [ ] No production `.env`, long-lived GitHub AWS key or Provider credential exists.
- [ ] Production startup fails safely when any required secret is absent.

## Logging and monitoring

- [ ] Web/API/Worker/ALB/WAF logs reach approved CloudWatch Log Groups.
- [ ] Retention, KMS encryption, access roles and redaction tests are approved.
- [ ] Health, HTTP 5xx/latency, DB, Valkey, Queue, Outbox and Worker alarms exist.
- [ ] SNS alert route reaches Primary and Secondary; P1 test evidence is attached.
- [ ] CloudTrail and deployment audit records are enabled.

## Deployment

- [ ] Candidate commit and successful CI run fixed in release evidence.
- [ ] `pnpm audit --prod --audit-level high` and `pnpm release:check` pass.
- [ ] Immutable Web/API/Worker images share the same `RELEASE_COMMIT`.
- [ ] Backup succeeds before the one-shot migration task.
- [ ] Production deployment does not execute seed.
- [ ] Rolling health checks and automatic deployment rollback are configured.
- [ ] Previous-release image starts against restored forward schema.

## Safety evidence

- [ ] `VOICE_PROVIDER=mock`; eight external integration flags are false.
- [ ] Twilio/OpenAI/Zoom/calendar credentials are absent.
- [ ] External Provider/API call count is 0.
- [ ] Real telephone call count is 0.
- [ ] Backup/restore and rollback rehearsal pass.
- [ ] Emergency Stop tabletop and Mock-only production rehearsal pass.

## Current decision

`NO-GO_FOR_MOCK_ONLY_PRODUCTION_DEPLOYMENT`: design is documented, but AWS resources, HTTPS,
owners, monitoring, alert delivery and environment evidence are not yet approved or provisioned.
`NO-GO_FOR_EXTERNAL_PROVIDER_ACTIVATION` remains unconditional for Phase 10.
