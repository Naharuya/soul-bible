import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:http/http.dart' as http;
import 'package:url_launcher/url_launcher.dart';
import '../app/api_config.dart';
import '../app/space_scaffold.dart';

class AccountDeletionPage extends StatefulWidget {
  const AccountDeletionPage({super.key});
  @override
  State<AccountDeletionPage> createState() => _AccountDeletionPageState();
}
class _AccountDeletionPageState extends State<AccountDeletionPage> {
  String? _email;
  bool _loading = true;
  @override
  void initState() { super.initState(); _load(); }
  Future<void> _load() async {
    final client = http.Client();
    try {
      final endpoint = ApiConfig.baseUrl!.resolve('/v1/privacy');
      ApiConfig.requireSecureEndpoint(endpoint);
      final request = http.Request('GET',endpoint)..followRedirects = false;
      final response = await client.send(request).then(http.Response.fromStream).timeout(const Duration(seconds:12));
      if (response.statusCode != 200) return;
      final policy = jsonDecode(response.body) as Map<String,dynamic>;
      final email = policy['supportEmail'];
      if (policy['ready'] == true && email is String && RegExp(r'^[^\s@]+@[^\s@]+\.[^\s@]+$').hasMatch(email) && mounted) setState(() => _email = email);
    } catch (_) { /* Never claim a request was sent. */ }
    finally { client.close(); if (mounted) setState(() => _loading = false); }
  }
  Future<void> _request() async {
    try {
      if (!await launchUrl(Uri(scheme:'mailto',path:_email,queryParameters:{'subject':'ONARIA 회원정보 삭제 요청'}))) throw StateError('unavailable');
    } catch (_) { if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content:Text('메일 앱을 열지 못했어요. 안내된 문의처로 직접 요청해 주세요.'))); }
  }
  @override
  Widget build(BuildContext context) => SpaceScaffold(appBar:AppBar(title:const Text('회원정보 삭제 요청')),
    body:ListView(padding:const EdgeInsets.all(20),children:[
      const Text('이전에 등록한 회원정보',style:TextStyle(fontSize:22,fontWeight:FontWeight.bold)),
      const Text('이 기기의 기록 삭제나 앱 삭제만으로 서버 회원정보가 지워지지 않아요. 담당자가 본인 확인 후 이름·전화번호·교회명·연결 식별자를 삭제합니다. 요청 시 비밀번호·인증코드·신분증을 보내지 마세요.'),
      const Text('기기 기록과 이미 공유한 사본은 별도예요. 백업·법정 보존 기록의 처리 범위는 담당자 안내를 확인해 주세요. 구독이 있다면 스토어의 구독 해지도 별도로 확인해 주세요.'),
      if (_loading) const LinearProgressIndicator() else if (_email == null)
        const Text('삭제 요청 문의처를 아직 확인할 수 없어요. 접수된 상태가 아니며 신규 회원정보 등록은 중단되어 있습니다.') else ...[
          SelectableText(_email!),
          FilledButton(onPressed:_request,child:const Text('삭제 요청 메일 작성')),
          const Text('메일 앱에서 직접 보내야 접수됩니다. 메일 작성 버튼을 누르는 것만으로 삭제가 완료되지는 않아요.'),
        ]
    ]));
}
