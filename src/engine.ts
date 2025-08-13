import {
  AutoQueuePriorities,
  CargoState,
  ExtractionEvent,
  LootNode,
  OperationOptions,
  SimulationConfig,
  Site,
  Stance,
  ToolsState,
} from './types.js';
import { DEFAULT_SIM_CONFIG, STANCE_MODIFIERS } from './constants.js';
import { clamp } from './util.js';
import { addHazard, checkThresholdEvents, createHazardState, HazardState } from './hazard.js';


export interface EngineInit {
  site: Site;
  cargo: CargoState;
  tools: ToolsState;
  options: OperationOptions;
  config?: Partial<SimulationConfig>;
}

export class LootingEngine {
  private site: Site;
  private cargo: CargoState;
  private tools: ToolsState;
  private options: OperationOptions;
  private config: SimulationConfig;

  private queue: LootNode[] = [];
  private isRunning = false;
  private timeSec = 0;
  private currentNodeProgressSec = 0;
  private currentNodeTotalSec = 0;
  private currentNode: LootNode | null = null;
  private hazardState: HazardState = createHazardState();


  public constructor(init: EngineInit) {
    this.site = init.site;
    this.cargo = init.cargo;
    this.tools = init.tools;
    this.options = init.options;
    this.config = { ...DEFAULT_SIM_CONFIG, ...init.config } as SimulationConfig;
  }

  public getQueue(): LootNode[] {
    return this.queue.slice();
  }

  public enqueue(nodes: LootNode[]): void {
    for (const n of nodes) {
      if (this.site.nodes.find((x) => x.id === n.id)) this.queue.push(n);
    }
  }

  public reorderQueue(index: number, newIndex: number): void {
    if (index < 0 || index >= this.queue.length) return;
    const [item] = this.queue.splice(index, 1);
    this.queue.splice(Math.max(0, Math.min(newIndex, this.queue.length)), 0, item);
  }

  public clearQueue(): void {
    this.queue = [];
  }

  public getState() {
    return {
      site: this.site,
      cargo: this.cargo,
      options: this.options,
      timeSec: this.timeSec,
      running: this.isRunning,
      currentNode: this.currentNode,
      currentNodeProgressSec: this.currentNodeProgressSec,

    };
  }

  private canExtract(node: LootNode): { ok: boolean; reason?: string } {
    if (node.requiresTool === 'Crane' && !this.tools.hasCrane) return { ok: false, reason: 'Requires Crane' };
    if (node.requiresTool === 'Cutter' && !this.tools.hasCutter) return { ok: false, reason: 'Requires Cutter' };
    const fits =
      this.cargo.usedMassKg + node.massKg <= this.cargo.maxMassKg &&
      this.cargo.usedVolumeM3 + node.volumeM3 <= this.cargo.maxVolumeM3;
    if (!fits && !this.options.waitForSpace) return { ok: false, reason: 'Insufficient cargo space' };
    return { ok: true };
  }

  private consumeCargo(node: LootNode): void {
    this.cargo.usedMassKg += node.massKg;
    this.cargo.usedVolumeM3 += node.volumeM3;
  }

  private removeNodeFromSite(nodeId: string): void {
    this.site.nodes = this.site.nodes.filter((n) => n.id !== nodeId);
    if (this.site.nodes.length === 0) this.site.exhausted = true;
  }

  private startNextNode(emit: (e: ExtractionEvent) => void): void {
    this.currentNode = null;
    this.currentNodeProgressSec = 0;
    this.currentNodeTotalSec = 0;

    while (this.queue.length > 0) {
      const node = this.queue[0];
      // If node no longer exists, drop it
      if (!this.site.nodes.find((n) => n.id === node.id)) {
        this.queue.shift();
        continue;
      }
      const can = this.canExtract(node);
      if (!can.ok) {
        if (!this.options.waitForSpace || can.reason !== 'Insufficient cargo space') {
          this.queue.shift();
          emit({ type: 'ItemSkipped', timeSec: this.timeSec, node, message: can.reason ?? 'Skipped' });
          continue;
        } else {
          // wait for space: keep it queued but move on (no other items if waiting)
          return;
        }
      }
      this.currentNode = node;
      const stance = STANCE_MODIFIERS[this.options.stance];
      this.currentNodeTotalSec = Math.max(0.5, node.extractTimeSec * stance.timeMultiplier);
      this.currentNodeProgressSec = 0;
      emit({ type: 'ItemStarted', timeSec: this.timeSec, node, queueIndex: 0 });
      return;
    }
    // No more items in queue
    this.isRunning = false;
    emit({ type: 'Completed', timeSec: this.timeSec });
  }

