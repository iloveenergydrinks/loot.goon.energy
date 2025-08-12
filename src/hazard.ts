import { LootNode, SimulationConfig, Site } from './types.js';
import { clamp, pickRandom } from './util.js';

export interface HazardState {
  triggeredThresholds: Set<number>;
}

export function createHazardState(): HazardState {
  return { triggeredThresholds: new Set<number>() };
}

export function addHazard(site: Site, amount: number, config: SimulationConfig): void {
  const next = clamp(site.hazard + amount, config.hazardClamp.min, config.hazardClamp.max);
  site.hazard = next;
}

export function checkThresholdEvents(
  site: Site,
  hazardState: HazardState,
  config: SimulationConfig,
  onNodeDamaged: (node: LootNode, message: string) => void,
  onNodeDestroyed: (node: LootNode, message: string) => void,
  onThreshold: (threshold: number) => void,
): void {
  for (const t of config.hazardThresholds) {
    if (site.hazard >= t && !hazardState.triggeredThresholds.has(t)) {
      hazardState.triggeredThresholds.add(t);
      onThreshold(t);
      rollThresholdEffects(site, config, onNodeDamaged, onNodeDestroyed);
    }
  }
}

function rollThresholdEffects(
  site: Site,
  config: SimulationConfig,
  onNodeDamaged: (node: LootNode, message: string) => void,
  onNodeDestroyed: (node: LootNode, message: string) => void,
) {
  // Volatile explosions
  const volatileCandidates = site.nodes.filter((n) => n.tags.includes('Volatile') || n.tags.includes('Ammo') || n.tags.includes('Fuel'));
  for (const node of volatileCandidates) {
    const chance = config.volatileExplodeChanceAtThreshold * (site.stabilizedVolatiles ? config.stabilizeEffectMultiplier : 1);
    if (Math.random() < chance) {
      // destroy this node
      onNodeDestroyed(node, `${node.name} detonated due to rising hazard.`);
      // affect neighbors
      const neighbors = pickRandom(site.nodes.filter((n) => n.id !== node.id), config.volatileRadiusCount);
      for (const neighbor of neighbors) {
        if (Math.random() < 0.5) {
          neighbor.condition = Math.max(0, neighbor.condition - 25);
          onNodeDamaged(neighbor, `${neighbor.name} damaged by blast.`);
          if (neighbor.condition <= 0) {
            onNodeDestroyed(neighbor, `${neighbor.name} destroyed by blast damage.`);
          }
        }
      }
    }
  }

  // Fragile damage
  for (const node of site.nodes) {
    if (node.tags.includes('Fragile') && Math.random() < config.fragileDamageChanceAtThreshold) {
      node.condition = Math.max(0, node.condition - 15);
      onNodeDamaged(node, `${node.name} condition dropped due to instability.`);
    }
  }

  // Stalls (simulate jams/cave-ins)
  for (const node of site.nodes) {
    if (Math.random() < config.stallChanceAtThreshold) {
      // Mark via negative extractTime spike by small factor to emulate stall; engine will surface as event
      node.extractTimeSec += 3; // transient slowdown; minimal state for MVP
      onNodeDamaged(node, `${node.name} encountered a stall; extraction slowed.`);
    }
  }
}


