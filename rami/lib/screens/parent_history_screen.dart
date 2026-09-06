import 'package:flutter/material.dart';

import '../services/rami_repository.dart';

class ParentHistoryScreen extends StatefulWidget {
  const ParentHistoryScreen({super.key, required this.firebaseReady});

  final bool firebaseReady;

  @override
  State<ParentHistoryScreen> createState() => _ParentHistoryScreenState();
}

class _ParentHistoryScreenState extends State<ParentHistoryScreen> {
  @override
  Widget build(BuildContext context) {
    final items = RamiRepository.instance.interactions;
    return Scaffold(
      appBar: AppBar(title: const Text('부모의 라미')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          Card(
            child: Padding(
              padding: const EdgeInsets.all(18),
              child: Row(
                children: [
                  Icon(widget.firebaseReady ? Icons.cloud_done : Icons.phone_android),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      widget.firebaseReady
                          ? 'Firebase 연결됨'
                          : '로컬 저장 모드 · 앱을 다시 열어도 기록이 남아요',
                    ),
                  ),
                ],
              ),
            ),
          ),
          const SizedBox(height: 14),
          Text('아이의 선택 기록', style: Theme.of(context).textTheme.titleLarge),
          const SizedBox(height: 10),
          if (items.isEmpty)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 40),
              child: Center(child: Text('아직 기록이 없어요.')),
            ),
          for (final item in items)
            ListTile(
              leading: const Text('🐘', style: TextStyle(fontSize: 30)),
              title: Text(_label(item.action)),
              subtitle: Text(item.createdAt.toLocal().toString().substring(0, 16)),
            ),
          const SizedBox(height: 24),
          OutlinedButton.icon(
            onPressed: () async {
              await RamiRepository.instance.clearLocalDemoData();
              if (mounted) setState(() {});
            },
            icon: const Icon(Icons.delete_outline),
            label: const Text('테스트 기록 초기화'),
          ),
        ],
      ),
    );
  }

  static String _label(String action) {
    return switch (action) {
      'tag' => '코끼리 카드를 태그했어요',
      'choose_record' => '소리내기를 골랐어요',
      'choose_real_sound' => '코끼리 소리 듣기를 골랐어요',
      'choose_my_sound' => '내 소리 듣기를 골랐어요',
      'record_saved' => '새로운 목소리를 만들었어요',
      'play_my_sound' => '내 목소리를 다시 들었어요',
      _ => action,
    };
  }
}
