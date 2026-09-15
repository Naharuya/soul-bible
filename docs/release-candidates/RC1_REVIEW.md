# ONARIA 0.4.2+7 RC1 — release validation

Decision: **HOLD — not approved for public release**.

Checked on 2026-09-13 KST. This is an immutable APK candidate with a hashed local source manifest, not a Git release tag or a production deployment.

## Candidate identity

- Base commit: `d73acfed15d10c25f0241d55112f3012b62aa584`, local `main`, uncommitted changes present.
- Fetched origin/main: `e58a0a8c42a570a8c4feae00e79f9cfafcc28bce`; local HEAD is 18 commits behind. No merge/reset/stash was performed.
- Package/version: `com.example.bible_mind_core`, `0.4.2+7`, non-debuggable.
- APK: `build/release-candidates/rc1/onaria-0.4.2-7-rc1.apk` (local build artifact, not committed).
- SHA-256: `0f5773cba627f5aeac5052e2c860d8d7262b195b9257adc002f2050dbe3eee84`.
- Signing certificate verified against the existing approved Release certificate: `692eabafe55986612f5aa3d475cea16e0e5e7db20ce2e09219a2f536f7e8f6bb`.
- `rc1-manifest.json` records 269 selected app/backend/assets/tests/scripts source hashes. It is not a complete reproducible environment or proof of source-to-binary equivalence; secrets and signing material are excluded.

## Fresh validation results

| Area | Result | Evidence / limits |
| --- | --- | --- |
| Flutter | PASS | 150 passed, 1 skipped; `build/rc-flutter-tests.log` |
| Flutter analyze | PASS | Four pre-existing example `avoid_print` infos; no errors/warnings |
| Backend | PASS | 397 tests passed; `build/rc-backend-tests.log` |
| Web/Admin browser tests | PASS | 17 passed using installed Chrome; initial default-browser run failed because bundled browser was unavailable |
| APK verification | PASS | Existing APK signature, package, version, non-debuggable metadata verified; build not repeated during this audit |
| Production HTTPS | PASS | Website, privacy, terms, health: 200; HSTS/CSP present |
| Admin access boundary | PASS | Unauthenticated overview and feedback requests: 401 + no-store; this does not prove the feedback handler exists behind auth |
| Input validation | PASS | Malformed chat request: 400 + no-store |
| Normal conversation | PASS | Three synthetic turns: 200, schema-valid; thought → need → verse_offer; 183/125/43 ms for this sample only |
| Religious citation boundary | PASS (limited) | Empty allowed verse list yielded no suggested verse ID in those three turns; not a full content-quality audit |
| Production Safety | PASS (HTTP only) | 13/13 synthetic crisis fixtures match fixed local responses; server/provider telemetry is still required to prove zero downstream calls in production |
| Production website browser | PASS | Chrome widths 390/768/1440: ten sections, no horizontal overflow or page script errors |
| Production feedback | **FAIL** | POST `/v1/feedback` with invalid empty payload returns **404**, while the current backend implements this endpoint and validates its payload. The RC app calls it from FeedbackPage. No real feedback was submitted |
| Physical device | **PASS (core flow)** | Subsequent connected-device verification completed; see `RC1_DEVICE_REVIEW.md`. Installed APK hash matches RC1. Voice quality and network-failure scenarios remain unverified |
| CI for exact RC | **NOT RUN** | RC includes uncommitted work. Recent success on origin/main cannot certify this local candidate |
| Backup/restore, monitoring, provider cost counters | **NOT RUN** | No authenticated server/operations access used in this audit |
| iOS | **NOT RUN** | Windows environment; macOS/CI/device validation required if iOS is in launch scope |

Production probe results: `rc1-production.json`, `rc1-chat.json`, `rc1-safety.json`. No credentials, response conversation text, or private member data are included.

Observed successful remote runs (different SHA, not RC certification):
- Web/Admin: https://github.com/Naharuya/soul-bible/actions/runs/34746849633
- Cafe24 package: https://github.com/Naharuya/soul-bible/actions/runs/34747213744

## Release gates still open

1. **P1 app/server mismatch:** reconcile production backend with the candidate, validate feedback behavior in a controlled test, and repeat contract checks after an authorized CI-artifact deployment. No production server modifications or restarts were performed.
2. **P1 release provenance:** reconcile the 18 remote commits while preserving all local work; select and review candidate changes, secret-scan, commit, and obtain exact-SHA CI/artifact verification. This audit did not mix existing changes into a commit.
3. **Remaining real-device acceptance:** core flow, APK identity, three-column layout, card persistence, automatic game start, six-star completion, inactive-star rejection, pause/resume, and return navigation passed in the subsequent audit. Finish actual audio listening and interrupted-network/retry verification. Avoid deleting personal records.
4. Confirm operational monitoring and recoverable backup/rollback with appropriate server evidence. Production Safety telemetry and iOS remain explicit limitations.

New findings or fixes should create RC2 or a new manifest; do not silently relabel this APK as a newer candidate.
