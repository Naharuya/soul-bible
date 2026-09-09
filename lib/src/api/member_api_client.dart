import 'dart:convert';
import 'package:http/http.dart' as http;
import '../../app/api_config.dart';

class MemberApiClient {
  MemberApiClient({required this.baseUrl, http.Client? httpClient, this.timeout = const Duration(seconds: 15)}) : _httpClient = httpClient ?? http.Client();
  final Uri baseUrl;
  final http.Client _httpClient;
  final Duration timeout;

  Future<void> signUp({required String name, required String phone, required String churchName, String loginProvider = 'phone'}) async {
    ApiConfig.requireSecureEndpoint(baseUrl);
    final request = http.Request('POST', baseUrl.resolve('/v1/auth/signup'))
      ..followRedirects = false
      ..headers.addAll(const {'Content-Type': 'application/json', 'Accept': 'application/json'})
      ..body = jsonEncode({'name': name, 'phone': phone, 'churchName': churchName, 'loginProvider': loginProvider});
    final response = await _httpClient.send(request).then(http.Response.fromStream).timeout(timeout);
    if (response.statusCode < 200 || response.statusCode >= 300) throw MemberApiException(_readError(response.body));
  }

  static String _readError(String body) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic> && decoded['message'] is String) return decoded['message'] as String;
    } catch (_) {}
    return '회원가입에 실패했습니다. 잠시 후 다시 시도해 주세요.';
  }
  void close() => _httpClient.close();
}

class MemberApiException implements Exception {
  const MemberApiException(this.message);
  final String message;
  @override
  String toString() => message;
}
