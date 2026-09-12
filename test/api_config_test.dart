import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/app/api_config.dart';

void main() {
  test('official default is valid under release policy', () {
    expect(ApiConfig.productionBaseUrl, 'https://api.onaria.ai.kr');
    expect(ApiConfig.resolveBaseUrl(ApiConfig.productionBaseUrl, debug: false)?.host, 'api.onaria.ai.kr');
  });
  test('compiled overrides preserve ONARIA precedence and legacy compatibility', () {
    const expected = String.fromEnvironment('ONARIA_API_BASE_URL',
        defaultValue: String.fromEnvironment('SOUL_BIBLE_API_BASE_URL', defaultValue: ApiConfig.productionBaseUrl));
    expect(ApiConfig.baseUrl, ApiConfig.resolveBaseUrl(expected));
    expect(ApiConfig.chatUrl, ApiConfig.baseUrl?.resolve('/v1/mind/chat'));
  });
  test('explicit development address is allowed only in debug', () {
    for (final host in ['localhost', '127.0.0.1', '10.0.2.2', '[::1]']) {
      expect(ApiConfig.resolveBaseUrl('http://$host:8787', debug: true), isNotNull);
      expect(ApiConfig.resolveBaseUrl('http://$host:8787', debug: false), isNull);
    }
    expect(ApiConfig.resolveBaseUrl('', debug: false), isNull);
    expect(ApiConfig.resolveBaseUrl('http://192.168.1.10:8787', debug: true), isNull);
    expect(ApiConfig.resolveBaseUrl('https://staging.example.com', debug: false), isNotNull);
    expect(ApiConfig.resolveBaseUrl('https://user:pass@example.com', debug: false), isNull);
  });
}
