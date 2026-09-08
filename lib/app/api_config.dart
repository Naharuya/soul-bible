import 'package:flutter/foundation.dart';

class ApiConfig {
  const ApiConfig._();

  static const _configuredBaseUrl = String.fromEnvironment(
    'SOUL_BIBLE_API_BASE_URL',
    defaultValue: 'https://api.onaria.ai.kr',
  );
  static const appToken = String.fromEnvironment('SOUL_BIBLE_APP_TOKEN');

  static Uri? get baseUrl {
    if (_configuredBaseUrl.isEmpty) return null;
    return Uri.tryParse(_configuredBaseUrl);
  }

  static Uri? get chatUrl {
    final base = baseUrl;
    return base?.resolve('/v1/mind/chat');
  }

  static String get setupHint {
    if (kIsWeb) return 'SOUL_BIBLE_API_BASE_URL=http://localhost:8787';
    return 'SOUL_BIBLE_API_BASE_URL=http://10.0.2.2:8787';
  }
}
