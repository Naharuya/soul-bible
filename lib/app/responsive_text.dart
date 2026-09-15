import 'package:flutter/material.dart';

/// Fits short display copy within a readable range, then wraps at word spaces.
/// System text scaling remains enabled; larger accessibility sizes gain lines.
class ResponsiveText extends StatelessWidget {
  const ResponsiveText(this.text,
      {super.key,
      this.style,
      this.minFontSize = 14,
      this.maxFontSize = 16,
      this.textAlign = TextAlign.start,
      this.preferredWrap});
  final String text;
  final String? preferredWrap;
  final TextStyle? style;
  final double minFontSize, maxFontSize;
  final TextAlign textAlign;

  @override
  Widget build(BuildContext context) =>
      LayoutBuilder(builder: (context, constraints) {
        final base = DefaultTextStyle.of(context).style.merge(style);
        final scaler = MediaQuery.textScalerOf(context);
        final direction = Directionality.of(context);
        double width(String value, double size) {
          final painter = TextPainter(
              text: TextSpan(text: value, style: base.copyWith(fontSize: size)),
              textScaler: scaler,
              textDirection: direction)
            ..layout();
          final result = painter.width;
          painter.dispose();
          return result;
        }

        final available = constraints.maxWidth;
        var size = maxFontSize;
        var displayed = text;
        if (available.isFinite && width(text, size) > available) {
          if (width(text, minFontSize) <= available) {
            var low = minFontSize, high = maxFontSize;
            for (var i = 0; i < 12; i++) {
              final mid = (low + high) / 2;
              if (width(text, mid) <= available) {
                low = mid;
              } else {
                high = mid;
              }
            }
            size = low;
          } else {
            final lines = <String>[];
            for (final paragraph in (preferredWrap ?? text).split('\n')) {
              var line = '';
              for (final word in paragraph.split(RegExp(r'\s+'))) {
                final next = line.isEmpty ? word : '$line $word';
                if (line.isNotEmpty && width(next, size) > available) {
                  lines.add(line);
                  line = word;
                } else {
                  line = next;
                }
              }
              if (line.isNotEmpty) lines.add(line);
            }
            displayed = lines.join('\n');
          }
        }
        return Semantics(
            label: text,
            excludeSemantics: true,
            child: Text(displayed,
                style: base.copyWith(fontSize: size),
                textAlign: textAlign,
                softWrap: true));
      });
}