  private maybeStabilize(emit: (e: ExtractionEvent) => void, dtSec: number): void {
    // Perform once per site, only once, at start of operation
    if (!this.site.stabilizedVolatiles && this.options.autoStabilizeVolatiles) {
      const dur = this.config.stabilizeTimeSec;
      const noise = this.config.stabilizeNoisePerSec;
      // Simulate the stabilization taking place immediately at operation start
      this.site.stabilizedVolatiles = true;
      emit({ type: 'StabilizedVolatiles', timeSec: this.timeSec });
      // Apply one-time hazard/noise during the stabilization window
      const ticks = Math.ceil((dur * this.config.tickRateHz) || 1);
      for (let i = 0; i < ticks; i++) {
        this.tickHazard(0, 1 / this.config.tickRateHz, emit);
      }
    }
  }

  private tickHazard(

    currentItemHazardPerSec: number,
    dtSec: number,
    emit: (e: ExtractionEvent) => void,
  ): void {
    const stance = STANCE_MODIFIERS[this.options.stance];
    // hazard grows with current item hazard rate scaled by stance
    const hazardPerSec = currentItemHazardPerSec * stance.hazardMultiplier;
    addHazard(this.site, hazardPerSec * dtSec, this.config);
    // thresholds
    checkThresholdEvents(
      this.site,
      this.hazardState,
      this.config,
      (node, message) => emit({ type: 'NodeDamaged', timeSec: this.timeSec, node, message }),
      (node, message) => {
        // remove destroyed nodes
        this.site.nodes = this.site.nodes.filter((n) => n.id !== node.id);
        emit({ type: 'NodeDestroyed', timeSec: this.timeSec, node, message });
      },
      (threshold) => emit({ type: 'HazardThreshold', timeSec: this.timeSec, threshold }),
    );

  }

  public runStep(emit: (e: ExtractionEvent) => void): void {
    if (!this.isRunning) return;
    const dtSec = 1 / this.config.tickRateHz;
    this.timeSec += dtSec;

    // Process current node or get a new one
    if (!this.currentNode) {
      this.startNextNode(emit);
      if (!this.isRunning) return; // may have completed
      if (!this.currentNode) return; // waiting for space
    }

    const node = this.currentNode!;
    const stance = STANCE_MODIFIERS[this.options.stance];
    // tick hazard using the node's base rates
    this.tickHazard(node.baseHazardPerSec, dtSec, emit);

    // progress extraction
    this.currentNodeProgressSec += dtSec;
    const progress = clamp(this.currentNodeProgressSec / this.currentNodeTotalSec, 0, 1);
    emit({ type: 'ItemProgress', timeSec: this.timeSec, node, progress });

    if (progress >= 1) {
      // transfer if still fits
      const can = this.canExtract(node);
      if (!can.ok) {
        // If we were waiting, then space never came; treat as skip now to avoid deadlock
        emit({ type: 'ItemSkipped', timeSec: this.timeSec, node, message: can.reason ?? 'Skipped' });
        this.queue.shift();
        this.currentNode = null;
        return;
      }

      // apply condition preservation
      node.condition = clamp(node.condition + STANCE_MODIFIERS[this.options.stance].conditionDelta, 0, 100);

      // transfer
      this.consumeCargo(node);
      this.removeNodeFromSite(node.id);
      this.queue.shift();
      emit({ type: 'ItemTransferred', timeSec: this.timeSec, node });
      this.currentNode = null;
    }
  }

  public start(emit: (e: ExtractionEvent) => void): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.maybeStabilize(emit, 0);
  }

  public abort(emit: (e: ExtractionEvent) => void): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    emit({ type: 'Aborted', timeSec: this.timeSec });
  }
}


