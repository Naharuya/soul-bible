import 'package:flutter/material.dart';

import '../app/app_theme.dart';
import '../app/social_auth_config.dart';

class ProviderSetupPage extends StatelessWidget {
  const ProviderSetupPage({super.key, required this.config});

  final SocialAuthConfig config;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 520),
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  const Icon(Icons.lock_outline_rounded, color: AppTheme.green, size: 42),
                  const SizedBox(height: 20),
                  Text('소셜 로그인 설정이 필요해요', style: Theme.of(context).textTheme.headlineSmall?.copyWith(fontWeight: FontWeight.w800)),
                  const SizedBox(height: 10),
                  const Text('네이버, 카카오, 구글 클라이언트 ID를 등록한 뒤 회원가입을 시작할 수 있어요.', style: TextStyle(color: AppTheme.muted, height: 1.5)),
                  const SizedBox(height: 24),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(18),
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text('등록이 필요한 제공자', style: TextStyle(fontWeight: FontWeight.w800)),
                          const SizedBox(height: 12),
                          ...config.missingProviders.map((provider) => Padding(
                                padding: const EdgeInsets.only(bottom: 8),
                                child: Row(children: [
                                  const Icon(Icons.error_outline, color: AppTheme.coral, size: 20),
                                  const SizedBox(width: 8),
                                  Text(provider),
                                ]),
                              )),
                        ],
                      ),
                    ),
                  ),
                  const SizedBox(height: 16),
                  const Text('설정값은 앱 코드나 저장소에 비밀 키로 커밋하지 마세요.', textAlign: TextAlign.center, style: TextStyle(fontSize: 12, color: AppTheme.subtle)),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}