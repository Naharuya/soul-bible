import 'package:flutter/foundation.dart';

class ApiConfig {
  const ApiConfig._();

  static const productionBaseUrl = 'https://api.onaria.ai.kr';

  static const _configuredBaseUrl = String.fromEnvironment(
    'ONARIA_API_BASE_URL',
    defaultValue: String.fromEnvironment(
      'SOUL_BIBLE_API_BASE_URL',
      defaultValue: productionBaseUrl,
    ),
  );
  static const appToken = String.fromEnvironment('ONARIA_APP_TOKEN',
      defaultValue: String.fromEnvironment('SOUL_BIBLE_APP_TOKEN'));

  static Uri? get baseUrl => resolveBaseUrl(_configuredBaseUrl);

  static Uri? resolveBaseUrl(String value, {bool debug = kDebugMode}) {
    if (value.isEmpty) return null;
    final uri = Uri.tryParse(value);
    return uri != null && isAllowedEndpoint(uri, debug: debug) ? uri : null;
  }

  static bool isAllowedEndpoint(Uri uri, {bool debug = kDebugMode}) {
    if (!uri.hasAuthority || uri.host.isEmpty || uri.userInfo.isNotEmpty) return false;
    if (uri.scheme == 'https') {
      if (debug) return true;
      final host = uri.host.toLowerCase().replaceFirst(RegExp(r'\.$'), '');
      if (host == 'lightshare8.mycafe24.com' || host.endsWith('.localhost')) return false;
      // Release overrides must be HTTPS DNS names, never IPs or loopback names.
      return RegExp(r'^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$').hasMatch(host);
    }
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
