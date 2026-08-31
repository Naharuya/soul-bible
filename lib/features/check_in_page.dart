import 'package:flutter/material.dart';

import '../app/app_theme.dart';
import '../bible_mind_core.dart';
import 'conversation_page.dart';

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
    EmotionType.other: '💭',
  };

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: ListView(
              padding: const EdgeInsets.fromLTRB(24, 28, 24, 32),
              children: [
                Row(children: [
                  Container(
                    width: 42,
                    height: 42,
                    decoration: const BoxDecoration(color: AppTheme.sage, shape: BoxShape.circle),
                    child: const Icon(Icons.auto_awesome_outlined, color: AppTheme.green),
                  ),
                  const SizedBox(width: 12),
                  const Text('소울바이블', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800)),
                ]),
                const SizedBox(height: 52),
                Text('오늘 마음은\n어떤가요?', style: Theme.of(context).textTheme.displaySmall?.copyWith(fontWeight: FontWeight.w800, height: 1.2)),
                const SizedBox(height: 12),
                const Text('판단하지 않고, 천천히 들어드릴게요.', style: TextStyle(fontSize: 16, color: Color(0xFF68756F))),
                const SizedBox(height: 32),
                GridView.count(
                  crossAxisCount: 4,
                  shrinkWrap: true,
                  physics: const NeverScrollableScrollPhysics(),
                  mainAxisSpacing: 10,
                  crossAxisSpacing: 10,
                  childAspectRatio: .9,
                  children: EmotionType.values.map((emotion) {
                    final selected = emotion == _emotion;
                    return InkWell(
                      onTap: () => setState(() => _emotion = emotion),
                      borderRadius: BorderRadius.circular(20),
                      child: AnimatedContainer(
                        duration: const Duration(milliseconds: 180),
                        decoration: BoxDecoration(
                          color: selected ? AppTheme.sage : Colors.white,
                          borderRadius: BorderRadius.circular(20),
                          border: Border.all(color: selected ? AppTheme.green : const Color(0xFFE8E4DC), width: selected ? 1.5 : 1),
                        ),
                        child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                          Text(_icons[emotion]!, style: const TextStyle(fontSize: 27)),
                          const SizedBox(height: 7),
                          Text(emotion.label, style: TextStyle(fontWeight: selected ? FontWeight.w800 : FontWeight.w600)),
                        ]),
                      ),
                    );
                  }).toList(),
                ),
                if (_emotion != null) ...[
                  const SizedBox(height: 30),
                  Card(
                    child: Padding(
                      padding: const EdgeInsets.all(22),
                      child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                        Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                          const Text('마음의 강도', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w700)),
                          Text('${_intensity.round()} / 10', style: const TextStyle(color: AppTheme.green, fontWeight: FontWeight.w800)),
                        ]),
                        Slider(value: _intensity, min: 1, max: 10, divisions: 9, onChanged: (value) => setState(() => _intensity = value)),
                        const Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [Text('잔잔해요', style: TextStyle(fontSize: 12)), Text('매우 커요', style: TextStyle(fontSize: 12))]),
                      ]),
                    ),
                  ),
                ],
                const SizedBox(height: 24),
                FilledButton(
                  onPressed: _emotion == null ? null : () => Navigator.of(context).push(MaterialPageRoute(builder: (_) => ConversationPage(emotion: _emotion!, intensity: _intensity.round()))),
                  child: const Text('마음 이야기 시작하기'),
                ),
                const SizedBox(height: 16),
                const Text('소울바이블은 의료·심리치료 서비스가 아닙니다. 긴급한 위험이 있다면 112, 119 또는 자살예방상담전화 109에 연락해 주세요.', textAlign: TextAlign.center, style: TextStyle(fontSize: 11, height: 1.5, color: Color(0xFF7B817E))),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
