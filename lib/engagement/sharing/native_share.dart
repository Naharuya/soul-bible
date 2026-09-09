import 'dart:typed_data';
import 'package:flutter/services.dart';
import 'package:flutter/material.dart';
import 'package:share_plus/share_plus.dart';

enum CardShareResult { completed, dismissed, unavailable }
abstract interface class CardShareGateway {
  Future<CardShareResult> share(Uint8List png, Rect origin);
  Future<bool> save(Uint8List png);
}
class NativeCardShare implements CardShareGateway {
  @override
  Future<CardShareResult> share(Uint8List png, Rect origin) async {
    final result = await SharePlus.instance.share(ShareParams(
      files: [XFile.fromData(png, mimeType: 'image/png')], fileNameOverrides: ['onaria-card.png'],
      title: 'onaria 이미지 카드', sharePositionOrigin: origin));
    return switch (result.status) {
      ShareResultStatus.success => CardShareResult.completed,
      ShareResultStatus.dismissed => CardShareResult.dismissed,
      ShareResultStatus.unavailable => CardShareResult.unavailable,
    };
  }
  @override
  Future<bool> save(Uint8List png) async => await const MethodChannel('soul_bible/image_export').invokeMethod<bool>('saveImage', png) ?? false;
}
