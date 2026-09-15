import 'dart:convert';
import 'dart:math';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import '../app/api_config.dart';
import '../app/space_scaffold.dart';
import '../engagement/engagement_controller.dart';
import '../engagement/safety_notice.dart';

class ContentReportPage extends StatefulWidget {
  const ContentReportPage({super.key, this.responseText, this.client});
  final String? responseText;
  final http.Client? client;
  @override
  State<ContentReportPage> createState() => _ContentReportPageState();
}
class _ContentReportPageState extends State<ContentReportPage> {
  static const reasons = {'unsafe':'위험한 행동 권유', 'hate':'혐오·차별 표현', 'sexual':'부적절한 성적 표현',
    'incorrect_scripture':'잘못된 경전·종교 설명', 'misleading':'오해를 부르는 정보', 'other':'그 밖의 부적절한 응답'};
  late final _client = widget.client ?? http.Client();
  String? _reason, _id, _payload, _error;
  bool _attach = false, _busy = false, _sent = false;
  @override
  void dispose() { if (widget.client == null) _client.close(); super.dispose(); }
  Future<void> _send() async {
    if (_busy || _sent || _reason == null || EngagementScope.maybeOf(context)?.safetyBlocked == true) return;
    setState(() { _busy = true; _error = null; });
    try {
      final fields = {'reason': _reason, 'includeResponse': _attach,
        if (_attach) 'responseText': widget.responseText!.substring(0, min(3000, widget.responseText!.length))};
      final payload = jsonEncode(fields);
      if (_payload != payload) { _payload = payload; _id = List.generate(16, (_) => Random.secure().nextInt(256).toRadixString(16).padLeft(2, '0')).join(); }
      final endpoint = ApiConfig.baseUrl!.resolve('/v1/reports');
      ApiConfig.requireSecureEndpoint(endpoint);
      final request = http.Request('POST', endpoint)..followRedirects = false
        ..headers.addAll({'Content-Type':'application/json', if (ApiConfig.appToken.isNotEmpty) 'Authorization':'Bearer ${ApiConfig.appToken}'})
        ..body = jsonEncode({'submissionId':_id, ...fields});
      final response = await _client.send(request).then(http.Response.fromStream).timeout(const Duration(seconds:12));
      if (response.statusCode != 202 || jsonDecode(response.body)['accepted'] != true) throw StateError('unavailable');
      if (mounted) setState(() => _sent = true);
    } catch (_) { if (mounted) setState(() => _error = '신고를 접수하지 못했어요. 선택은 유지되며 다시 보낼 수 있어요.'); }
    finally { if (mounted) setState(() => _busy = false); }
  }
  @override
  Widget build(BuildContext context) => SpaceScaffold(appBar: AppBar(title:const Text('AI 응답 신고')),
    body: EngagementScope.maybeOf(context)?.safetyBlocked == true ? const SafetyNotice() : ListView(padding:const EdgeInsets.all(20),children:[
      if (_sent) const Text('신고가 접수됐어요. 담당자가 검토해 안전 개선에 활용합니다.') else ...[
        const Text('어떤 문제가 있었나요?', style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
        for (final entry in reasons.entries) ChoiceChip(label:Text(entry.value), selected:_reason == entry.key,
          onSelected:_busy ? null : (selected) => setState(() => _reason = selected ? entry.key : null)),
        if (widget.responseText?.trim().isNotEmpty == true) ...[
          const Text('첨부할 AI 응답 미리보기'),
          Text(widget.responseText!.substring(0,min(3000,widget.responseText!.length))),
          CheckboxListTile(value:_attach,onChanged:_busy ? null : (value) => setState(() => _attach = value ?? false),
            title:const Text('위 AI 응답을 신고에 첨부하는 데 동의해요')),
        ],
        const Text('기본 전송: 신고 사유와 중복 방지 번호. 선택하면 위 AI 응답도 전송합니다. 사용자의 입력과 전체 대화는 자동 첨부하지 않아요. 응답에 민감한 정보가 있다면 첨부하지 마세요.'),
        if (_error != null) Semantics(liveRegion:true,child:Text(_error!)),
        FilledButton(onPressed:_busy || _reason == null ? null : _send,child:Text(_busy ? '보내는 중…' : '신고 보내기')),
      ]
    ]));
}
