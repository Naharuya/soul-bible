import 'package:flutter/material.dart';

import 'nfc_wait_screen.dart';
import 'parent_history_screen.dart';

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key, required this.firebaseReady});

  final bool firebaseReady;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              const Text('🌱', style: TextStyle(fontSize: 84)),
              const SizedBox(height: 16),
              Text('라미', style: Theme.of(context).textTheme.headlineMedium?.copyWith(fontSize: 46)),
              const SizedBox(height: 12),
              Text(
                '그림으로 고르고\n놀이로 표현해요',
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge?.copyWith(height: 1.5),
              ),
              const Spacer(),
              SizedBox(
                width: double.infinity,
                height: 74,
                child: FilledButton(
                  onPressed: () => Navigator.of(context).push(
                    MaterialPageRoute(builder: (_) => const NfcWaitScreen()),
                  ),
                  child: const Text('아이 모드', style: TextStyle(fontSize: 22, fontWeight: FontWeight.w800)),
                ),
              ),
              const SizedBox(height: 12),
              TextButton.icon(
                onPressed: () => Navigator.of(context).push(
                  MaterialPageRoute(builder: (_) => ParentHistoryScreen(firebaseReady: firebaseReady)),
                ),
                icon: const Icon(Icons.lock_outline),
                label: const Text('부모 모드'),
              ),
              const SizedBox(height: 8),
            ],
          ),
        ),
      ),
    );
  }
}
