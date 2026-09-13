import 'dart:async';
import 'package:flutter/material.dart';
import 'package:flutter_tts/flutter_tts.dart';
import 'package:speech_to_text/speech_recognition_result.dart';
import 'package:speech_to_text/speech_to_text.dart';
import 'package:url_launcher/url_launcher.dart';

import '../app/app_theme.dart';
import '../app/space_scaffold.dart';
import '../app/api_config.dart';
import '../app/asset_loader.dart';
import '../app/mind_card_store.dart';
import '../onaria.dart';
import '../engagement/engagement_controller.dart';
import '../engagement/domain_events.dart';
import '../engagement/mini_games/cross_light/cross_light_page.dart';
import '../engagement/mini_games/cross_light/cross_light_game.dart';
import '../engagement/sharing/share_card.dart';
import '../engagement/sharing/share_preview_page.dart';
import 'growth_page.dart';
import 'conversation_question_examples.dart';

class _ChatItem {
  const _ChatItem(this.text, {this.fromUser = false, this.question, this.answerExamples = const []});
  final String? question;
  final List<String> answerExamples;
  final String text;
  final bool fromUser;
}

class ConversationPage extends StatefulWidget {
  const ConversationPage({super.key, required this.emotion, required this.intensity, this.customEmotion, this.apiClient, this.mindCardStore});
  final MindCardStore? mindCardStore;
  final LlmApiClient? apiClient;
  final String? customEmotion;
  final EmotionType emotion;
  final int intensity;

  @override
  State<ConversationPage> createState() => _ConversationPageState();
}

class _ConversationPageState extends State<ConversationPage> {
  String? get _customFeeling {
    final text = widget.customEmotion?.trim();
    return text == null || text.isEmpty ? null : text;
  }

  String _feelingQuestion(int turn) {
    final feeling = _customFeeling;
    if (feeling == null) {
      return turn == 0 ? '무슨 일이 있었는지 편한 만큼 이야기해 주실래요?'
          : turn == 1 ? '그때 어떤 마음이 가장 크게 느껴졌나요?'
          : '지금 나에게 필요한 위로는 무엇인가요?';
    }
    return turn == 0 ? '“$feeling”라고 적어 주셨는데, 어떤 순간에 이런 마음이 들었나요?'
        : turn == 1 ? '“$feeling”라는 마음과 관련해, 방금 이야기한 상황에서 가장 마음에 남는 것은 무엇인가요?'
        : '“$feeling”라는 마음을 돌보기 위해 지금 어떤 도움이나 위로가 필요하신가요?';
  }
  static const _cardTitle = '오늘의 마음 카드';
  static const _cardClosingMessage =
      '오늘 마음을 외면하지 않고 바라본 것만으로도 충분히 의미 있는 시간이었어요.';

  static const _emotionSpecificPrompts = <EmotionType, List<String>>{
    EmotionType.anxiety: [
      '내일 있을 중요한 일이 자꾸 걱정돼요.',
      '미래가 불투명해서 마음이 불안하고 떨려요.',
      '갑자기 안 좋은 일이 생길까 봐 불안한 마음이 커요.'
    ],
    EmotionType.loneliness: [
      '문득 세상에 나 혼자 남겨진 것 같은 기분이 들어요.',
      '진심으로 내 마음을 이해해줄 사람이 없는 것 같아 외로워요.',
      '혼자 있는 시간이 길어지니 마음이 공허해지네요.'
    ],
    EmotionType.exhaustion: [
      '요즘 업무가 너무 많아 몸과 마음이 다 타버린 것 같아요.',
      '아무것도 하고 싶지 않고 그저 쉬고만 싶어요.',
      '반복되는 일상에 지쳐서 에너지가 하나도 없어요.'
    ],
    EmotionType.anger: [
      '상대방이 무례하게 행동해서 화를 참기 힘들어요.',
      '정당하지 못한 상황을 겪으니 너무 억울하고 화가 나요.',
      '자꾸만 짜증이 나고 마음이 날카로워져 있어요.'
    ],
    EmotionType.sadness: [
      '이유 없이 자꾸만 눈물이 나고 마음이 울적해요.',
      '소중한 것을 잃어버린 것 같은 상실감이 커요.',
      '가슴 한구석이 먹먹하고 슬픈 기분이 가시질 않아요.'
    ],
    EmotionType.complexity: [
      '여러 가지 고민이 겹쳐서 머릿속이 너무 복잡해요.',
      '내 마음을 나도 잘 모르겠어서 답답한 기분이에요.',
      '어떤 선택을 해야 할지 몰라 마음이 갈팡질팡해요.'
    ],
    EmotionType.gratitude: [
      '오늘 하루를 평안하게 보낼 수 있음에 감사해요.',
      '주변 사람들의 따뜻한 말 한마디가 큰 힘이 되었어요.',
      '작은 일에서도 감사를 발견하니 마음이 풍요로워지네요.'
    ],
    EmotionType.joy: [
      '오랫동안 기다려온 기쁜 소식을 들었어요.',
      '내가 좋아하는 일을 할 수 있어서 너무 즐거워요.',
      '함께 웃고 떠들 수 있는 사람이 곁에 있어 기뻐요.'
    ],
    EmotionType.fear: [
      '새로운 도전을 앞두고 실패할까 봐 너무 무서워요.',
      '안 좋은 일이 일어날 것 같은 예감에 마음이 졸여요.',
      '어두운 밤이나 혼자 있는 상황이 두렵게 느껴질 때가 있어요.'
    ],
    EmotionType.disgust: [
      '누군가의 비도덕적인 행동을 보고 마음이 상했어요.',
      '정말 싫어하는 상황에 놓이게 되어 기분이 좋지 않아요.',
      '받아들이기 힘든 일을 겪고 거부감이 강하게 들어요.'
    ],
    EmotionType.surprise: [
      '생각지도 못한 깜짝 파티를 받아서 놀랐어요.',
      '갑작스러운 변화에 어떻게 대처해야 할지 얼떨떨해요.',
      '믿기지 않는 놀라운 이야기를 들어서 가슴이 두근거려요.'
    ],
    EmotionType.happiness: [
      '날씨가 너무 좋아서 걷는 것만으로도 행복해요.',
      '사랑하는 가족과 함께 맛있는 음식을 먹어 행복해요.',
      '지금 이 평화로운 순간이 오래도록 유지되면 좋겠어요.'
    ],
    EmotionType.anticipation: [
      '조만간 떠날 여행을 생각하니 벌써부터 설레요.',
      '새로운 일을 시작하게 되어 기분 좋은 긴장감이 들어요.',
      '내일은 어떤 즐거운 일이 생길지 기대하며 기다리고 있어요.'
    ],
    EmotionType.admiration: [
      '아름다운 노을을 보며 자연의 신비로움에 감탄했어요.',
      '누군가의 훌륭한 성품이나 성취를 보고 큰 감명을 받았어요.',
      '예술 작품을 보며 말로 표현하기 힘든 감동을 느꼈어요.'
    ],
    EmotionType.overwhelmed: [
      '너무 큰 사랑과 격려를 받아서 마음이 벅차올라요.',
      '나에게 주어진 축복이 너무 과분하다는 생각이 들어요.',
      '가슴이 꽉 찬 것 같은 벅찬 감동에 말을 잇기 힘들어요.'
    ],
    EmotionType.jealousy: [
      '나보다 앞서가는 사람을 보니 자꾸 비교하게 돼요.',
      '내가 갖고 싶던 걸 가진 친구를 보며 질투심이 생겨요.',
      '타인의 행복이 마냥 축하해주기 힘들 때가 있어 괴로워요.'
    ],
  };

