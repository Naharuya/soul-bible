import 'package:flutter/services.dart';

import '../onaria.dart';

class FlutterVerseAssetLoader implements VerseAssetLoader {
  const FlutterVerseAssetLoader();

  @override
  Future<String> loadString(String path) => rootBundle.loadString(path);
}
