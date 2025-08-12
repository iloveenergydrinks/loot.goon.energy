import { DetectionModelConfig } from './types.js';

export interface DetectionState {
  progress: number; // 0..threshold
}

export function createDetectionState(): DetectionState {
  return { progress: 0 };
}

export function advanceDetection(
  state: DetectionState,
  noisePerSec: number,
  dtSec: number,
  model: DetectionModelConfig,
): { detected: boolean; etaSec: number | null } {
  // Linear model: progress increases with noise scaled by sensitivity
  const delta = noisePerSec * model.sensitivity * dtSec;
  state.progress += delta;
  const remaining = Math.max(0, model.detectionThreshold - state.progress);
  const rate = Math.max(1e-6, noisePerSec * model.sensitivity);
  const etaSec = rate > 0 ? remaining / rate : Infinity;
  return { detected: state.progress >= model.detectionThreshold, etaSec: isFinite(etaSec) ? etaSec : null };
}