  static const _emotionSpecificActions = <EmotionType, List<String>>{
    EmotionType.anxiety: ['1분간 천천히 호흡하기', '평안을 구하는 짧은 기도 하기', '주변의 소리 3가지에 집중해보기'],
    EmotionType.fear: ['1분간 천천히 호흡하기', '나를 지키시는 약속 붙들기', '따뜻한 차 한 잔 마시기'],
    EmotionType.surprise: ['깊게 세 번 숨 들이마시기', '현재 상황을 차분히 정리해보기', '잠시 눈을 감고 마음 고르기'],
    EmotionType.loneliness: ['소중한 사람에게 짧은 안부 보내기', '나를 향한 응원의 메시지 적어보기', '오늘 하루 나를 위한 작은 선물하기'],
    EmotionType.sadness: ['믿을 수 있는 사람과 마음 나누기', '충분히 울거나 감정 표현하기', '나를 위로하는 찬양 듣기'],
    EmotionType.exhaustion: ['10분간 아무 생각 없이 쉬기', '가벼운 스트레칭으로 몸 풀기', '일찍 잠자리에 들 준비하기'],
    EmotionType.anger: ['자리를 잠시 옮겨 마음 가라앉히기', '차가운 물 한 잔 마시기', '용서와 온유함을 구하는 기도하기'],
    EmotionType.disgust: ['좋아하는 향기나 풍경에 집중하기', '마음을 깨끗하게 하는 짧은 산책', '부정적인 생각 흘려보내기'],
    EmotionType.jealousy: ['나만의 고유한 장점 3가지 적기', '타인을 축복하는 짧은 기도하기', '남과 비교하지 않는 연습하기'],
    EmotionType.complexity: ['책상이나 주변 환경 정리하기', '머릿속 생각을 종이에 적어보기', '가장 단순한 일 하나만 먼저 하기'],
    EmotionType.gratitude: ['감사한 대상에게 고마움 전하기', '오늘의 감사 일기 한 줄 쓰기', '감사의 기도로 하루 마무리하기'],
    EmotionType.joy: ['기쁜 소식을 소중한 사람과 나누기', '이 즐거움을 주신 분께 찬양하기', '오늘의 기쁨을 사진이나 글로 기록하기'],
    EmotionType.happiness: ['지금 이 평화를 충분히 누리기', '주변 사람들에게 밝은 인사 건네기', '나눔을 실천할 수 있는 방법 찾기'],
    EmotionType.admiration: ['감동받은 내용을 깊이 묵상하기', '예술적 영감을 기록으로 남기기', '위대함을 찬양하는 짧은 글 쓰기'],
    EmotionType.overwhelmed: ['벅찬 감동을 짧은 기도로 표현하기', '받은 사랑을 어떻게 나눌지 생각하기', '지금 이 순간을 온전히 기억하기'],
    EmotionType.anticipation: ['기대되는 일을 위해 차분히 준비하기', '좋은 결과가 있기를 기도하기', '설레는 마음을 긍정적인 에너지로 쓰기'],
  };

