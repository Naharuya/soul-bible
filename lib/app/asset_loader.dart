import 'package:flutter/services.dart';

import '../bible_mind_core.dart';

class FlutterVerseAssetLoader implements VerseAssetLoader {
  const FlutterVerseAssetLoader();

  @override
  Future<String> loadString(String path) => rootBundle.loadString(path);
}
