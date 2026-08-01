# Phase 10 production topology

## Decision status

This is the recommended Gate A (Mock-only) topology. AWS account, owners, budgets and production
resources remain unapproved and unprovisioned. Region is proposed as `ap-northeast-1` (Tokyo).
Gate B external Provider connectivity is prohibited and has no route, credential or enabled flag.

## Topology

```text
Internet
  |
Route 53 -> ACM TLS -> AWS WAF -> public ALB
                                  |-- / and /api/health -> ECS Web (private subnets, 2 tasks)
                                  `-- /backend/*       -> ECS API (private subnets, 2 tasks)
                                                               |
                          +------------------------------------+------------------+
                          |                                    |                  |
                  RDS PostgreSQL Multi-AZ        ElastiCache Serverless     S3 object/evidence
                    private DB subnets              for Valkey/private       encrypted buckets
                          ^                                    ^
                          |                                    |
                    ECS Worker (private subnets, 1–2 tasks; no public endpoint)

GitHub Actions --OIDC--> AWS deploy role -> ECR/ECS migration task/deployment
ECS task roles -------> Secrets Manager, CloudWatch Logs/Metrics, permitted S3 prefixes
CloudWatch Alarms ----> SNS -> approved alert destination (TBD)
```

## Service placement and responsibility

| Component       | Proposed AWS service              | Exposure                   | Initial availability | Owner                     |
| --------------- | --------------------------------- | -------------------------- | -------------------- | ------------------------- |
| DNS / TLS       | Route 53 / ACM                    | Public                     | Managed              | Infrastructure Owner: TBD |
| Edge protection | WAF on ALB                        | Public                     | Managed              | Security Owner: TBD       |
| Web             | ECS Fargate                       | ALB only                   | 2 tasks / 2 AZ       | Application Owner: TBD    |
| API             | ECS Fargate                       | ALB path only              | 2 tasks / 2 AZ       | Application Owner: TBD    |
| Worker          | ECS Fargate                       | None                       | 1–2 tasks            | Operations Owner: TBD     |
| PostgreSQL      | RDS PostgreSQL                    | Private SG only            | Multi-AZ             | Database Owner: TBD       |
| Queue/cache     | ElastiCache Serverless for Valkey | Private SG only            | Multi-AZ managed     | Infrastructure Owner: TBD |
| Object/evidence | S3 + KMS                          | IAM only                   | Regional managed     | Data Owner: TBD           |
| Secrets         | Secrets Manager + KMS             | IAM only                   | Regional managed     | Security Owner: TBD       |
| Images          | ECR                               | IAM only                   | Regional managed     | Release Manager: TBD      |
| Logs/metrics    | CloudWatch                        | IAM only                   | Regional managed     | On-call Owner: TBD        |
| Alerts          | CloudWatch Alarms + SNS           | Approved destinations only | Managed              | On-call Primary: TBD      |

## Deployment and rollback

- GitHub Actions uses OIDC and a least-privilege deploy role; no long-lived AWS key is stored in
  GitHub.
- Web, API and Worker images carry one immutable `RELEASE_COMMIT` and are promoted together.
- A one-shot ECS migration task runs after backup confirmation and before service rollout. Seed is
  never run in production.
- ECS performs rolling replacement with health-check rollback. Database migrations are never
  reversed; rollback starts the last verified image against the forward-compatible schema.
- Queue, Outbox, Audit and Emergency Stop records are preserved.

## Cost envelope

For low traffic with Multi-AZ RDS, 5–6 small Fargate tasks, ALB/WAF, Valkey, logs, secrets and
backup storage, budget **JPY 80,000–180,000/month plus tax and data transfer**. This is a planning
range, not a quote. NAT gateways, log ingestion, RDS size/storage and traffic are the largest
variables. The Infrastructure Owner must save an AWS Pricing Calculator estimate before Go.

Pricing assumptions must be refreshed at approval time using the official
[AWS Pricing Calculator](https://calculator.aws/),
[Fargate pricing](https://aws.amazon.com/fargate/pricing/),
[RDS for PostgreSQL pricing](https://aws.amazon.com/rds/postgresql/pricing/),
[ElastiCache pricing](https://aws.amazon.com/elasticache/pricing/),
[Secrets Manager pricing](https://aws.amazon.com/secrets-manager/pricing/),
[CloudWatch pricing](https://aws.amazon.com/cloudwatch/pricing/) and
[WAF pricing](https://aws.amazon.com/waf/pricing/). The estimate excludes consumption tax and
unapproved Gate B Provider charges.
