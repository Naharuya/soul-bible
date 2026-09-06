import 'package:flutter/material.dart';

import '../models/rami_card.dart';
import '../services/rami_repository.dart';
import 'choice_screen.dart';

class ContentScreen extends StatefulWidget {
  const ContentScreen({super.key, required this.card});

  final RamiCard card;

  @override
  State<ContentScreen> createState() => _ContentScreenState();
}

class _ContentScreenState extends State<ContentScreen> {
  bool _ready = false;

  @override
  void initState() {
    super.initState();
    RamiRepository.instance.addInteraction(widget.card.id, 'tag');
    Future<void>.delayed(const Duration(milliseconds: 900), () {
      if (mounted) setState(() => _ready = true);
    });
    Future<void>.delayed(const Duration(milliseconds: 1800), _goToChoices);
  }

  void _goToChoices() {
    if (!mounted) return;
    Navigator.of(context).pushReplacement(
      MaterialPageRoute(builder: (_) => ChoiceScreen(card: widget.card)),
    );
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: SafeArea(
        child: InkWell(
          onTap: _ready ? _goToChoices : null,
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                AnimatedScale(
                  scale: _ready ? 1.08 : .8,
                  duration: const Duration(milliseconds: 700),
                  curve: Curves.easeOutBack,
                  child: Text(widget.card.emoji, style: const TextStyle(fontSize: 170)),
                ),
                const SizedBox(height: 24),
                Text(
                  widget.card.intro,
                  textAlign: TextAlign.center,
                  style: Theme.of(context).textTheme.headlineMedium,
                ),
                const SizedBox(height: 14),
                const Text('✨', style: TextStyle(fontSize: 52)),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
