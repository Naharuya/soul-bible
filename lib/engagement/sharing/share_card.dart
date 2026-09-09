import 'dart:typed_data';
import 'dart:ui' as ui;
import 'package:flutter/material.dart';
import '../../app/mind_card_store.dart';
import '../../src/verses/verse_models.dart';

enum ShareCardKind { verse, mindCard, prayer, journey }

class ShareCardContent {
  const ShareCardContent._(this.kind, this.title, this.text, this.reference, {this.date});
  final ShareCardKind kind;
  final String title, text, reference;
  final DateTime? date;
  // Only explicitly selected catalog scripture is copied; no English development-reference text.
  factory ShareCardContent.verse(BibleVerse verse) => ShareCardContent._(ShareCardKind.verse, '오늘 곁에 둔 말씀', verse.text, verse.reference);
  factory ShareCardContent.mindCard(MindCardRecord card, Iterable<BibleVerse> catalog) {
    final canonical = catalog.where((v) => v.reference == card.verseReference).firstOrNull;
    return ShareCardContent._(ShareCardKind.mindCard, '나를 돌보는 작은 시간',
      canonical?.text ?? '오늘, 나를 위해 잠시 쉬어 가는 시간을 가졌어요.', canonical?.reference ?? '');
  }
  factory ShareCardContent.prayer() => const ShareCardContent._(ShareCardKind.prayer, '잠시 머무는 기도',
    '오늘의 작은 순간을 소중히 여기게 해 주세요.\n나와 이웃에게 다정한 마음을 건네고,\n필요할 때 쉬어 갈 용기를 갖게 해 주세요.', 'onaria 창작 기도문');
  factory ShareCardContent.journey(Iterable<BibleVerse> encountered) => ShareCardContent._(ShareCardKind.journey, '7일 마음의 여정',
    '일곱 번, 나를 돌보는 시간을 가졌어요.\n잠시 쉬어도 괜찮고, 천천히 이어가도 괜찮아요.\n작은 돌봄이 일상에 머물기를.',
    encountered.map((v) => v.reference).toSet().take(7).join(' · '));
  ShareCardContent withDate(DateTime? value) => ShareCardContent._(kind, title, text, reference, date: value);
  String get accessibleText => [title, text, reference, 'onaria', if (date != null) '${date!.year}.${date!.month}.${date!.day}'].join('\n');
}

class ShareCardRenderer {
  // The exact same PNG is previewed, saved and sent to the native share sheet.
  Future<Uint8List> render(ShareCardContent content) async {
    const width = 1080.0, padding = 90.0;
    TextPainter paragraph(String text, double size, Color color, {FontWeight weight = FontWeight.normal}) => TextPainter(
      text: TextSpan(text: text, style: TextStyle(fontFamily: 'sans-serif', fontSize: size, color: color, fontWeight: weight, height: 1.65)),
      textDirection: TextDirection.ltr)..layout(maxWidth: width - padding * 2);
    final title = paragraph(content.title, 44, const Color(0xFFDFCA91), weight: FontWeight.w600);
    final body = paragraph(content.text, 54, const Color(0xFFF6F4EC));
    final reference = paragraph(content.reference, 31, const Color(0xFFCCDCCF));
    final branding = paragraph('onaria', 30, const Color(0xFFDFCA91));
    final date = paragraph(content.date == null ? '' : '${content.date!.year}.${content.date!.month.toString().padLeft(2, '0')}.${content.date!.day.toString().padLeft(2, '0')}', 26, const Color(0xFFCCDCCF));
    final height = 370 + title.height + body.height + reference.height + branding.height + date.height;
    final recorder = ui.PictureRecorder(), canvas = Canvas(recorder);
    canvas.drawRect(Rect.fromLTWH(0, 0, width, height), Paint()..shader = const LinearGradient(
      begin: Alignment.topLeft, end: Alignment.bottomRight, colors: [Color(0xFF244C42), Color(0xFF102E2A)]).createShader(Rect.fromLTWH(0, 0, width, height)));
    canvas.drawRRect(RRect.fromRectAndRadius(Rect.fromLTWH(34, 34, width - 68, height - 68), const Radius.circular(36)),
      Paint()..color = const Color(0xFF759488)..style = PaintingStyle.stroke..strokeWidth = 2);
    final light = Paint()..color = const Color(0xFFDFCA91);
    canvas.drawCircle(const Offset(width - 120, 105), 8, light);
    var y = 125.0;
    title.paint(canvas, Offset(padding, y)); y += title.height + 48;
    body.paint(canvas, Offset(padding, y)); y += body.height + 48;
    reference.paint(canvas, Offset(padding, y)); y += reference.height + 65;
    branding.paint(canvas, Offset(padding, y)); y += branding.height + 12;
    date.paint(canvas, Offset(padding, y));
    final picture = recorder.endRecording();
    try {
      final image = await picture.toImage(width.toInt(), height.ceil());
      try {
        final data = await image.toByteData(format: ui.ImageByteFormat.png);
        if (data == null) throw StateError('Image encoding failed');
        return data.buffer.asUint8List(data.offsetInBytes, data.lengthInBytes);
      } finally { image.dispose(); }
    } finally { picture.dispose(); }
  }
}
