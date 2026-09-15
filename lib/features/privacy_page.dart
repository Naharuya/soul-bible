import 'package:flutter/material.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:url_launcher/url_launcher.dart';
import '../app/conversation_draft.dart';
import '../app/mind_card_store.dart';
import '../app/space_scaffold.dart';
import '../app/verse_history.dart';
import '../engagement/engagement_controller.dart';
import '../app/privacy_consent.dart';
import 'account_deletion_page.dart';

class PrivacyPage extends StatefulWidget {
  const PrivacyPage({super.key});
  @override
  State<PrivacyPage> createState() => _PrivacyPageState();
}

class _PrivacyPageState extends State<PrivacyPage> {
  bool _busy = false;
  Future<void> _delete(String name, Future<void> Function() action) async {
    if (_busy) return;
    final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
                title: Text('$name 삭제할까요?'),
                content: const Text(
                    '이 기기의 해당 기록만 삭제하며 되돌릴 수 없어요. 서버 회원 정보와 다른 앱 기록은 그대로 남아요.'),
                actions: [
                  TextButton(
                      onPressed: () => Navigator.pop(context, false),
                      child: const Text('취소')),
                  FilledButton(
                      onPressed: () => Navigator.pop(context, true),
                      child: const Text('삭제'))
                ]));
    if (confirmed != true || !mounted) return;
    setState(() => _busy = true);
    try {
      await action();
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('$name 삭제했어요.')));
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('삭제를 완료하지 못했어요. 다시 시도해 주세요.')));
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final engagement = EngagementScope.maybeOf(context);
    return SpaceScaffold(
        appBar: AppBar(title: const Text('개인정보와 기록 관리')),
        body: ListView(padding: const EdgeInsets.all(20), children: [
          const Text('어디에 저장되나요?',
              style: TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
          const ListTile(
              title: Text('이 기기'),
              subtitle: Text(
                  '저장한 마음카드에는 감정·강도·선택한 실천과 대화 요약이 포함될 수 있어요. 임시 문장은 저장을 선택했을 때만 보관하며, 전체 대화 원문을 자동 보관하지 않아요. 말씀·여정·실천 기록도 기기에 남아요.')),
          const ListTile(
              title: Text('서버와 외부 AI'),
              subtitle: Text(
                  '대화를 보내면 입력 문장과 필요한 최근 맥락이 서버로 전송돼요. 외부 AI 사용은 서버 설정에 따라 달라져요. 앱의 로컬 기록 삭제는 서버의 사용량 기록이나 회원 정보를 삭제하지 않아요.')),
          const ListTile(
              title: Text('음성과 의견'),
              subtitle: Text(
                  '음성 입력은 기기의 음성 인식 서비스를 사용하며 서비스 설정에 따라 네트워크를 사용할 수 있어요. 말씀 듣기는 기기 음성 엔진을 사용해요. 의견 보내기는 선택한 평가와 이유만 전송하며 대화 원문을 첨부하지 않아요.')),
          const Text(
              '공유 기기에서는 임시 저장을 끄고 사용 후 필요한 기록을 삭제해 주세요. 공유한 이미지와 다른 곳에 보관한 사본은 여기서 삭제되지 않아요.'),
          const SizedBox(height: 16),
          OutlinedButton(
              onPressed: _busy
                  ? null
                  : () => _delete('임시 문장을', () async {
                        await SharedPreferencesAsync()
                            .setBool(ConversationDraft.autoSaveKey, false);
                        await ConversationDraft.delete();
                      }),
              child: const Text('자동 복구 끄고 임시 문장 삭제')),
          OutlinedButton(
              onPressed: _busy
                  ? null
                  : () => _delete('마음카드와 관련 실천 기록을', MindCardStore().deleteAll),
              child: const Text('마음카드·실천 기록 전체 삭제')),
          if (engagement != null) ...[
            OutlinedButton(
                onPressed: _busy
                    ? null
                    : () => _delete('저장한 말씀을', engagement.clearSavedVerses),
                child: const Text('저장한 말씀 삭제')),
            OutlinedButton(
                onPressed: _busy
                    ? null
                    : () => _delete('7일 여정을', engagement.deleteJourney),
                child: const Text('7일 여정 기록 삭제')),
          ],
          OutlinedButton(
              onPressed: _busy
                  ? null
                  : () => _delete(
                      '최근 말씀 선택 기록을',
                      () => SharedPreferencesAsync()
                          .remove(VerseHistory.storageKey)),
              child: const Text('최근 말씀 선택 기록 삭제')),
          const SizedBox(height: 20),
          const Text('회원 정보와 계정',
              style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
          const Text('신규 회원정보 등록은 중단되어 있어요. 이전에 등록한 회원정보는 본인 확인 후 삭제 요청할 수 있어요. 기기 기록 삭제와 서버 회원정보 삭제는 별도예요.'),
          OutlinedButton(onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const AccountDeletionPage())),
            child: const Text('기존 회원정보 삭제 요청')),
          OutlinedButton(onPressed: () async {
            try {
              await PrivacyConsent.revoke();
              if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('대화 전송 동의를 철회했어요. 이미 전송된 정보의 삭제는 별도 요청이 필요해요.')));
            } catch (_) {
              if (context.mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('동의 철회를 저장하지 못했어요. 다시 시도해 주세요.')));
            }
          }, child: const Text('서버·외부 AI 전송 동의 철회')),
          TextButton(
              onPressed: () async {
                try {
                  if (!await launchUrl(
                      Uri.parse('https://onaria.ai.kr/privacy'),
                      mode: LaunchMode.externalApplication)) {
                    throw StateError('unavailable');
                  }
                } catch (_) {
                  if (context.mounted) {
                    ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('개인정보 안내를 열지 못했어요.')));
                  }
                }
              },
              child: const Text('공식 개인정보 안내 보기')),
        ]));
  }
}
