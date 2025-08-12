import { AutoQueuePriorities, CargoState, LootNode, LootTag } from './types.js';
import { weightedValuePerKg } from './util.js';

export function computeAutoQueue(
  nodes: LootNode[],
  cargo: CargoState,
  priorities: AutoQueuePriorities,
  maxItems: number = 20,
): LootNode[] {
  const preferred = new Set(priorities.preferredTags.slice(0, 3));

  const ranked = nodes
    .slice()
    .filter((n) => n.value > 0)
    .map((n) => ({
      node: n,
      score: weightedValuePerKg(n.value, n.massKg, n.tags.some((t) => preferred.has(t))),
    }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.node);

  const result: LootNode[] = [];
  let mass = cargo.usedMassKg;
  let vol = cargo.usedVolumeM3;

  for (const node of ranked) {
    if (result.length >= maxItems) break;
    if (mass + node.massKg <= cargo.maxMassKg && vol + node.volumeM3 <= cargo.maxVolumeM3) {
      result.push(node);
      mass += node.massKg;
      vol += node.volumeM3;
    }
  }
  return result;
}


