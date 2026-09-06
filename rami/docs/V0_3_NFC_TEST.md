# RAMI v0.3 NFC test

## A. Elephant (required first)

NFC Tools → Write → Add a record → Text:

`RAMI:ELEPHANT:001`

Expected:

RAMI → 아이 모드 → tag → 🐘 코끼리 content.

## B. Dog (optional second tag)

`RAMI:DOG:001`

Expected: 🐶 강아지 content.

## C. Car (optional third tag)

`RAMI:CAR:001`

Expected: 🚗 자동차 content.

## Failure interpretation

- "휴대폰 NFC를 켜주세요" → NFC disabled/unavailable.
- "NDEF 정보가 없어요" → tag detected but no NDEF record exists.
- "지원하지 않는 NFC 레코드" → record format is not supported by this MVP.
- "아직 등록되지 않은 라미 태그" + read value → NFC read succeeded; only the RAMI ID is unknown.

Do not lock/read-only the tags during development.