  static const _clinicalActions = <String>[
    '숨을 4초간 들이마시고 6초간 내쉬는 호흡을 5번 해보기',
    '발바닥이 바닥에 닿는 감각을 1분 동안 느껴보기',
    '눈에 보이는 것 5가지와 들리는 소리 3가지를 찾아보기',
    '어깨와 턱의 힘을 풀고 가볍게 스트레칭하기',
    '지금 느끼는 감정에 이름을 붙여 한 문장으로 적어보기',
    '떠오른 생각 앞에 “나는 지금 …라고 생각하고 있다”를 붙여보기',
    '지금 바꿀 수 있는 일과 바꿀 수 없는 일을 나눠 적어보기',
    '걱정되는 일 중 오늘 할 수 있는 가장 작은 부분 하나 정하기',
    '해야 할 일을 5분만 시작하고 계속할지는 그때 다시 정하기',
    '지금 필요한 것이 쉼·위로·도움·거리두기 중 무엇인지 골라보기',
    '10분 동안 알림을 끄고 조용한 곳에서 쉬어보기',
    '물 한 잔을 천천히 마시고 간단한 간식을 챙겨보기',
    '오늘 잠들 시간을 정하고 편안한 취침 준비 하나 해보기',
    '집 안이나 바깥에서 5분 동안 천천히 걸어보기',
    '믿을 수 있는 사람에게 “잠깐 이야기할 수 있어?”라고 보내보기',
    '도움이 필요한 일을 한 문장으로 구체적으로 부탁해보기',
    '오늘 해낸 아주 작은 일 한 가지를 찾아 스스로 인정해보기',
    '나에게 친한 사람에게 하듯 따뜻한 말을 한 문장 건네보기',
  ];

  List<String> get _currentActions {
    if (_agentMode == 'clinical_reflection') return _clinicalActions;
    return _emotionSpecificActions[widget.emotion] ??
        ['1분간 천천히 호흡하기', '믿을 수 있는 사람에게 안부 보내기', '짧게 기도하고 마음 한 줄 적기'];
  }

  List<String> get _currentExamplePrompts {
    final assistant = _items.where((item) => !item.fromUser).lastOrNull;
    final question = assistant?.question;
    if (question == null) return const [];
    return conversationQuestionExamples(
      _questionText(question),
      answerExamples: assistant!.answerExamples,
      userMessage: _session.lastUserMessage ?? '',
      situationExamples: _emotionSpecificPrompts[widget.emotion] ?? const [],
    );
  }
  final _controller = TextEditingController();
  final _scrollController = ScrollController();
  final _speech = SpeechToText();
  final _tts = FlutterTts();
  late final _mindCardStore = widget.mindCardStore ?? MindCardStore();
  final _detector = const CrisisDetector();
  final _machine = const ConversationMachine();
  late final LlmApiClient? _client;
  final _verseRepository = VerseRepository(loader: const FlutterVerseAssetLoader());
  final _items = <_ChatItem>[];
  late ConversationSession _session;
  bool _busy = false;
  Timer? _responseWaitTimer;
  bool _responseDelayed = false;
  bool _speechInitialized = false;
  bool _isListening = false;
  bool _isSpeaking = false;
  int _speechGeneration = 0;
  bool _savingCard = false;
  MindCardRecord? _savedMindCard;
  bool _showVerseOffer = false;
  BibleVerse? _verse;
  BibleVerse? _suggestedVerse;
  bool _showActions = false;
  bool _showSummary = false;
  String? _chosenAction;
  String _agentMode = 'auto';
  String _verseLanguage = 'bilingual';
  String _lastAgent = 'integrated';
  String? _clinicalReflection;
  String? _integratedInsight;

  @override
  void initState() {
    super.initState();
    _client = widget.apiClient ?? (ApiConfig.chatUrl == null
        ? null
        : ProxyLlmApiClient(
        endpoint: ApiConfig.chatUrl!,
            appTokenProvider: () async => ApiConfig.appToken,
          ));
    _session = ConversationSession(
      sessionId: DateTime.now().microsecondsSinceEpoch.toString(),
      selectedEmotion: widget.emotion,
      emotionIntensity: widget.intensity,
      customEmotion: _customFeeling,
      lastAssistantQuestion: _feelingQuestion(0),
    );
    _items.add(_ChatItem(_customFeeling == null
        ? '${widget.emotion.naturalFeelingPhrase}이 오늘 ${widget.intensity}/10 정도로 느껴지는군요.'
        : '직접 적어 주신 마음을 함께 살펴볼게요.', question: _feelingQuestion(0)));
    _configureTts();
  }

  @override
  void dispose() {
    _responseWaitTimer?.cancel();
    _speechGeneration++;
    _speech.cancel().catchError((Object _) {});
    _tts.stop().catchError((Object _) => 0);
    if (_client case final ProxyLlmApiClient proxy) {
      if (widget.apiClient == null) proxy.close();
    }
    _controller.dispose();
    _scrollController.dispose();
    super.dispose();
  }

