import 'package:flutter/services.dart';
import 'package:flutter/foundation.dart';
import 'dart:convert';
import 'package:crypto/crypto.dart';

import '../onaria.dart';

class FlutterVerseAssetLoader implements VerseAssetLoader {
  const FlutterVerseAssetLoader({this.requireApproved = kReleaseMode});
  final bool requireApproved;

  @override
  Future<String> loadString(String path) async {
    final raw = await rootBundle.loadString(path);
    if (!requireApproved || path != 'assets/data/bible_verses_ko.json') return raw;
    return approvedVerseAsset(raw);
  }

  static String approvedVerseAsset(String raw) {
    final data = jsonDecode(raw) as Map<String, dynamic>;
    data['verses'] = (data['verses'] as List).where((verse) {
      final approval = (verse as Map)['approval'];
      return approval is Map && approval['status'] == 'approved' &&
        approval['reviewer'] is String && (approval['reviewer'] as String).trim().isNotEmpty &&
        approval['reviewedAt'] is String && DateTime.tryParse(approval['reviewedAt'] as String) != null &&
        approval['licenseEvidence'] is String && (approval['licenseEvidence'] as String).trim().isNotEmpty &&
        approval['contentSha256'] == sha256.convert(utf8.encode(jsonEncode([
          verse['reference'], verse['translation'], verse['text'], verse['englishText']
        ]))).toString();
    }).toList();
    return jsonEncode(data);
  }
}
