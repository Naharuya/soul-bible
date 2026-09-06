import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../models/interaction.dart';

class RamiRepository {
  RamiRepository._();
  static final instance = RamiRepository._();

  final List<Interaction> _interactions = [];
  String? _lastRecordingPath;
  bool _initialized = false;

  List<Interaction> get interactions => List.unmodifiable(_interactions.reversed);
  String? get lastRecordingPath => _lastRecordingPath;
  bool get hasRecording => _lastRecordingPath != null;

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    try {
      final file = await _stateFile();
      if (!await file.exists()) return;
      final json = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      final savedPath = json['lastRecordingPath'] as String?;
      if (savedPath != null && await File(savedPath).exists()) {
        _lastRecordingPath = savedPath;
      }
      final rawItems = json['interactions'] as List<dynamic>? ?? const [];
      _interactions
        ..clear()
        ..addAll(
          rawItems.whereType<Map>().map(
                (item) => Interaction.fromJson(Map<String, dynamic>.from(item)),
              ),
        );
    } catch (_) {
      // Corrupt or unavailable local state must never block child mode.
    }
  }

  void addInteraction(String cardId, String action) {
    _interactions.add(
      Interaction(cardId: cardId, action: action, createdAt: DateTime.now()),
    );
    unawaited(_save());
  }

  Future<void> saveRecordingPath(String path, String cardId) async {
    _lastRecordingPath = path;
    _interactions.add(
      Interaction(cardId: cardId, action: 'record_saved', createdAt: DateTime.now()),
    );
    await _save();
  }

  Future<void> clearLocalDemoData() async {
    final path = _lastRecordingPath;
    _lastRecordingPath = null;
    _interactions.clear();
    if (path != null) {
      final recording = File(path);
      if (await recording.exists()) {
        await recording.delete();
      }
    }
    final file = await _stateFile();
    if (await file.exists()) await file.delete();
  }

  Future<File> _stateFile() async {
    final dir = await getApplicationDocumentsDirectory();
    return File('${dir.path}/rami_mvp_state.json');
  }

  Future<void> _save() async {
    try {
      final file = await _stateFile();
      final json = {
        'lastRecordingPath': _lastRecordingPath,
        'interactions': _interactions.map((item) => item.toJson()).toList(),
      };
      await file.writeAsString(jsonEncode(json), flush: true);
    } catch (_) {
      // Persistence failure should not interrupt the play loop.
    }
  }
}
