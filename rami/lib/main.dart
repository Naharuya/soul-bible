import 'dart:async';

import 'package:app_links/app_links.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';

import 'core/rami_theme.dart';
import 'models/rami_card.dart';
import 'screens/content_screen.dart';
import 'screens/home_screen.dart';
import 'services/rami_repository.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Create AppLinks before runApp so a cold-start NFC/deep link is not missed.
  final appLinks = AppLinks();
  await RamiRepository.instance.initialize();

  bool firebaseReady = false;
  try {
    await Firebase.initializeApp();
    firebaseReady = true;
  } catch (_) {
    // RAMI still runs fully in local/demo mode before Firebase native config.
  }

  runApp(RamiApp(firebaseReady: firebaseReady, appLinks: appLinks));
}

class RamiApp extends StatefulWidget {
  const RamiApp({
    super.key,
    required this.firebaseReady,
    required this.appLinks,
  });

  final bool firebaseReady;
  final AppLinks appLinks;

  @override
  State<RamiApp> createState() => _RamiAppState();
}

class _RamiAppState extends State<RamiApp> {
  final GlobalKey<NavigatorState> _navigatorKey = GlobalKey<NavigatorState>();
  StreamSubscription<Uri>? _linkSubscription;
  Uri? _pendingUri;
  bool _navigationScheduled = false;

  @override
  void initState() {
    super.initState();
    _initializeLinkHandling();
  }

  Future<void> _initializeLinkHandling() async {
    _linkSubscription = widget.appLinks.uriLinkStream.listen(
      _receiveUri,
      onError: (_) {},
    );

    try {
      final initialUri = await widget.appLinks.getInitialLink();
      if (initialUri != null) _receiveUri(initialUri);
    } catch (_) {
      // An unavailable initial-link channel must not prevent the app from launching.
    }
  }

  void _receiveUri(Uri uri) {
    _pendingUri = uri;
    _schedulePendingNavigation();
  }

  void _schedulePendingNavigation() {
    if (_navigationScheduled || _pendingUri == null) return;
    _navigationScheduled = true;
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _navigationScheduled = false;
      final uri = _pendingUri;
      if (uri == null) return;
      final navigator = _navigatorKey.currentState;
      if (navigator == null) {
        _schedulePendingNavigation();
        return;
      }

      _pendingUri = null;
      final card = RamiCard.fromNdefValue(uri.toString());
      if (card == null) return;

      navigator.pushAndRemoveUntil(
        MaterialPageRoute(builder: (_) => ContentScreen(card: card)),
        (route) => false,
      );
    });
  }

  @override
  void dispose() {
    _linkSubscription?.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      navigatorKey: _navigatorKey,
      debugShowCheckedModeBanner: false,
      title: '라미',
      theme: RamiTheme.light,
      home: HomeScreen(firebaseReady: widget.firebaseReady),
    );
  }
}
