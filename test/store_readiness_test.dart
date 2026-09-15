import 'dart:convert';
import 'package:crypto/crypto.dart';
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:onaria/app/asset_loader.dart';
import 'package:onaria/app/privacy_consent.dart';
import 'package:onaria/features/content_report_page.dart';
import 'package:onaria/onaria.dart';
import 'package:onaria/engagement/engagement_controller.dart';
import 'support/engagement_fakes.dart';
import 'package:shared_preferences_platform_interface/in_memory_shared_preferences_async.dart';
import 'package:shared_preferences_platform_interface/shared_preferences_async_platform_interface.dart';

class _WithheldLoader implements VerseAssetLoader {
  @override
  Future<String> loadString(String path) async => '{"verses":[]}';
}
void main() {
  setUp(() => SharedPreferencesAsyncPlatform.instance = InMemorySharedPreferencesAsync.empty());
  tearDown(() => SharedPreferencesAsyncPlatform.instance = null);
  test('withholding content preserves saved IDs across an unrelated record write', () async {
    final storage = MemoryEngagementStorage();
    storage.values[EngagementController.storageKey] = jsonEncode({'savedVerseIds':['verse_1']});
    final controller = EngagementController(storage:storage,verses:VerseRepository(loader:_WithheldLoader()));
    addTearDown(controller.dispose);
    await controller.load();
    expect(controller.catalog,isEmpty);
    expect(controller.savedVerseIds,{'verse_1'});
    await controller.deleteJourney();
    expect(jsonDecode(storage.values[EngagementController.storageKey]!)['savedVerseIds'],['verse_1']);
    final restored = testEngagement(storage:storage,clock:DateTime.now);
    addTearDown(restored.dispose);
    await restored.load();
    expect(restored.verse('verse_1'),isNotNull);
    expect(restored.savedVerseIds,{'verse_1'});
  });
  test('release verses reject pending approval and text changed after approval', () {
    final verse = <String, dynamic>{'reference':'Fixture 1:1','translation':'fixture','text':'fixture text','englishText':''};
    verse['approval'] = {'status':'approved','reviewer':'fixture','reviewedAt':'2026-09-15','licenseEvidence':'fixture-only',
      'contentSha256':sha256.convert(utf8.encode(jsonEncode(['Fixture 1:1','fixture','fixture text','']))).toString()};
    List filtered() => jsonDecode(FlutterVerseAssetLoader.approvedVerseAsset(jsonEncode({'verses':[verse]})))['verses'] as List;
    expect(filtered(), hasLength(1));
    verse['text'] = 'changed'; expect(filtered(), isEmpty);
    verse['text'] = 'fixture text'; verse['approval']['status'] = 'pending'; expect(filtered(), isEmpty);
  });
  testWidgets('AI consent requires an approved notice, explicit acceptance and can be revoked', (tester) async {
    var ready = false;
    bool? result;
    final client = MockClient((request) async {
      expect(request.method, 'GET'); expect(request.followRedirects, isFalse);
      return http.Response(jsonEncode({'ready':ready,'version':'2026-09-15','aiProviders':['Fixture AI'],
        'operatorName':'Fixture','supportEmail':'fixture@example.com','usageRetention':'Fixture','internationalTransfer':'Fixture'}),200);
    });
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: Builder(builder:(context) => TextButton(
      onPressed:() async { result = await PrivacyConsent.ensure(context,client:client); },child:const Text('start'))))));
    await tester.tap(find.text('start')); await tester.pumpAndSettle();
    expect(result,false); expect(await PrivacyConsent.acceptedVersion(),isNull);
    ready = true; await tester.tap(find.text('start')); await tester.pumpAndSettle();
    await tester.tap(find.text('동의하지 않음')); await tester.pumpAndSettle();
    expect(result,false); expect(await PrivacyConsent.acceptedVersion(),isNull);
    await tester.tap(find.text('start')); await tester.pumpAndSettle();
    await tester.tap(find.text('확인하고 동의')); await tester.pumpAndSettle();
    expect(result,true); expect(await PrivacyConsent.acceptedVersion(),'2026-09-15');
    await PrivacyConsent.revoke(); expect(await PrivacyConsent.acceptedVersion(),isNull);
  });
  testWidgets('report does not attach response by default and retry keeps identity', (tester) async {
    final requests = <Map<String,dynamic>>[];
    final client = MockClient((request) async {
      expect(request.followRedirects,isFalse); requests.add(jsonDecode(request.body) as Map<String,dynamic>);
      return http.Response(requests.length == 1 ? '{}' : '{"accepted":true}', requests.length == 1 ? 503 : 202);
    });
    await tester.pumpWidget(MaterialApp(home:ContentReportPage(responseText:'Fixture sensitive response',client:client)));
    await tester.tap(find.text('위험한 행동 권유')); await tester.pumpAndSettle();
    await tester.ensureVisible(find.text('신고 보내기')); await tester.tap(find.text('신고 보내기')); await tester.pumpAndSettle();
    expect(requests.single['includeResponse'],false); expect(requests.single.containsKey('responseText'),false);
    await tester.ensureVisible(find.text('신고 보내기')); await tester.tap(find.text('신고 보내기')); await tester.pumpAndSettle();
    expect(requests[1]['submissionId'],requests[0]['submissionId']);
    expect(find.text('신고가 접수됐어요. 담당자가 검토해 안전 개선에 활용합니다.'),findsOneWidget);
  });
}
