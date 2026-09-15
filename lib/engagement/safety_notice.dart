import 'package:flutter/material.dart';

class SafetyNotice extends StatelessWidget {
  const SafetyNotice({super.key});
  @override
  Widget build(BuildContext context) => const Center(
    child: Padding(padding: EdgeInsets.all(24), child: Text(
      '지금은 현실에서 안전을 확보하는 일이 먼저예요.\n'
      '가까운 믿을 만한 사람에게 함께 있어 달라고 요청해 주세요.\n'
      '즉각적인 위험이 있다면 한국에서는 119 또는 112, 다른 지역에서는 현지 응급 번호에 연락해 주세요.',
      style: TextStyle(fontSize: 18, height: 1.6))),
  );
}
