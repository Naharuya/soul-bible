import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../app/app_theme.dart';
import '../bible_mind_core.dart';
import 'conversation_page.dart';
import 'saved_cards_page.dart';

class CheckInPage extends StatefulWidget {
  const CheckInPage({super.key});

  @override
  State<CheckInPage> createState() => _CheckInPageState();
}

class _CheckInPageState extends State<CheckInPage> {
  EmotionType? _emotion;
  double _intensity = 5;

  static const _icons = <EmotionType, String>{
    EmotionType.anxiety: '🌊',
    EmotionType.loneliness: '🌙',
    EmotionType.exhaustion: '🍂',
    EmotionType.anger: '🔥',
    EmotionType.sadness: '🌧️',
    EmotionType.complexity: '🫧',
    EmotionType.gratitude: '🌿',
    EmotionType.joy: '☀️',
    EmotionType.fear: '🌑',
    EmotionType.disgust: '🌵',
    EmotionType.surprise: '⚡',
    EmotionType.happiness: '🌈',
    EmotionType.anticipation: '🎈',
    EmotionType.admiration: '🎆',
    EmotionType.overwhelmed: '🌋',
    EmotionType.jealousy: '🍏',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 20),
              children: [
                Row(children: [
                  ClipRRect(
                    borderRadius: BorderRadius.circular(8),
                    child: SvgPicture.asset(
                      'assets/images/logo.svg',
                      width: 32,
                      height: 32,
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Text('소울바이블', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
                  const Spacer(),
                  IconButton(
                    onPressed: () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SavedCardsPage())),
                    icon: const Icon(Icons.bookmarks_outlined, color: AppTheme.green, size: 22),
                    tooltip: '저장된 카드',
                    constraints: const BoxConstraints(),
                    padding: EdgeInsets.zero,
                  ),
                ]),
                const SizedBox(height: 20),
                Text('오늘 마음은\n어떤가요?', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontWeight: FontWeight.w800, height: 1.1)),
                const SizedBox(height: 8),
                const Text('판단하지 않고, 천천히 들어드릴게요.', style: TextStyle(fontSize: 14, color: Color(0xFF68756F))),
                const SizedBox(height: 20),
                GridView.count(
                  crossAxisCount: 4,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 8,
                  crossAxisSpacing: 8,
                  childAspectRatio: 1.0,
                  children: EmotionType.values.map((emotion) {
                    final selected = emotion == _emotion;
                    return InkWell(
                      onTap: () => setState(() => _emotion = emotion),
                      borderRadius: BorderRadius.circular(16),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        decoration: BoxDecoration(
                          color: selected ? AppTheme.sage : Colors.white,
                          borderRadius: BorderRadius.circular(16),
                          border: Border.all(color: selected ? AppTheme.green : const Color(0xFFE8E4DC), width: selected ? 1.5 : 1),
                        ),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text(_icons[emotion]!, style: const TextStyle(fontSize: 22)),
                          const SizedBox(height: 4),
                          Text(emotion.label, style: TextStyle(fontSize: 13, fontWeight: selected ? FontWeight.w800 : FontWeight.w600)),
                        ]),
                      ),
                    );
                  }).toList(),
                ),
                if (_emotion != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    decoration: BoxDecoration(
                      color: const Color(0xFFF8F9F8),
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        const Text('마음의 강도', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                        Text('${_intensity.round()} / 10', style: const TextStyle(color: AppTheme.green, fontWeight: FontWeight.w800)),
                      ]),
                      Slider(value: _intensity, min: 1, max: 10, divisions: 9, onChanged: (value) => setState(() => _intensity = value)),
                    ]),
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                  onPressed: _emotion == null
                      ? null
                      : () => Navigator.of(context)
                          .push(MaterialPageRoute(
                              builder: (_) => ConversationPage(
                                  emotion: _emotion!,
                                  intensity: _intensity.round())))
                          .then((_) {
                          if (mounted) {
                            setState(() {
                              _emotion = null;
                              _intensity = 5;
                            });
                          }
                        }),
                  child: const Text('마음 이야기 시작하기'),
                ),
                const SizedBox(height: 12),
                const Text('긴급한 위험이 있다면 112, 119 또는 109에 연락해 주세요.', textAlign: TextAlign.center, style: TextStyle(fontSize: 10, color: Color(0xFF7B817E))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
