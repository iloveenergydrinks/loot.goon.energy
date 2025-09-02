import { generateSite } from '../siteGenerator.js';
import { LootingEngine } from '../engine.js';
import { AutoQueuePriorities, CargoState, LootNode, LootTag, Site, ToolsState } from '../types.js';
import { computeAutoQueue } from '../autoQueue.js';
import { getTooltipManager } from './tooltip-manager.js';

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

// Wreck stats elements (create if they don't exist)
let wreckAgeDisplay: HTMLElement;
let integrityDisplay: HTMLElement;
let integrityBar: HTMLElement;

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
    
    // Degrade site integrity on extraction
    if (e.type === 'ItemTransferred' && currentSite) {
      currentSite.integrity = Math.max(0, (currentSite.integrity ?? 100) - 5);
      updateWreckStats(currentSite);
    }
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
      // Use custom tooltip (data-tip), not browser title
      const tip = escapeAttr(getTagTooltip(tag));
      return `<span class="tag ${isDanger ? 'danger' : ''}" data-tip="${tip}">${tag}</span>`;
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

  // Ensure styles and initialize tooltip manager
  ensureTagStyles();
  getTooltipManager();
}

// Tooltips for loot tags
const TAG_TOOLTIPS: Record<LootTag, string> = {
  Ammo: 'Explosive munitions. Can detonate as hazard rises; high chain risk.',
  Fuel: 'Flammable fuel. Increases instability; burns/ignites under stress.',
  Volatile: 'Highly unstable. Explosion chance increases at hazard thresholds.',
  Fragile: 'Easily damaged by vibrations/collapses; value drops if damaged.',
  Heavy: 'High mass. Consumes cargo capacity quickly; slower to move.',
  Rare: 'High-value find. Prioritize when safe; often guarded by risk.',
  Ore: 'Bulk ore. Low value density; heavy and space-consuming.',
  Oil: 'Liquid cargo. Bulky drums; spill/fire risk if compromised.',
};

