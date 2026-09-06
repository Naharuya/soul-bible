import 'package:flutter/material.dart';

import '../models/rami_card.dart';
import '../services/rami_repository.dart';
import '../widgets/rami_choice_card.dart';
import 'record_screen.dart';

class ChoiceScreen extends StatelessWidget {
  const ChoiceScreen({super.key, required this.card});

  final RamiCard card;

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
              Text(card.emoji, style: const TextStyle(fontSize: 88)),
              const SizedBox(height: 8),
              Text('어느 걸 해볼까?', style: Theme.of(context).textTheme.headlineMedium),
              const Spacer(),
              Row(
                children: [
                  RamiChoiceCard(
                    emoji: '🎤',
                    label: hasRecording ? '새로 만들기' : '내가 소리내기',
                    onTap: () {
                      RamiRepository.instance.addInteraction(card.id, 'choose_record');
                      Navigator.of(context).pushReplacement(
                        MaterialPageRoute(builder: (_) => RecordScreen(card: card)),
                      );
                    },
                  ),
                  const SizedBox(width: 14),
                  RamiChoiceCard(
                    emoji: hasRecording ? '❤️' : '👂',
                    label: hasRecording ? '내 소리 듣기' : card.realSoundLabel,
                    onTap: () {
                      RamiRepository.instance.addInteraction(
                        card.id,
                        hasRecording ? 'choose_my_sound' : 'choose_real_sound',
                      );
                      if (hasRecording) {
                        Navigator.of(context).pushReplacement(
                          MaterialPageRoute(
                            builder: (_) => RecordScreen(card: card, playbackOnly: true),
                          ),
                        );
                        return;
                      }
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(
                          content: Text('코끼리 원음은 실물 콘텐츠 패키지에서 연결합니다.'),
                        ),
                      );
                    },
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
