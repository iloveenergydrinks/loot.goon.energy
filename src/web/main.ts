import { generateSite } from '../siteGenerator.js';
import { LootingEngine } from '../engine.js';
import { AutoQueuePriorities, CargoState, LootNode, Site, ToolsState } from '../types.js';
import { computeAutoQueue } from '../autoQueue.js';

type Vec = { x: number; y: number };

// Canvas and HUD
const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const hud = document.getElementById('hud')!;
const hudPos = document.getElementById('hudPos')!;
const hudSite = document.getElementById('hudSite')!;
const prompt = document.getElementById('prompt')!;

// Modal elements
const lootModal = document.getElementById('lootModal')!;
const modalTitle = document.getElementById('modalTitle')!;
const closeModal = document.getElementById('closeModal')!;
const lootGrid = document.getElementById('lootGrid')!;
const queueList = document.getElementById('queueList')!;
const hazardValue = document.getElementById('hazardValue')!;
const hazardBar = document.getElementById('hazardBar') as HTMLDivElement;

const cargoStatus = document.getElementById('cargoStatus')!;
const waitForSpace = document.getElementById('waitForSpace') as HTMLInputElement;
const autoStabilize = document.getElementById('autoStabilize') as HTMLInputElement;
const autoQueueBtn = document.getElementById('autoQueueBtn')!;
const startBtn = document.getElementById('startBtn')!;
const abortBtn = document.getElementById('abortBtn')!;

// Stance buttons
const stanceButtons = document.querySelectorAll('.stance-btn');
let currentStance: 'Quick' | 'Normal' | 'Careful' = 'Normal';

// Game state
const player: Vec = { x: 100, y: 100 };
const speed = 160;
let sites: Site[] = [];
let currentSite: Site | null = null;
let engine: LootingEngine | null = null;

const cargo: CargoState = { maxMassKg: 2500, maxVolumeM3: 8, usedMassKg: 0, usedVolumeM3: 0 };
const tools: ToolsState = { hasCrane: true, hasCutter: true };

// Input handling
const keys = new Set<string>();

function resize() {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
}

window.addEventListener('resize', resize);
resize();

// Generate sites
function generateSites() {
  sites = [
    generateSite('Wreck', 'wreck1'),
    generateSite('ResourceNode', 'node1'),
    generateSite('Wreck', 'wreck2'),
  ];
  sites[0].position = { x: 400, y: 300 };
  sites[1].position = { x: 700, y: 200 };
  sites[2].position = { x: 500, y: 500 };
}

generateSites();

// Distance calculation
function distance(a: Vec, b: Vec): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

// Find nearest site
function getNearestSite(): Site | null {
  for (const site of sites) {
    if (distance(player, site.position) < 100) {
      return site;
    }
  }
  return null;
}

// Setup engine for current site
function setupEngine() {
  if (!currentSite) return;
  
  engine = new LootingEngine({
    site: currentSite,
    cargo,
    tools,
    options: {
      stance: currentStance,
      waitForSpace: waitForSpace.checked,
      autoStabilizeVolatiles: autoStabilize.checked,
    },
  });
}

