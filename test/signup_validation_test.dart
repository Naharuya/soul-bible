import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/features/signup_page.dart';

void main() {
  testWidgets('invalid phone is rejected before signup is sent', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: SignUpPage()));
    await tester.enterText(find.byType(TextFormField).at(0), '테스트');
    await tester.enterText(find.byType(TextFormField).at(1), '123');
    await tester.enterText(find.byType(TextFormField).at(2), '테스트 교회');
    tester.testTextInput.hide();
    await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('회원가입'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('회원가입'));
    await tester.pumpAndSettle();
    expect(find.text('휴대폰 번호를 확인해 주세요.'), findsOneWidget);
    expect(find.text('가입 중...'), findsNothing);
  });
}
