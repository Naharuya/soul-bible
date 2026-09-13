import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_sky.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_game.dart';

void main() {
  testWidgets(
      'uncollected stars drift with their touch targets and pause safely',
      (tester) async {
    Future<void> show(
            {Set<String> pieces = const {},
            bool paused = false,
            bool reduced = false}) =>
        tester.pumpWidget(MaterialApp(
            home: MediaQuery(
          data: MediaQueryData(disableAnimations: reduced),
          child: Scaffold(
              body: CrossLightSky(
                  pieces: pieces,
                  ready: false,
                  paused: paused,
                  onCollect: (_) {})),
        )));
    Offset position(String word) =>
        tester.getCenter(find.byKey(ValueKey('cross-light-touch-$word')));
    await show();
    final before = {
      for (final word in crossLightWords.keys) word: position(word)
    };
    await tester.pump(const Duration(seconds: 2));
    for (final word in crossLightWords.keys) {
      expect(position(word), isNot(before[word]));
    }
    await show(paused: true);
    final paused = position('hope');
    await tester.pump(const Duration(seconds: 2));
    expect(position('hope'), paused);
    await show(pieces: {'peace'});
    await tester.pump(const Duration(seconds: 1));
    final collected = position('peace');
    await tester.pump(const Duration(seconds: 2));
    expect(position('peace'), collected);
    await show(reduced: true);
    await tester.pumpAndSettle();
    final still = position('hope');
    await tester.pump(const Duration(seconds: 2));
    expect(position('hope'), still);
    expect(tester.binding.transientCallbackCount, 0);
    await tester.pumpWidget(const SizedBox());
  });
  testWidgets('only the next star accepts taps; dragging does not collect',
      (tester) async {
    final pieces = ValueNotifier<Set<String>>({});
    addTearDown(pieces.dispose);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
      body: ValueListenableBuilder<Set<String>>(
        valueListenable: pieces,
        builder: (context, value, _) => CrossLightSky(
          pieces: value,
          ready: true,
          onCollect: (word) => pieces.value = {...value, word},
        ),
      ),
    )));
    Finder star(String word) => find.byKey(ValueKey('cross-light-touch-$word'));
    await tester.tap(star('hope'));
    await tester.pump();
    expect(pieces.value, isEmpty);
    await tester.drag(star('peace'), const Offset(80, 40));
    await tester.pump();
    expect(pieces.value, isEmpty);
    for (final word in crossLightWords.keys) {
      await tester.tap(star(word));
      await tester.pump();
      await tester.pump(const Duration(seconds: 1));
      expect(pieces.value.last, word);
    }
    expect(pieces.value, crossLightWords.keys.toSet());
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('only the active star pulses; pause and reduced motion stop it',
      (tester) async {
    Future<void> show(Set<String> pieces,
            {bool reduced = false, bool paused = false, bool ready = true}) =>
        tester.pumpWidget(MaterialApp(
            home: MediaQuery(
          data: MediaQueryData(disableAnimations: reduced),
          child: Scaffold(
              body: CrossLightSky(
            pieces: pieces,
            ready: ready,
            paused: paused,
            onCollect: (_) {},
          )),
        )));
    double scale(String word) => tester
        .widget<Transform>(find
            .descendant(
              of: find.byKey(ValueKey('cross-light-touch-$word')),
              matching: find.byType(Transform),
            )
            .first)
        .transform
        .storage[0];
    await show({});
    await tester.pump(const Duration(milliseconds: 400));
    expect(scale('peace'), greaterThan(1));
    for (final word in crossLightWords.keys.skip(1)) {
      expect(scale(word), 1);
    }
    await show({'peace'});
    await tester.pump(const Duration(seconds: 1));
    expect(scale('peace'), 1);
    expect(scale('hope'), greaterThan(1));
    for (final options in [0, 1, 2]) {
      await show({'peace'},
          reduced: options == 0, paused: options == 1, ready: options != 2);
      if (options == 2) {
        // Stars still drift between collection windows, but do not pulse.
        await tester.pump(const Duration(seconds: 1));
      } else {
        await tester.pumpAndSettle();
        expect(tester.binding.transientCallbackCount, 0);
      }
      expect(scale('hope'), 1);
    }
    await show(crossLightWords.keys.toSet());
    await tester.pumpAndSettle();
    expect(
        tester
            .widget<AnimatedOpacity>(
                find.byKey(const ValueKey('cross-quiet-glow')))
            .opacity,
        1);
    expect(tester.binding.transientCallbackCount, 0);
  });
  testWidgets(
      'touching a scattered star moves it into the cross and disables repeated collection',
      (tester) async {
    final pieces = ValueNotifier<Set<String>>({});
    addTearDown(pieces.dispose);
    var taps = 0;
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: Center(
                child: SizedBox(
      width: 280,
      child: ValueListenableBuilder<Set<String>>(
          valueListenable: pieces,
          builder: (context, value, _) => CrossLightSky(
              pieces: value,
              ready: true,
              onCollect: (word) {
                taps++;
                pieces.value = {...value, word};
              })),
    )))));
    final star = find.byKey(const ValueKey('cross-light-touch-peace'));
    final before = tester.getCenter(star);
    expect(tester.getSize(star), const Size(48, 48));
    expect(find.bySemanticsLabel('평안의 빛'), findsOneWidget);
    await tester.tap(star);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(tester.getCenter(star).dx, greaterThan(before.dx));
    expect(pieces.value, {'peace'});
    await tester.tap(star);
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(taps, 1);
    expect(tester.takeException(), isNull);
  });
}
