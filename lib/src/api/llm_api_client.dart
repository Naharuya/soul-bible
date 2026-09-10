import 'dart:convert';

import 'package:http/http.dart' as http;
import '../../app/api_config.dart';

import 'llm_models.dart';

abstract interface class LlmApiClient {
  Future<LlmConversationResponse> send(LlmConversationRequest request);
}

/// Calls your own backend proxy. Never embed an LLM provider API key in Flutter.
class ProxyLlmApiClient implements LlmApiClient {
  ProxyLlmApiClient({
    required this.endpoint,
    required this.appTokenProvider,
    this.identityTokenProvider,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 25),
  }) : _httpClient = httpClient ?? http.Client();

  final Uri endpoint;
  final Future<String?> Function() appTokenProvider;
  /// Supply a fresh token from the configured login SDK. Never persist it here.
  final Future<String?> Function()? identityTokenProvider;
  final http.Client _httpClient;
  final Duration timeout;

  @override
  Future<LlmConversationResponse> send(
    LlmConversationRequest request,
  ) async {
    ApiConfig.requireSecureEndpoint(endpoint);
    final token = await appTokenProvider();
    final identityToken = await identityTokenProvider?.call();
    if (identityToken != null && identityToken.isNotEmpty &&
        (identityToken.length > 8192 ||
         !RegExp(r'^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$').hasMatch(identityToken))) {
      throw const FormatException('회원 인증 정보를 확인해 주세요.');
    }
    final outbound = http.Request('POST', endpoint)
      ..followRedirects = false
      ..headers.addAll({
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            if (token != null && token.isNotEmpty)
              'Authorization': 'Bearer $token',
            if (identityToken != null && identityToken.isNotEmpty)
              'X-Soul-Identity-Token': identityToken,
          })
      ..body = jsonEncode(request.toJson());
    final response = await _httpClient.send(outbound).then(http.Response.fromStream).timeout(timeout);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw LlmApiException(
        statusCode: response.statusCode,
        message: '서버 연결을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.',
      );
    }

    try {
      final decoded = jsonDecode(response.body);
      if (decoded is! Map<String, dynamic>) {
        throw const FormatException('Invalid response.');
      }
      return LlmConversationResponse.fromJson(decoded);
    } catch (_) {
      throw const FormatException('서버 응답을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
    }
  }

  void close() => _httpClient.close();
}

class LlmApiException implements Exception {
  const LlmApiException({
    required this.statusCode,
    required this.message,
  });

  final int statusCode;
  final String message;

  @override
  String toString() => 'LlmApiException($statusCode): $message';
}
