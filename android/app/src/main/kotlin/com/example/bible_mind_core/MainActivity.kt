package com.example.bible_mind_core

import android.app.Activity
import android.content.Intent
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodChannel

class MainActivity : FlutterActivity() {
    private var exportResult: MethodChannel.Result? = null
    private var exportBytes: ByteArray? = null

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        MethodChannel(flutterEngine.dartExecutor.binaryMessenger, "soul_bible/image_export")
            .setMethodCallHandler { call, result ->
                if (call.method != "saveImage") {
                    result.notImplemented()
                    return@setMethodCallHandler
                }
                val bytes = call.arguments as? ByteArray
                val signature = byteArrayOf(-119, 80, 78, 71, 13, 10, 26, 10)
                if (bytes == null || bytes.size < 8 || bytes.size > 20 * 1024 * 1024 ||
                    !bytes.copyOfRange(0, 8).contentEquals(signature)) {
                    result.error("invalid_image", "A PNG image is required.", null)
                    return@setMethodCallHandler
                }
                if (exportResult != null) {
                    result.error("export_busy", "An export is already open.", null)
                    return@setMethodCallHandler
                }
                exportResult = result
                exportBytes = bytes
                try {
                    // The user selects a destination; no broad storage permission is needed.
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        addCategory(Intent.CATEGORY_OPENABLE)
                        type = "image/png"
                        putExtra(Intent.EXTRA_TITLE, "onaria-card.png")
                    }
                    startActivityForResult(intent, EXPORT_IMAGE)
                } catch (_: Exception) {
                    finishExport(false, failed = true)
                }
            }
    }

    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        if (requestCode != EXPORT_IMAGE || exportResult == null) return
        val uri = data?.data
        val bytes = exportBytes
        if (resultCode != Activity.RESULT_OK) {
            finishExport(false)
            return
        }
        if (uri == null || bytes == null) {
            finishExport(false, failed = true)
            return
        }
        Thread {
            val success = runCatching {
                val output = contentResolver.openOutputStream(uri, "wt")
                    ?: error("Destination unavailable")
                output.use { it.write(bytes) }
            }.isSuccess
            runOnUiThread { finishExport(success, failed = !success) }
        }.start()
    }

    private fun finishExport(saved: Boolean, failed: Boolean = false) {
        val result = exportResult
        exportResult = null
        exportBytes = null
        if (failed) result?.error("export_failed", "The image could not be saved.", null)
        else result?.success(saved)
    }

    override fun onDestroy() {
        finishExport(false)
        super.onDestroy()
    }

    companion object {
        private const val EXPORT_IMAGE = 4817
    }
}
