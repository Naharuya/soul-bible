import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:onaria/app/api_config.dart';
import 'package:onaria/src/api/member_api_client.dart';

void main() {
  test('release requires HTTPS, including localhost and configured overrides', () {
    for (final url in ['http://lightshare8.mycafe24.com', 'http://localhost:8787', 'http://10.0.2.2:8787', 'ftp://example.com', 'https://user:pass@example.com', '/relative']) {
      expect(ApiConfig.isAllowedEndpoint(Uri.parse(url), debug: false), isFalse);
    }
    expect(ApiConfig.isAllowedEndpoint(Uri.parse(ApiConfig.productionBaseUrl), debug: false), isTrue);
    for (final url in ['https://lightshare8.mycafe24.com', 'https://LIGHTSHARE8.MYCAFE24.COM.', 'https://127.0.0.1', 'https://104.105.128.84', 'https://[::1]', 'https://localhost', 'https://app.localhost', 'https://2130706433']) {
      expect(ApiConfig.isAllowedEndpoint(Uri.parse(url), debug: false), isFalse, reason: url);
    }
  });
  test('debug HTTP is restricted to explicit development loopback hosts', () {
    expect(ApiConfig.isAllowedEndpoint(Uri.parse('http://127.0.0.1:8787'), debug: true), isTrue);
    expect(ApiConfig.isAllowedEndpoint(Uri.parse('http://10.0.2.2:8787'), debug: true), isTrue);
    expect(ApiConfig.isAllowedEndpoint(Uri.parse('http://lightshare8.mycafe24.com'), debug: true), isFalse);
    expect(ApiConfig.isAllowedEndpoint(Uri.parse('http://localhost.attacker.example'), debug: true), isFalse);
  });
  test('signup rejects plaintext production before sending personal data', () async {
    var called = false;
    final client = MemberApiClient(baseUrl: Uri.parse('http://lightshare8.mycafe24.com'),
      httpClient: MockClient((_) async { called = true; return http.Response('{}', 201); }));
    addTearDown(client.close);
    await expectLater(client.signUp(name: 'fixture', phone: '01000000000', churchName: 'fixture'), throwsFormatException);
    expect(called, isFalse);
  });
  test('signup never follows a server redirect with personal data', () async {
    final client = MemberApiClient(baseUrl: Uri.parse('https://example.com'),
      httpClient: MockClient((request) async {
        expect(request.followRedirects, isFalse);
        return http.Response('', 307, headers: {'location': 'http://example.com'});
      }));
    addTearDown(client.close);
    await expectLater(client.signUp(name: 'fixture', phone: '01000000000', churchName: 'fixture'), throwsA(isA<MemberApiException>()));
  });
}
