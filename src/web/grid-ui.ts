import { LootingGrid, Module, GridSite } from './grid-game.js';
import { getTooltipManager } from './tooltip-manager.js';

// Create the game instance
const game = new LootingGrid(
  () => updateUI(),
  (exploded, affected) => onExplosion(exploded, affected)
);

// DOM elements
const gridElement = document.getElementById('lootGrid') as HTMLDivElement;
const totalValueElement = document.getElementById('totalValue') as HTMLElement;
const cargoStatusElement = document.getElementById('cargoStatus') as HTMLElement;
const stabilityBar = document.getElementById('stabilityBar') as HTMLDivElement;
const stabilityValue = document.getElementById('stabilityValue') as HTMLElement;


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

// Initialize
function init() {
  // Generate initial site
  const site = game.generateSite(6, 5);
  game.loadSite(site);
  
  // Setup stance buttons
  document.querySelectorAll('.stance-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const target = e.target as HTMLButtonElement;
      const stance = target.dataset.stance as 'quick' | 'normal' | 'careful';
      
      // Update active state
      document.querySelectorAll('.stance-btn').forEach(b => b.classList.remove('active'));
      target.classList.add('active');
      
      // Set stance
      game.setStance(stance);
    });
  });
  
  // Start game loop
  setInterval(() => {
    game.tick();
  }, 100);
  
  // Initial render
  renderGrid();
  updateUI();
  // Initialize tooltip manager (uses event delegation)
  getTooltipManager();
}

// Get value tier for styling
function getValueTier(value: number): number {
  if (value >= 2500) return 5;  // Ultra valuable
  if (value >= 2000) return 4;  // Very valuable
  if (value >= 1500) return 3;  // Valuable
  if (value >= 1000) return 2;  // Moderate
  return 1;  // Low value
}

// Render the grid
function renderGrid() {
  const state = game.getState();
  const site = state.currentSite;
  
  if (!site) return;
  
  // Set grid dimensions
  gridElement.style.gridTemplateColumns = `repeat(${site.width}, 1fr)`;
  gridElement.innerHTML = '';
  
  // Sort modules by position
  const sortedModules = [...site.modules].sort((a, b) => {
    if (a.gridY !== b.gridY) return a.gridY - b.gridY;
    return a.gridX - b.gridX;
  });
  
  // Find top 3 most valuable available modules for crown indicators
  const availableModules = site.modules
    .filter(m => m.state === 'available' && m.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 3);
  
  // Create cells
  for (const module of sortedModules) {
    const cell = createCell(module);
    
    // Add crown indicator for top 3 most valuable modules
    const topValueRank = availableModules.indexOf(module);
    if (topValueRank !== -1) {
      const crown = document.createElement('div');
      crown.className = 'value-crown';
      
      if (topValueRank === 0) {
        crown.textContent = '👑';
        crown.classList.add('crown-gold');
      } else if (topValueRank === 1) {
        crown.textContent = '🥈';
        crown.classList.add('crown-silver');
      } else if (topValueRank === 2) {
        crown.textContent = '🥉';
        crown.classList.add('crown-bronze');
      }
      
      cell.appendChild(crown);
    }
    
    gridElement.appendChild(cell);
    
    // Add click handlers
    if (module.state === 'available') {
      cell.addEventListener('click', () => {
        game.startExtraction(module.id);
      });
    } else if (module.state === 'extracting') {
      cell.addEventListener('click', () => {
        game.cancelExtraction(module.id);
      });
      cell.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        game.cancelExtraction(module.id);
      });
    }
  }
}

