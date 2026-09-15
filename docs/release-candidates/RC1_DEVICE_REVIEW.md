# RC1 physical-device verification — 2026-09-13

Device: Samsung SM-S908N, Android Release package `com.example.bible_mind_core` 0.4.2+7. System font scale: 1.5. Device was unlocked by the user; no authentication bypass was used.

## Passed

- Installed base APK SHA-256 exactly matches RC1: `0f5773cba627f5aeac5052e2c860d8d7262b195b9257adc002f2050dbe3eee84`. See `rc1-device-identity.json`.
- Cold app launch; home slogan displays on one line without a stranded final syllable.
- Emotion rows contain three choices with aligned bounds. Gratitude selection enables conversation start.
- Three built-in synthetic example messages progress through conversation to today's verse. No real personal input was sent by the agent.
- Today's verse displays Psalm 100:4 with Korean translation label and English text. Speech tap changes the control to stop narration. Proceeding to the action screen succeeds. This checks UI state only, not acoustic quality or verified audio-stop timing.
- Action selection opens the matching mind card. Confirmation saves the card and automatically starts the game.
- Six stars are visible together, with one highlighted star. Pause disables all six accessibility click actions. The phone locked during verification; after the user unlocked it, the game remained paused with state intact.
- Tapping the inactive hope star before peace does not collect it. Active stars subsequently collect in order, with selected counts 1, 2, 3, 4, 5, 6. All six remain present; the final completion screen appears. See `rc1-device-game.json`.
- Completion return button is reachable above the navigation bar after scrolling and returns directly to emotion selection.
- The newly created synthetic card appears in saved cards. Its detail contains the selected action (one-line gratitude journal) and Psalm 100:4.
- App returned to the home screen after verification. No existing cards were deleted. One synthetic test card remains stored; normal usage counters also advanced through the test flow.

## Observations and limits

- P2: the long game app-bar title is ellipsized at text scale 1.5. The main game heading and controls remain readable. No candidate code was changed in this audit.
- Actual listening/naturalness, microphone recognition, interrupted-network/retry, process-death recovery, and iOS were not verified on a physical device.
- Animated game screens can prevent UI Automator from reaching idle. A dump failure initially returned stale XML; that XML was not counted as game evidence. Game evidence uses screenshots and fresh successful dumps while paused or completed.
- Screenshots and raw UI dumps remain local under ignored `build/`; only APK identity and non-personal game counts are retained in the report directory.
- Production feedback endpoint was rechecked during this audit and still returns 404 (empty invalid payload, no feedback record created). Exact-RC CI and operational readiness gates remain open. **Public-release decision remains HOLD.**
