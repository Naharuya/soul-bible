import 'package:flutter/material.dart';
import '../app/app_theme.dart';
import '../app/space_scaffold.dart';
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
  bool _otherEmotion = false;
  final _customEmotion = TextEditingController();
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
    return SpaceScaffold(
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
                    child: Container(
                      width: 32, height: 32,
                      color: AppTheme.of(context).sage,
                      child: Icon(Icons.auto_awesome, size: 23, color: AppTheme.of(context).green),
                    ),
                  ),
                  const SizedBox(width: 10),
                  const Text('소울바이블', style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800, letterSpacing: 0.4)),
                  const Spacer(),
                  PopupMenuButton<String>(
                    icon: Icon(Icons.menu, color: AppTheme.of(context).green, size: 24),
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
                    gradient: LinearGradient(begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [AppTheme.of(context).sage, AppTheme.of(context).panel]), border: Border.all(color: AppTheme.of(context).border),
                    borderRadius: BorderRadius.circular(18),
                    boxShadow: [BoxShadow(color: AppTheme.of(context).green.withValues(alpha: 0.12), blurRadius: 18, offset: Offset(0, 8))],
                  ),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                    Text('오늘의 묵상', style: TextStyle(color: AppTheme.of(context).gold, fontSize: 12, fontWeight: FontWeight.w700, letterSpacing: 1.2)),
                    SizedBox(height: 12),
                    Text('오늘 마음은\n어떤가요?', style: TextStyle(color: Colors.white, fontSize: 30, fontWeight: FontWeight.w700, height: 1.15)),
                    SizedBox(height: 12),
                    Text('판단하지 않고, 천천히 마음을 살펴보는 시간입니다.', style: TextStyle(color: AppTheme.of(context).muted, fontSize: 14, height: 1.5)),
                  ]),
                ),
                const SizedBox(height: 24),
                Row(children: [
                  Expanded(child: Divider(color: AppTheme.of(context).gold)),
                  Padding(padding: EdgeInsets.symmetric(horizontal: 12), child: Icon(Icons.auto_awesome, size: 14, color: AppTheme.of(context).gold)),
                  Expanded(child: Divider(color: AppTheme.of(context).gold)),
                ]),
                const SizedBox(height: 18),
                Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                  Text('지금 가장 가까운 마음을 골라주세요', style: TextStyle(fontSize: 15, fontWeight: FontWeight.w700, color: AppTheme.of(context).ink)),
                  if (_emotion != null || _otherEmotion) Text('선택됨', style: TextStyle(fontSize: 12, color: AppTheme.of(context).green, fontWeight: FontWeight.w700)),
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
                      children: <EmotionType?>[...EmotionType.values, null].map((emotion) {
                        final selected = emotion == null ? _otherEmotion : !_otherEmotion && emotion == _emotion;
                        return Semantics(
                          button: true,
                          selected: selected,
                          label: '${emotion?.label ?? '기타'}${selected ? ' 선택됨' : ''}',
                          child: InkWell(
                            onTap: () => _selectEmotion(emotion),
                            borderRadius: BorderRadius.circular(16),
                            child: AnimatedContainer(
                              duration: const Duration(milliseconds: 180),
                              decoration: BoxDecoration(
                                color: selected ? AppTheme.of(context).sage : AppTheme.of(context).panel,
                                borderRadius: BorderRadius.circular(16),
                                border: Border.all(color: selected ? AppTheme.of(context).gold : AppTheme.of(context).border, width: selected ? 1.5 : 1),
                              ),
                              child: Stack(children: [
                                Center(child: Column(mainAxisAlignment: MainAxisAlignment.center, children: [
                                  Text(emotion == null ? '✏️' : _icons[emotion]!, style: const TextStyle(fontSize: 20)),
                                  const SizedBox(height: 5),
                                  Text(emotion?.label ?? '기타', style: TextStyle(fontSize: 13, color: selected ? AppTheme.of(context).ink : AppTheme.of(context).muted, fontWeight: selected ? FontWeight.w800 : FontWeight.w600)),
                                ])),
                                if (selected) Positioned(top: 7, right: 7, child: Icon(Icons.check_circle, size: 17, color: AppTheme.of(context).green)),
                              ]),
                            ),
                          ),
                        );
                      }).toList(),
                    );
                  },
                ),
                if (_otherEmotion) ...[
                  const SizedBox(height: 16),
                  TextField(
                    key: const ValueKey('custom-emotion'),
                    controller: _customEmotion,
                    maxLength: 100,
                    minLines: 2,
                    maxLines: 4,
                    textCapitalization: TextCapitalization.sentences,
                    decoration: const InputDecoration(
                      labelText: '내 마음 직접 적기',
                      hintText: '예: 설레지만 조금 걱정돼요',
                      helperText: '지금 느끼는 감정을 자유롭게 적어 주세요.',
                      helperMaxLines: 3,
                      alignLabelWithHint: true,
                    ),
                    onChanged: (_) => setState(() {}),
                  ),
                ],
                if (_emotion != null || _otherEmotion) ...[
                  const SizedBox(height: 16),
                  Container(
                    padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
                    decoration: BoxDecoration(
                      color: AppTheme.of(context).panel,
                      borderRadius: BorderRadius.circular(16),
                    ),
                    child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
                      Row(mainAxisAlignment: MainAxisAlignment.spaceBetween, children: [
                        const Text('마음의 강도', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w700)),
                        Text('${_intensity.round()} / 10', style: TextStyle(color: AppTheme.of(context).green, fontWeight: FontWeight.w800)),
                      ]),
                      Slider(value: _intensity, min: 1, max: 10, divisions: 9, onChanged: (value) => setState(() => _intensity = value)),
                    ]),
                  ),
                ],
                const SizedBox(height: 16),
                FilledButton(
                  style: FilledButton.styleFrom(minimumSize: const Size.fromHeight(52)),
                    onPressed: (_otherEmotion ? _customEmotion.text.trim().isEmpty : _emotion == null) || _loadingUsage || _startingConversation
                      ? null
                      : _startConversation,
                    child: const Text('다음 이야기 선택하기'),
                ),
                const SizedBox(height: 12),
                Text(
                    '사용 횟수 제한 없음 · 오늘 $_dailyUsageCount회 사용',
                  textAlign: TextAlign.center,
                  style: TextStyle(fontSize: 11, color: AppTheme.of(context).subtle),
                ),
                const SizedBox(height: 4),
                Text('긴급한 위험이 있다면 112, 119 또는 109에 연락해 주세요.', textAlign: TextAlign.center, style: TextStyle(fontSize: 10, color: AppTheme.of(context).subtle)),
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
    _customEmotion.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  void _selectEmotion(EmotionType? emotion) {
    setState(() {
      _emotion = emotion;
      _otherEmotion = emotion == null;
    });
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
    if (_startingConversation || (_otherEmotion ? _customEmotion.text.trim().isEmpty : _emotion == null)) return;
    FocusScope.of(context).unfocus();
    final customEmotion = _otherEmotion ? _customEmotion.text.trim() : null;
    final emotion = _emotion ?? EmotionType.complexity;
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
        emotion: emotion, customEmotion: customEmotion,
        intensity: _intensity.round(),
      ),
    ));
    if (mounted) {
      setState(() {
        _emotion = null;
        _otherEmotion = false;
        _customEmotion.clear();
        _intensity = 5;
      });
    }
  }
}
