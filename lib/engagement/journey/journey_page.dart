import 'dart:async';
import 'package:flutter/material.dart';
import '../../app/space_scaffold.dart';
import '../engagement_controller.dart';
import '../sharing/share_card.dart';
import '../sharing/share_preview_page.dart';
import 'journey.dart';

class JourneyPage extends StatefulWidget {
  const JourneyPage({super.key});
  @override
  State<JourneyPage> createState() => _JourneyPageState();
}

class _JourneyPageState extends State<JourneyPage> with WidgetsBindingObserver {
  final _note = TextEditingController();
  String? _mood;
  bool _busy = false;
  Timer? _midnight;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    _watchDate();
  }

  void _watchDate() {
    _midnight?.cancel();
    final now = EngagementScope.of(context).clock();
    final next = DateTime(now.year, now.month, now.day + 1);
    _midnight = Timer(next.difference(now), () {
      if (!mounted) return;
      setState(() {});
      _watchDate();
    });
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed && mounted) {
      setState(() {});
      _watchDate();
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _midnight?.cancel();
    _note.dispose();
    super.dispose();
  }

  Future<void> _run(Future<void> Function() action,
      {bool clear = false}) async {
    if (_busy) return;
    setState(() => _busy = true);
    try {
      await action();
      if (clear && mounted) {
        _note.clear();
        _mood = null;
        FocusScope.of(context).unfocus();
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(const SnackBar(
          content: Text('기록을 변경하지 못했어요. 입력한 내용은 그대로 있어요. 다시 시도해 주세요.'),
        ));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _delete(EngagementController controller) async {
    if (_busy) return;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
              title: const Text('여정 기록을 삭제할까요?'),
              content: const Text(
                  '이 여정에 적은 마음과 한 줄 기록을 모두 삭제해요. 복구할 수 없어요. 저장한 말씀과 작은 발자취는 남아요.'),
              actions: [
                TextButton(
                    onPressed: () => Navigator.pop(context, false),
                    child: const Text('취소')),
                FilledButton(
                    onPressed: () => Navigator.pop(context, true),
                    child: const Text('삭제')),
              ],
            ));
    if (confirmed == true && mounted) {
      await _run(controller.deleteJourney, clear: true);
    }
  }

  @override
  Widget build(BuildContext context) {
    final controller = EngagementScope.of(context);
    final journey = controller.journey;
    final verse =
        journey == null ? null : controller.journeyVerse(journey.currentDay);
    final canComplete = journey?.canComplete(controller.clock()) == true;
    return PopScope(
        canPop: !_busy,
        child: SpaceScaffold(
          appBar: AppBar(title: const Text('7일 마음의 여정')),
          body: controller.error != null
              ? Center(child: Text(controller.error!))
              : !controller.ready
                  ? const Center(child: CircularProgressIndicator())
                  : ListView(padding: const EdgeInsets.all(20), children: [
                      const Text('하루에 한 번, 나를 돌보는 시간',
                          style: TextStyle(
                              fontSize: 24, fontWeight: FontWeight.bold)),
                      const SizedBox(height: 12),
                      const Text(
                          '연속으로 하지 않아도 괜찮아요. 쉬어 간 날에도 기록은 남고, 다음에 이어갈 수 있어요. 한 줄 기록은 이 기기에만 저장해요.'),
                      const SizedBox(height: 20),
                      if (journey == null)
                        FilledButton(
                            onPressed: _busy || controller.catalog.isEmpty
                                ? null
                                : () => _run(controller.startJourney),
                            child: const Text('여정 시작하기'))
                      else ...[
                        Text('${journey.checkins.length} / 7일 기록',
                            style:
                                const TextStyle(fontWeight: FontWeight.bold)),
                        const SizedBox(height: 8),
                        LinearProgressIndicator(
                            value: journey.checkins.length / 7,
                            semanticsLabel:
                                '7일 중 ${journey.checkins.length}일 완료'),
                        const SizedBox(height: 20),
                        if (journey.complete) ...[
                          const Text('일곱 번의 돌봄을 함께했어요.',
                              style: TextStyle(
                                  fontSize: 22, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 12),
                          FilledButton.icon(
                              onPressed: _busy
                                  ? null
                                  : () => Navigator.of(context)
                                          .push(MaterialPageRoute<void>(
                                        builder: (_) => SharePreviewPage(
                                            content: ShareCardContent.journey(
                                          controller.catalog.where((verse) =>
                                              journey.savedVerseIds
                                                  .contains(verse.id)),
                                        )),
                                      )),
                              icon: const Icon(Icons.ios_share),
                              label: const Text('여정 카드 미리보기')),
                        ] else if (!canComplete)
                          const Text('오늘의 기록을 남겼어요. 다음 날 편할 때 이어가요.')
                        else if (verse == null)
                          const Text('오늘의 말씀을 불러오지 못했어요. 잠시 후 다시 열어 주세요.')
                        else ...[
                          Text('${journey.currentDay}일째 · ${verse.reference}',
                              style: const TextStyle(
                                  fontSize: 20, fontWeight: FontWeight.bold)),
                          const SizedBox(height: 12),
                          Text(verse.text),
                          const SizedBox(height: 12),
                          Text(verse.reflectionQuestion),
                          const SizedBox(height: 16),
                          Text(
                              '오늘의 작은 실천: ${journeyActions[journey.currentDay - 1]}'),
                          const SizedBox(height: 20),
                          const Text('지금의 마음'),
                          Wrap(spacing: 8, children: [
                            for (final mood in journeyMoods)
                              ChoiceChip(
                                  label: Text(mood),
                                  selected: _mood == mood,
                                  onSelected: _busy
                                      ? null
                                      : (_) => setState(() => _mood = mood)),
                          ]),
                          const SizedBox(height: 12),
                          TextField(
                              key: const ValueKey('journey-note'),
                              controller: _note,
                              enabled: !_busy,
                              minLines: 2,
                              maxLines: 4,
                              maxLength: 120,
                              decoration: const InputDecoration(
                                  labelText: '오늘의 한 줄',
                                  hintText: '지금 기억하고 싶은 작은 순간을 적어 주세요.'),
                              onChanged: (_) => setState(() {})),
                          FilledButton(
                              onPressed: _busy ||
                                      _mood == null ||
                                      _note.text.trim().isEmpty
                                  ? null
                                  : () => _run(
                                      () => controller.finishJourneyDay(
                                          _mood!, _note.text),
                                      clear: true),
                              child: const Text('오늘의 기록 남기기')),
                        ],
                        const SizedBox(height: 24),
                        for (final checkin in journey.checkins.reversed)
                          Card(
                              child: ExpansionTile(
                            title: Text('${checkin.day}일째 · ${checkin.date}'),
                            subtitle: Text(checkin.mood),
                            childrenPadding: const EdgeInsets.all(16),
                            expandedCrossAxisAlignment:
                                CrossAxisAlignment.start,
                            children: [
                              Text(checkin.note),
                              const SizedBox(height: 8),
                              Text(checkin.action)
                            ],
                          )),
                        const SizedBox(height: 16),
                        TextButton.icon(
                            onPressed: _busy ? null : () => _delete(controller),
                            icon: const Icon(Icons.delete_outline),
                            label: const Text('여정 기록 삭제')),
                      ],
                      if (_busy)
                        const Padding(
                            padding: EdgeInsets.all(16),
                            child: Center(child: CircularProgressIndicator())),
                    ]),
        ));
  }
}
