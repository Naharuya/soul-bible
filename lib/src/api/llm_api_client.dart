import 'dart:convert';

import 'package:http/http.dart' as http;

import 'llm_models.dart';

abstract interface class LlmApiClient {
  Future<LlmConversationResponse> send(LlmConversationRequest request);
}

/// Calls your own backend proxy. Never embed an LLM provider API key in Flutter.
class ProxyLlmApiClient implements LlmApiClient {
  ProxyLlmApiClient({
    required this.endpoint,
    required this.appTokenProvider,
    http.Client? httpClient,
    this.timeout = const Duration(seconds: 25),
  }) : _httpClient = httpClient ?? http.Client();

  final Uri endpoint;
  final Future<String?> Function() appTokenProvider;
  final http.Client _httpClient;
  final Duration timeout;

  @override
  Future<LlmConversationResponse> send(
    LlmConversationRequest request,
  ) async {
    final token = await appTokenProvider();
    final response = await _httpClient
        .post(
          endpoint,
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            if (token != null && token.isNotEmpty)
              'Authorization': 'Bearer $token',
          },
          body: jsonEncode(request.toJson()),
        )
        .timeout(timeout);

    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw LlmApiException(
        statusCode: response.statusCode,
        message: _readError(response.body),
      );
    }

    final decoded = jsonDecode(response.body);
    if (decoded is! Map<String, dynamic>) {
      throw const FormatException('LLM response must be a JSON object.');
    }
    return LlmConversationResponse.fromJson(decoded);
  }

  static String _readError(String body) {
    try {
      final decoded = jsonDecode(body);
      if (decoded is Map<String, dynamic> && decoded['message'] is String) {
        return decoded['message'] as String;
      }
    } catch (_) {}
    return body.isEmpty ? 'Unknown server error.' : body;
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
