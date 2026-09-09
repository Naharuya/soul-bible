import 'package:flutter/foundation.dart';

class ApiConfig {
  const ApiConfig._();

  static const _configuredBaseUrl = String.fromEnvironment(
    'ONARIA_API_BASE_URL',
    defaultValue: String.fromEnvironment(
      'SOUL_BIBLE_API_BASE_URL',
      defaultValue: 'https://api.onaria.ai.kr',
    ),
  );
  static const appToken = String.fromEnvironment('ONARIA_APP_TOKEN',
      defaultValue: String.fromEnvironment('SOUL_BIBLE_APP_TOKEN'));

  static Uri? get baseUrl {
    if (_configuredBaseUrl.isEmpty) return null;
    final uri = Uri.tryParse(_configuredBaseUrl);
    return uri != null && isAllowedEndpoint(uri) ? uri : null;
  }

  static bool isAllowedEndpoint(Uri uri, {bool debug = kDebugMode}) {
    if (!uri.hasAuthority || uri.host.isEmpty || uri.userInfo.isNotEmpty) return false;
    if (uri.scheme == 'https') return true;
    return debug && uri.scheme == 'http' &&
        const ['localhost', '127.0.0.1', '::1', '10.0.2.2'].contains(uri.host);
  }

  static void requireSecureEndpoint(Uri uri) {
    if (!isAllowedEndpoint(uri)) {
      throw const FormatException('API 연결에는 HTTPS가 필요합니다.');
    }
  }

  static Uri? get chatUrl {
    final base = baseUrl;
    return base?.resolve('/v1/mind/chat');
  }

  static String get setupHint {
    if (!kDebugMode) return 'HTTPS 서버 설정을 확인해 주세요.';
    if (kIsWeb) return 'ONARIA_API_BASE_URL=http://localhost:8787';
    return 'ONARIA_API_BASE_URL=http://10.0.2.2:8787';
  }
}
