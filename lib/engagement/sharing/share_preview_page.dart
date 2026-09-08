import 'dart:typed_data';
import 'package:flutter/material.dart';
import '../../app/space_scaffold.dart';
import '../engagement_controller.dart';
import '../domain_events.dart';
import 'share_card.dart';
import 'native_share.dart';

class SharePreviewPage extends StatefulWidget {
  const SharePreviewPage({super.key, required this.content, this.gateway, this.renderer});
  final ShareCardContent content;
  final CardShareGateway? gateway;
  final ShareCardRenderer? renderer;
  @override
  State<SharePreviewPage> createState() => _SharePreviewPageState();
}
class _SharePreviewPageState extends State<SharePreviewPage> {
  late final _renderer = widget.renderer ?? ShareCardRenderer();
  late final _gateway = widget.gateway ?? NativeCardShare();
  late ShareCardContent _content = widget.content;
  late Future<Uint8List> _image = _renderer.render(_content);
  bool _busy = false;
  Future<void> _export(BuildContext buttonContext, {bool save = false}) async {
    if (_busy) return;
    final controller = EngagementScope.maybeOf(context);
    final box = buttonContext.findRenderObject() as RenderBox;
    final origin = box.localToGlobal(Offset.zero) & box.size;
    setState(() => _busy = true);
    try {
      final bytes = await _image;
      if (!save) await controller?.emit(EngagementEventType.shareCardRequested, resourceRef: widget.content.kind.name);
      final result = save ? (await _gateway.save(bytes) ? CardShareResult.completed : CardShareResult.dismissed)
        : await _gateway.share(bytes, origin);
      if (!save && result == CardShareResult.completed) await controller?.track(EngagementMetric.shareCompleted);
      if (!mounted) return;
      final message = switch (result) {
        CardShareResult.completed => save ? '이미지를 저장했어요.' : '선택한 공유창에 전달했어요.',
        CardShareResult.dismissed => '취소했어요. 언제든 다시 나눌 수 있어요.',
        CardShareResult.unavailable => '공유창을 열었어요. 전달 여부는 대상 앱에서 확인해 주세요.',
      };
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
    } catch (_) {
      if (mounted) ScaffoldMessenger.of(context).showSnackBar(const SnackBar(content: Text('이미지를 준비하지 못했어요. 다시 시도해 주세요.')));
    } finally { if (mounted) setState(() => _busy = false); }
  }
  @override
  Widget build(BuildContext context) => SpaceScaffold(appBar: AppBar(title: const Text('공유 미리보기')),
    body: ListView(padding: const EdgeInsets.all(20), children: [
      const Text('이 이미지에 보이는 내용만 나눠요.', style: TextStyle(fontSize: 20, fontWeight: FontWeight.bold)),
      const SizedBox(height: 8), const Text('감정 강도, 대화, 이름, 개인 기록은 포함하지 않았어요.'),
      const SizedBox(height: 20),
      Center(child: ConstrainedBox(constraints: const BoxConstraints(maxWidth: 380), child: FutureBuilder<Uint8List>(
        future: _image, builder: (context, snapshot) {
          if (snapshot.hasError) return const Text('미리보기를 만들지 못했어요. 뒤로 갔다가 다시 열어 주세요.');
          if (!snapshot.hasData) return const SizedBox(height: 300, child: Center(child: CircularProgressIndicator()));
          return Semantics(label: _content.accessibleText, image: true, child: ExcludeSemantics(child: Image.memory(snapshot.data!, key: const ValueKey('share-card-preview'))));
        }))),
      const SizedBox(height: 16), SwitchListTile(title: const Text('생성 날짜 표시'), value: _content.date != null,
        onChanged: _busy ? null : (value) => setState(() { _content = widget.content.withDate(value ? DateTime.now() : null); _image = _renderer.render(_content); })),
      Builder(builder: (buttonContext) => FilledButton.icon(onPressed: _busy ? null : () => _export(buttonContext),
        icon: const Icon(Icons.ios_share), label: const Text('이 이미지 공유하기'))),
      const SizedBox(height: 8),
      Builder(builder: (buttonContext) => OutlinedButton.icon(onPressed: _busy ? null : () => _export(buttonContext, save: true),
        icon: const Icon(Icons.save_alt), label: const Text('이미지 저장'))),
    ]));
}
