import 'package:flutter/material.dart';

import '../models/rami_card.dart';
import '../services/audio_service.dart';
import '../services/rami_repository.dart';
import 'nfc_wait_screen.dart';

class RecordScreen extends StatefulWidget {
  const RecordScreen({super.key, required this.card, this.playbackOnly = false});

  final RamiCard card;
  final bool playbackOnly;

  @override
  State<RecordScreen> createState() => _RecordScreenState();
}

class _RecordScreenState extends State<RecordScreen> {
  final _audio = RamiAudioService();
  bool _recording = false;
  bool _busy = false;
  String? _message;

  Future<void> _toggleRecord() async {
    if (_busy) return;
    if (!_recording) {
      final ok = await _audio.startRecording();
      if (!mounted) return;
      setState(() {
        _recording = ok;
        _message = ok ? widget.card.recordPrompt : '마이크를 사용할 수 없어요.';
      });
      return;
    }

    setState(() => _busy = true);
    final path = await _audio.stopRecording();
    if (!mounted) return;
    if (path != null) {
      await RamiRepository.instance.saveRecordingPath(path, widget.card.id);
    }
    if (!mounted) return;
    setState(() {
      _recording = false;
      _busy = false;
      _message = path == null ? '한 번 더 해볼까?' : '우와! 내 소리가 생겼어!';
    });
  }

  Future<void> _play() async {
    final path = RamiRepository.instance.lastRecordingPath;
    if (path == null || _busy) return;
    setState(() => _busy = true);
    try {
      await _audio.playFile(path);
      RamiRepository.instance.addInteraction(widget.card.id, 'play_my_sound');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  void _meetAgain() {
    Navigator.of(context).pushAndRemoveUntil(
      MaterialPageRoute(builder: (_) => const NfcWaitScreen()),
      (route) => route.isFirst,
    );
  }

  @override
  void dispose() {
    _audio.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final hasRecording = RamiRepository.instance.hasRecording;
    return Scaffold(
      appBar: AppBar(backgroundColor: Colors.transparent),
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            children: [
              const Spacer(),
              Text(widget.card.emoji, style: const TextStyle(fontSize: 116)),
              const SizedBox(height: 18),
              Text(
                widget.playbackOnly
                    ? '내가 만든 소리야!'
                    : (_message ?? widget.card.recordPrompt),
                textAlign: TextAlign.center,
                style: Theme.of(context).textTheme.headlineMedium,
              ),
              const Spacer(),
              if (!widget.playbackOnly)
                SizedBox(
                  width: 160,
                  height: 160,
                  child: FilledButton(
                    style: FilledButton.styleFrom(shape: const CircleBorder()),
                    onPressed: _busy ? null : _toggleRecord,
                    child: Text(_recording ? '■' : '🎤', style: const TextStyle(fontSize: 62)),
                  ),
                ),
              if (widget.playbackOnly || hasRecording) ...[
                const SizedBox(height: 20),
                SizedBox(
                  width: double.infinity,
                  height: 72,
                  child: FilledButton.tonalIcon(
                    onPressed: _busy ? null : _play,
                    icon: const Icon(Icons.play_arrow_rounded, size: 38),
                    label: const Text(
                      '내 소리 듣기',
                      style: TextStyle(fontSize: 21, fontWeight: FontWeight.w800),
                    ),
                  ),
                ),
              ],
              const SizedBox(height: 16),
              SizedBox(
                width: double.infinity,
                height: 64,
                child: OutlinedButton.icon(
                  onPressed: _recording ? null : _meetAgain,
                  icon: const Icon(Icons.nfc_rounded, size: 30),
                  label: const Text(
                    '카드 다시 만나기',
                    style: TextStyle(fontSize: 19, fontWeight: FontWeight.w800),
                  ),
                ),
              ),
              const SizedBox(height: 12),
            ],
          ),
        ),
      ),
    );
  }
}
