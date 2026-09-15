import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../app/api_config.dart';
import '../app/space_scaffold.dart';
import '../engagement/engagement_controller.dart';
import '../engagement/safety_notice.dart';
import 'content_report_page.dart';

class FeedbackPage extends StatefulWidget {
  const FeedbackPage({super.key, this.client, this.responseText});
  final String? responseText;
  final http.Client? client;
  @override
  State<FeedbackPage> createState() => _FeedbackPageState();
}

class _FeedbackPageState extends State<FeedbackPage> {
  late final _client = widget.client ?? http.Client();
  String? _id, _lastSelection;
  String? _rating, _reason;
  String? _error;
  bool _busy = false, _sent = false;
  static const _reasons = {
    'empathy': '공감하는 표현',
    'relevance': '질문과 답변의 연결',
    'scripture': '말씀 연결',
    'voice': '음성 듣기·입력',
    'usability': '화면과 사용 방법',
    'other': '그 밖의 경험',
  };
  @override
  void dispose() {
    if (widget.client == null) _client.close();
    super.dispose();
  }

  Future<void> _send() async {
    if (_busy ||
        _sent ||
        _rating == null ||
        _reason == null ||
        EngagementScope.maybeOf(context)?.safetyBlocked == true) {
      return;
    }
    setState(() {
      _busy = true;
      _error = null;
    });
    try {
      final selection = '$_rating:$_reason';
      if (_lastSelection != selection) {
        _id = List.generate(
            16,
            (_) => Random.secure()
                .nextInt(256)
                .toRadixString(16)
                .padLeft(2, '0')).join();
        _lastSelection = selection;
      }
      final endpoint = ApiConfig.baseUrl?.resolve('/v1/feedback');
      if (endpoint == null) throw StateError('unavailable');
      ApiConfig.requireSecureEndpoint(endpoint);
      final request = http.Request('POST', endpoint)
        ..followRedirects = false
        ..headers.addAll({
          'Content-Type': 'application/json',
          if (ApiConfig.appToken.isNotEmpty)
            'Authorization': 'Bearer ${ApiConfig.appToken}'
        })
        ..body = jsonEncode(
            {'submissionId': _id, 'rating': _rating, 'reason': _reason});
      final response = await _client
          .send(request)
          .then(http.Response.fromStream)
          .timeout(const Duration(seconds: 12));
      if (response.statusCode != 202 ||
          jsonDecode(response.body)['accepted'] != true) {
        throw StateError('unavailable');
      }
      if (mounted) setState(() => _sent = true);
    } catch (_) {
      if (mounted) {
        setState(() => _error = '의견을 보내지 못했어요. 선택은 유지했으니 잠시 후 다시 시도해 주세요.');
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) => SpaceScaffold(
        appBar: AppBar(title: const Text('개선 의견 보내기')),
        body: EngagementScope.maybeOf(context)?.safetyBlocked == true
            ? const SafetyNotice()
            : ListView(padding: const EdgeInsets.all(20), children: [
                if (_sent) ...[
                  const Text('의견을 받았어요. 더 편안한 경험을 만드는 데 참고할게요.'),
                  FilledButton(
                      onPressed: () => Navigator.pop(context),
                      child: const Text('돌아가기')),
                ] else ...[
                  OutlinedButton.icon(
                    onPressed: _busy ? null : () => Navigator.push(context, MaterialPageRoute<void>(
                      builder: (_) => ContentReportPage(responseText: widget.responseText))),
                    icon: const Icon(Icons.flag_outlined), label: const Text('부적절한 AI 응답 신고')),
                  const Text('어떤 경험이었나요?',
                      style:
                          TextStyle(fontSize: 22, fontWeight: FontWeight.bold)),
                  Wrap(spacing: 8, children: [
                    for (final value in [
                      ('helpful', '도움됐어요'),
                      ('not_helpful', '맞지 않았어요')
                    ])
                      ChoiceChip(
                          label: Text(value.$2),
                          selected: _rating == value.$1,
                          onSelected: _busy
                              ? null
                              : (_) => setState(() => _rating = value.$1)),
                  ]),
                  const SizedBox(height: 16),
                  const Text('어떤 부분에 대한 의견인가요?'),
                  Wrap(spacing: 8, children: [
                    for (final entry in _reasons.entries)
                      ChoiceChip(
                          label: Text(entry.value),
                          selected: _reason == entry.key,
                          onSelected: _busy
                              ? null
                              : (_) => setState(() => _reason = entry.key)),
                  ]),
                  const SizedBox(height: 16),
                  const Text(
                      '보낼 내용: 선택한 평가와 이유. 대화 원문·감정·회원 정보는 첨부하지 않아요. 전송은 선택이며 보내기 버튼을 눌렀을 때만 서버에 집계돼요.'),
                  if (_error != null)
                    Semantics(liveRegion: true, child: Text(_error!)),
                  FilledButton(
                      onPressed: _busy || _rating == null || _reason == null
                          ? null
                          : _send,
                      child: Text(_busy ? '보내는 중…' : '선택한 의견 보내기')),
                ],
              ]),
      );
}