// Create a cell element
function createCell(module: Module): HTMLDivElement {
  const cell = document.createElement('div');
  cell.className = `grid-cell ${module.state}`;
  cell.dataset.moduleId = module.id;
  
  // Calculate value tier for styling (only for available modules)
  if (module.state === 'available' && module.value > 0) {
    const valueTier = getValueTier(module.value);
    cell.classList.add(`value-tier-${valueTier}`);
  }
  
  // Apply value-based border colors for available modules
  if (module.state === 'available') {
    if (module.value >= 2500) {
      cell.style.borderColor = '#ffaa00';
    } else if (module.value >= 2000) {
      cell.style.borderColor = '#ff9900';
    } else if (module.value >= 1500) {
      cell.style.borderColor = '#aa6600';
    }
  }
  
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
  if (module.affixes.includes('encrypted') && module.state !== 'extracted') {
    typeBadge.className = 'module-type encrypted';
    typeBadge.textContent = '???';
    typeBadge.style.background = '#ff44ff';
    typeBadge.setAttribute('data-tip', 'Module type unknown - encrypted');
  } else {
    typeBadge.className = `module-type ${module.type}`;
    typeBadge.textContent = module.type.substring(0, 3).toUpperCase();
    typeBadge.setAttribute('data-tip', typeTooltip(module.type));
  }
  cell.appendChild(typeBadge);
  
  // Name
  const name = document.createElement('div');
  name.className = 'module-name';
  // Encrypted modules hide their identity
  if (module.affixes.includes('encrypted') && module.state !== 'extracted') {
    name.textContent = 'ENCRYPTED';
    name.style.color = '#ff44ff';
  } else {
    name.textContent = module.name;
  }
  cell.appendChild(name);
  
  // Value
  const value = document.createElement('div');
  value.className = 'module-value';
  // Encrypted modules hide value too - complete gamble
  if (module.affixes.includes('encrypted') && module.state !== 'extracted') {
    value.textContent = '???';
    value.style.color = '#ff44ff'; // Purple for mystery
  } else {
    value.textContent = `$${module.value}`;
  }
  cell.appendChild(value);
  
  // Add value badge for high-value items (but not for encrypted - value unknown)
  if (module.value >= 2000 && module.state === 'available' && !module.affixes.includes('encrypted')) {
    const valueBadge = document.createElement('div');
    valueBadge.className = 'value-badge';
    valueBadge.textContent = 'HIGH';
    cell.appendChild(valueBadge);
  }
  
  // Condition
  const condition = document.createElement('div');
  condition.className = 'module-condition';
  condition.textContent = `${Math.round(module.condition)}%`;
  cell.appendChild(condition);

  // Affix badges
  if (module.affixes && module.affixes.length && module.state !== 'destroyed') {
    const affixWrap = document.createElement('div');
    affixWrap.className = 'affix-badges';
    for (const a of module.affixes) {
      const b = document.createElement('span');
      b.className = `affix-badge affix-${a}`;
      b.textContent = affixLabel(a);
      b.setAttribute('data-tip', affixTooltip(a));
      affixWrap.appendChild(b);
    }
    cell.appendChild(affixWrap);
  }
  
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
  
  return cell;
}

function affixLabel(a: string): string {
  switch (a) {
    case 'booby_trapped': return 'TRAP';
    case 'unstable': return 'UNST';
    case 'reinforced': return 'RNF';
    case 'encrypted': return 'ENC';
    case 'tethered': return 'TETH';
    case 'time_sensitive': return 'DECAY';
    default: return a.toUpperCase();
  }
}

function typeTooltip(t: string): string {
  switch (t) {
    case 'volatile': return 'Highly unstable cargo. Can explode; chain reaction risk.';
    case 'fragile': return 'Delicate item. Easily damaged by instability/collapses.';
    case 'heavy': return 'Large and bulky. Slower to extract; fills cargo fast.';
    case 'data': return 'Digital/encoded assets. Valuable; may be encrypted.';
    case 'structural': return 'Supports integrity. Removing too many reduces stability.';
    case 'valuable': return 'High-value component or material.';
    default: return 'Unknown type.';
  }
}

function affixTooltip(a: string): string {
  switch (a) {
    // Universal
    case 'secured': return 'Extra clamps; 50% slower but guaranteed success.';
    case 'damaged': return 'Partially broken; -30% value, +10% failure chance.';
    case 'pristine': return 'Perfect condition; +20% value, -5% failure chance.';
    // Volatile
    case 'leaking': return 'Slowly damages nearby modules; extract quickly.';
    case 'pressurized': return 'If fails, guaranteed explosion; +15% failure.';
    case 'unstable': return 'Builds instability 2x faster at low integrity.';
    // Fragile
    case 'cracked': return '50% chance to break even if successful; +20% failure.';
    case 'sensitive': return 'Fails if adjacent module explodes; +10% failure.';
    case 'calibrated': return '+30% value if extracted carefully; -10% failure.';
    // Heavy
    case 'anchored': return '2x extraction time but explosion immune; -15% failure.';
    case 'military': return 'Reinforced construction; +10% value, -10% failure.';
    case 'corroded': return 'Gets harder over time; +5% failure, slower if old.';
    // Data
    case 'encrypted': return 'Identity and value hidden until extracted; +10% failure.';
    case 'corrupted': return '50% chance to be worthless; +15% failure.';
    case 'classified': return '+50% value but attracts heat; +5% failure.';
    // Structural
    case 'welded': return 'Must clear adjacent modules first; +10% failure.';
    case 'load_bearing': return 'Reduces site stability by 10% when removed.';
    case 'recycled': return 'Low quality; -50% value but 2x faster, -5% failure.';
    // Valuable
    case 'booby_trapped': return '30% chance to explode after extraction; +5% failure.';
    case 'contraband': return 'Illegal goods; +30% value but adds heat.';
    case 'insured': return 'Guaranteed minimum 1000 value; -5% failure.';
    default: return 'Unknown affix effect.';
  }
}



// Update UI elements
function updateUI() {
  const state = game.getState();
  const site = state.currentSite;
  
  if (!site) return;
  
  // Update stats
  totalValueElement.textContent = state.totalValue.toString();
  cargoStatusElement.textContent = `${state.cargoUsed}/${state.cargoMax}`;
  
  // Update meters
  stabilityBar.style.width = `${site.siteStability}%`;
  stabilityValue.textContent = `${Math.round(site.siteStability)}%`;
  

  
  // Re-render grid to update cell states
  renderGrid();
}

// Handle explosion effects
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
}

// Start the game
init();