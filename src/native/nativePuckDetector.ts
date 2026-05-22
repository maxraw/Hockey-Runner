import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

export type NativePuckEvent = {
  className: string;
  confidence: number;
  x: number;
  y: number;
  width: number;
  height: number;
  ts: number;
};

const LINKING_ERROR =
  'PuckDetector native module is not linked. Run iOS prebuild and include the .mlmodelc bundle asset.';

const PuckDetector = NativeModules.PuckDetector;

export function isPuckDetectorAvailable() {
  return Platform.OS === 'ios' && !!PuckDetector;
}

export function startNativePuckDetector(opts: { confidenceThreshold: number; modelName: string }) {
  if (!PuckDetector) throw new Error(LINKING_ERROR);
  return PuckDetector.start(opts);
}

export function stopNativePuckDetector() {
  if (!PuckDetector) return;
  return PuckDetector.stop();
}

export function addNativePuckListener(cb: (ev: NativePuckEvent) => void) {
  if (!PuckDetector) throw new Error(LINKING_ERROR);
  const emitter = new NativeEventEmitter(PuckDetector);
  return emitter.addListener('PuckDetectorOnDetection', cb);
}
