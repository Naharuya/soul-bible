class SocialAuthConfig {
  const SocialAuthConfig({
    this.naverClientId = const String.fromEnvironment('NAVER_CLIENT_ID'),
    this.kakaoClientId = const String.fromEnvironment('KAKAO_CLIENT_ID'),
    this.googleClientId = const String.fromEnvironment('GOOGLE_CLIENT_ID'),
    this.developmentOverride = const bool.fromEnvironment('ALLOW_UNCONFIGURED_AUTH'),
  });

  final String naverClientId;
  final String kakaoClientId;
  final String googleClientId;
  final bool developmentOverride;

  bool get isReady =>
      naverClientId.isNotEmpty && kakaoClientId.isNotEmpty && googleClientId.isNotEmpty;

  bool get isDevelopmentOverrideEnabled => developmentOverride;

  List<String> get missingProviders => [
        if (naverClientId.isEmpty) '네이버',
        if (kakaoClientId.isEmpty) '카카오',
        if (googleClientId.isEmpty) '구글',
      ];
}