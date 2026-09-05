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
  final _scrollController = ScrollController();

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
    final usageLimitReached = !_dailyUsageStore.isPremium &&
        _dailyUsageCount >= _dailyUsageStore.maxUsesPerDay;
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 620),
            child: ListView(
              controller: _scrollController,
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
                  const Text('소울바이블', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: 0.4)),
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
                const SizedBox(height: 32),
                Container(
                  padding: const EdgeInsets.fromLTRB(22, 22, 22, 24),
                  decoration: BoxDecoration(
                    color: AppTheme.ink,
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: const [BoxShadow(color: Color(0x18202E3D), blurRadius: 18, offset: Offset(0, 8))],
                  ),
                  child: const Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('오늘의 묵상', style: TextStyle(color: Color(0xFFD8B873), fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.2)),
                    SizedBox(height: 12),
                    Text('오늘 마음은\n어떤가요?', style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w700, height: 1.15)),
                    SizedBox(height: 12),
                    Text('판단하지 않고, 천천히 마음을 살펴보는 시간입니다.', style: TextStyle(color: Color(0xFFD8DFDB), fontSize: 14, height: 1.5)),
                  ]),
                ),
                const SizedBox(height: 24),
                const Row(children: [
                  Expanded(child: Divider(color: AppTheme.gold)),
                  Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Icon(Icons.auto_awesome, size: 14, color: AppTheme.gold)),
                  Expanded(child: Divider(color: AppTheme.gold)),
                ]),
                const SizedBox(height: 18),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  const Text('지금 가장 가까운 마음을 골라주세요', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.ink)),
                  if (_emotion != null) const Text('선택됨', style: TextStyle(fontSize: 12, color: AppTheme.green, fontWeight: FontWeight.w700)),
                ]),
                const SizedBox(height: 12),
                LayoutBuilder(
                  builder: (context, constraints) {
                    final columns = constraints.maxWidth < 390 ? 3 : 4;
                    return GridView.count(
                      crossAxisCount: columns,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      mainAxisSpacing: 10,
                      crossAxisSpacing: 10,
                      childAspectRatio: columns == 3 ? 1.12 : 1.0,
                      children: EmotionType.values.map((emotion) {
                        final selected = emotion == _emotion;
                        return Semantics(
                          button: true,
                          selected: selected,
                          label: '${emotion.label}${selected ? ' 선택됨' : ''}',
                          child: InkWell(
                            onTap: () => _selectEmotion(emotion),
                            borderRadius: BorderRadius.circular(16),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              decoration: BoxDecoration(
                                color: selected ? AppTheme.sage : AppTheme.panel,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: selected ? AppTheme.gold : AppTheme.border, width: selected ? 1.5 : 1),
                              ),
                              child: Stack(children: [
                                Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                                  Text(_icons[emotion]!, style: const TextStyle(fontSize: 20)),
                                  const SizedBox(height: 5),
                                  Text(emotion.label, style: TextStyle(fontSize: 13, color: selected ? AppTheme.ink : AppTheme.muted, fontWeight: selected ? FontWeight.w800 : FontWeight.w600)),
                                ])),
                                if (selected) const Positioned(top: 7, right: 7, child: Icon(Icons.check_circle, size: 17, color: AppTheme.green)),
                              ]),
                            ),
                          ),
                        );
                      }).toList(),
                    );
                  },
                ),
                if (_emotion != null) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    decoration: BoxDecoration(
                      color: AppTheme.panel,
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
                    child: Text(usageLimitReached ? '오늘 무료 사용 횟수를 모두 사용했어요' : '다음 이야기 선택하기'),
                ),
                const SizedBox(height: 12),
                Text(
                    _dailyUsageStore.isPremium
                      ? '프리미엄 회원 · 사용 횟수 제한 없음'
                      : '무료 회원 · 오늘 ${_dailyUsageStore.maxUsesPerDay}회 중 $_dailyUsageCount회 사용',
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontSize: 11, color: AppTheme.subtle),
                ),
                const SizedBox(height: 4),
                const Text('긴급한 위험이 있다면 112, 119 또는 109에 연락해 주세요.', textAlign: TextAlign.center, style: TextStyle(fontSize: 10, color: AppTheme.subtle)),
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

  @override
  void dispose() {
    _scrollController.dispose();
    super.dispose();
  }

  void _selectEmotion(EmotionType emotion) {
    setState(() => _emotion = emotion);
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (!mounted || !_scrollController.hasClients) return;
      _scrollController.animateTo(
        _scrollController.position.maxScrollExtent,
        duration: const Duration(milliseconds: 420),
        curve: Curves.easeOutCubic,
      );
    });
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
      setState(() => _startingConversation = false);
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
