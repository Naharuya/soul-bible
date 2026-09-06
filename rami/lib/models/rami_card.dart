class RamiCard {
  const RamiCard({
    required this.id,
    required this.title,
    required this.emoji,
    required this.intro,
    required this.recordPrompt,
    required this.realSoundLabel,
  });

  final String id;
  final String title;
  final String emoji;
  final String intro;
  final String recordPrompt;
  final String realSoundLabel;

  static const elephant = RamiCard(
    id: 'RAMI:ELEPHANT:001',
    title: '코끼리',
    emoji: '🐘',
    intro: '코끼리다! 뿌우우!',
    recordPrompt: '코끼리처럼 소리 내볼까?',
    realSoundLabel: '코끼리 소리 듣기',
  );

  static const dog = RamiCard(
    id: 'RAMI:DOG:001',
    title: '강아지',
    emoji: '🐶',
    intro: '강아지다! 멍멍!',
    recordPrompt: '강아지처럼 멍멍 해볼까?',
    realSoundLabel: '강아지 소리 듣기',
  );

  static const car = RamiCard(
    id: 'RAMI:CAR:001',
    title: '자동차',
    emoji: '🚗',
    intro: '자동차다! 부릉부릉!',
    recordPrompt: '자동차처럼 부릉부릉 해볼까?',
    realSoundLabel: '자동차 소리 듣기',
  );

  static const all = <RamiCard>[elephant, dog, car];

  static RamiCard? fromNdefValue(String raw) {
    final value = raw.trim();
    for (final card in all) {
      if (value.toUpperCase() == card.id) return card;
    }

    // v0.4 accepts both a RAMI custom scheme for the quickest Android MVP
    // and the future HTTPS App Link form.
    //   rami://t/E001
    //   https://rami.app/t/E001
    final uri = Uri.tryParse(value);
    if (uri != null) {
      final isHttpsRami = uri.scheme.toLowerCase() == 'https' &&
          uri.host.toLowerCase() == 'rami.app';
      final isCustomRami = uri.scheme.toLowerCase() == 'rami';
      if (isHttpsRami || isCustomRami) {
        final code = uri.pathSegments.isEmpty
            ? ''
            : uri.pathSegments.last.toUpperCase();
        switch (code) {
          case 'E001':
            return elephant;
          case 'D001':
            return dog;
          case 'C001':
            return car;
        }
      }
    }
    return null;
  }
}
