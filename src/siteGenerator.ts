import { LootNode, LootTag, Site, SiteType } from './types.js';

function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}

let nextId = 1;
function id(prefix: string): string {
  return `${prefix}_${nextId++}`;
}

function makeNode(
  name: string,
  kind: 'Module' | 'Crate' | 'Intel' | 'Crew',
  tags: LootTag[],
  massKg: number,
  volumeM3: number,
  value: number,
  extractTimeSec: number,
  baseNoisePerSec: number,
  baseHazardPerSec: number,
  requiresTool?: 'Crane' | 'Cutter',
  volatile?: boolean,
): LootNode {
  return {
    id: id('node'),
    name,
    kind,
    tags,
    massKg,
    volumeM3,
    condition: randomInt(60, 100),
    value,
    extractTimeSec,
    baseNoisePerSec,
    baseHazardPerSec,
    requiresTool,
    volatile,
  };
}

function generateWreckNodes(): LootNode[] {
  const nodes: LootNode[] = [];
  // Modules
  nodes.push(
    makeNode('AK-130 Turret', 'Module', ['Heavy', 'Fragile', 'Rare'], 8000, 30, 120000, 60, 6, 4, 'Crane'),
    makeNode('MR-500 Radar', 'Module', ['Fragile', 'Rare'], 1200, 6, 50000, 45, 5, 3, 'Crane'),
    makeNode('Encrypted Disk', 'Intel', ['Rare'], 2, 0.01, 25000, 12, 2, 1, 'Cutter'),
  );
  // Crates
  nodes.push(
    makeNode('30mm Ammo Crate (120)', 'Crate', ['Ammo', 'Volatile'], 200, 1.2, 12000, 20, 4, 5, undefined, true),
    makeNode('Fuel Drum (200L)', 'Crate', ['Fuel', 'Volatile', 'Heavy'], 180, 0.3, 8000, 15, 4, 4, undefined, true),
    makeNode('Missile x1', 'Crate', ['Ammo', 'Volatile', 'Rare'], 300, 1.5, 35000, 30, 5, 6, 'Crane', true),
  );
  // Crew
  nodes.push(makeNode('Survivor', 'Crew', [], 80, 0.2, 0, 10, 1, 1));
  return nodes;
}

function generateResourceNodes(): LootNode[] {
  const nodes: LootNode[] = [];
  for (let i = 0; i < randomInt(6, 12); i++) {
    const oreMass = randomInt(30, 70);
    nodes.push(
      makeNode(
        `Ore Crate (${oreMass}kg)`,
        'Crate',
        ['Ore', ...(Math.random() < 0.15 ? (['Fragile'] as LootTag[]) : [])],
        oreMass,
        0.4,
        oreMass * randomRange(40, 60),
        randomInt(10, 20),
        2,
        2,
        'Crane',
      ),
    );
  }
  // Rare sample
  if (Math.random() < 0.35) {
    nodes.push(
      makeNode('Rare Crystal Sample', 'Crate', ['Rare', 'Fragile'], 25, 0.1, 45000, 25, 3, 3, 'Cutter'),
    );
  }
  // Oil drums
  for (let i = 0; i < randomInt(1, 3); i++) {
    nodes.push(makeNode('Oil Drum (200L)', 'Crate', ['Oil', 'Heavy'], 200, 0.35, 7000, 12, 2, 2));
  }
  // Intel
  if (Math.random() < 0.25) {
    nodes.push(makeNode('Survey Data', 'Intel', ['Rare'], 2, 0.01, 18000, 8, 1, 1));
  }
  return nodes;
}

export function generateSite(type: SiteType, idStr = 'site'): Site {
  const nodes = type === 'Wreck' ? generateWreckNodes() : generateResourceNodes();
  return {
    id: `${idStr}_${Math.floor(Math.random() * 100000)}`,
    type,
    position: { x: Math.random() * 1000, y: Math.random() * 1000 },
    nodes,
    hazard: 0,
    baselineNoisePerSec: type === 'Wreck' ? 2 : 1,
    stabilizedVolatiles: false,
    exhausted: nodes.length === 0,
    createdAt: Date.now(),
    integrity: 100,
  };
}


