import 'package:flutter_test/flutter_test.dart';
import 'package:app_links/app_links.dart';
import 'package:rami_mvp/main.dart';

void main() {
  testWidgets('RAMI start screen shows child mode', (tester) async {
    await tester.pumpWidget(
      RamiApp(firebaseReady: false, appLinks: AppLinks()),
    );
    expect(find.text('라미'), findsOneWidget);
    expect(find.text('아이 모드'), findsOneWidget);
  });
}