// Render map
function renderMap() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw grid
  ctx.strokeStyle = 'rgba(30, 40, 65, 0.3)';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 50) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }

  // Draw sites
  for (const site of sites) {
    ctx.beginPath();
    ctx.arc(site.position.x, site.position.y, 30, 0, Math.PI * 2);
    ctx.fillStyle = site.type === 'Wreck' ? 'rgba(59, 130, 246, 0.3)' : 'rgba(16, 185, 129, 0.3)';
    ctx.fill();
    ctx.strokeStyle = site.type === 'Wreck' ? '#3b82f6' : '#10b981';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw site label
    ctx.fillStyle = '#e8eaed';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(site.type, site.position.x, site.position.y - 40);
  }

  // Draw interaction radius for current site
  if (currentSite) {
    ctx.beginPath();
    ctx.arc(currentSite.position.x, currentSite.position.y, 100, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Draw player
  ctx.beginPath();
  ctx.arc(player.x, player.y, 12, 0, Math.PI * 2);
  ctx.fillStyle = '#f59e0b';
  ctx.fill();
  ctx.strokeStyle = '#f59e0b';
  ctx.lineWidth = 2;
  ctx.stroke();
}

// Update game state
function update(dt: number) {
  // Movement
  let vx = 0, vy = 0;
  if (keys.has('w') || keys.has('arrowup')) vy -= 1;
  if (keys.has('s') || keys.has('arrowdown')) vy += 1;
  if (keys.has('a') || keys.has('arrowleft')) vx -= 1;
  if (keys.has('d') || keys.has('arrowright')) vx += 1;
  
  const len = Math.hypot(vx, vy) || 1;
  player.x += (vx / len) * speed * dt;
  player.y += (vy / len) * speed * dt;
  player.x = Math.max(20, Math.min(canvas.width - 20, player.x));
  player.y = Math.max(20, Math.min(canvas.height - 20, player.y));

  // Check for nearby site
  const nearSite = getNearestSite();
  if (nearSite !== currentSite) {
    currentSite = nearSite;
    if (currentSite) {
      prompt.style.display = 'block';
      hudSite.textContent = `${currentSite.id} (${currentSite.type})`;
    } else {
      prompt.style.display = 'none';
      hudSite.textContent = 'None';
      if (lootModal.classList.contains('show')) {
        closeLootModal();
      }
    }
  }

  // Update HUD
  hudPos.textContent = `${Math.round(player.x)}, ${Math.round(player.y)}`;

  // Run engine steps
  if (engine && engine.getState().running) {
    for (let i = 0; i < 3; i++) {
      engine.runStep(onEngineEvent);
    }
  }
}

// Engine event handler
function onEngineEvent(e: any) {
  if (!engine) return;
  
  const state = engine.getState();
  
  // Update hazard
  hazardBar.style.width = `${state.site.hazard}%`;
  hazardValue.textContent = `${Math.round(state.site.hazard)}%`;
  

  
  // Update UI on changes
  if (e.type === 'ItemTransferred' || e.type === 'ItemSkipped' || e.type === 'NodeDestroyed') {
    renderLootGrid();
    renderQueue();
  }
  
  // Update cargo
  updateCargoDisplay();
}

// Render loot grid
function renderLootGrid() {
  if (!currentSite || !engine) return;
  
  lootGrid.innerHTML = '';
  const queue = engine.getQueue();
  const queueIds = new Set(queue.map(n => n.id));
  
  for (const node of currentSite.nodes) {
    const card = document.createElement('div');
    card.className = 'loot-card';
    if (queueIds.has(node.id)) {
      card.classList.add('queued');
    }
    
    // Icon based on type
    const icon = node.kind === 'Module' ? '⚙️' : 
                 node.kind === 'Crate' ? '📦' : 
                 node.kind === 'Intel' ? '💾' : '👤';
    
    // Tags
    const tags = node.tags.map(tag => {
      const isDanger = tag === 'Volatile' || tag === 'Ammo' || tag === 'Fuel';
      return `<span class="tag ${isDanger ? 'danger' : ''}">${tag}</span>`;
    }).join('');
    
    card.innerHTML = `
      <div class="loot-tags">${tags}</div>
      <div>
        <div class="loot-icon">${icon}</div>
        <div class="loot-name">${node.name}</div>
      </div>
      <div class="loot-stats">
        <div>${node.extractTimeSec}s • ${node.condition}% cond</div>
        <div>${node.massKg}kg • ${(node.value / Math.max(1, node.massKg)).toFixed(0)} v/kg</div>
      </div>
    `;
    
    card.onclick = () => {
      if (!engine) return;
      engine.enqueue([node]);
      renderLootGrid();
      renderQueue();
      if (!engine.getState().running) {
        engine.start(onEngineEvent);
      }
    };
    
    card.oncontextmenu = (e) => {
      e.preventDefault();
      if (!engine) return;
      engine.enqueue([node]);
      renderLootGrid();
      renderQueue();
    };
    
    lootGrid.appendChild(card);
  }
}

// Render queue
function renderQueue() {
  if (!engine) return;
  
  queueList.innerHTML = '';
  const queue = engine.getQueue();
  
  queue.forEach((node, idx) => {
    const item = document.createElement('div');
    item.className = 'queue-item';
    
    item.innerHTML = `
      <div class="queue-item-name">${node.name}</div>
      <div class="queue-controls">
        <button class="btn small" data-action="up">↑</button>
        <button class="btn small" data-action="down">↓</button>
        <button class="btn small danger" data-action="remove">✕</button>
      </div>
    `;
    
    const upBtn = item.querySelector('[data-action="up"]') as HTMLButtonElement;
    const downBtn = item.querySelector('[data-action="down"]') as HTMLButtonElement;
    const removeBtn = item.querySelector('[data-action="remove"]') as HTMLButtonElement;
    
    upBtn.onclick = () => {
      engine.reorderQueue(idx, idx - 1);
      renderQueue();
    };
    
    downBtn.onclick = () => {
      engine.reorderQueue(idx, idx + 1);
      renderQueue();
    };
    
    removeBtn.onclick = () => {
      const newQueue = queue.filter((_, i) => i !== idx);
      engine.clearQueue();
      engine.enqueue(newQueue);
      renderQueue();
      renderLootGrid();
    };
    
    queueList.appendChild(item);
  });
}

// Update cargo display
function updateCargoDisplay() {
  cargoStatus.textContent = `${Math.round(cargo.usedMassKg)}/${cargo.maxMassKg} kg`;
}

// Open loot modal
function openLootModal() {
  if (!currentSite) return;
  
  lootModal.classList.add('show');
  modalTitle.textContent = `Salvage Operation - ${currentSite.id}`;
  setupEngine();
  renderLootGrid();
  renderQueue();
  updateCargoDisplay();
}

// Close loot modal
function closeLootModal() {
  lootModal.classList.remove('show');
  if (engine && engine.getState().running) {
    engine.abort(onEngineEvent);
  }
}

// Event listeners
window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  keys.add(key);
  
  if (key === 'e' && currentSite && !lootModal.classList.contains('show')) {
    openLootModal();
  }
  
  if (key === 'escape' && lootModal.classList.contains('show')) {
    closeLootModal();
  }
});

window.addEventListener('keyup', (e) => {
  keys.delete(e.key.toLowerCase());
});

closeModal.onclick = closeLootModal;

// Stance selection
stanceButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    stanceButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentStance = btn.getAttribute('data-stance') as any;
    if (engine) {
      setupEngine(); // Recreate engine with new stance
    }
  });
});

// Control buttons
autoQueueBtn.onclick = () => {
  if (!currentSite || !engine) return;
  const priorities: AutoQueuePriorities = { preferredTags: ['Rare', 'Fuel', 'Ammo'] };
  const picks = computeAutoQueue(currentSite.nodes, cargo, priorities, 10);
  engine.enqueue(picks);
  renderLootGrid();
  renderQueue();
};

startBtn.onclick = () => {
  if (!engine) return;
  engine.start(onEngineEvent);
};

abortBtn.onclick = () => {
  if (!engine) return;
  engine.abort(onEngineEvent);
};

// Game loop
let lastTime = performance.now();
function gameLoop(currentTime: number) {
  const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
  lastTime = currentTime;
  
  update(dt);
  renderMap();
  
  requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);