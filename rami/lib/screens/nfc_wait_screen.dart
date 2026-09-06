import 'package:flutter/material.dart';

import '../models/rami_card.dart';
import '../services/nfc_service.dart';
import 'content_screen.dart';

class NfcWaitScreen extends StatefulWidget {
  const NfcWaitScreen({super.key});

  @override
  State<NfcWaitScreen> createState() => _NfcWaitScreenState();
}

class _NfcWaitScreenState extends State<NfcWaitScreen> {
  final _nfc = NfcService();
  bool _scanning = false;
  String _message = '그림 카드를 골라 휴대폰에 톡!';
  String? _debugValue;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) => _scan());
  }

  Future<void> _scan() async {
    if (_scanning) return;
    setState(() {
      _scanning = true;
      _message = '카드를 기다리고 있어요…';
      _debugValue = null;
    });

    final result = await _nfc.scanOnce();
    if (!mounted) return;

    if (result == null) {
      setState(() {
        _scanning = false;
        _message = '카드를 찾지 못했어요. 다시 톡!';
      });
      return;
    }

    if (!result.isSuccess) {
      setState(() {
        _scanning = false;
        _message = result.error ?? 'NFC 정보를 읽지 못했어요.';
      });
      return;
    }

    final value = result.ndefValue!;
    final card = RamiCard.fromNdefValue(value);
    if (card == null) {
      setState(() {
        _scanning = false;
        _message = '아직 등록되지 않은 라미 태그예요.';
        _debugValue = value;
      });
      return;
    }

    _openCard(card);
  }

  void _openCard(RamiCard card) {
    _nfc.cancel();
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => ContentScreen(card: card)),
    );
  }

  @override
  void dispose() {
    _nfc.cancel();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              TweenAnimationBuilder<double>(
                tween: Tween(begin: .92, end: 1),
                duration: const Duration(milliseconds: 800),
                curve: Curves.easeOutBack,
                builder: (_, value, child) => Transform.scale(scale: value, child: child),
                child: const Text('🪪  📱', style: TextStyle(fontSize: 78)),
              ),
              const SizedBox(height: 30),
              Text('카드를 대주세요', style: Theme.of(context).textTheme.headlineMedium),
              const SizedBox(height: 14),
              Text(
                _message,
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.bodyLarge,
              ),
              if (_debugValue != null) ...[
                const SizedBox(height: 10),
                Text(
                  '읽은 값: $_debugValue',
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.bodySmall,
                ),
              ],
              const Spacer(),
              if (!_scanning)
                SizedBox(
                  width: double.infinity,
                  height: 68,
                  child: FilledButton.icon(
                    onPressed: _scan,
                    icon: const Icon(Icons.nfc, size: 30),
                    label: const Text('다시 기다리기', style: TextStyle(fontSize: 20)),
                  ),
                ),
              const SizedBox(height: 8),
              Wrap(
                alignment: WrapAlignment.center,
                spacing: 4,
                children: [
                  TextButton(onPressed: () => _openCard(RamiCard.elephant), child: const Text('개발용 🐘')),
                  TextButton(onPressed: () => _openCard(RamiCard.dog), child: const Text('개발용 🐶')),
                  TextButton(onPressed: () => _openCard(RamiCard.car), child: const Text('개발용 🚗')),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}
