export type PuckDetection = {
  className: string;
  confidence: number;
  bbox: { x: number; y: number; width: number; height: number }; // normalized to calibrated field crop
  ts: number;
};

export type FieldCalibration = {
  expectedPuckDiameterNorm: number;
};

export type MotionSample = {
  x: number;
  y: number;
  confidence: number;
  ts: number;
};

export type MotionCommand = {
  cmd: 'left' | 'right' | 'jump' | 'duck' | 'neutral' | 'lost';
  confidence: number;
  x: number;
  y: number;
  speed: number;
  dx: number;
  dy: number;
  reason: string;
  ts: number;
};

export type DetectorFilterConfig = {
  minConfidence: number;
  squareTolerance: number;
  sizeTolerance: number;
};

const DEFAULT_FILTERS: DetectorFilterConfig = {
  minConfidence: 0.35,
  squareTolerance: 0.45,
  sizeTolerance: 0.70
};

export function filterPuckDetection(
  detection: PuckDetection,
  calibration: FieldCalibration,
  cfg: Partial<DetectorFilterConfig> = {}
): MotionSample | null {
  const conf = { ...DEFAULT_FILTERS, ...cfg };
  if (detection.className !== 'puck') return null;
  if (detection.confidence < conf.minConfidence) return null;

  const { x, y, width, height } = detection.bbox;
  if (x < 0 || y < 0 || x + width > 1 || y + height > 1) return null;

  const ratio = width / Math.max(1e-6, height);
  if (Math.abs(1 - ratio) > conf.squareTolerance) return null;

  const diameter = (width + height) / 2;
  const expected = calibration.expectedPuckDiameterNorm;
  const relDiff = Math.abs(diameter - expected) / Math.max(1e-6, expected);
  if (relDiff > conf.sizeTolerance) return null;

  return {
    x: x + width / 2,
    y: y + height / 2,
    confidence: detection.confidence,
    ts: detection.ts
  };
}

export class PuckMotionBuffer {
  private points: MotionSample[] = [];
  constructor(private maxPoints = 24, private maxAgeMs = 520) {}
  push(sample: MotionSample) {
    this.points.push(sample);
    const now = sample.ts;
    while (this.points.length > this.maxPoints) this.points.shift();
    while (this.points.length && now - this.points[0].ts > this.maxAgeMs) this.points.shift();
  }
  reset() { this.points = []; }
  all() { return this.points; }
}

export class PeakDirectionDetector {
  constructor(private minDisplacement = 0.03, private minPeakSpeed = 0.23) {}
  detect(points: MotionSample[]) {
    if (points.length < 4) return { cmd: 'neutral' as const, dx: 0, dy: 0, speed: 0, reason: 'warming-up' };
    const first = points[0];
    const last = points[points.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dt = Math.max(0.001, (last.ts - first.ts) / 1000);
    const vx = dx / dt;
    const vy = dy / dt;
    const speed = Math.sqrt(vx * vx + vy * vy);
    const ax = Math.abs(dx);
    const ay = Math.abs(dy);
    if (Math.max(ax, ay) < this.minDisplacement && speed < this.minPeakSpeed) {
      return { cmd: 'neutral' as const, dx, dy, speed, reason: 'below-threshold' };
    }
    if (ax > ay * 1.18 || Math.abs(vx) > Math.abs(vy) * 1.22) {
      return { cmd: dx < 0 ? 'left' as const : 'right' as const, dx, dy, speed, reason: 'x-peak' };
    }
    if (ay > ax * 1.05 || Math.abs(vy) > Math.abs(vx) * 1.12) {
      return { cmd: dy < 0 ? 'jump' as const : 'duck' as const, dx, dy, speed, reason: 'y-peak' };
    }
    return { cmd: 'neutral' as const, dx, dy, speed, reason: 'ambiguous' };
  }
}

export class CommandSmoother {
  private lastEmitAt = 0;
  private lastStrongCmd: MotionCommand['cmd'] = 'neutral';
  private lastStrongAt = 0;
  constructor(private cooldownMs = 150, private holdMs = 170) {}

  apply(base: ReturnType<PeakDirectionDetector['detect']>, point: MotionSample): MotionCommand {
    const now = point.ts;
    let cmd: MotionCommand['cmd'] = base.cmd;
    let reason = base.reason;

    if (cmd !== 'neutral') {
      if (now - this.lastEmitAt < this.cooldownMs && cmd === this.lastStrongCmd) {
        cmd = 'neutral';
        reason = 'cooldown';
      } else {
        this.lastEmitAt = now;
        this.lastStrongCmd = cmd;
        this.lastStrongAt = now;
      }
    } else if (now - this.lastStrongAt < this.holdMs) {
      cmd = this.lastStrongCmd;
      reason = 'hold';
    }

    return { cmd, confidence: point.confidence, x: point.x, y: point.y, speed: base.speed, dx: base.dx, dy: base.dy, reason, ts: now };
  }
}
