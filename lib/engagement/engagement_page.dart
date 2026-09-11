import 'package:flutter/material.dart';
import '../app/space_scaffold.dart';
import '../src/verses/verse_models.dart';
import 'engagement_controller.dart';
import 'journey/journey_page.dart';
import 'mini_games/cross_light/cross_light_page.dart';
import 'sharing/share_card.dart';
import 'sharing/share_preview_page.dart';

class EngagementPage extends StatelessWidget {
  const EngagementPage({super.key, this.savedOnly = false});
  final bool savedOnly;

  @override
  Widget build(BuildContext context) {
    final controller = EngagementScope.of(context);
    final today = controller.todayVerse;
    return SpaceScaffold(
      appBar: AppBar(title: Text(savedOnly ? '저장한 말씀' : '말씀과 작은 기록')),
      body: controller.error != null
          ? Center(child: Text(controller.error!))
          : !controller.ready
              ? const Center(child: CircularProgressIndicator())
              : ListView(padding: const EdgeInsets.all(20), children: [
                  if (!savedOnly)
                    ListTile(
                      leading: const Icon(Icons.light_mode_outlined),
                      title: const Text('십자가 빛 모으기'),
                      subtitle: const Text('여섯 단어로 완성하는 작은 십자가'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                              builder: (_) => const CrossLightPage())),
                    ),
                  if (!savedOnly)
                    ListTile(
                      leading: const Icon(Icons.route_outlined),
                      title: const Text('7일 마음의 여정'),
                      subtitle: Text(controller.journey == null
                          ? '편할 때 시작하고, 하루씩 이어가요.'
                          : '${controller.journey!.checkins.length} / 7일 기록'),
                      trailing: const Icon(Icons.chevron_right),
                      onTap: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                              builder: (_) => const JourneyPage())),
                    ),
                  if (!savedOnly && today != null) ...[
                    const Text('오늘의 말씀',
                        style: TextStyle(
                            fontSize: 22, fontWeight: FontWeight.bold)),
                    _verseCard(context, controller, today),
                    const SizedBox(height: 24),
                  ],
                  const Text('저장한 말씀',
                      style:
                          TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  if (controller.savedVerseIds.isEmpty)
                    const Padding(
                        padding: EdgeInsets.symmetric(vertical: 16),
                        child: Text('곁에 두고 싶은 말씀을 저장해 보세요.')),
                  for (final verse in controller.catalog
                      .where((v) => controller.savedVerseIds.contains(v.id)))
                    _verseCard(context, controller, verse),
                  if (!savedOnly) ...[
                    const SizedBox(height: 24),
                    const Text('작은 발자취',
                        style: TextStyle(
                            fontSize: 22, fontWeight: FontWeight.bold)),
                    if (controller.achievements.isEmpty)
                      const Text('나를 돌보는 순간들이 이곳에 남아요.'),
                    for (final achievement in controller.achievements)
                      ListTile(
                          leading: const Icon(Icons.auto_awesome),
                          title: Text(achievement.label)),
                    for (final egg in controller.eggs)
                      ListTile(
                          leading: const Icon(Icons.light_mode_outlined),
                          title: Text(egg.label),
                          subtitle: Text(egg.message)),
                  ],
                ]),
    );
  }

  Widget _verseCard(
      BuildContext context, EngagementController controller, BibleVerse verse) {
    final saved = controller.savedVerseIds.contains(verse.id);
    return Card(
        child: Padding(
            padding: const EdgeInsets.all(16),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(verse.reference,
                    style: const TextStyle(fontWeight: FontWeight.bold)),
                const SizedBox(height: 8),
                Text(verse.text),
                const SizedBox(height: 8),
                Text(verse.reflectionQuestion),
                Wrap(spacing: 8, children: [
                  TextButton.icon(
                    icon: Icon(saved ? Icons.bookmark : Icons.bookmark_border),
                    label: Text(saved ? '저장 해제' : '말씀 저장'),
                    onPressed: () async {
                      try {
                        if (saved) {
                          await controller.removeVerse(verse.id);
                        } else {
                          await controller.saveVerse(verse);
                        }
                      } catch (_) {
                        if (context.mounted) {
                          ScaffoldMessenger.of(context).showSnackBar(
                              const SnackBar(
                                  content: Text('저장하지 못했어요. 다시 시도해 주세요.')));
                        }
                      }
                    },
                  ),
                  TextButton.icon(
                      icon: const Icon(Icons.ios_share),
                      label: const Text('공유 미리보기'),
                      onPressed: () => Navigator.of(context).push(
                          MaterialPageRoute<void>(
                              builder: (_) => SharePreviewPage(
                                  content: ShareCardContent.verse(verse))))),
                ]),
              ],
            )));
  }
}
