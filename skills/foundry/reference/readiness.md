# Readiness

Read by `audit` only. Never paste this list into a build prompt.

Each item has one line and the way it is checked: a script, a test, or a review.
Only a short definition of done for the current tier goes into AGENTS.md.

## Tier 1: real users

| Item | How checked (script/test/review) |
|---|---|
| Designed schema | review: the schema is written down, and each migration is read against it. |
| Authorization per object | test: for each endpoint, a request for another user's object is refused. |
| Server-side validation | test: each input handler rejects a malformed payload. |
| Secrets out of repo and chat | script: a secret scanner runs in `check` and in CI. |
| Dependency scanning | script: a dependency audit runs in CI on each change. |
| Backups with a tested restore | review: a runbook records the last restore drill and its date. |
| Migrations that roll back | test: each migration runs up, down and up again in CI. |
| Structured logs | review: logs are structured and carry a request id. |
| Error tracking | review: production errors reach a tracker, and a test error was seen there. |
| Uptime check | review: an external check hits the public URL and alerts the owner. |

## Tier 2: paying users

| Item | How checked (script/test/review) |
|---|---|
| Idempotency | test: a retried write with the same key has one effect. |
| Money as integers | test: amounts are stored and computed in minor units, with no floats. |
| Rate limits | test: a burst over the limit is refused on each public endpoint. |
| Audit trail | test: each change to money, access or settings writes an audit entry. |
| Email deliverability | script: SPF, DKIM and DMARC records resolve for the sending domain. |
| Rollbacks | review: a runbook names the rollback command, and it has been run once. |
| Cost alerts | review: each paid service has a budget alert that reaches the owner. |

## Tier 3: enterprise

| Item | How checked (script/test/review) |
|---|---|
| SSO/SAML | test: a login through a test identity provider succeeds, and a bad assertion fails. |
| SCIM | test: provisioning and deprovisioning through SCIM change access. |
| Tenant isolation proofs | test: every query path runs with two tenants and never crosses them. |
| Data residency | review: each data store and backup is mapped to its region. |
| Retention and deletion everywhere | test: a deleted account leaves no data in stores, logs or backups past the retention period. |
| Compliance evidence | review: the evidence each control needs is collected and dated. |
