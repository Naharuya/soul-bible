import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:shared_preferences/shared_preferences.dart';
import 'api_config.dart';

class PrivacyConsent {
  static const storageKey = 'onaria.privacy_consent.version';
  static Future<String?> acceptedVersion() => SharedPreferencesAsync().getString(storageKey);
  static Future<void> revoke() => SharedPreferencesAsync().remove(storageKey);

  static Future<bool> ensure(BuildContext context, {http.Client? client}) async {
    final connection = client ?? http.Client();
    try {
      final endpoint = ApiConfig.baseUrl!.resolve('/v1/privacy');
      ApiConfig.requireSecureEndpoint(endpoint);
      final request = http.Request('GET', endpoint)..followRedirects = false;
      final response = await connection.send(request).then(http.Response.fromStream).timeout(const Duration(seconds: 12));
      if (response.statusCode != 200) throw StateError('unavailable');
      final policy = jsonDecode(response.body) as Map<String, dynamic>;
      if (policy['ready'] != true || policy['version'] is! String || policy['aiProviders'] is! List) throw StateError('unavailable');
      final version = policy['version'] as String;
      if (await acceptedVersion() == version) return true;
      if (!context.mounted) return false;
      final accepted = await showDialog<bool>(context: context, builder: (context) => AlertDialog(
        title: const Text('대화 전 개인정보 안내'),
        content: SingleChildScrollView(child: Text(
          '입력한 문장과 필요한 최근 대화 맥락을 ONARIA 서버에 보냅니다. 외부 AI를 사용할 때는 ${(policy['aiProviders'] as List).join(', ')}에도 전달될 수 있어요.\n\n'
          '운영 주체: ${policy['operatorName']}\n문의: ${policy['supportEmail']}\n'
          '사용량 기록 보관: ${policy['usageRetention']}\n국외 이전: ${policy['internationalTransfer']}\n\n'
          '이름·전화번호나 타인의 민감한 정보를 대화에 넣지 마세요. 동의하지 않아도 기기에 저장된 기록을 볼 수 있어요. 개인정보 화면에서 동의를 철회할 수 있어요.')),
        actions: [TextButton(onPressed: () => Navigator.pop(context, false), child: const Text('동의하지 않음')),
          FilledButton(onPressed: () => Navigator.pop(context, true), child: const Text('확인하고 동의'))],
      ));
      if (accepted != true) { return false; }
      await SharedPreferencesAsync().setString(storageKey, version);
      return true;
    } catch (_) {
      if (context.mounted) { ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
        content: Text('개인정보 안내를 확인할 수 없어 대화를 보내지 않았어요. 잠시 후 다시 시도해 주세요.'))); }
      return false;
    } finally { if (client == null) connection.close(); }
  }
}
