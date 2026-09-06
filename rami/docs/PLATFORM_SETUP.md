# Platform setup required after `flutter create .`

## Android
In `android/app/src/main/AndroidManifest.xml`, add before `<application>`:

```xml
<uses-permission android:name="android.permission.NFC" />
<uses-feature android:name="android.hardware.nfc" android:required="false" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
```

## iOS
In `ios/Runner/Info.plist`, add:

```xml
<key>NFCReaderUsageDescription</key>
<string>라미 그림카드를 읽기 위해 NFC를 사용합니다.</string>
<key>NSMicrophoneUsageDescription</key>
<string>아이의 놀이 목소리를 녹음하기 위해 마이크를 사용합니다.</string>
```

In Xcode > Runner > Signing & Capabilities, add:
- Near Field Communication Tag Reading

Then make sure the Runner entitlements contain the NFC tag reader session formats required by the tag type used in the product.

## Firebase
1. Create or select the RAMI Firebase project.
2. Register Android/iOS apps with the final package/bundle IDs.
3. Run `flutterfire configure`.
4. Add the generated platform configuration files.
5. Replace demo/local repository writes with Firestore/Storage writes.
