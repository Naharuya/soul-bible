import 'dart:async';
import 'dart:convert';
import 'dart:typed_data';

import 'package:nfc_manager/nfc_manager.dart';
import 'package:nfc_manager/ndef_record.dart';
import 'package:nfc_manager/nfc_manager_android.dart';
import 'package:nfc_manager/nfc_manager_ios.dart';

class NfcScanResult {
  const NfcScanResult._({this.ndefValue, this.error});

  final String? ndefValue;
  final String? error;

  bool get isSuccess => ndefValue != null;

  factory NfcScanResult.success(String value) => NfcScanResult._(ndefValue: value);
  factory NfcScanResult.failure(String message) => NfcScanResult._(error: message);
}

class NfcService {
  bool _sessionRunning = false;

  Future<bool> isAvailable() async {
    final status = await NfcManager.instance.checkAvailability();
    return status == NfcAvailability.enabled;
  }

  Future<NfcScanResult?> scanOnce({Duration timeout = const Duration(seconds: 30)}) async {
    final available = await isAvailable();
    if (!available) {
      return NfcScanResult.failure('휴대폰 NFC를 켜주세요.');
    }

    final completer = Completer<NfcScanResult?>();
    _sessionRunning = true;

    await NfcManager.instance.startSession(
      pollingOptions: const {
        NfcPollingOption.iso14443,
        NfcPollingOption.iso15693,
      },
      alertMessageIos: '라미 태그를 아이폰 위쪽에 대주세요.',
      onDiscovered: (tag) async {
        if (completer.isCompleted) return;
        try {
          final message = await _readNdefMessage(tag);
          if (message == null || message.records.isEmpty) {
            await _stop(errorMessageIos: '라미 정보를 찾지 못했어요.');
            completer.complete(
              NfcScanResult.failure('태그는 읽었지만 NDEF 정보가 없어요.'),
            );
            return;
          }

          String? value;
          for (final record in message.records) {
            value = _decodeRecord(record);
            if (value != null && value.trim().isNotEmpty) break;
          }

          if (value == null || value.trim().isEmpty) {
            await _stop(errorMessageIos: '지원하지 않는 NFC 형식이에요.');
            completer.complete(
              NfcScanResult.failure('지원하지 않는 NFC 레코드예요.'),
            );
            return;
          }

          await _stop(alertMessageIos: '라미를 찾았어요!');
          completer.complete(NfcScanResult.success(value.trim()));
        } catch (_) {
          await _stop(errorMessageIos: 'NFC 정보를 읽지 못했어요.');
          if (!completer.isCompleted) {
            completer.complete(NfcScanResult.failure('NFC 정보를 읽지 못했어요.'));
          }
        }
      },
      onSessionErrorIos: (_) {
        if (!completer.isCompleted) completer.complete(null);
      },
    );

    Timer(timeout, () async {
      if (completer.isCompleted) return;
      await _stop();
      completer.complete(null);
    });

    return completer.future;
  }

  Future<NdefMessage?> _readNdefMessage(NfcTag tag) async {
    final android = NdefAndroid.from(tag);
    if (android != null) {
      return android.cachedNdefMessage ?? await android.getNdefMessage();
    }

    final ios = NdefIos.from(tag);
    if (ios != null) {
      return ios.cachedNdefMessage ?? await ios.readNdef();
    }
    return null;
  }

  String? _decodeRecord(NdefRecord record) {
    if (record.typeNameFormat == TypeNameFormat.wellKnown &&
        _bytesEqual(record.type, const [0x54])) {
      return _decodeTextPayload(record.payload);
    }

    if (record.typeNameFormat == TypeNameFormat.wellKnown &&
        _bytesEqual(record.type, const [0x55])) {
      return _decodeUriPayload(record.payload);
    }

    if (record.typeNameFormat == TypeNameFormat.absoluteUri) {
      return utf8.decode(record.type, allowMalformed: true);
    }

    return null;
  }

  String? _decodeTextPayload(Uint8List payload) {
    if (payload.isEmpty) return null;
    final status = payload.first;
    final languageLength = status & 0x3f;
    final start = 1 + languageLength;
    if (start > payload.length) return null;

    // NFC Tools writes UTF-8 for this RAMI test. UTF-16 is rejected instead of
    // silently producing a wrong card ID.
    final isUtf16 = (status & 0x80) != 0;
    if (isUtf16) return null;
    return utf8.decode(payload.sublist(start), allowMalformed: true);
  }

  String? _decodeUriPayload(Uint8List payload) {
    if (payload.isEmpty) return null;
    const prefixes = <String>[
      '',
      'http://www.',
      'https://www.',
      'http://',
      'https://',
      'tel:',
      'mailto:',
      'ftp://anonymous:anonymous@',
      'ftp://ftp.',
      'ftps://',
      'sftp://',
      'smb://',
      'nfs://',
      'ftp://',
      'dav://',
      'news:',
      'telnet://',
      'imap:',
      'rtsp://',
      'urn:',
      'pop:',
      'sip:',
      'sips:',
      'tftp:',
      'btspp://',
      'btl2cap://',
      'btgoep://',
      'tcpobex://',
      'irdaobex://',
      'file://',
      'urn:epc:id:',
      'urn:epc:tag:',
      'urn:epc:pat:',
      'urn:epc:raw:',
      'urn:epc:',
      'urn:nfc:',
    ];
    final prefixCode = payload.first;
    final prefix = prefixCode < prefixes.length ? prefixes[prefixCode] : '';
    final rest = utf8.decode(payload.sublist(1), allowMalformed: true);
    return '$prefix$rest';
  }

  bool _bytesEqual(Uint8List value, List<int> expected) {
    if (value.length != expected.length) return false;
    for (var i = 0; i < value.length; i++) {
      if (value[i] != expected[i]) return false;
    }
    return true;
  }

  Future<void> cancel() async {
    await _stop();
  }

  Future<void> _stop({String? alertMessageIos, String? errorMessageIos}) async {
    if (!_sessionRunning) return;
    _sessionRunning = false;
    try {
      await NfcManager.instance.stopSession(
        alertMessageIos: alertMessageIos,
        errorMessageIos: errorMessageIos,
      );
    } catch (_) {
      // A session may already be closed by the operating system.
    }
  }
}
