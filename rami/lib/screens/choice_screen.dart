import 'package:flutter/material.dart';

import '../models/rami_card.dart';
import '../services/audio_service.dart';
import '../services/rami_repository.dart';
import '../widgets/rami_choice_card.dart';
import 'record_screen.dart';

class ChoiceScreen extends StatefulWidget {
  const ChoiceScreen({super.key, required this.card});

  final RamiCard card;

  @override
  State<ChoiceScreen> createState() => _ChoiceScreenState();
}

class _ChoiceScreenState extends State<ChoiceScreen> {
  final _audio = RamiAudioService();
  bool _playingOriginal = false;

  @override
  void dispose() {
    _audio.dispose();
    super.dispose();
  }

  Future<void> _playOriginal() async {
    if (_playingOriginal) return;
    setState(() => _playingOriginal = true);
    RamiRepository.instance.addInteraction(widget.card.id, 'choose_real_sound');
    try {
      await _audio.playAsset(widget.card.realSoundAsset);
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('원음 파일을 준비 중이에요.')),
        );
      }
    } finally {
      if (mounted) setState(() => _playingOriginal = false);
    }
  }

  void _openRecording() {
    RamiRepository.instance.addInteraction(widget.card.id, 'choose_record');
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => RecordScreen(card: widget.card)),
    );
  }

  void _openSavedRecording() {
    RamiRepository.instance.addInteraction(widget.card.id, 'choose_my_sound');
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(
        builder: (_) => RecordScreen(card: widget.card, playbackOnly: true),
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final hasRecording = RamiRepository.instance.hasRecording;
    return Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.fromLTRB(18, 10, 18, 24),
          child: Column(
            children: [
              Text(widget.card.emoji, style: const TextStyle(fontSize: 88)),
              const SizedBox(height: 8),
              Text('어느 걸 해볼까?', style: Theme.of(context).textTheme.headlineMedium),
              const Spacer(),
              Row(
                children: [
                  RamiChoiceCard(
                    emoji: '🎤',
                    label: hasRecording ? '새로 만들기' : '내가 소리내기',
                    onTap: _openRecording,
                  ),
                  const SizedBox(width: 14),
                  RamiChoiceCard(
                    emoji: hasRecording ? '❤️' : (_playingOriginal ? '🔊' : '👂'),
                    label: hasRecording ? '내 소리 듣기' : widget.card.realSoundLabel,
                    onTap: hasRecording ? _openSavedRecording : _playOriginal,
                  ),
                ],
              ),
              const Spacer(),
              Text(
                hasRecording ? '전에 만든 소리가 기다리고 있어요 ❤️' : '두 그림 중 마음 가는 쪽을 톡!',
                textAlign: TextAlign.center,
                style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w700),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
