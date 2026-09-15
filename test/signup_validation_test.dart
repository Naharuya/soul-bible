import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/features/signup_page.dart';
void main() {
  testWidgets('suspended registration collects no member information', (tester) async {
    await tester.pumpWidget(const MaterialApp(home: SignUpPage()));
    expect(find.byType(TextFormField), findsNothing);
    expect(find.byType(TextField), findsNothing);
    expect(find.text('기존 회원정보 삭제 요청'), findsOneWidget);
  });
}
