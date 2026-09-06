import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import '../models/interaction.dart';

class RamiRepository {
  RamiRepository._();
  static final instance = RamiRepository._();

  final List<Interaction> _interactions = [];
  final Map<String, String> _recordingPaths = {};
  bool _initialized = false;

  List<Interaction> get interactions => List.unmodifiable(_interactions.reversed);
  String? recordingPathFor(String cardId) => _recordingPaths[cardId];
  bool hasRecordingFor(String cardId) => _recordingPaths.containsKey(cardId);

  Future<void> initialize() async {
    if (_initialized) return;
    _initialized = true;
    try {
      final file = await _stateFile();
      if (!await file.exists()) return;
      final json = jsonDecode(await file.readAsString()) as Map<String, dynamic>;
      final savedPaths = json['recordingPaths'] as Map<String, dynamic>? ?? const {};
      for (final entry in savedPaths.entries) {
        final path = entry.value as String?;
        if (path != null && await File(path).exists()) {
          _recordingPaths[entry.key] = path;
        }
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
    _recordingPaths[cardId] = path;
    _interactions.add(
      Interaction(cardId: cardId, action: 'record_saved', createdAt: DateTime.now()),
    );
    await _save();
  }

  Future<void> clearLocalDemoData() async {
    final paths = _recordingPaths.values.toList();
    _recordingPaths.clear();
    _interactions.clear();
    for (final path in paths) {
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
        'recordingPaths': _recordingPaths,
        'interactions': _interactions.map((item) => item.toJson()).toList(),
      };
      await file.writeAsString(jsonEncode(json), flush: true);
    } catch (_) {
      // Persistence failure should not interrupt the play loop.
    }
  }
}
