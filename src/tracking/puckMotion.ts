export type PuckCommand = 'neutral' | 'left' | 'right' | 'jump' | 'duck' | 'lost';

export type PuckSample = {
  x: number | null;
  y: number | null;
  confidence: number;
  ts?: number;
};

export type PuckMotionOptions = {
  maxPoints?: number;
  windowMs?: number;
  minConfidence?: number;
  minDisplacement?: number;
  minPeakSpeed?: number;
  alpha?: number;
  cooldownMs?: number;
  holdMs?: number;
};

export type PuckMotionResult = {
  cmd: PuckCommand;
  rawCommand: PuckCommand;
  confidence: number;
  x: number | null;
  y: number | null;
  dx: number;
  dy: number;
  speed: number;
  reason: string;
  stable: boolean;
  ts: number;
};

type Point = { x: number; y: number; ts: number; confidence: number };

function median(values: number[]): number {
  if (!values.length) return 0;
  const arr = values.slice().sort((a, b) => a - b);
  const mid = Math.floor(arr.length / 2);
  return arr.length % 2 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
}

function majorityVote(values: PuckCommand[]): PuckCommand {
  const counts: Partial<Record<PuckCommand, number>> = {};
  let best: PuckCommand = 'neutral';
  let bestCount = 0;
  for (const v of values) {
    if (!v || v === 'neutral' || v === 'lost') continue;
    counts[v] = (counts[v] || 0) + 1;
    if ((counts[v] || 0) > bestCount) {
      best = v;
      bestCount = counts[v] || 0;
    }
  }
  return bestCount >= 2 ? best : 'neutral';
}

export class PuckMotionEngine {
  private points: Point[] = [];
  private rawCommands: PuckCommand[] = [];
  private smoothed: { x: number; y: number } | null = null;
  private lastEmitAt = 0;
  private lastStrongCmd: PuckCommand = 'neutral';
  private lastStrongAt = 0;

  private readonly maxPoints: number;
  private readonly windowMs: number;
  private readonly minConfidence: number;
  private readonly minDisplacement: number;
  private readonly minPeakSpeed: number;
  private readonly alpha: number;
  private readonly cooldownMs: number;
  private readonly holdMs: number;

  constructor(options: PuckMotionOptions = {}) {
    this.maxPoints = options.maxPoints ?? 24;
    this.windowMs = options.windowMs ?? 520;
    this.minConfidence = options.minConfidence ?? 0.35;
    this.minDisplacement = options.minDisplacement ?? 0.065;
    this.minPeakSpeed = options.minPeakSpeed ?? 0.38;
    this.alpha = options.alpha ?? 0.30;
    this.cooldownMs = options.cooldownMs ?? 220;
    this.holdMs = options.holdMs ?? 140;
  }

  reset(): void {
    this.points = [];
    this.rawCommands = [];
    this.smoothed = null;
    this.lastEmitAt = 0;
    this.lastStrongCmd = 'neutral';
    this.lastStrongAt = 0;
  }

  update(sample: PuckSample): PuckMotionResult {
    const now = sample.ts ?? Date.now();
    const confidence = typeof sample.confidence === 'number' ? sample.confidence : 0;

    if (sample.x == null || sample.y == null || confidence < this.minConfidence) {
      return this.result('lost', 'lost', confidence, sample.x, sample.y, 0, 0, 0, 'low-confidence', now);
    }

    const rawWindow = this.points.slice(-2);
    rawWindow.push({ x: sample.x, y: sample.y, ts: now, confidence });
    const mx = median(rawWindow.map((p) => p.x));
    const my = median(rawWindow.map((p) => p.y));

    if (!this.smoothed) this.smoothed = { x: mx, y: my };
    this.smoothed.x = this.smoothed.x * (1 - this.alpha) + mx * this.alpha;
    this.smoothed.y = this.smoothed.y * (1 - this.alpha) + my * this.alpha;

    const point: Point = { x: this.smoothed.x, y: this.smoothed.y, ts: now, confidence };
    this.points.push(point);
    while (this.points.length > this.maxPoints) this.points.shift();
    while (this.points.length && now - this.points[0].ts > this.windowMs) this.points.shift();

    if (this.points.length < 4) {
      return this.result('neutral', 'neutral', confidence, point.x, point.y, 0, 0, 0, 'warming-up', now);
    }

    const first = this.points[0];
    const last = this.points[this.points.length - 1];
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    const dtSec = Math.max(0.001, (last.ts - first.ts) / 1000);
    const vx = dx / dtSec;
    const vy = dy / dtSec;
    const speed = Math.sqrt(vx * vx + vy * vy);

    const raw = this.classify(dx, dy, vx, vy, speed);
    this.rawCommands.push(raw.cmd);
    if (this.rawCommands.length > 5) this.rawCommands.shift();

    let cmd = majorityVote(this.rawCommands);
    let reason = raw.reason;

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

    return this.result(cmd, raw.cmd, confidence, last.x, last.y, dx, dy, speed, reason, now);
  }

  private classify(dx: number, dy: number, vx: number, vy: number, speed: number): { cmd: PuckCommand; reason: string } {
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    const peakX = Math.abs(vx);
    const peakY = Math.abs(vy);

    if (Math.max(absX, absY) < this.minDisplacement && speed < this.minPeakSpeed) {
      return { cmd: 'neutral', reason: 'below-threshold' };
    }
    if (absX > absY * 1.18 || peakX > peakY * 1.22) {
      return { cmd: dx < 0 ? 'left' : 'right', reason: 'x-peak' };
    }
    if (absY > absX * 1.05 || peakY > peakX * 1.12) {
      return { cmd: dy < 0 ? 'jump' : 'duck', reason: 'y-peak' };
    }
    return { cmd: 'neutral', reason: 'ambiguous' };
  }

  private result(
    cmd: PuckCommand,
    rawCommand: PuckCommand,
    confidence: number,
    x: number | null,
    y: number | null,
    dx: number,
    dy: number,
    speed: number,
    reason: string,
    ts: number,
  ): PuckMotionResult {
    return {
      cmd,
      rawCommand,
      confidence,
      x,
      y,
      dx,
      dy,
      speed,
      reason,
      stable: cmd !== 'neutral' && cmd !== 'lost',
      ts,
    };
  }
}
