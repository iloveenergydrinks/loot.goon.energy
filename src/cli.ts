import { generateSite } from './siteGenerator.js';
import { LootingEngine } from './engine.js';
import { AutoQueuePriorities, CargoState, ToolsState } from './types.js';
import { computeAutoQueue } from './autoQueue.js';

function logEvent(e: any) {
  switch (e.type) {
    case 'ItemStarted':
      console.log(`[${e.timeSec.toFixed(1)}s] ▶️  Started: ${e.node.name}`);
      break;
    case 'ItemProgress':
      if (Math.abs((e.progress * 100) % 10) < 1e-3) {
        console.log(`[${e.timeSec.toFixed(1)}s] ⏳ ${e.node.name} ${(e.progress * 100).toFixed(0)}%`);
      }
      break;
    case 'ItemTransferred':
      console.log(`[${e.timeSec.toFixed(1)}s] ✅ Transferred: ${e.node.name}`);
      break;
    case 'ItemSkipped':
      console.log(`[${e.timeSec.toFixed(1)}s] ⛔ Skipped: ${e.node.name} — ${e.message}`);
      break;
    case 'StabilizedVolatiles':
      console.log(`[${e.timeSec.toFixed(1)}s] 🧯 Volatiles stabilized`);
      break;
    case 'HazardThreshold':
      console.log(`[${e.timeSec.toFixed(1)}s] ⚠️  Hazard threshold ${e.threshold}`);
      break;
    case 'NodeDamaged':
      console.log(`[${e.timeSec.toFixed(1)}s] 🟠 ${e.node.name}: ${e.message}`);
      break;
    case 'NodeDestroyed':
      console.log(`[${e.timeSec.toFixed(1)}s] 🔴 ${e.node.name}: ${e.message}`);
      break;
    case 'DetectionProgress':
      if (e.message) console.log(`[${e.timeSec.toFixed(1)}s] 👂 Detection ${e.message}`);
      break;
    case 'Completed':
      console.log(`[${e.timeSec.toFixed(1)}s] 🏁 Operation complete`);
      break;
    case 'Aborted':
      console.log(`[${e.timeSec.toFixed(1)}s] 🛑 Operation aborted`);
      break;
  }
}

async function main() {
  // Generate a sample site
  const site = generateSite(Math.random() < 0.5 ? 'Wreck' : 'ResourceNode');

  const cargo: CargoState = {
    maxMassKg: 3000,
    maxVolumeM3: 10,
    usedMassKg: 0,
    usedVolumeM3: 0,
  };

  const tools: ToolsState = { hasCrane: true, hasCutter: true };

  const engine = new LootingEngine({
    site,
    cargo,
    tools,
    options: { stance: 'Normal', waitForSpace: true, autoStabilizeVolatiles: true },
  });

  // Auto-queue by priorities
  const priorities: AutoQueuePriorities = { preferredTags: ['Rare', 'Fuel', 'Ammo'] };
  const picks = computeAutoQueue(site.nodes, cargo, priorities, 8);
  engine.enqueue(picks);

  console.log(`Site ${site.id} (${site.type}) — nodes: ${site.nodes.length}`);
  console.log('Queued items:');
  for (const n of engine.getQueue()) console.log(`  - ${n.name} [${n.tags.join(', ')}] v/kg=${(n.value / n.massKg).toFixed(1)}`);

  engine.start(logEvent);

  let detected = false;
  const intervalMs = 1000 / 30;
  const maxMs = 60_000; // cap demo to 60s
  let elapsed = 0;
  await new Promise<void>((resolve) => {
    const t = setInterval(() => {
      engine.runStep(logEvent);
      elapsed += intervalMs;
      // stop when completed or out of time
      if (!engine.getState().running || elapsed >= maxMs) {
        clearInterval(t);
        resolve();
      }
    }, intervalMs);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


