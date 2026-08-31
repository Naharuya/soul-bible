import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/app_theme.dart';
import '../app/asset_loader.dart';
import '../app/demo_llm_client.dart';
import '../app/mind_card_store.dart';
import '../bible_mind_core.dart';

class _ChatItem {
  const _ChatItem(this.text, {this.fromUser = false});
  final String text;
  final bool fromUser;
}

class ConversationPage extends StatefulWidget {
  const ConversationPage({super.key, required this.emotion, required this.intensity});
  final EmotionType emotion;
  final int intensity;

  @override
  State<ConversationPage> createState() => _ConversationPageState();
}

class _ConversationPageState extends State<ConversationPage> {
  static const _apiUrl = String.fromEnvironment('SOUL_BIBLE_API_URL');
  static const _cardTitle = '오늘의 마음 카드';
  static const _cardClosingMessage =
      '오늘 마음을 외면하지 않고 바라본 것만으로도 충분히 의미 있는 시간이었어요.';
  static const _examplePrompts = <String>[
    '오늘 있었던 일 중 가장 마음에 남는 장면은 무엇인가요?',
    '그 순간 어떤 생각과 감정이 함께 떠올랐나요?',
    '그 감정이 몸에서는 어떻게 느껴지나요?',
  ];
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _speech = SpeechToText();
  final _tts = FlutterTts();
  final _mindCardStore = MindCardStore();
  final _detector = const CrisisDetector();
  final _machine = const ConversationMachine();
  late final LlmApiClient _client;
  final _verseRepository = VerseRepository(loader: const FlutterVerseAssetLoader());
  final _items = <_ChatItem>[];
  late ConversationSession _session;
  bool _busy = false;
  bool _speechInitialized = false;
  bool _isListening = false;
  bool _isSpeaking = false;
  bool _savingCard = false;
  bool _cardSaved = false;
  bool _showVerseOffer = false;
  BibleVerse? _verse;
  bool _showActions = false;
  bool _showSummary = false;
  String? _chosenAction;

  @override
  void initState() {
    super.initState();
    _client = _apiUrl.isEmpty
        ? const DemoLlmApiClient()
        : ProxyLlmApiClient(
            endpoint: Uri.parse(_apiUrl),
            appTokenProvider: () async => null,
          );
    _session = ConversationSession(
      sessionId: DateTime.now().microsecondsSinceEpoch.toString(),
      selectedEmotion: widget.emotion,
      emotionIntensity: widget.intensity,
    );
    _items.add(_ChatItem('${widget.emotion.label}한 마음이 오늘 ${widget.intensity}/10 정도로 느껴지는군요.\n\n무슨 일이 있었는지 편한 만큼만 들려주세요.'));
    _configureTts();
  }

  @override
  void dispose() {
    _speech.cancel();
    _tts.stop();
    if (_client case final ProxyLlmApiClient proxy) {
      proxy.close();
    }
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _busy) return;
    _controller.clear();
    setState(() {
      _items.add(_ChatItem(text, fromUser: true));
      _busy = true;
    });
    _scrollDown();

    final assessment = _detector.assess(text);
    final local = _machine.applyLocalCrisis(_session, assessment, text);
    _session = local.session;
    if (assessment.isCrisis) {
      setState(() => _busy = false);
      await _showCrisisSupport(assessment.requiresImmediateUi);
      return;
    }

