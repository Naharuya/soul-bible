import 'package:flutter/material.dart';
import '../app/space_scaffold.dart';
import 'account_deletion_page.dart';

class SignUpPage extends StatelessWidget {
  const SignUpPage({super.key});
  @override
  Widget build(BuildContext context) => SpaceScaffold(
    appBar: AppBar(title: const Text('회원정보 안내')),
    body: ListView(padding: const EdgeInsets.all(24), children: [
      const Text('가입 없이 이용할 수 있어요', style: TextStyle(fontSize:24,fontWeight:FontWeight.bold)),
      const Text('본인 확인과 개인정보 처리 준비가 끝날 때까지 신규 회원정보 등록을 중단합니다. 이름·전화번호·교회명을 입력받지 않아요.'),
      const Text('현재 기기 기록은 서버 계정과 동기화되지 않아요.'),
      FilledButton(onPressed: () => Navigator.pop(context), child: const Text('돌아가기')),
      TextButton(onPressed: () => Navigator.push(context, MaterialPageRoute<void>(builder: (_) => const AccountDeletionPage())),
        child: const Text('기존 회원정보 삭제 요청')),
    ]),
  );
}