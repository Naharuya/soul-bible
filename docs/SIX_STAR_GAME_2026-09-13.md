# Emotion grid and six-star game

- Emotion choices use three columns, including with enlarged system text. Tile height reserves two label lines.
- Confirming the mind card saves it on-device and opens the game, which starts automatically. The save-only and sharing actions remain available.
- All six stars are visible together. Uncollected stars drift; only the next eligible star pulses and accepts touch, drag, or accessibility activation. Collected stars settle on the cross.
- The existing five-second rest between collections remains. During rest or pause no star can be collected. Reduced-motion settings stop animation.
- Game logic also rejects out-of-order collections, independently of UI touch guards.

Validation: Flutter 150 passed / 1 skipped. Tests cover enlarged-text three-column layout, automatic start after confirmation, six visible stars, inactive-star rejection, sequential collection, pause, reduced motion, drag, and return navigation. Static analysis has only four existing example print infos.

Android debug and Release builds passed. Required installer verified the existing and new Release signatures, installed version 0.4.2+7 with `adb install -r`, and confirmed application launch on the connected phone. Full manual interaction on the phone remains unverified. No production server deployment, commit, or push was performed.
