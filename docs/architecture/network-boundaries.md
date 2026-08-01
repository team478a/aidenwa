# Production network boundaries

## Trust zones

| Zone                | Components                                | Inbound rule                         | Outbound rule                                                  |
| ------------------- | ----------------------------------------- | ------------------------------------ | -------------------------------------------------------------- |
| Public edge         | Route 53, ACM, WAF, public ALB            | HTTPS 443 from Internet              | Only registered Web/API target groups                          |
| Application private | ECS Web/API/Worker                        | ALB to Web/API; no inbound to Worker | RDS, Valkey, AWS endpoints; approved package/deploy paths only |
| Data private        | RDS, Valkey                               | Only owning ECS security groups      | No Internet route                                              |
| AWS control plane   | ECR, Secrets Manager, CloudWatch, S3, KMS | IAM/VPC endpoints                    | AWS-managed                                                    |
| External Provider   | Twilio/OpenAI/Zoom/Calendar               | None for Gate A                      | Denied; flags false and secrets absent                         |

## Required flows

| Source         | Destination     | Protocol                   | Purpose                                      |
| -------------- | --------------- | -------------------------- | -------------------------------------------- |
| Browser        | ALB             | HTTPS 443                  | UI and same-origin backend requests          |
| ALB            | Web             | HTTP target port           | Web pages and Web health                     |
| ALB            | API             | HTTP target port           | `/backend/*` and API health                  |
| Web            | API             | Private HTTP               | server-side rewrite using `API_INTERNAL_URL` |
| API / Worker   | RDS             | TLS PostgreSQL 5432        | Business data, sessions, Outbox, Audit       |
| API / Worker   | Valkey          | TLS 6379                   | BullMQ, throttling and Worker health         |
| Web/API/Worker | Secrets Manager | HTTPS via VPC endpoint     | Startup secret retrieval                     |
| Services       | CloudWatch      | HTTPS via VPC endpoint     | Sanitized logs and metrics                   |
| Worker/API     | S3              | HTTPS via gateway endpoint | Approved import/evidence object prefixes     |

## Controls

- RDS and Valkey have no public IP and no `0.0.0.0/0` security-group rule.
- Security groups reference service security groups, not broad CIDR ranges.
- TLS terminates at ALB; TLS is also required for database, Valkey and AWS service access.
- Admin access uses AWS SSM/ECS Exec with audited IAM; SSH and bastion hosts are not enabled by
  default.
- Production egress is deny-by-default. Gate A must not create DNS, NAT, proxy or VPC endpoint
  exceptions for Twilio, OpenAI, Zoom or calendar APIs.
- WAF starts with AWS managed baseline rules and rate limiting. Final rule set and exception owner
  are TBD and must be tested before Go.
- CloudTrail records AWS control-plane changes; deployment and emergency changes require named
  identities.

## Gate separation

Gate A requires `VOICE_PROVIDER=mock`, all external flags false and all external credentials
absent. Gate B requires a separate network review, egress allowlist, secret inventory update,
written approval and bounded manual test. Passing Gate A never changes Gate B.
