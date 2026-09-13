# Feedback API release fix

The RC Android app submits categorical feedback to `POST /v1/feedback`, but the deployed backend returned 404 during the 2026-09-13 release audit.

This change adds the existing app contract: a 32-character lowercase hexadecimal submission ID, rating (`helpful` or `not_helpful`), and one predefined reason. Extra fields and free text are rejected. Accepted submissions return 202 with `{ "accepted": true }` and no-store caching. Configured app-token authentication and the existing rate limiter apply.

Aggregates are visible only through authenticated admin routes. Immediate duplicate submissions are suppressed by a bounded in-process ID set. Metrics reset on restart; the admin screen identifies the process-lifetime scope. There is no database migration or AI call.

Validation on a clean worktree based on origin/main: backend 400 tests passed. Browser verification and deployment status are reported separately in the PR/CI; local success is not proof of production deployment.

Deployment must use the existing Cafe24 CI artifact for a verified main commit. The packaging workflow requires App QA and Web CI for that exact main SHA. Follow `docs/CAFE24_ZIP_DEPLOYMENT.md`; do not upload a locally generated ZIP as a verified CI artifact. The production deployment/restart requires explicit authorization.

After deployment, verify `/health`, rejected invalid feedback (400 or configured-auth 401 instead of 404), protected admin access (401/no-store), and an approved controlled acceptance/deduplication check. Preserve the release audit's distinction between app RC and backend deployment identity.
