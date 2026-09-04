import 'package:flutter/material.dart';
import 'package:flutter_svg/flutter_svg.dart';
import '../app/app_theme.dart';
import '../bible_mind_core.dart';
import '../app/mind_card_store.dart';
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
  final _dailyUsageStore = DailyUsageStore();
  int _dailyUsageCount = 0;
  bool _loadingUsage = true;
  bool _startingConversation = false;

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
    final usageLimitReached = _dailyUsageCount >= DailyUsageStore.maxUsesPerDay;
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
                  PopupMenuButton<String>(
                    icon: const Icon(Icons.menu, color: AppTheme.green, size: 24),
                    tooltip: '메뉴',
                    onSelected: (value) {
                      if (value == 'saved_cards') {
                        Navigator.of(context).push(MaterialPageRoute(builder: (_) => const SavedCardsPage()));
                      }
                    },
                    itemBuilder: (_) => const [
                      PopupMenuItem<String>(
                        value: 'saved_cards',
                        child: Row(children: [
                          Icon(Icons.bookmarks_outlined),
                          SizedBox(width: 12),
                          Text('저장된 카드'),
                        ]),
                      ),
                    ],
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
                  onPressed: _emotion == null || _loadingUsage || usageLimitReached || _startingConversation
                      ? null
                      : _startConversation,
                  child: Text(usageLimitReached ? '오늘 사용 횟수를 모두 사용했어요' : '마음 이야기 시작하기'),
                ),
                const SizedBox(height: 12),
                Text(
                  DailyUsageStore.isComputerTestMode
                      ? '컴퓨터 테스트 모드 · 사용 횟수 제한 없음'
                      : '오늘 ${DailyUsageStore.maxUsesPerDay}회 중 $_dailyUsageCount회 사용했어요.',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: Color(0xFF7B817E)),
                ),
                const SizedBox(height: 4),
                const Text('긴급한 위험이 있다면 112, 119 또는 109에 연락해 주세요.', textAlign: TextAlign.center, style: TextStyle(fontSize: 10, color: Color(0xFF7B817E))),
              ],
            ),
          ),
        ),
      ),
    );
  }

  @override
  void initState() {
    super.initState();
    _loadDailyUsage();
  }

  Future<void> _loadDailyUsage() async {
    final count = await _dailyUsageStore.getCount();
    if (!mounted) return;
    setState(() {
      _dailyUsageCount = count;
      _loadingUsage = false;
    });
  }

  Future<void> _startConversation() async {
    setState(() => _startingConversation = true);
    final consumed = await _dailyUsageStore.tryConsume();
    if (!mounted) return;
    if (!consumed) {
      setState(() {
        _dailyUsageCount = DailyUsageStore.maxUsesPerDay;
        _startingConversation = false;
      });
      return;
    }

    setState(() {
      _dailyUsageCount++;
      _startingConversation = false;
    });
    await Navigator.of(context).push(MaterialPageRoute(
      builder: (_) => ConversationPage(
        emotion: _emotion!,
        intensity: _intensity.round(),
      ),
    ));
    if (mounted) {
      setState(() {
        _emotion = null;
        _intensity = 5;
      });
    }
  }
}