  Future<void> _send() async {
    final text = _controller.text.trim();
    if (text.isEmpty || _busy || _session.isEnded ||
        _session.turnCount >= _machine.maxCoreTurns) {
      return;
    }
    _controller.clear();
    setState(() {
      _items.add(_ChatItem(text, fromUser: true));
      _busy = true;
    });
    _scrollDown();

    final typedAssessment = _detector.assess(text);
    final customAssessment = _detector.assess(_customFeeling ?? '');
    final assessment = customAssessment.level > typedAssessment.level
        ? customAssessment : typedAssessment;
    final local = _machine.applyLocalCrisis(_session, assessment, text);
    _session = local.session;
    if (assessment.isCrisis) {
      setState(() => _busy = false);
      await _showCrisisSupport(assessment.requiresImmediateUi);
      return;
    }

    final turnBeforeRequest = _session.turnCount;
    _responseDelayed = false;
    _responseWaitTimer = Timer(const Duration(seconds: 4), () {
      if (mounted && _busy) setState(() => _responseDelayed = true);
    });
    try {
      final client = _client;
      if (client == null) {
        await _continueWithoutServer(turnBeforeRequest);
        return;
      }
      final allowedVerses = await _verseRepository.findForEmotion(
        widget.emotion,
        limit: 100,
      );
      if (!mounted) return;
      final response = await client.send(LlmConversationRequest(
        session: _session,
        userMessage: text,
        systemPromptVersion: 'ko-v1',
        allowedVerseIds: allowedVerses.map((verse) => verse.id).toList(growable: false),
        agentMode: _agentMode,
        verseLanguage: _verseLanguage,
      ));
      if (!mounted) return;
      final transition = _machine.applyLlmResponse(_session, response);
      if (transition.uiAction == ConversationUiAction.showCrisisSupport ||
          transition.uiAction == ConversationUiAction.showEmergencySupport) {
        _session = transition.session;
        setState(() {
          _busy = false;
          _showVerseOffer = false;
        });
        await _showCrisisSupport(
          transition.uiAction == ConversationUiAction.showEmergencySupport,
        );
        return;
      }
      _session = transition.session.copyWith(agentMemory: response.memorySummary);
      _lastAgent = response.agent;
      _clinicalReflection = response.clinicalReflection;
      _integratedInsight = response.integratedInsight;
      final suggestedVerse = response.suggestedVerseId == null
          ? null
          : await _verseRepository.getById(response.suggestedVerseId!);
      if (!mounted) return;
      final shouldAutoShowVerse = transition.uiAction == ConversationUiAction.showVerseConsent &&
          !_session.isEnded &&
          _session.riskLevel == 0 &&
          (suggestedVerse != null || allowedVerses.isNotEmpty);
      _suggestedVerse = suggestedVerse ?? allowedVerses.firstOrNull;
      setState(() {
        final replyParts = <String>[response.message];
        if (shouldAutoShowVerse) {
          replyParts.add('세 가지 마음 이야기를 나누었으니, 지금 마음에 머물 수 있는 말씀 한 구절을 함께 볼게요.');
        }
        if (transition.uiAction == ConversationUiAction.end) {
          replyParts.add('오늘 대화를 여기서 마칠게요.');
        }
        if (response.clinicalReflection != null) {
          replyParts.add('성찰: ${response.clinicalReflection!}');
        }
        if (response.integratedInsight != null) {
          replyParts.add('통합 인사이트: ${response.integratedInsight!}');
        }
        _items.add(_ChatItem(
          replyParts.join('\n\n'),
          question: shouldAutoShowVerse ? null : response.question,
          answerExamples: response.answerExamples,
        ));
        _showVerseOffer = !shouldAutoShowVerse &&
          transition.uiAction == ConversationUiAction.showVerseConsent;
        _busy = false;
      });
      if (shouldAutoShowVerse) {
        await _showVerseAutomatically();
      }
    } catch (_) {
      if (!mounted) return;
      await _continueWithoutServer(turnBeforeRequest);
    } finally {
      _responseWaitTimer?.cancel();
      _responseDelayed = false;
    }
    _scrollDown();
  }

  Future<void> _selectExample(String prompt) async {
    if (_busy || _session.isEnded) return;
    _controller.text = prompt;
    FocusScope.of(context).unfocus();
    await _send();
  }

  Future<void> _continueWithoutServer(int previousTurn) async {
    if (!mounted || _session.isEnded || _session.riskLevel > 0) return;
    // Count each submitted answer once, including a failed network request.
    final turn = _session.turnCount > previousTurn
        ? _session.turnCount : previousTurn + 1;
    final complete = turn >= _machine.maxCoreTurns;
    setState(() {
      _session = _session.copyWith(
        turnCount: turn,
        stage: complete ? ConversationStage.verseOffer : ConversationStage.need,
        lastAssistantQuestion: complete ? '' : _feelingQuestion(turn),
      );
      _busy = false;
      _showVerseOffer = complete;
      _items.add(_ChatItem(
        '서버에 연결하지 못해 AI 답변을 받지 못했어요. 적어 주신 내용으로 다음 단계를 이어갈게요.',
        question: complete ? null : _feelingQuestion(turn),
      ));
    });
    if (complete) {
      FocusScope.of(context).unfocus();
      try {
        await _showVerseAutomatically();
      } catch (_) {
        if (!mounted) return;
        // Asset failure must not reopen chat or force another answer.
        _declineVerse();
      }
    }
    _scrollDown();
  }

  String _questionText(String question) {
    final text = question.trim().replaceFirst(RegExp(r'[.。!！?？…\s]+$'), '');
    return text.isEmpty ? '' : '$text?';
  }

  Future<void> _toggleVoiceInput() async {
    try {
      await _startOrStopVoiceInput();
    } catch (_) {
      if (!mounted) return;
      setState(() => _isListening = false);
      _showVoiceMessage('마이크를 시작하지 못했어요. 권한과 음성 인식 기능을 확인해 주세요.');
    }
  }

