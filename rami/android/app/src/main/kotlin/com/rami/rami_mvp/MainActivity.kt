package com.rami.rami_mvp

import android.content.Intent
import android.nfc.NfcAdapter
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.android.FlutterActivity
import io.flutter.plugin.common.MethodChannel
import java.nio.charset.Charset

class MainActivity : FlutterActivity() {
	private val channelName = "rami/nfc_intent"
	private var methodChannel: MethodChannel? = null
	private var pendingValue: String? = null

	override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
		super.configureFlutterEngine(flutterEngine)
		methodChannel = MethodChannel(flutterEngine.dartExecutor.binaryMessenger, channelName)
		methodChannel?.setMethodCallHandler { call, result ->
			if (call.method == "getInitialValue") {
				result.success(pendingValue)
				pendingValue = null
			} else {
				result.notImplemented()
			}
		}
		handleIntent(intent)
	}

	override fun onNewIntent(intent: Intent) {
		super.onNewIntent(intent)
		setIntent(intent)
		handleIntent(intent)
	}

	private fun handleIntent(intent: Intent?) {
		val value = extractNdefValue(intent) ?: return
		if (methodChannel == null) {
			pendingValue = value
		} else {
			methodChannel?.invokeMethod("nfcValue", value)
		}
	}

	private fun extractNdefValue(intent: Intent?): String? {
		if (intent == null) return null
		val rawMessages = intent.getParcelableArrayExtra(NfcAdapter.EXTRA_NDEF_MESSAGES)
		val message = rawMessages?.firstOrNull() as? NdefMessage ?: return null
		return message.records.asSequence()
			.mapNotNull { decodeRecord(it) }
			.firstOrNull { it.isNotBlank() }
			?.trim()
	}

	private fun decodeRecord(record: NdefRecord): String? {
		if (record.tnf == NdefRecord.TNF_WELL_KNOWN && record.type.contentEquals(NdefRecord.RTD_TEXT)) {
			val payload = record.payload
			if (payload.isEmpty()) return null
			val languageLength = payload[0].toInt() and 0x3f
			val charset = if ((payload[0].toInt() and 0x80) == 0) Charsets.UTF_8 else Charset.forName("UTF-16")
			val start = 1 + languageLength
			if (start > payload.size) return null
			return String(payload, start, payload.size - start, charset)
		}
		if (record.tnf == NdefRecord.TNF_WELL_KNOWN && record.type.contentEquals(NdefRecord.RTD_URI)) {
			return record.toUri()?.toString()
		}
		return null
	}
}