    try {
      final response = await _client.send(LlmConversationRequest(
        session: _session,
        userMessage: text,
        systemPromptVersion: 'ko-v1',
      ));
      final transition = _machine.applyLlmResponse(_session, response);
      _session = transition.session;
      final shouldAutoShowVerse = _session.turnCount >= 3 &&
          _session.riskLevel == 0 &&
          transition.uiAction != ConversationUiAction.showCrisisSupport &&
          transition.uiAction != ConversationUiAction.showEmergencySupport;
      setState(() {
        final replyParts = <String>[response.message];
        if (shouldAutoShowVerse) {
          replyParts.add('세 가지 마음 이야기를 나누었으니, 지금 마음에 머물 수 있는 말씀 한 구절을 함께 볼게요.');
        } else if (response.question != null) {
          replyParts.add(response.question!);
        }
        _items.add(_ChatItem(replyParts.join('\n\n')));
        _showVerseOffer = !shouldAutoShowVerse &&
            transition.uiAction == ConversationUiAction.showVerseConsent;
        _busy = false;
      });
      if (transition.uiAction == ConversationUiAction.showCrisisSupport ||
          transition.uiAction == ConversationUiAction.showEmergencySupport) {
        await _showCrisisSupport(
          transition.uiAction == ConversationUiAction.showEmergencySupport,
        );
      } else if (shouldAutoShowVerse) {
        await _showVerseAutomatically();
      }
    } catch (_) {
      setState(() {
        _items.add(const _ChatItem('잠시 연결이 고르지 않아요. 마음을 한 번 더 천천히 적어 주세요.'));
        _busy = false;
      });
    }
    _scrollDown();
  }

  void _selectExample(String prompt) {
    _controller
      ..text = prompt
      ..selection = TextSelection.collapsed(offset: prompt.length);
    setState(() {});
  }

  Future<void> _toggleVoiceInput() async {
    if (_isSpeaking) {
      await _tts.stop();
      if (mounted) setState(() => _isSpeaking = false);
    }
    if (_isListening) {
      await _speech.stop();
      if (mounted) setState(() => _isListening = false);
      return;
    }

    if (!_speechInitialized) {
      final available = await _speech.initialize(
        onStatus: (status) {
          if (!mounted) return;
          if (status == 'done' || status == 'notListening') {
            setState(() => _isListening = false);
          }
        },
        onError: (error) {
          if (!mounted) return;
          setState(() => _isListening = false);
          _showVoiceMessage('음성을 인식하지 못했어요. 잠시 후 다시 시도해 주세요.');
        },
      );
      _speechInitialized = available;
      if (!available) {
        if (mounted) {
          _showVoiceMessage('마이크 권한을 허용하거나 기기의 음성 인식 기능을 확인해 주세요.');
        }
        return;
      }
    }

    await _speech.listen(
      onResult: _onSpeechResult,
      localeId: 'ko_KR',
    );
    if (mounted) setState(() => _isListening = _speech.isListening);
  }

  void _onSpeechResult(SpeechRecognitionResult result) {
    if (!mounted) return;
    setState(() {
      _controller
        ..text = result.recognizedWords
        ..selection = TextSelection.collapsed(offset: result.recognizedWords.length);
      if (result.finalResult) _isListening = false;
    });
  }

  void _showVoiceMessage(String message) {
    ScaffoldMessenger.of(context)
      ..hideCurrentSnackBar()
      ..showSnackBar(SnackBar(content: Text(message)));
  }

  void _configureTts() {
    _tts
      ..setStartHandler(() {
        if (mounted) setState(() => _isSpeaking = true);
      })
      ..setCompletionHandler(() {
        if (mounted) setState(() => _isSpeaking = false);
      })
      ..setCancelHandler((_) {
        if (mounted) setState(() => _isSpeaking = false);
      })
      ..setErrorHandler((_) {
        if (!mounted) return;
        setState(() => _isSpeaking = false);
        _showVoiceMessage('말씀을 재생하지 못했어요. 기기의 한국어 음성을 확인해 주세요.');
      });
  }

  Future<void> _toggleVerseSpeech(BibleVerse verse) async {
    if (_isSpeaking) {
      await _tts.stop();
      if (mounted) setState(() => _isSpeaking = false);
      return;
    }
    if (_isListening) {
      await _speech.stop();
      if (mounted) setState(() => _isListening = false);
    }

    await _tts.setLanguage('ko-KR');
    await _tts.setSpeechRate(0.42);
    await _tts.setPitch(1.0);
    await _tts.setVolume(1.0);
    await _tts.awaitSpeakCompletion(true);
    await _tts.speak(
      '${verse.reference}. ${verse.text}. 묵상 질문입니다. ${verse.reflectionQuestion}',
    );
  }

  Future<void> _acceptVerse() async {
    final verses = await _verseRepository.findForEmotion(widget.emotion, limit: 1);
    if (!mounted || verses.isEmpty) return;
    final verse = verses.first;
    _session = _machine.acceptVerse(_session, verseId: verse.id).session;
    setState(() {
      _verse = verse;
      _showVerseOffer = false;
    });
    _scrollDown();
  }

  Future<void> _showVerseAutomatically() async {
    final verses = await _verseRepository.findForEmotion(widget.emotion, limit: 1);
    if (!mounted || verses.isEmpty) {
      if (mounted) _showVoiceMessage('지금은 말씀을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
    final verse = verses.first;
    _session = _machine.acceptVerse(_session, verseId: verse.id).session;
    setState(() {
      _verse = verse;
      _showVerseOffer = false;
    });
    _scrollDown();
  }

  void _declineVerse() {
    _session = _machine.declineVerse(_session).session;
    setState(() {
      _showVerseOffer = false;
      _showActions = true;
    });
    _scrollDown();
  }

  void _continueAfterVerse() {
    setState(() => _showActions = true);
    _scrollDown();
  }

  void _chooseAction(String action) {
    _session = _machine.selectAction(_session).session;
    setState(() {
      _chosenAction = action;
      _showActions = false;
      _showSummary = true;
    });
    _scrollDown();
  }

  Future<void> _saveMindCard() async {
    if (_savingCard || _cardSaved || _verse == null || _chosenAction == null) return;
    final now = DateTime.now();
    setState(() => _savingCard = true);
    try {
      await _mindCardStore.save(MindCardRecord(
        id: now.microsecondsSinceEpoch.toString(),
        createdAt: now,
        title: _cardTitle,
        dateLabel: '${now.year}년 ${now.month}월 ${now.day}일',
        emotion: widget.emotion.label,
        intensity: widget.intensity,
        verseReference: _verse!.reference,
        verseText: _verse!.text,
        reflectionQuestion: _verse!.reflectionQuestion,
        action: _chosenAction!,
        closingMessage: _cardClosingMessage,
      ));
      if (!mounted) return;
      setState(() {
        _savingCard = false;
        _cardSaved = true;
      });
      _showVoiceMessage('오늘의 마음 카드 문구를 모두 저장했어요.');
    } catch (_) {
      if (!mounted) return;
      setState(() => _savingCard = false);
      _showVoiceMessage('마음 카드를 저장하지 못했어요. 다시 시도해 주세요.');
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (_scrollController.hasClients) {
        _scrollController.animateTo(_scrollController.position.maxScrollExtent, duration: const Duration(milliseconds: 350), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _showCrisisSupport(bool immediate) async {
    if (!mounted) return;
    await showModalBottomSheet<void>(
      context: context,
      isDismissible: !immediate,
      enableDrag: !immediate,
      showDragHandle: true,
      builder: (context) => Padding(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 36),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(immediate ? '지금은 안전이 가장 중요해요' : '혼자 견디지 않아도 괜찮아요', style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const Text('저는 긴급 구조를 제공할 수 없어요. 지금 자신이나 다른 사람을 해칠 가능성이 있다면 위험한 물건에서 멀어지고, 믿을 수 있는 사람과 함께 있어 주세요.', style: TextStyle(height: 1.55)),
          const SizedBox(height: 20),
          FilledButton.icon(onPressed: () => launchUrl(Uri.parse('tel:109')), icon: const Icon(Icons.call), label: const Text('자살예방상담전화 109')),
          const SizedBox(height: 10),
          OutlinedButton.icon(onPressed: () => launchUrl(Uri.parse('tel:112')), icon: const Icon(Icons.emergency_outlined), label: const Text('긴급 신고 112'), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52))),
          const SizedBox(height: 10),
          OutlinedButton.icon(onPressed: () => launchUrl(Uri.parse('tel:119')), icon: const Icon(Icons.local_hospital_outlined), label: const Text('응급 구조 119'), style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52))),
        ]),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          const Text('마음 대화', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          Text('${widget.emotion.label} · ${widget.intensity}/10', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400)),
        ]),
        actions: [IconButton(onPressed: () => _showCrisisSupport(false), icon: const Icon(Icons.health_and_safety_outlined), tooltip: '도움받기')],
      ),
      body: SafeArea(
        child: Center(
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 720),
            child: Column(children: [
              Expanded(
                child: ListView(
                  controller: _scrollController,
                  padding: const EdgeInsets.fromLTRB(18, 18, 18, 22),
                  children: [
                    const Center(child: Padding(padding: EdgeInsets.only(bottom: 22), child: Text('이 대화는 기기에 저장되지 않는 MVP 데모입니다', style: TextStyle(fontSize: 11, color: Color(0xFF7B817E))))),
                    ..._items.map(_bubble),
                    if (_busy) _typing(),
                    if (_showVerseOffer) _verseOffer(),
                    if (_verse != null) _verseCard(_verse!),
                    if (_showActions) _actionCard(),
                    if (_showSummary) _summaryCard(),
                  ],
                ),
              ),
              if (!_showSummary && !_showActions && _verse == null && !_showVerseOffer)
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                  decoration: const BoxDecoration(color: Colors.white, border: Border(top: BorderSide(color: Color(0xFFE8E4DC)))),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    const Text('이렇게 시작해 보세요', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: Color(0xFF65726B))),
                    const SizedBox(height: 8),
                    ..._examplePrompts.map((prompt) => Padding(
                      padding: const EdgeInsets.only(bottom: 7),
                      child: OutlinedButton.icon(
                        onPressed: _busy ? null : () => _selectExample(prompt),
                        icon: const Icon(Icons.touch_app_outlined, size: 18),
                        label: Text(prompt, maxLines: 2, overflow: TextOverflow.ellipsis),
                        style: OutlinedButton.styleFrom(
                          minimumSize: const Size.fromHeight(44),
                          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
                          alignment: Alignment.centerLeft,
                          foregroundColor: AppTheme.green,
                          side: const BorderSide(color: Color(0xFFD5DED3)),
                          shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(14)),
                        ),
                      ),
                    )),
                    const SizedBox(height: 3),
                    if (_isListening)
                      const Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                          SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.coral)),
                          SizedBox(width: 7),
                          Text('듣고 있어요 · 다시 누르면 멈춰요', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.coral)),
                        ]),
                      ),
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Expanded(child: TextField(controller: _controller, enabled: !_busy, minLines: 1, maxLines: 4, textInputAction: TextInputAction.send, onSubmitted: (_) => _send(), decoration: const InputDecoration(hintText: '마음을 편하게 적어 주세요', filled: false))),
                      const SizedBox(width: 10),
                      Semantics(
                        button: true,
                        label: '음성으로 마음 말하기',
                        child: Material(
                          color: _isListening ? AppTheme.coral : AppTheme.green,
                          elevation: 5,
                          shadowColor: _isListening ? AppTheme.coral : AppTheme.green,
                          shape: const CircleBorder(),
                          child: InkWell(
                            onTap: _busy ? null : _toggleVoiceInput,
                            customBorder: const CircleBorder(),
                            child: SizedBox(
                              width: 60,
                              height: 60,
                              child: Icon(_isListening ? Icons.stop_rounded : Icons.mic_rounded, color: Colors.white, size: 32),
                            ),
                          ),
                        ),
                      ),
                      const SizedBox(width: 8),
                      IconButton.filled(
                        onPressed: _busy ? null : _send,
                        icon: const Icon(Icons.arrow_upward_rounded),
                        tooltip: '보내기',
                        style: IconButton.styleFrom(minimumSize: const Size(52, 52)),
                      ),
                    ]),
                  ]),
                ),
            ]),
          ),
        ),
      ),
    );
  }

  Widget _bubble(_ChatItem item) => Align(
    alignment: item.fromUser ? Alignment.centerRight : Alignment.centerLeft,
    child: Container(
      constraints: const BoxConstraints(maxWidth: 520),
      margin: const EdgeInsets.only(bottom: 12),
      padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 14),
      decoration: BoxDecoration(color: item.fromUser ? AppTheme.green : Colors.white, borderRadius: BorderRadius.only(topLeft: const Radius.circular(20), topRight: const Radius.circular(20), bottomLeft: Radius.circular(item.fromUser ? 20 : 5), bottomRight: Radius.circular(item.fromUser ? 5 : 20))),
      child: Text(item.text, style: TextStyle(color: item.fromUser ? Colors.white : AppTheme.ink, height: 1.5)),
    ),
  );

  Widget _typing() => const Align(alignment: Alignment.centerLeft, child: Padding(padding: EdgeInsets.all(16), child: SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2))));

  Widget _verseOffer() => _panel(
    children: [
      const Icon(Icons.menu_book_rounded, color: AppTheme.green, size: 30),
      const SizedBox(height: 12),
      const Text('지금 마음을 위한 말씀을\n함께 읽어볼까요?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, height: 1.35), textAlign: TextAlign.center),
      const SizedBox(height: 18),
      FilledButton(onPressed: _acceptVerse, child: const Text('네, 읽어볼게요')),
      TextButton(onPressed: _declineVerse, child: const Text('지금은 괜찮아요')),
    ],
  );

  Widget _verseCard(BibleVerse verse) => _panel(children: [
    const Text('오늘의 말씀', style: TextStyle(color: AppTheme.green, fontWeight: FontWeight.w800)),
    const SizedBox(height: 14),
    Text(verse.reference, style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800)),
    const SizedBox(height: 12),
    Text(verse.text, style: const TextStyle(fontSize: 17, height: 1.7), textAlign: TextAlign.center),
    const SizedBox(height: 14),
    Text(verse.reflectionQuestion, style: const TextStyle(color: Color(0xFF596761), height: 1.5), textAlign: TextAlign.center),
    const SizedBox(height: 16),
    OutlinedButton.icon(
      onPressed: () => _toggleVerseSpeech(verse),
      icon: Icon(_isSpeaking ? Icons.stop_circle_outlined : Icons.volume_up_rounded),
      label: Text(_isSpeaking ? '말씀 낭독 멈추기' : '오늘의 말씀 음성으로 듣기'),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: _isSpeaking ? AppTheme.coral : AppTheme.green,
        side: BorderSide(color: _isSpeaking ? AppTheme.coral : AppTheme.green),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
      ),
    ),
    const SizedBox(height: 8),
    const Text('※ 개발용 요약 문구이며 정식 성경 본문이 아닙니다.', style: TextStyle(fontSize: 10, color: Color(0xFF8A8F8C))),
    const SizedBox(height: 20),
    FilledButton(onPressed: _continueAfterVerse, child: const Text('작은 실천 정하기')),
  ]);

  Widget _actionCard() => _panel(children: [
    const Text('지금 할 수 있는\n아주 작은 한 걸음', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, height: 1.35), textAlign: TextAlign.center),
    const SizedBox(height: 16),
    ...['1분간 천천히 호흡하기', '믿을 수 있는 사람에게 안부 보내기', '짧게 기도하고 마음 한 줄 적기'].map(
      (action) => Padding(
        padding: const EdgeInsets.only(bottom: 9),
        child: OutlinedButton(
          onPressed: () => _chooseAction(action),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            alignment: Alignment.centerLeft,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(16)),
          ),
          child: Text(action),
        ),
      ),
    ),
  ]);

  Widget _summaryCard() => _panel(children: [
    const Icon(Icons.favorite_outline_rounded, color: AppTheme.coral, size: 34),
    const SizedBox(height: 12),
    const Text(_cardTitle, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
    const SizedBox(height: 20),
    _summaryRow('내 마음', '${widget.emotion.label} · ${widget.intensity}/10'),
    if (_verse != null) _summaryRow('함께한 말씀', _verse!.reference),
    _summaryRow('작은 실천', _chosenAction ?? ''),
    const SizedBox(height: 20),
    const Text(_cardClosingMessage, textAlign: TextAlign.center, style: TextStyle(height: 1.6, color: Color(0xFF596761))),
    const SizedBox(height: 18),
    FilledButton.icon(
      onPressed: _savingCard || _cardSaved ? null : _saveMindCard,
      icon: _savingCard
          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : Icon(_cardSaved ? Icons.check_rounded : Icons.bookmark_add_outlined),
      label: Text(_cardSaved ? '저장 완료' : '마음 카드 저장하기'),
    ),
    const SizedBox(height: 8),
    OutlinedButton(
      onPressed: () => Navigator.of(context).pop(),
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
      child: const Text('대화 마치기'),
    ),
  ]);

  Widget _summaryRow(String label, String value) => Padding(padding: const EdgeInsets.only(bottom: 13), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 100, child: Text(label, style: const TextStyle(color: Color(0xFF6E7873)))), Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w700)))]));

  Widget _panel({required List<Widget> children}) => Card(margin: const EdgeInsets.only(top: 12, bottom: 16), child: Padding(padding: const EdgeInsets.all(24), child: Column(children: children)));
}
