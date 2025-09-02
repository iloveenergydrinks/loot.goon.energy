export type LootKind = 'Module' | 'Crate' | 'Intel' | 'Crew';
export type LootTag =
  | 'Ammo'
  | 'Fuel'
  | 'Volatile'
  | 'Fragile'
  | 'Heavy'
  | 'Rare'
  | 'Ore'
  | 'Oil';

export interface LootNode {
  id: string;
  name: string;
  kind: LootKind;
  tags: LootTag[];
  massKg: number;
  volumeM3: number;
  condition: number; // 0–100
  value: number;
  extractTimeSec: number;
  baseNoisePerSec: number;
  baseHazardPerSec: number;
  requiresTool?: 'Crane' | 'Cutter';
  volatile?: boolean;
}

export type SiteType = 'Wreck' | 'ResourceNode';

export interface Site {
  id: string;
  type: SiteType;
  position: { x: number; y: number };
  nodes: LootNode[];
  hazard: number; // 0–100
  baselineNoisePerSec: number;
  stabilizedVolatiles: boolean;
  exhausted: boolean;
  createdAt?: number; // Timestamp when wreck was created
  integrity?: number; // 0-100, structural integrity
}

export type Stance = 'Quick' | 'Normal' | 'Careful';

export interface CargoState {
  maxMassKg: number;
  maxVolumeM3: number;
  usedMassKg: number;
  usedVolumeM3: number;
}

export interface ToolsState {
  hasCrane: boolean;
  hasCutter: boolean;
}

export interface OperationOptions {
  stance: Stance;
  waitForSpace: boolean;
  autoStabilizeVolatiles: boolean; // perform once-per-site stabilization if beneficial
}



export interface SimulationConfig {
  tickRateHz: number; // ticks per second
  hazardClamp: { min: number; max: number };
  hazardThresholds: number[]; // e.g., [30, 60, 90]
  stallChanceAtThreshold: number; // 0..1 applied to non-volatile nodes
  fragileDamageChanceAtThreshold: number; // 0..1 for Fragile-tagged nodes
  volatileExplodeChanceAtThreshold: number; // 0..1 for Volatile/Ammo/Fuel
  volatileRadiusCount: number; // how many neighboring nodes to affect on explosion
  stabilizeTimeSec: number; // time cost for stabilization action
  stabilizeNoisePerSec: number;
  stabilizeEffectMultiplier: number; // e.g., 0.5 halves future volatile risks

}

export interface ExtractionEventBase {
  timeSec: number;
  type:
    | 'Tick'
    | 'ItemStarted'
    | 'ItemProgress'
    | 'ItemTransferred'
    | 'ItemSkipped'
    | 'ItemStalled'
    | 'HazardThreshold'
    | 'NodeDamaged'
    | 'NodeDestroyed'
    | 'StabilizedVolatiles'

    | 'Aborted'
    | 'Completed';
  message?: string;
}

export interface ItemEventPayload {
  node?: LootNode;
  queueIndex?: number;
  progress?: number; // 0..1 of current item
}

export interface HazardEventPayload {
  threshold?: number;
  affectedNode?: LootNode;
}

export type ExtractionEvent =
  | (ExtractionEventBase & { type: 'Tick' })
  | (ExtractionEventBase & { type: 'ItemStarted'; node: LootNode; queueIndex: number })
  | (ExtractionEventBase & { type: 'ItemProgress'; node: LootNode; progress: number })
  | (ExtractionEventBase & { type: 'ItemTransferred'; node: LootNode })
  | (ExtractionEventBase & { type: 'ItemSkipped'; node: LootNode; message: string })
  | (ExtractionEventBase & { type: 'ItemStalled'; node: LootNode; message: string })
  | (ExtractionEventBase & { type: 'HazardThreshold'; threshold: number })
  | (ExtractionEventBase & { type: 'NodeDamaged'; node: LootNode; message: string })
  | (ExtractionEventBase & { type: 'NodeDestroyed'; node: LootNode; message: string })
  | (ExtractionEventBase & { type: 'StabilizedVolatiles' })

  | (ExtractionEventBase & { type: 'Aborted' })
  | (ExtractionEventBase & { type: 'Completed' });

export interface AutoQueuePriorities {
  preferredTags: LootTag[]; // up to 3
}


