import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';
import 'package:share_plus/share_plus.dart';

enum CardShareResult { completed, dismissed, unavailable }

abstract interface class CardShareGateway {
  Future<CardShareResult> share(Uint8List png, Rect origin);
  Future<bool> save(Uint8List png);
}

class NativeCardShare implements CardShareGateway {
  // Enable after the HTTPS landing page and association files are deployed.
  static const _appLink = String.fromEnvironment('ONARIA_SHARE_APP_URL');
  static String? get invitationText {
    final uri = Uri.tryParse(_appLink);
    if (uri == null || uri.scheme != 'https' || uri.host != 'api.onaria.ai.kr' ||
        uri.path != '/app/open' || uri.userInfo.isNotEmpty || uri.hasQuery || uri.hasFragment) {
      return null;
    }
    return 'onaria에서 마음에 작은 쉼을 만나보세요.\n앱 열기 · 설치 안내: $uri';
  }
  static bool get supportsSave =>
      !kIsWeb &&
      [TargetPlatform.android, TargetPlatform.iOS]
          .contains(defaultTargetPlatform);
  @override
  Future<CardShareResult> share(Uint8List png, Rect origin) async {
    final result = await SharePlus.instance.share(ShareParams(
        files: [XFile.fromData(png, mimeType: 'image/png')],
        fileNameOverrides: ['onaria-card.png'],
        title: 'onaria 이미지 카드',
        text: invitationText,
        sharePositionOrigin: origin));
    return switch (result.status) {
      ShareResultStatus.success => CardShareResult.completed,
      ShareResultStatus.dismissed => CardShareResult.dismissed,
      ShareResultStatus.unavailable => CardShareResult.unavailable,
    };
  }

  @override
  Future<bool> save(Uint8List png) async =>
      await const MethodChannel('soul_bible/image_export')
          .invokeMethod<bool>('saveImage', png) ??
      false;
}
