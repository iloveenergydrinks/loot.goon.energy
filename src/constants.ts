import { SimulationConfig, Stance } from './types.js';

export const DEFAULT_SIM_CONFIG: SimulationConfig = {
  tickRateHz: 10,
  hazardClamp: { min: 0, max: 100 },
  hazardThresholds: [30, 60, 90],
  stallChanceAtThreshold: 0.15,
  fragileDamageChanceAtThreshold: 0.25,
  volatileExplodeChanceAtThreshold: 0.2,
  volatileRadiusCount: 2,
  stabilizeTimeSec: 6,
  stabilizeNoisePerSec: 4,
  stabilizeEffectMultiplier: 0.5,

};

export interface StanceModifiers {
  timeMultiplier: number;
  noiseMultiplier: number;
  hazardMultiplier: number;
  conditionDelta: number; // additive percentage points
}

export const STANCE_MODIFIERS: Record<Stance, StanceModifiers> = {
  Quick: {
    timeMultiplier: 0.65,
    noiseMultiplier: 1.35,
    hazardMultiplier: 1.35,
    conditionDelta: -10,
  },
  Normal: {
    timeMultiplier: 1,
    noiseMultiplier: 1,
    hazardMultiplier: 1,
    conditionDelta: 0,
  },
  Careful: {
    timeMultiplier: 1.25,
    noiseMultiplier: 0.75,
    hazardMultiplier: 0.75,
    conditionDelta: +10,
  },
};


