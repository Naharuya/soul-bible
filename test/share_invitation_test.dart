import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/sharing/native_share.dart';

void main() {
  test('only the configured public invitation URL is included in sharing', () {
    const configured = String.fromEnvironment('ONARIA_SHARE_APP_URL');
    if (configured == 'https://api.onaria.ai.kr/app/open') {
      expect(NativeCardShare.invitationText, contains(configured));
      expect(NativeCardShare.invitationText, contains('앱 열기 · 설치 안내'));
    } else {
      expect(NativeCardShare.invitationText, isNull);
    }
  });
}
