import 'package:flutter_test/flutter_test.dart';
import 'package:onaria/engagement/mini_games/cross_light/cross_light_game.dart';

void main() {
  test('six distinct words light the cross after five seconds each', () {
    var now = DateTime(2026, 9, 11);
    final game = CrossLightGame(clock: () => now);
    expect(game.collect('peace'), isFalse);
    game.start();
    expect(game.remainingSeconds, 5);
    for (final word in crossLightWords.keys) {
      expect(game.collect(word), isFalse);
      now = now.add(const Duration(seconds: 5));
      expect(game.collect('unknown'), isFalse);
      expect(game.collect(word), isTrue);
      expect(game.collect(word), isFalse);
    }
    expect(game.complete, isTrue);
    expect(game.progress, 1);
    expect(game.remainingSeconds, 0);
    expect(game.ready, isFalse);
  });

  test(
      'pause freezes remaining time, resume keeps collected pieces, restart clears them',
      () {
    var now = DateTime(2026, 9, 11);
    final game = CrossLightGame(clock: () => now)..start();
    now = now.add(const Duration(seconds: 5));
    game.collect('peace');
    now = now.add(const Duration(seconds: 2));
    game.pause();
    now = now.add(const Duration(minutes: 10));
    expect(game.remainingSeconds, 3);
    expect(game.collect('hope'), isFalse);
    game.resume();
    expect(game.remainingSeconds, 3);
    expect(game.pieces, contains('peace'));
    now = now.add(const Duration(seconds: 3));
    expect(game.collect('hope'), isTrue);
    game.restart();
    expect(game.pieces, isEmpty);
    expect(game.remainingSeconds, 5);
    expect(game.started, isTrue);
  });
}
