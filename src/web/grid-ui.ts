import { LootingGrid, Module } from './grid-game.js';

// DOM elements
const lootGrid = document.getElementById('lootGrid')!;
const totalValue = document.getElementById('totalValue')!;
const cargoStatus = document.getElementById('cargoStatus')!;
const stabilityBar = document.getElementById('stabilityBar') as HTMLDivElement;
const stabilityValue = document.getElementById('stabilityValue')!;
const detectionBar = document.getElementById('detectionBar') as HTMLDivElement;
const detectionValue = document.getElementById('detectionValue')!;
const stanceButtons = document.querySelectorAll('.stance-btn');

// Game instance
const game = new LootingGrid(updateUI, onExplosion);

// Module icons
const moduleIcons: Record<string, string> = {
  volatile: '💣',
  fragile: '💎',
  heavy: '🛡️',
  data: '💾',
  structural: '🏗️',
  valuable: '✨',
  empty: '',
};

function updateUI() {
  const state = game.getState();
  const site = state.currentSite;
  
  if (!site) return;
  
  // Update stats
  totalValue.textContent = state.totalValue.toString();
  cargoStatus.textContent = `${state.cargoUsed}/${state.cargoMax}`;
  
  // Update meters
  stabilityBar.style.width = `${site.siteStability}%`;
  stabilityValue.textContent = `${Math.round(site.siteStability)}%`;
  
  detectionBar.style.width = `${site.detectionLevel}%`;
  detectionValue.textContent = `${Math.round(site.detectionLevel)}%`;
  
  // Color code stability bar
  if (site.siteStability < 30) {
    stabilityBar.style.background = 'linear-gradient(90deg, #ff0040, #ff3366)';
  } else if (site.siteStability < 60) {
    stabilityBar.style.background = 'linear-gradient(90deg, #ff6600, #ffaa00)';
  } else {
    stabilityBar.style.background = 'linear-gradient(90deg, #00aa66, #00ff88)';
  }
  
  // Render grid
  renderGrid();
}

function renderGrid() {
  const state = game.getState();
  const site = state.currentSite;
  
  if (!site) return;
  
  // Set grid dimensions
  lootGrid.style.gridTemplateColumns = `repeat(${site.width}, 1fr)`;
  lootGrid.innerHTML = '';
  
  // Sort modules by position
  const sortedModules = [...site.modules].sort((a, b) => {
    if (a.gridY !== b.gridY) return a.gridY - b.gridY;
    return a.gridX - b.gridX;
  });
  
  for (const module of sortedModules) {
    const cell = createCell(module);
    lootGrid.appendChild(cell);
  }
}

function createCell(module: Module): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = `grid-cell ${module.state}`;
  cell.dataset.moduleId = module.id;
  
  if (module.isShaking) {
    cell.classList.add('shaking');
  }
  
  if (module.state === 'destroyed' || module.type === 'empty') {
    return cell;
  }
  
  // Icon
  const icon = document.createElement('div');
  icon.className = 'module-icon';
  icon.textContent = moduleIcons[module.type] || '📦';
  cell.appendChild(icon);
  
  // Type badge
  const typeBadge = document.createElement('div');
  typeBadge.className = `module-type ${module.type}`;
  typeBadge.textContent = module.type.substring(0, 3).toUpperCase();
  cell.appendChild(typeBadge);
  
  // Name
  const name = document.createElement('div');
  name.className = 'module-name';
  name.textContent = module.name;
  cell.appendChild(name);
  
  // Value
  const value = document.createElement('div');
  value.className = 'module-value';
  value.textContent = `$${module.value}`;
  cell.appendChild(value);
  
  // Condition
  const condition = document.createElement('div');
  condition.className = 'module-condition';
  condition.textContent = `${Math.round(module.condition)}%`;
  cell.appendChild(condition);
  
  // Progress bar for extraction
  if (module.state === 'extracting') {
    const progressBar = document.createElement('div');
    progressBar.className = 'progress-bar';
    const progressFill = document.createElement('div');
    progressFill.className = 'progress-fill';
    progressFill.style.width = `${module.extractProgress * 100}%`;
    progressBar.appendChild(progressFill);
    cell.appendChild(progressBar);
  }
  
  // Instability bar for volatiles
  if (module.type === 'volatile' && module.instability > 0) {
    const instabilityBar = document.createElement('div');
    instabilityBar.className = 'instability-bar';
    const instabilityFill = document.createElement('div');
    instabilityFill.className = 'instability-fill';
    instabilityFill.style.width = `${module.instability}%`;
    instabilityBar.appendChild(instabilityFill);
    cell.appendChild(instabilityBar);
  }
  
  // Click handlers
  if (module.state === 'available') {
    cell.addEventListener('click', () => {
      game.startExtraction(module.id);
    });
  } else if (module.state === 'extracting') {
    cell.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      game.cancelExtraction(module.id);
    });
  }
  
  return cell;
}

function onExplosion(exploded: Module, affected: Module[]) {
  // Find the exploded cell
  const explodedCell = document.querySelector(`[data-module-id="${exploded.id}"]`);
  if (!explodedCell) return;
  
  // Create explosion effect
  const explosion = document.createElement('div');
  explosion.className = 'explosion-effect';
  explosion.style.left = '50%';
  explosion.style.top = '50%';
  explosion.style.transform = 'translate(-50%, -50%)';
  explodedCell.appendChild(explosion);
  
  // Remove after animation
  setTimeout(() => explosion.remove(), 500);
  
  // Show damage numbers on affected modules
  for (const module of affected) {
    const cell = document.querySelector(`[data-module-id="${module.id}"]`);
    if (!cell) continue;
    
    const damage = document.createElement('div');
    damage.className = 'damage-number';
    damage.textContent = '-50';
    damage.style.left = '50%';
    damage.style.top = '50%';
    damage.style.transform = 'translate(-50%, -50%)';
    cell.appendChild(damage);
    
    // Remove after animation
    setTimeout(() => damage.remove(), 1000);
  }
  
  // Screen shake effect
  document.body.style.animation = 'shake 0.3s';
  setTimeout(() => {
    document.body.style.animation = '';
  }, 300);
}

// Stance selection
stanceButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    stanceButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const stance = btn.getAttribute('data-stance') as 'quick' | 'normal' | 'careful';
    game.setStance(stance);
  });
});

// Initialize game
function init() {
  const site = game.generateSite(6, 4);
  game.loadSite(site);
  updateUI();
  
  // Game tick
  setInterval(() => {
    game.tick();
  }, 100);
}

// Add screen shake animation
const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    10% { transform: translateX(-10px) translateY(-5px); }
    20% { transform: translateX(10px) translateY(5px); }
    30% { transform: translateX(-8px) translateY(-3px); }
    40% { transform: translateX(8px) translateY(3px); }
    50% { transform: translateX(-6px) translateY(-2px); }
    60% { transform: translateX(6px) translateY(2px); }
    70% { transform: translateX(-4px) translateY(-1px); }
    80% { transform: translateX(4px) translateY(1px); }
    90% { transform: translateX(-2px); }
  }
`;
document.head.appendChild(style);

// Start game
init();
