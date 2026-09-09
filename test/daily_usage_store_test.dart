import 'package:onaria/app/mind_card_store.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

void main() {
  setUp(() {
    SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty();
  });
  tearDown(() {
    SharedPreferencesAsyncPlatform.instance = null;
  });

  test('무료 회원도 하루 세 번 이후 계속 대화를 시작할 수 있다', () async {
    final store = DailyUsageStore(tier: MembershipTier.free);
    for (var count = 1; count <= 5; count++) {
      expect(await store.tryConsume(), isTrue);
      expect(await store.getCount(), count);
    }
  });
}
