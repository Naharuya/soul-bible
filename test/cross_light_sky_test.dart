import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_sky.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_game.dart';

void main() {
  testWidgets(
      'drag collects only inside the center and leaves page scrolling in place',
      (tester) async {
    final pieces = ValueNotifier<Set<String>>({});
    final scroll = ScrollController();
    addTearDown(pieces.dispose);
    addTearDown(scroll.dispose);
    await tester.pumpWidget(MaterialApp(
        home: Scaffold(
            body: ListView(
      controller: scroll,
      children: [
        ValueListenableBuilder<Set<String>>(
          valueListenable: pieces,
          builder: (context, value, child) => CrossLightSky(
              pieces: value,
              ready: true,
              onCollect: (word) => pieces.value = {...value, word}),
        ),
        const SizedBox(height: 900)
      ],
    ))));
    final star = find.byKey(const ValueKey('cross-light-touch-peace'));
    final target =
        tester.getCenter(find.byKey(const ValueKey('cross-gathering-area')));
    await tester.drag(star, const Offset(0, 30));
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(pieces.value, isEmpty);
    expect(scroll.offset, 0);
    final gesture = await tester.startGesture(tester.getCenter(star));
    await gesture.moveBy(const Offset(20, 20));
    await tester.pump();
    await gesture.moveTo(target);
    await tester.pump();
    await tester.pump(const Duration(milliseconds: 16));
    expect((tester.getCenter(star) - target).distance, lessThan(1));
    await gesture.up();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(pieces.value, {'peace'});
    expect(scroll.offset, 0);
    final hope = find.byKey(const ValueKey('cross-light-touch-hope'));
    final cancelled = await tester.startGesture(tester.getCenter(hope));
    await cancelled.moveTo(target);
    await tester.pump();
    await cancelled.cancel();
    await tester.pump();
    expect(pieces.value, {'peace'});
    await tester.pumpWidget(const SizedBox());
    expect(tester.takeException(), isNull);
  });

  testWidgets('stars keep drifting until collected and respect reduced motion',
      (tester) async {
    Future<void> show(Set<String> pieces, {bool reduced = false}) =>
        tester.pumpWidget(MaterialApp(
            home: MediaQuery(
                data: MediaQueryData(disableAnimations: reduced),
                child: Scaffold(
                    body: CrossLightSky(
                        pieces: pieces, ready: true, onCollect: (_) {})))));
    Offset displacement() {
      final transform = tester.widget<Transform>(find
          .ancestor(
              of: find.byKey(const ValueKey('cross-light-touch-peace')),
              matching: find.byType(Transform))
          .first);
      return Offset(
          transform.transform.storage[12], transform.transform.storage[13]);
    }

    await show({});
    final initial = displacement();
    await tester.pump(const Duration(milliseconds: 800));
    expect(displacement(), isNot(initial));
    await tester.pump(const Duration(milliseconds: 2200));
    expect((displacement() - initial).distance, greaterThan(25));
    expect(
        tester.getSize(find.byKey(const ValueKey('cross-light-touch-peace'))),
        const Size(48, 48));
    await tester.pump(const Duration(seconds: 7));
    final later = displacement();
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(displacement(), isNot(later));
    await show(crossLightWords.keys.toSet());
    await tester.pump();
    await tester.pump(const Duration(seconds: 1));
    expect(displacement(), Offset.zero);
    expect(
        tester
            .widget<AnimatedOpacity>(
                find.byKey(const ValueKey('cross-quiet-glow')))
            .opacity,
        1);
    await tester.pump(const Duration(seconds: 3));
    expect(displacement(), Offset.zero);
    await show({}, reduced: true);
    await tester.pump();
    expect(displacement(), Offset.zero);
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