  Future<void> _startOrStopVoiceInput() async {
    if (_isSpeaking) {
      await _stopVerseSpeech();
    }
    if (!mounted) return;
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

    if (!mounted) return;
    await _speech.listen(
      onResult: _onSpeechResult,
      listenOptions: SpeechListenOptions(
        localeId: _verseLanguage == 'english' ? 'en_US' : 'ko_KR',
        partialResults: true,
        listenMode: ListenMode.dictation,
        cancelOnError: true,
      ),
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
      .setErrorHandler((msg) {
        _speechGeneration++;
        if (!mounted) return;
        setState(() => _isSpeaking = false);
        _showVoiceMessage('말씀을 재생하지 못했어요. 기기의 한국어 음성을 확인해 주세요.');
      });
  }

  Future<void> _toggleVerseSpeech(BibleVerse verse) async {
    if (_isSpeaking) {
      await _stopVerseSpeech();
      return;
    }
    final generation = ++_speechGeneration;
    bool active() => mounted && generation == _speechGeneration;
    setState(() => _isSpeaking = true);
    try {
      if (_isListening) {
        await _speech.stop();
        if (!active()) return;
        setState(() => _isListening = false);
      }
      await _tts.setSpeechRate(0.42);
      if (!active()) return;
      await _tts.setPitch(1.0);
      if (!active()) return;
      await _tts.setVolume(1.0);
      if (!active()) return;
      await _tts.awaitSpeakCompletion(true);
      if (!active()) return;
      final korean = '${verse.koreanSpokenReference}. ${verse.text}.';
      final english = verse.englishText.isEmpty ? '' : '${verse.reference}. ${verse.englishText}.';
      final segments = <(String, String)>[
        if (_verseLanguage != 'english' || english.isEmpty) ('ko-KR', korean),
        if (_verseLanguage != 'korean' && english.isNotEmpty) ('en-US', english),
      ];
      for (final segment in segments) {
        if (!active()) return;
        await _tts.setLanguage(segment.$1);
        if (!active()) return;
        await _tts.speak(segment.$2);
      }
    } catch (_) {
      if (active()) _showVoiceMessage('말씀을 재생하지 못했어요. 기기의 음성 설정을 확인해 주세요.');
    } finally {
      if (active()) setState(() => _isSpeaking = false);
    }
  }

  Future<void> _stopVerseSpeech() async {
    _speechGeneration++;
    if (mounted) setState(() => _isSpeaking = false);
    try {
      await _tts.stop();
    } catch (_) {
      if (mounted) _showVoiceMessage('음성 재생을 중지하지 못했어요. 기기의 음성 설정을 확인해 주세요.');
    }
  }

  Future<void> _acceptVerse() async {
    final verse = _suggestedVerse ?? (await _verseRepository.findForEmotion(widget.emotion, limit: 1)).firstOrNull;
    if (!mounted || verse == null) return;
    _session = _machine.acceptVerse(_session, verseId: verse.id).session;
    setState(() {
      _verse = verse;
      _showVerseOffer = false;
    });
    _scrollDown();
  }

  Future<void> _showVerseAutomatically() async {
    final verse = _suggestedVerse ?? (await _verseRepository.findForEmotion(widget.emotion, limit: 1)).firstOrNull;
    if (!mounted || verse == null) {
      if (mounted) _showVoiceMessage('지금은 말씀을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.');
      return;
    }
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

  Future<void> _chooseAction(String action) async {
    if (_showSummary) return;
    _session = _machine.selectAction(_session).session;
    setState(() {
      _chosenAction = action;
      _showActions = false;
      _showSummary = true;
    });
    await _stopVerseSpeech();
    if (!mounted) return;
    _scrollDown();
  }

  MindCardRecord _mindCard() {
    final now = DateTime.now();
    return MindCardRecord(
        id: now.microsecondsSinceEpoch.toString(),
        createdAt: now,
        title: _cardTitle,
        dateLabel: '${now.year}년 ${now.month}월 ${now.day}일',
        emotion: widget.emotion.label,
        intensity: widget.intensity,
        verseReference: _verse?.reference ?? '',
        verseText: _verse?.text ?? '',
        englishVerseText: _verse?.englishText ?? '',
        reflectionQuestion: _questionText(_verse?.reflectionQuestion ?? ''),
        action: _chosenAction!,
        closingMessage: _cardClosingMessage,
        agent: _lastAgent,
        memorySummary: _session.agentMemory,
        clinicalReflection: _clinicalReflection,
        integratedInsight: _integratedInsight,
        verseLanguage: _verseLanguage,
      );
  }

  Future<void> _shareMindCard() => _saveMindCard(share: true);

  Future<void> _saveMindCard({bool share = false}) async {
    if (_savingCard || _chosenAction == null) return;
    final engagement = EngagementScope.maybeOf(context);
    final route = ModalRoute.of(context);
    setState(() => _savingCard = true);
    try {
      if (_savedMindCard == null) {
        final card = _mindCard();
        await _mindCardStore.save(card);
        _savedMindCard = card;
        // Analytics failure must not turn a successful save into a failed action.
        unawaited(engagement?.emit(EngagementEventType.mindCardCreated)
            .catchError((Object _) {}) ?? Future<void>.value());
      }
      if (!mounted || route?.isCurrent == false) return;
      _showVoiceMessage('마음 카드와 감정·대화 요약을 이 기기에 저장했어요. 저장된 카드에서 삭제할 수 있어요.');
      if (share) {
        await Navigator.of(context).push(MaterialPageRoute<void>(
          builder: (_) => SharePreviewPage(content: ShareCardContent.mindCard(
            _savedMindCard!, engagement?.catalog ?? [],
          )),
        ));
      } else {
        await _stopVerseSpeech();
        if (!mounted || route?.isCurrent == false) return;
        final game = CrossLightGame();
        final completed = await Navigator.of(context).push<bool>(MaterialPageRoute(
          builder: (_) => CrossLightPage(game: game, continueToMindCard: true),
        ));
        if (!mounted || route?.isCurrent == false || completed != true ||
            !game.complete) {
          return;
        }
        Navigator.of(context).pushReplacement(MaterialPageRoute<void>(
          builder: (_) => GrowthPage(store: _mindCardStore)));
      }
    } catch (_) {
      if (!mounted) return;
      _showVoiceMessage(_savedMindCard == null
          ? '마음 카드를 저장하지 못했어요. 다시 시도해 주세요.'
          : '카드는 저장했지만 다음 화면을 열지 못했어요. 다시 시도해 주세요.');
    } finally {
      if (mounted) setState(() => _savingCard = false);
    }
  }

  void _scrollDown() {
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (mounted && _scrollController.hasClients) {
        final nextPage = _verse != null || _showVerseOffer || _showActions || _showSummary;
        _scrollController.animateTo(nextPage ? 0 : _scrollController.position.maxScrollExtent, duration: const Duration(milliseconds: 350), curve: Curves.easeOut);
      }
    });
  }