function getTagTooltip(tag: LootTag): string {
  return TAG_TOOLTIPS[tag] ?? 'No additional info.';
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Inject CSS for larger tags and our tooltip (once)
let TAG_STYLE_ATTACHED = false;
function ensureTagStyles() {
  if (TAG_STYLE_ATTACHED) return;
  const style = document.createElement('style');
  style.textContent = `
    .loot-tags { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 6px; }
    .loot-tags .tag {
      display: inline-flex;
      align-items: center;
      height: 22px;
      padding: 0 8px;
      border: 1px solid #444;
      border-radius: 4px;
      background: rgba(0,0,0,0.7);
      color: #cfcfcf;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      line-height: 1;
      cursor: default;
    }
    .loot-tags .tag.danger { border-color: #ff4444; color: #ffaaaa; background: rgba(64,0,0,0.5); }
    .ui-tooltip {
      position: fixed;
      z-index: 10000;
      max-width: 280px;
      padding: 8px 10px;
      background: linear-gradient(135deg, rgba(15,15,15,0.98), rgba(10,10,10,0.98));
      border: 1px solid #444;
      border-radius: 3px;
      color: #e0e0e0;
      font-size: 12px;
      line-height: 1.4;
      pointer-events: none;
      box-shadow: 0 4px 12px rgba(0,0,0,0.7), 0 0 1px rgba(255,255,255,0.1);
      backdrop-filter: blur(4px);
      animation: tooltip-fade-in 0.15s ease-out;
    }
    
    @keyframes tooltip-fade-in {
      from {
        opacity: 0;
        transform: scale(0.95);
      }
      to {
        opacity: 1;
        transform: scale(1);
      }
    }
  `;
  document.head.appendChild(style);
  TAG_STYLE_ATTACHED = true;
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

// Initialize wreck stats display
function initWreckStats() {
  // Check if elements exist, if not create them
  if (!document.getElementById('wreckAge')) {
    // Create wreck stats container
    const statsContainer = document.createElement('div');
    statsContainer.className = 'wreck-stats-container';
    statsContainer.innerHTML = `
      <div class="wreck-stat-row">
        <span class="stat-label">Wreck Age:</span>
        <span id="wreckAge" class="stat-value">Fresh</span>
      </div>
      <div class="wreck-stat-row">
        <span class="stat-label">Integrity:</span>
        <div class="integrity-bar-container">
          <div id="wreckIntegrityBar" class="integrity-bar-fill"></div>
        </div>
        <span id="wreckIntegrityValue" class="stat-value">100%</span>
      </div>
    `;
    
    // Insert after hazard display or in loot grid area
    const lootGridContainer = lootGrid?.parentElement;
    if (lootGridContainer) {
      lootGridContainer.insertBefore(statsContainer, lootGrid);
    }
    
    // Add styles
    if (!document.getElementById('wreck-stats-style')) {
      const style = document.createElement('style');
      style.id = 'wreck-stats-style';
      style.textContent = `
        .wreck-stats-container {
          margin: 10px 0;
          padding: 10px;
          background: rgba(0,0,0,0.5);
          border: 1px solid #333;
          border-radius: 3px;
        }
        .wreck-stat-row {
          display: flex;
          align-items: center;
          margin: 5px 0;
          font-size: 12px;
        }
        .wreck-stat-row .stat-label {
          flex: 0 0 80px;
          color: #888;
        }
        .wreck-stat-row .stat-value {
          color: #fff;
          font-weight: bold;
        }
        .integrity-bar-container {
          flex: 1;
          height: 10px;
          background: rgba(0,0,0,0.8);
          border: 1px solid #444;
          margin: 0 10px;
          position: relative;
        }
        .integrity-bar-fill {
          height: 100%;
          background: linear-gradient(90deg, #44ff44, #ffaa44);
          transition: width 0.3s ease;
        }
        .wreck-age-fresh { color: #44ff44 !important; }
        .wreck-age-aging { color: #ffaa44 !important; }
        .wreck-age-old { color: #ff6644 !important; }
      `;
      document.head.appendChild(style);
    }
  }
  
  wreckAgeDisplay = document.getElementById('wreckAge')!;
  integrityDisplay = document.getElementById('wreckIntegrityValue')!;
  integrityBar = document.getElementById('wreckIntegrityBar') as HTMLElement;
}

// Update wreck stats display
function updateWreckStats(site: Site) {
  if (!wreckAgeDisplay || !integrityDisplay || !integrityBar) {
    initWreckStats();
  }
  
  // Calculate wreck age
  const ageMinutes = site.createdAt ? (Date.now() - site.createdAt) / 60000 : 0;
  let ageText = 'Fresh';
  let ageClass = 'wreck-age-fresh';
  
  if (ageMinutes >= 30) {
    ageText = `Old (${Math.floor(ageMinutes)}min)`;
    ageClass = 'wreck-age-old';
  } else if (ageMinutes >= 10) {
    ageText = `Aging (${Math.floor(ageMinutes)}min)`;
    ageClass = 'wreck-age-aging';
  } else {
    ageText = `Fresh (${Math.floor(ageMinutes)}min)`;
  }
  
  wreckAgeDisplay.textContent = ageText;
  wreckAgeDisplay.className = `stat-value ${ageClass}`;
  
  // Update integrity
  const integrity = site.integrity ?? 100;
  integrityDisplay.textContent = `${Math.round(integrity)}%`;
  integrityBar.style.width = `${integrity}%`;
  
  // Color code integrity bar
  if (integrity <= 30) {
    integrityBar.style.background = 'linear-gradient(90deg, #ff4444, #ff6644)';
  } else if (integrity <= 60) {
    integrityBar.style.background = 'linear-gradient(90deg, #ffaa44, #ffcc44)';
  } else {
    integrityBar.style.background = 'linear-gradient(90deg, #44ff44, #66ff66)';
  }
}

// Timer for updating wreck age
let wreckAgeTimer: number | null = null;

// Open loot modal
function openLootModal() {
  if (!currentSite) return;
  
  lootModal.classList.add('show');
  modalTitle.textContent = `Salvage Operation - ${currentSite.id}`;
  setupEngine();
  initWreckStats();
  updateWreckStats(currentSite);
  renderLootGrid();
  renderQueue();
  updateCargoDisplay();
  
  // Start timer to update wreck age every 10 seconds
  if (wreckAgeTimer) clearInterval(wreckAgeTimer);
  wreckAgeTimer = window.setInterval(() => {
    if (currentSite) {
      updateWreckStats(currentSite);
      
      // Apply age-based degradation
      const ageMinutes = currentSite.createdAt ? (Date.now() - currentSite.createdAt) / 60000 : 0;
      if (ageMinutes >= 10) {
        // Slow integrity loss for old wrecks
        currentSite.integrity = Math.max(0, (currentSite.integrity ?? 100) - 0.5);
      }
    }
  }, 10000);
}

// Close loot modal
function closeLootModal() {
  lootModal.classList.remove('show');
  if (engine && engine.getState().running) {
    engine.abort(onEngineEvent);
  }
  if (wreckAgeTimer) {
    clearInterval(wreckAgeTimer);
    wreckAgeTimer = null;
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