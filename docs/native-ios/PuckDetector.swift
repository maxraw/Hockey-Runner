import AVFoundation
import Foundation
import Vision
import CoreML

// Template: copy into ios target after `npm run prebuild:ios`.
@objc(PuckDetector)
class PuckDetector: RCTEventEmitter, AVCaptureVideoDataOutputSampleBufferDelegate {
  private let session = AVCaptureSession()
  private let videoOutput = AVCaptureVideoDataOutput()
  private var request: VNCoreMLRequest?
  private var minConfidence: Float = 0.35

  override static func requiresMainQueueSetup() -> Bool { false }
  override func supportedEvents() -> [String]! { ["PuckDetectorOnDetection"] }

  @objc(start:resolver:rejecter:)
  func start(options: NSDictionary, resolve: RCTPromiseResolveBlock, reject: RCTPromiseRejectBlock) {
    minConfidence = options["confidenceThreshold"] as? Float ?? 0.35
    guard let model = loadModel(named: (options["modelName"] as? String) ?? "PuckYOLO") else {
      reject("model_error", "Failed to load CoreML model", nil)
      return
    }
    let vnModel = try! VNCoreMLModel(for: model)
    request = VNCoreMLRequest(model: vnModel) { [weak self] req, _ in self?.handleDetection(req) }
    configureSession()
    session.startRunning()
    resolve(["started": true])
  }

  @objc(stop)
  func stop() { session.stopRunning() }

  private func loadModel(named: String) -> MLModel? {
    guard let url = Bundle.main.url(forResource: named, withExtension: "mlmodelc") else { return nil }
    return try? MLModel(contentsOf: url)
  }

  private func configureSession() {
    session.beginConfiguration()
    session.sessionPreset = .hd1280x720
    guard let camera = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back),
          let input = try? AVCaptureDeviceInput(device: camera),
          session.canAddInput(input) else { session.commitConfiguration(); return }
    if session.inputs.isEmpty { session.addInput(input) }
    let queue = DispatchQueue(label: "PuckDetectorVideo")
    videoOutput.setSampleBufferDelegate(self, queue: queue)
    videoOutput.alwaysDiscardsLateVideoFrames = true
    if session.outputs.isEmpty && session.canAddOutput(videoOutput) { session.addOutput(videoOutput) }
    session.commitConfiguration()
  }

  func captureOutput(_ output: AVCaptureOutput, didOutput sampleBuffer: CMSampleBuffer, from connection: AVCaptureConnection) {
    guard let req = request, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else { return }
    let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: .right, options: [:])
    try? handler.perform([req])
  }

  private func handleDetection(_ request: VNRequest) {
    guard let results = request.results as? [VNRecognizedObjectObservation] else { return }
    for obs in results {
      guard let top = obs.labels.first, top.identifier == "puck", top.confidence >= minConfidence else { continue }
      let b = obs.boundingBox
      sendEvent(withName: "PuckDetectorOnDetection", body: [
        "className": top.identifier,
        "confidence": top.confidence,
        "x": b.origin.x,
        "y": b.origin.y,
        "width": b.size.width,
        "height": b.size.height,
        "ts": Int(Date().timeIntervalSince1970 * 1000)
      ])
      break
    }
  }
}
