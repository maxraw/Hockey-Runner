import AVFoundation
import CoreML
import Vision

struct PuckDetectionResult {
    let x: CGFloat
    let y: CGFloat
    let confidence: Float
    let bbox: CGRect
    let label: String
}

final class PuckDetector {
    private var request: VNCoreMLRequest?
    private let queue = DispatchQueue(label: "hockeyrunner.puckdetector", qos: .userInitiated)
    private var isRunning = false

    var confidenceThreshold: Float = 0.35
    var iouThreshold: Float = 0.7

    init() {
        loadModel()
    }

    private func loadModel() {
        // Preferred: add your own Puck_and_ball_v3_nano.mlmodel to Xcode.
        // Xcode will generate a Puck_and_ball_v3_nano class automatically.
        // If you only have a compiled .mlmodelc, add it to Copy Bundle Resources and load by URL.
        do {
            if let compiledURL = Bundle.main.url(forResource: "Puck_and_ball_v3_nano", withExtension: "mlmodelc") {
                let mlModel = try MLModel(contentsOf: compiledURL)
                let vnModel = try VNCoreMLModel(for: mlModel)
                configureRequest(model: vnModel)
                return
            }

            // If using generated class instead, uncomment after adding .mlmodel:
            // let config = MLModelConfiguration()
            // config.computeUnits = .all
            // let model = try Puck_and_ball_v3_nano(configuration: config).model
            // let vnModel = try VNCoreMLModel(for: model)
            // configureRequest(model: vnModel)
        } catch {
            print("[PuckDetector] Failed to load CoreML model: \(error)")
        }
    }

    private func configureRequest(model: VNCoreMLModel) {
        let request = VNCoreMLRequest(model: model)
        request.imageCropAndScaleOption = .scaleFit
        self.request = request
    }

    func detect(pixelBuffer: CVPixelBuffer, orientation: CGImagePropertyOrientation, completion: @escaping (PuckDetectionResult?) -> Void) {
        guard let request = request else {
            completion(nil)
            return
        }
        if isRunning { return }
        isRunning = true

        queue.async { [weak self] in
            guard let self else { return }
            defer { self.isRunning = false }

            let handler = VNImageRequestHandler(cvPixelBuffer: pixelBuffer, orientation: orientation, options: [:])
            do {
                try handler.perform([request])
                let observations = request.results as? [VNRecognizedObjectObservation] ?? []
                let best = self.bestPuck(from: observations)
                DispatchQueue.main.async { completion(best) }
            } catch {
                print("[PuckDetector] Vision request failed: \(error)")
                DispatchQueue.main.async { completion(nil) }
            }
        }
    }

    private func bestPuck(from observations: [VNRecognizedObjectObservation]) -> PuckDetectionResult? {
        var best: PuckDetectionResult?

        for obs in observations {
            guard let label = obs.labels.first else { continue }
            guard label.identifier == "puck" else { continue }
            guard label.confidence >= confidenceThreshold else { continue }

            let bbox = obs.boundingBox
            let aspect = bbox.width / max(0.0001, bbox.height)
            guard aspect >= 0.60 && aspect <= 1.45 else { continue }

            let area = bbox.width * bbox.height
            guard area >= 0.0002 && area <= 0.18 else { continue }

            let centerX = bbox.midX
            let centerY = 1.0 - bbox.midY
            let candidate = PuckDetectionResult(x: centerX, y: centerY, confidence: label.confidence, bbox: bbox, label: label.identifier)
            if best == nil || candidate.confidence > best!.confidence {
                best = candidate
            }
        }
        return best
    }
}
