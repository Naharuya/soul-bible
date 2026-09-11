import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate, UIDocumentPickerDelegate, UIAdaptivePresentationControllerDelegate {
  private var exportResult: FlutterResult?
  private var exportFile: URL?
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    let channel = FlutterMethodChannel(
      name: "soul_bible/image_export",
      binaryMessenger: engineBridge.applicationRegistrar.messenger()
    )
    channel.setMethodCallHandler { [weak self] call, result in
      guard call.method == "saveImage" else { result(FlutterMethodNotImplemented); return }
      guard let self = self else {
        result(FlutterError(code: "export_failed", message: "Export unavailable.", details: nil)); return
      }
      self.saveImage(call.arguments, result: result)
    }
  }

  private func saveImage(_ arguments: Any?, result: @escaping FlutterResult) {
    guard exportResult == nil else {
      result(FlutterError(code: "export_busy", message: "An export is already open.", details: nil)); return
    }
    guard let bytes = arguments as? FlutterStandardTypedData,
          bytes.data.count >= 8, bytes.data.count <= 20 * 1024 * 1024,
          bytes.data.prefix(8) == Data([137, 80, 78, 71, 13, 10, 26, 10]) else {
      result(FlutterError(code: "invalid_image", message: "A PNG image is required.", details: nil)); return
    }
    let activeWindow = UIApplication.shared.connectedScenes
      .compactMap { $0 as? UIWindowScene }
      .filter { $0.activationState == .foregroundActive }
      .flatMap { $0.windows }.first { $0.isKeyWindow }
    guard var presenter = activeWindow?.rootViewController else {
      result(FlutterError(code: "export_failed", message: "Export unavailable.", details: nil)); return
    }
    while let presented = presenter.presentedViewController { presenter = presented }
    guard !presenter.isBeingDismissed else {
      result(FlutterError(code: "export_failed", message: "Export unavailable.", details: nil)); return
    }
    let file = FileManager.default.temporaryDirectory
      .appendingPathComponent("onaria-card-\(UUID().uuidString).png")
    do {
      try bytes.data.write(to: file, options: .atomic)
      exportFile = file
      exportResult = result
      let picker: UIDocumentPickerViewController
      if #available(iOS 14.0, *) {
        picker = UIDocumentPickerViewController(forExporting: [file], asCopy: true)
      } else {
        picker = UIDocumentPickerViewController(url: file, in: .exportToService)
      }
      picker.delegate = self
      picker.presentationController?.delegate = self
      presenter.present(picker, animated: true)
    } catch {
      try? FileManager.default.removeItem(at: file)
      result(FlutterError(code: "export_failed", message: "The image could not be saved.", details: nil))
    }
  }

  func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
    finishExport(!urls.isEmpty)
  }

  func documentPickerWasCancelled(_ controller: UIDocumentPickerViewController) {
    finishExport(false)
  }

  func presentationControllerDidDismiss(_ presentationController: UIPresentationController) {
    finishExport(false)
  }

  private func finishExport(_ saved: Bool) {
    let result = exportResult
    exportResult = nil
    if let file = exportFile { try? FileManager.default.removeItem(at: file) }
    exportFile = nil
    result?(saved)
  }
}
