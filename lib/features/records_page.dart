import 'package:flutter/material.dart';
import '../app/space_scaffold.dart';
import '../engagement/engagement_page.dart';
import '../engagement/journey/journey_page.dart';
import 'growth_page.dart';
import 'saved_cards_page.dart';
import 'seven_day_history_page.dart';
import 'privacy_page.dart';
import 'feedback_page.dart';

class RecordsPage extends StatelessWidget {
  const RecordsPage({super.key});
  @override
  Widget build(BuildContext context) => SpaceScaffold(
        appBar: AppBar(title: const Text('내 기록')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          const Text('내가 쌓아 온 마음의 기록',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold)),
          const SizedBox(height: 12),
          const Text(
              '기록은 이 기기에 보관돼요. 앱을 삭제하거나 기기를 바꾸기 전에는 필요한 카드를 공유해 보관해 주세요.'),
          const SizedBox(height: 20),
          for (final entry in <(String, String, IconData, Widget)>[
            (
              '최근 7일 마음 기록',
              '감정·강도·선택한 작은 행동',
              Icons.history,
              const SevenDayHistoryPage()
            ),
            (
              '저장된 카드',
              '마음 카드 보기·공유·삭제',
              Icons.bookmarks_outlined,
              const SavedCardsPage()
            ),
            (
              '말씀과 작은 기록',
              '오늘의 말씀과 저장한 말씀',
              Icons.menu_book_outlined,
              const EngagementPage()
            ),
            (
              '7일 마음의 여정',
              '진행하던 여정 이어가기',
              Icons.route_outlined,
              const JourneyPage()
            ),
            (
              '작은 성장 기록',
              '내가 선택했던 작은 행동 돌아보기',
              Icons.spa_outlined,
              const GrowthPage()
            ),
            (
              '개인정보와 기록 관리',
              '보관 범위 확인·기기 기록 삭제',
              Icons.privacy_tip_outlined,
              const PrivacyPage()
            ),
            (
              '개선 의견 보내기',
              '대화 원문 없이 선택한 의견만 보내요',
              Icons.feedback_outlined,
              const FeedbackPage()
            ),
          ])
            Card(
                child: ListTile(
              leading: Icon(entry.$3),
              title: Text(entry.$1),
              subtitle: Text(entry.$2),
              trailing: const Icon(Icons.chevron_right),
              onTap: () => Navigator.of(context)
                  .push(MaterialPageRoute(builder: (_) => entry.$4)),
            )),
        ]),
      );
}