  Future<void> _showCrisisSupport(bool immediate) async {
    if (!mounted) return;
    unawaited(EngagementScope.maybeOf(context)?.reminders.pause() ?? Future<void>.value());
    FocusScope.of(context).unfocus();
    await showModalBottomSheet<void>(
      context: context,
      isDismissible: !immediate,
      enableDrag: !immediate,
      showDragHandle: true,
      isScrollControlled: true,
      useSafeArea: true,
      builder: (context) => SingleChildScrollView(
        padding: const EdgeInsets.fromLTRB(24, 8, 24, 36),
        child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(immediate ? '지금은 안전이 가장 중요해요' : '혼자 견디지 않아도 괜찮아요', style: const TextStyle(fontSize: 23, fontWeight: FontWeight.w800)),
          const SizedBox(height: 12),
          const Text('지금 안전한 곳에 계신가요?', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700)),
          const SizedBox(height: 12),
          const Text('가능하다면 위험한 물건에서 멀어지고, 믿을 수 있는 주변 사람에게 곁에 있어 달라고 부탁해 주세요. 상담 전문가나 의료진의 도움을 받아도 괜찮아요. 저는 직접 출동하거나 구조를 요청할 수 없어요.', style: TextStyle(height: 1.55)),
          const SizedBox(height: 12),
          const Text('다쳤거나 자신 또는 다른 사람을 곧 해칠 위험이 있다면 현지 응급 서비스에 바로 연락해 주세요. 아래 번호는 한국 기준입니다. 한국 밖에서는 현재 지역의 응급 번호를 이용해 주세요.', style: TextStyle(height: 1.55)),
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
    return SpaceScaffold(
      appBar: AppBar(
        title: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(_showSummary ? '마음 카드' : _showActions ? '작은 실천' :
              _verse != null || _showVerseOffer ? '오늘의 말씀' : '마음 대화',
              style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w800)),
          Text('${widget.emotion.label} · ${widget.intensity}/10', style: const TextStyle(fontSize: 12, fontWeight: FontWeight.w400)),
        ]),
        actions: [
          PopupMenuButton<String>(
            icon: const Icon(Icons.tune_rounded),
            tooltip: '대화 에이전트와 말씀 언어',
            onSelected: (value) {
              if (value.startsWith('agent:')) {
                setState(() => _agentMode = value.substring(6));
              } else if (value.startsWith('language:')) {
                setState(() => _verseLanguage = value.substring(9));
              }
            },
            itemBuilder: (_) => [
              const PopupMenuItem(value: 'agent:auto', child: Text('자동 통합 라우터')),
              const PopupMenuItem(value: 'agent:bible_ko', child: Text('한국어 성경 에이전트')),
              const PopupMenuItem(value: 'agent:bible_en', child: Text('영어 성경 에이전트')),
              const PopupMenuItem(value: 'agent:clinical_reflection', child: Text('임상심리 성찰 에이전트')),
              const PopupMenuItem(value: 'agent:integrated', child: Text('심리·신앙 통합 에이전트')),
              const PopupMenuDivider(),
              const PopupMenuItem(value: 'language:korean', child: Text('한국어 말씀')),
              const PopupMenuItem(value: 'language:english', child: Text('영어 말씀')),
              const PopupMenuItem(value: 'language:bilingual', child: Text('한국어·영어 함께')),
            ],
          ),
          IconButton(onPressed: () => _showCrisisSupport(false), icon: const Icon(Icons.health_and_safety_outlined), tooltip: '도움받기'),
        ],
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
                    if (_showSummary)
                      _summaryCard()
                    else if (_showActions)
                      _actionCard()
                    else if (_verse != null)
                      _verseCard(_verse!)
                    else if (_showVerseOffer)
                      _verseOffer()
                    else ...[
                      Center(child: Padding(padding: const EdgeInsets.only(bottom: 22), child: Text('마음을 살피는 조용한 대화 · ${_session.turnCount}/3', style: TextStyle(fontSize: 12, color: AppTheme.of(context).gold, fontWeight: FontWeight.w700, letterSpacing: 0.5)))),
                      ..._items.map(_bubble),
                      if (_busy) _typing(),
                    ],
                  ],
                ),
              ),
              if (!_session.isEnded && !_showSummary && !_showActions && _verse == null && !_showVerseOffer)
                Container(
                  padding: const EdgeInsets.fromLTRB(16, 12, 16, 14),
                  decoration: BoxDecoration(color: AppTheme.of(context).panel, border: Border(top: BorderSide(color: AppTheme.of(context).border))),
                  child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
                    if (_currentExamplePrompts.isNotEmpty)
                    Text(_session.turnCount == 0 ? '이렇게 시작해 보세요' : '이렇게 이어가도 좋아요', style: TextStyle(fontSize: 13, fontWeight: FontWeight.w700, color: AppTheme.of(context).muted)),
                    const SizedBox(height: 8),
                    LayoutBuilder(
                      builder: (context, constraints) => SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            for (final prompt in _currentExamplePrompts)
                              Padding(
                                padding: const EdgeInsets.only(right: 8),
                                child: SizedBox(
                                  width: (constraints.maxWidth - 16).clamp(160.0, 320.0),
                                  child: OutlinedButton.icon(
                                    onPressed: _busy || _session.isEnded ? null : () => _selectExample(prompt),
                                    icon: const Icon(Icons.touch_app_outlined, size: 18),
                                    label: Text(prompt, softWrap: true),
                                    style: OutlinedButton.styleFrom(
                                      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                                      alignment: Alignment.centerLeft,
                                      foregroundColor: AppTheme.of(context).green,
                                      side: BorderSide(color: AppTheme.of(context).border),
                                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radius)),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 3),
                    if (_isListening)
                      Padding(
                        padding: EdgeInsets.only(bottom: 8),
                        child: Row(mainAxisAlignment: MainAxisAlignment.end, children: [
                          SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 2, color: AppTheme.of(context).coral)),
                          SizedBox(width: 7),
                          Text('듣고 있어요 · 다시 누르면 멈춰요', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.of(context).coral)),
                        ]),
                      ),
                    Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
                      Expanded(child: TextField(controller: _controller, enabled: !_busy && !_session.isEnded, minLines: 1, maxLines: 4, textInputAction: TextInputAction.send, onSubmitted: (_) => _send(), decoration: const InputDecoration(hintText: '마음을 편하게 적어 주세요', filled: false))),
                      const SizedBox(width: 10),
                      IconButton.filled(
                        onPressed: _busy || _session.isEnded ? null : _send,
                        icon: const Icon(Icons.arrow_upward_rounded),
                        tooltip: '보내기',
                        style: IconButton.styleFrom(minimumSize: const Size(56, 56)),
                      ),
                      const SizedBox(width: 8),
                      Semantics(
                        button: true,
                        label: '음성으로 마음 말하기',
                        child: Material(
                          color: _isListening ? AppTheme.of(context).coral : AppTheme.of(context).accentFill,
                          elevation: 5,
                          shadowColor: _isListening ? AppTheme.of(context).coral : AppTheme.of(context).green,
                          shape: const CircleBorder(),
                          child: InkWell(
                            onTap: _busy || _session.isEnded ? null : _toggleVoiceInput,
                            customBorder: const CircleBorder(),
                            child: SizedBox(
                              width: 56,
                              height: 56,
                              child: Icon(_isListening ? Icons.stop_rounded : Icons.mic_rounded, color: Colors.white, size: 28),
                            ),
                          ),
                        ),
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
      decoration: BoxDecoration(color: item.fromUser ? AppTheme.of(context).accentFill : AppTheme.of(context).panel, border: item.fromUser ? null : Border.all(color: AppTheme.of(context).border), borderRadius: BorderRadius.only(topLeft: const Radius.circular(18), topRight: const Radius.circular(18), bottomLeft: Radius.circular(item.fromUser ? 18 : 5), bottomRight: Radius.circular(item.fromUser ? 5 : 18))),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Text(item.text, style: TextStyle(color: item.fromUser ? Colors.white : AppTheme.of(context).muted, height: 1.5)),
          if (item.question case final question?) ...[
            const SizedBox(height: 18),
            Container(
              padding: const EdgeInsets.all(16),
              decoration: BoxDecoration(
                color: AppTheme.of(context).sage,
                borderRadius: BorderRadius.circular(16),
                border: Border.all(color: AppTheme.of(context).green, width: 1.5),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(children: [
                    Icon(Icons.help_outline_rounded, size: 20, color: AppTheme.of(context).gold),
                    SizedBox(width: 8),
                    Expanded(child: Text('질문', style: TextStyle(color: AppTheme.of(context).gold, fontSize: 13, fontWeight: FontWeight.w800))),
                  ]),
                  const SizedBox(height: 10),
                  Text(_questionText(question), style: TextStyle(color: AppTheme.of(context).ink, fontSize: 17, fontWeight: FontWeight.w700, height: 1.5)),
                ],
              ),
            ),
          ],
        ],
      ),
    ),
  );

  Widget _typing() => Align(
    alignment: Alignment.centerLeft,
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Row(children: [
        const SizedBox(width: 22, height: 22,
          child: CircularProgressIndicator(strokeWidth: 2)),
        const SizedBox(width: 12),
        Expanded(child: Text(_responseDelayed
          ? '응답이 늦어지고 있어요. 잠시만 기다려 주세요.'
          : '답변을 기다리고 있어요.')),
      ]),
    ),
  );

  Widget _verseOffer() => _panel(
    children: [
      Icon(Icons.menu_book_rounded, color: AppTheme.of(context).green, size: 30),
      const SizedBox(height: 12),
      const Text('지금 마음을 위한 말씀을\n함께 읽어볼까요?', style: TextStyle(fontSize: 20, fontWeight: FontWeight.w800, height: 1.35), textAlign: TextAlign.center),
      const SizedBox(height: 18),
      FilledButton(onPressed: _acceptVerse, child: const Text('네, 읽어볼게요')),
      TextButton(onPressed: _declineVerse, child: const Text('지금은 괜찮아요')),
    ],
  );

  Widget _verseCard(BibleVerse verse) => _panel(children: [
    Row(mainAxisAlignment: MainAxisAlignment.center, children: [Icon(Icons.menu_book_outlined, size: 18, color: AppTheme.of(context).gold), SizedBox(width: 8), Text('오늘의 말씀', style: TextStyle(color: AppTheme.of(context).gold, fontWeight: FontWeight.w800, letterSpacing: 0.5))]),
    const SizedBox(height: 14),
    Text(verse.reference, style: TextStyle(fontSize: 24, fontWeight: FontWeight.w800, color: AppTheme.of(context).ink)),
    const SizedBox(height: 12),
    Text('“${verse.text}”', style: const TextStyle(fontSize: 17, height: 1.8, fontStyle: FontStyle.italic), textAlign: TextAlign.center),
    if (verse.englishText.isNotEmpty) ...[
      const SizedBox(height: 16),
      Text('English (NIV)', style: TextStyle(fontSize: 12, fontWeight: FontWeight.w700, color: AppTheme.of(context).muted)),
      const SizedBox(height: 6),
      Text(verse.englishText, style: TextStyle(fontSize: 15, height: 1.6, color: AppTheme.of(context).muted, fontStyle: FontStyle.italic), textAlign: TextAlign.center),
    ],
    if (verse.reflectionQuestion.isNotEmpty) ...[
      const SizedBox(height: 14),
      Text(_questionText(verse.reflectionQuestion), style: TextStyle(color: AppTheme.of(context).muted, height: 1.5, fontWeight: FontWeight.w600), textAlign: TextAlign.center),
    ],
    const SizedBox(height: 16),
    OutlinedButton.icon(
      onPressed: () => _toggleVerseSpeech(verse),
      icon: Icon(_isSpeaking ? Icons.stop_circle_outlined : Icons.volume_up_rounded),
      label: Text(_isSpeaking ? '말씀 낭독 멈추기' : '오늘의 말씀 음성으로 듣기'),
      style: OutlinedButton.styleFrom(
        minimumSize: const Size.fromHeight(52),
        foregroundColor: _isSpeaking ? AppTheme.of(context).coral : AppTheme.of(context).green,
        side: BorderSide(color: _isSpeaking ? AppTheme.of(context).coral : AppTheme.of(context).green),
        shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radius)),
      ),
    ),
    const SizedBox(height: 8),
    Text('※ 개발용 요약 문구이며 정식 성경 본문이 아닙니다.', style: TextStyle(fontSize: 10, color: AppTheme.of(context).muted)),
    const SizedBox(height: 20),
    FilledButton(onPressed: _continueAfterVerse, child: const Text('작은 실천 정하기')),
  ]);

  Widget _actionCard() => _panel(children: [
    const Text('지금 할 수 있는\n아주 작은 한 걸음', style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800, height: 1.35), textAlign: TextAlign.center),
    const SizedBox(height: 8),
    const Text('작은 행동을 하나 고른 뒤, 십자가에 빛을 모으며 잠시 쉬어 가요.', textAlign: TextAlign.center),
    const SizedBox(height: 16),
    ..._currentActions.map(
      (action) => Padding(
        padding: const EdgeInsets.only(bottom: 9),
        child: OutlinedButton(
          onPressed: () => _chooseAction(action),
          style: OutlinedButton.styleFrom(
            minimumSize: const Size.fromHeight(52),
            alignment: Alignment.centerLeft,
            shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(AppTheme.radius)),
          ),
          child: Text(action),
        ),
      ),
    ),
  ]);

  Widget _summaryCard() => _panel(children: [
    Icon(Icons.favorite_outline_rounded, color: AppTheme.of(context).coral, size: 34),
    const SizedBox(height: 12),
    const Text(_cardTitle, style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
    const SizedBox(height: 20),
    _summaryRow('내 마음', '${widget.emotion.label} · ${widget.intensity}/10'),
    if (_verse != null) _summaryRow('함께한 말씀', _verse!.reference),
    _summaryRow('작은 실천', _chosenAction ?? ''),
    const SizedBox(height: 20),
    Text(_cardClosingMessage, textAlign: TextAlign.center, style: TextStyle(height: 1.6, color: AppTheme.of(context).muted)),
    const SizedBox(height: 18),
    FilledButton.icon(
      onPressed: _savingCard ? null : _saveMindCard,
      icon: _savingCard
          ? const SizedBox(width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2))
          : const Icon(Icons.bookmark_add_outlined),
      label: const Text('마음 카드 저장하기'),
    ),
    const SizedBox(height: 8),
    OutlinedButton.icon(
      onPressed: _savingCard ? null : _shareMindCard,
      icon: const Icon(Icons.ios_share),
      label: const Text('마음 카드 공유하기'),
    ),
    const SizedBox(height: 8),
    const Text('공유하면 마음 카드도 이 기기에 함께 저장돼요.',
        textAlign: TextAlign.center),
    const SizedBox(height: 8),
    OutlinedButton(
      onPressed: () => Navigator.of(context).pop(),
      style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(52)),
      child: const Text('대화 마치기'),
    ),
  ]);

  Widget _summaryRow(String label, String value) => Padding(padding: const EdgeInsets.only(bottom: 13), child: Row(crossAxisAlignment: CrossAxisAlignment.start, children: [SizedBox(width: 100, child: Text(label, style: TextStyle(color: AppTheme.of(context).muted))), Expanded(child: Text(value, style: const TextStyle(fontWeight: FontWeight.w700)))]));

  Widget _panel({required List<Widget> children}) => Card(margin: const EdgeInsets.only(top: 12, bottom: 16), child: Padding(padding: const EdgeInsets.all(24), child: Column(children: children)));
}
