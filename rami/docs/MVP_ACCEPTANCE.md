# RAMI MVP v0.2 acceptance test

The elephant prototype passes when all of the following work on a real supported phone:

1. App launches into RAMI start screen.
2. Child mode automatically begins waiting for NFC; no scan button is required for the normal path.
3. A physical NFC tag can be detected on the target Android phone and supported iPhone.
4. In v0.2 any detected physical tag opens the elephant experience.
5. Developer/demo elephant tag opens the same post-tag experience.
6. RAMI reveals the elephant before presenting choices.
7. Exactly two large child choices are visible at one time.
8. Child can choose the microphone play path.
9. Microphone permission failure is handled without crashing.
10. Child voice can be recorded and replayed.
11. Recording state survives app restart.
12. Interaction history survives app restart.
13. Re-tagging after a recording changes one choice to “my sound”.
14. The saved child recording can be replayed from that choice.
15. Parent screen can clear local prototype data for a fresh test.
16. No child personal information is stored on the NFC tag.

## The one metric that matters first

**Re-tag behavior:** after creating a voice, does the child voluntarily bring the elephant card back to the phone to hear or make something again?
