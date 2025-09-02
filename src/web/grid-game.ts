// Grid-based looting game with immediate extraction and chain reactions

export type ModuleType = 'volatile' | 'fragile' | 'heavy' | 'data' | 'structural' | 'valuable' | 'empty';
export type ModuleAffix =
  | 'booby_trapped'
  | 'unstable'
  | 'reinforced'
  | 'encrypted'
  | 'tethered'
  | 'time_sensitive';
export type ModuleState = 'available' | 'extracting' | 'looted' | 'damaged' | 'destroyed' | 'unstable';

export interface Module {
  id: string;
  type: ModuleType;
  state: ModuleState;
  name: string;
  value: number;
  condition: number; // 0-100
  extractTime: number; // seconds
  extractProgress: number; // 0-1
  gridX: number;
  gridY: number;
  width: number; // Grid cells wide
  height: number; // Grid cells tall
  instability: number; // 0-100
  isShaking?: boolean;
  failureAnimation?: boolean; // Flag for failure animation
  explosionRadius?: number;
  affixes: ModuleAffix[];
}

export interface GridSite {
  id: string;
  name: string;
  width: number;
  height: number;
  modules: Module[];
  siteStability: number; // 0-100

  activeExtractions: Set<string>;
}

export interface GameState {
  currentSite: GridSite | null;
  stance: 'quick' | 'normal' | 'careful';
  totalValue: number;
  cargoUsed: number;
  cargoMax: number;
}

export class LootingGrid {
  private state: GameState;
  private extractionTimers: Map<string, number> = new Map();
  private onUpdate: () => void;
  private onExplosion: (module: Module, affected: Module[]) => void;

  constructor(
    onUpdate: () => void,
    onExplosion: (module: Module, affected: Module[]) => void
  ) {
    this.onUpdate = onUpdate;
    this.onExplosion = onExplosion;
    this.state = {
      currentSite: null,
      stance: 'normal',
      totalValue: 0,
      cargoUsed: 0,
      cargoMax: 100,
    };
  }

  generateSite(width: number = 6, height: number = 4): GridSite {
    const modules: Module[] = [];
    const occupiedCells = new Set<string>();
    
    // Define module size patterns for different types
    const moduleSizes: Record<ModuleType, Array<{w: number, h: number}>> = {
      volatile: [{w: 1, h: 1}, {w: 2, h: 1}],  // Can be 1x1 or 2x1
      fragile: [{w: 1, h: 1}],
      heavy: [{w: 2, h: 1}, {w: 3, h: 1}, {w: 1, h: 2}],  // Large items
      data: [{w: 1, h: 1}],
      structural: [{w: 2, h: 1}, {w: 1, h: 2}],
      valuable: [{w: 1, h: 1}, {w: 2, h: 1}],
      empty: [{w: 1, h: 1}],
    };
    
    // Place some guaranteed interesting modules with varying sizes
    const guaranteedModules = [
      { type: 'heavy' as ModuleType, count: 1 },  // At least one large module
      { type: 'volatile' as ModuleType, count: 2 },
      { type: 'valuable' as ModuleType, count: 2 },
      { type: 'fragile' as ModuleType, count: 1 },
      { type: 'data' as ModuleType, count: 2 },
    ];
    
    // Helper function to check if a module can fit at position
    const canPlaceModule = (x: number, y: number, w: number, h: number): boolean => {
      if (x + w > width || y + h > height) return false;
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          if (occupiedCells.has(`${x + dx},${y + dy}`)) return false;
        }
      }
      return true;
    };
    
    // Helper function to mark cells as occupied
    const markOccupied = (x: number, y: number, w: number, h: number) => {
      for (let dy = 0; dy < h; dy++) {
        for (let dx = 0; dx < w; dx++) {
          occupiedCells.add(`${x + dx},${y + dy}`);
        }
      }
    };
    
    // Place guaranteed modules
    for (const { type, count } of guaranteedModules) {
      for (let i = 0; i < count; i++) {
        const sizes = moduleSizes[type];
        const size = sizes[Math.floor(Math.random() * sizes.length)];
        
        let placed = false;
        let attempts = 0;
        while (!placed && attempts < 50) {
          const x = Math.floor(Math.random() * width);
          const y = Math.floor(Math.random() * height);
          
          if (canPlaceModule(x, y, size.w, size.h)) {
            markOccupied(x, y, size.w, size.h);
            modules.push(this.createModule(x, y, type, size.w, size.h));
            placed = true;
          }
          attempts++;
        }
      }
    }
    
    // Fill some remaining space with random modules
    const randomTypes: ModuleType[] = ['heavy', 'structural', 'valuable', 'data'];
    const remainingAttempts = 10;
    
    for (let i = 0; i < remainingAttempts; i++) {
      const type = randomTypes[Math.floor(Math.random() * randomTypes.length)];
      const sizes = moduleSizes[type];
      const size = sizes[Math.floor(Math.random() * sizes.length)];
      
      const x = Math.floor(Math.random() * width);
      const y = Math.floor(Math.random() * height);
      
      if (canPlaceModule(x, y, size.w, size.h)) {
        markOccupied(x, y, size.w, size.h);
        modules.push(this.createModule(x, y, type, size.w, size.h));
      }
    }
    
    // Fill remaining single cells with empty spaces
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        if (!occupiedCells.has(`${x},${y}`)) {
          modules.push(this.createModule(x, y, 'empty', 1, 1));
        }
      }
    }

    return {
      id: `site_${Date.now()}`,
      name: 'Derelict Freighter',
      width,
      height,
      modules,
      siteStability: 100,

      activeExtractions: new Set(),
    };
  }

  private createModule(x: number, y: number, type: ModuleType, width: number = 1, height: number = 1): Module {
    const configs = {
      volatile: {
        names: ['Fuel Tank', 'Ammo Cache', 'Reactor Core', 'Munitions Store'],
        value: [1500, 2500],  // High value but dangerous
        extractTime: [2, 3],  // Quick to grab
        explosionRadius: 2,   // Bigger explosion
      },
      fragile: {
        names: ['Data Core', 'Crystal Matrix', 'Quantum Drive', 'AI Module'],
        value: [2000, 3000],  // Very high value
        extractTime: [4, 6],  // Takes time and care
      },
      heavy: {
        names: ['Armor Plating', 'Engine Block', 'Shield Generator', 'Reactor Assembly'],
        value: [800, 1200],   // Decent value, scales with size
        extractTime: [6, 8],  // Very slow
      },
      data: {
        names: ['Nav Computer', 'Black Box', 'Encrypted Files', 'Research Data'],
        value: [1500, 2000],  // Good value
        extractTime: [3, 4],  // Medium speed
      },
      structural: {
        names: ['Support Beam', 'Power Conduit', 'Life Support', 'Hull Section'],
        value: [400, 600],    // Low value but stable
        extractTime: [3, 4],  // Medium speed
      },
      valuable: {
        names: ['Rare Alloy', 'Gold Circuit', 'Quantum Chip', 'Exotic Matter'],
        value: [1000, 1500],  // Good consistent value
        extractTime: [3, 4],  // Medium speed
      },
      empty: {
        names: ['Empty'],
        value: [0, 0],
        extractTime: [0, 0],
      },
    };

    const config = configs[type];
    const name = config.names[Math.floor(Math.random() * config.names.length)];
    let value = config.value[0] + Math.random() * (config.value[1] - config.value[0]);
    let extractTime = config.extractTime[0] + Math.random() * (config.extractTime[1] - config.extractTime[0]);
    
    // Scale value and time based on size
    const sizeMultiplier = width * height;
    value = value * (1 + (sizeMultiplier - 1) * 0.5); // Larger items are worth more
    extractTime = extractTime * (1 + (sizeMultiplier - 1) * 0.3); // Larger items take longer

    const affixes = this.rollAffixesForType(type);
    if (affixes.includes('reinforced')) {
      extractTime *= 1.25;
    }
    if (affixes.includes('encrypted')) {
      value *= 1.2;
    }
    let explosionRadius: number | undefined = type === 'volatile' ? 2 : undefined;
    if (type === 'volatile' && affixes.includes('unstable')) {
      explosionRadius = 3;
    }

    return {
      id: `module_${x}_${y}_${Date.now()}`,
      type,
      state: type === 'empty' ? 'destroyed' : 'available',
      name: sizeMultiplier > 1 ? `Large ${name}` : name,
      value: Math.round(value),
      condition: 70 + Math.random() * 30,
      extractTime,
      extractProgress: 0,
      gridX: x,
      gridY: y,
      width,
      height,
      instability: 0,
      explosionRadius,
      affixes,
    };
  }

  private rollAffixesForType(type: ModuleType): ModuleAffix[] {
    const out: ModuleAffix[] = [];
    const chance = (p: number) => Math.random() < p;
    switch (type) {
      case 'volatile':
        if (chance(0.5)) out.push('unstable');
        if (chance(0.25)) out.push('booby_trapped');
        if (chance(0.2)) out.push('tethered');
        break;
      case 'fragile':
        if (chance(0.3)) out.push('time_sensitive');
        if (chance(0.2)) out.push('reinforced');
        break;
      case 'heavy':
        if (chance(0.35)) out.push('tethered');
        if (chance(0.15)) out.push('reinforced');
        break;
      case 'data':
        if (chance(0.6)) out.push('encrypted');
        if (chance(0.15)) out.push('time_sensitive');
        break;
      case 'valuable':
        if (chance(0.25)) out.push('booby_trapped');
        if (chance(0.2)) out.push('time_sensitive');
        break;
      case 'structural':
        if (chance(0.2)) out.push('reinforced');
        break;
      case 'empty':
      default:
        break;
    }
    return out;
  }

  loadSite(site: GridSite) {
    this.state.currentSite = site;
    this.clearAllExtractions();
    this.onUpdate();
  }

  startExtraction(moduleId: string) {
    const site = this.state.currentSite;
    if (!site) return;

    const module = site.modules.find(m => m.id === moduleId);
    if (!module || module.state !== 'available') return;

    // Check if cargo has space before starting
    const cargoNeeded = 5; // Reduced cargo per item
    if (this.state.cargoUsed + cargoNeeded > this.state.cargoMax) {
      console.log('Cargo full! Cannot start extraction of', module.name);
      // Could add a visual feedback here
      return;
    }

    module.state = 'extracting';
    site.activeExtractions.add(moduleId);
    
    // Extraction time with affix modifiers
    let actualExtractTime = module.extractTime;
    if (module.affixes.includes('reinforced')) actualExtractTime *= 1.1;
    if (module.affixes.includes('tethered')) actualExtractTime *= 1.15;
    
    // Start extraction timer
    const startTime = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      module.extractProgress = Math.min(elapsed / actualExtractTime, 1);
      
      // Build instability for volatile modules
      if (module.type === 'volatile') {
        const baseRate = 3;
        const rate = module.affixes.includes('unstable') ? baseRate * 1.6 : baseRate;
        module.instability += rate;
        if (module.instability > 80) {
          module.isShaking = true;
        }
        if (module.instability >= 100) {
          clearInterval(timer);
          this.extractionTimers.delete(moduleId);
          this.triggerExplosion(module);
          return;
        }
      }
      
      // Check if extraction complete
      if (module.extractProgress >= 1) {
        clearInterval(timer);
        this.extractionTimers.delete(moduleId);
        
        // Roll for extraction failure based on site stability and module affixes
        const failureChance = this.calculateFailureChanceWithModule(module, site.siteStability);
        if (Math.random() * 100 < failureChance) {
          this.failExtraction(moduleId);
        } else {
          this.completeExtraction(module);
        }
        return;
      }
      

      
      this.onUpdate();
    }, 100);
    
    this.extractionTimers.set(moduleId, timer);
    this.onUpdate();
  }

  private completeExtraction(module: Module) {
    const site = this.state.currentSite;
    if (!site) return;

    // Timer should already be cleared by the caller, but double-check
    const timer = this.extractionTimers.get(module.id);
    if (timer) {
      clearInterval(timer);
      this.extractionTimers.delete(module.id);
    }

    // Check if cargo has space
    const cargoNeeded = 5; // Reduced cargo per item
    if (this.state.cargoUsed + cargoNeeded > this.state.cargoMax) {
      // Cargo full - stop extraction but keep module available
      module.state = 'available';
      module.extractProgress = 0;
      site.activeExtractions.delete(module.id);
      console.log('Cargo full! Cannot extract', module.name);
      this.onUpdate();
      return;
    }

    // Update module state
    module.state = 'looted';
    module.extractProgress = 0;
    site.activeExtractions.delete(module.id);

    // Add to cargo (apply encrypted bonus)
    let payout = Math.round(module.value * (module.condition / 100));
    if (module.affixes.includes('encrypted')) {
      payout = Math.round(payout * 1.25);
    }
    this.state.totalValue += payout;
    this.state.cargoUsed += cargoNeeded;

    // SITE DEGRADATION: Each extraction makes the site more unstable
    site.siteStability = Math.max(0, site.siteStability - 15); // Lose 15% stability per extraction
    
    // At low stability, things get dangerous
    if (site.siteStability <= 30) {
      // All volatile modules become more unstable
      for (const mod of site.modules) {
        if (mod.type === 'volatile' && mod.state === 'available') {
          mod.instability = Math.min(100, mod.instability + 20);
          if (mod.instability >= 100) {
            this.triggerExplosion(mod);
          }
        }
      }
    }
    
    // At very low stability, all modules start degrading
    if (site.siteStability <= 20) {
      for (const mod of site.modules) {
        if (mod.state === 'available') {
          mod.condition = Math.max(10, mod.condition - 10); // Lose 10% condition
        }
      }
    }

    // Check structural integrity
    this.checkStructuralIntegrity();
    // Booby trap trigger on successful extraction
    if (module.affixes.includes('booby_trapped') && Math.random() < 0.3) {
      this.triggerTrapExplosion(module);
    }
    
    this.onUpdate();
  }

  cancelExtraction(moduleId: string) {
    const site = this.state.currentSite;
    if (!site) return;

    const module = site.modules.find(m => m.id === moduleId);
    if (!module || module.state !== 'extracting') return;

    // Clear timer
    const timer = this.extractionTimers.get(moduleId);
    if (timer) {
      clearInterval(timer);
      this.extractionTimers.delete(moduleId);
    }

    // Reset module state
    module.state = 'available';
    module.extractProgress = 0;
    site.activeExtractions.delete(moduleId);
    
    this.onUpdate();
  }

  private triggerExplosion(module: Module) {
    const site = this.state.currentSite;
    if (!site) return;

    // Clear extraction if active
    this.cancelExtraction(module.id);

    // Destroy the exploding module
    module.state = 'destroyed';
    module.instability = 0;
    module.isShaking = false;

    // Find affected neighbors
    const affected: Module[] = [];
    const radius = module.explosionRadius || 1;
    
    for (const other of site.modules) {
      if (other.id === module.id || other.state === 'destroyed') continue;
      
      const dx = Math.abs(other.gridX - module.gridX);
      const dy = Math.abs(other.gridY - module.gridY);
      
      if (dx <= radius && dy <= radius) {
        affected.push(other);
        
        // Apply damage based on distance
        const distance = Math.max(dx, dy);
        const damage = distance === 1 ? 50 : 25;
        other.condition = Math.max(0, other.condition - damage);
        
        // Cancel any active extractions on damaged modules BEFORE changing state
        if (other.state === 'extracting') {
          const timer = this.extractionTimers.get(other.id);
          if (timer) {
            clearInterval(timer);
            this.extractionTimers.delete(other.id);
          }
          site.activeExtractions.delete(other.id);
          other.extractProgress = 0;
        }
        
        if (other.condition <= 0) {
          other.state = 'destroyed';
          // Chain reaction for volatiles
          if (other.type === 'volatile' && Math.random() < 0.5) {
            setTimeout(() => this.triggerExplosion(other), 500);
          }
        } else {
          other.state = 'damaged';
        }
      }
    }

    // Reduce site stability
    site.siteStability = Math.max(0, site.siteStability - 20);
    
    // Trigger callback for visual effects
    this.onExplosion(module, affected);
    
    this.onUpdate();
  }
  
  private triggerTrapExplosion(source: Module) {
    const site = this.state.currentSite;
    if (!site) return;
    const affected: Module[] = [];
    const radius = (source.explosionRadius || 1) - 1;
    for (const other of site.modules) {
      if (other.id === source.id || other.state === 'destroyed') continue;
      const dx = Math.abs(other.gridX - source.gridX);
      const dy = Math.abs(other.gridY - source.gridY);
      if (dx <= radius && dy <= radius) {
        affected.push(other);
        const damage = 20;
        other.condition = Math.max(0, other.condition - damage);
        if (other.condition <= 0) {
          other.state = 'destroyed';
        } else if (other.state === 'available') {
          other.state = 'damaged';
        }
      }
    }
    site.siteStability = Math.max(0, site.siteStability - 10);
    this.onExplosion(source, affected);
  }

  private checkStructuralIntegrity() {
    const site = this.state.currentSite;
    if (!site) return;

    // Count structural modules
    const structuralCount = site.modules.filter(
      m => m.type === 'structural' && m.state !== 'destroyed' && m.state !== 'looted'
    ).length;

    // If too few structural modules, increase instability
    if (structuralCount < 2) {
      site.siteStability = Math.max(0, site.siteStability - 10);
      
      // Random collapses
      if (Math.random() < 0.3) {
        const availableModules = site.modules.filter(m => m.state === 'available');
        if (availableModules.length > 0) {
          const victim = availableModules[Math.floor(Math.random() * availableModules.length)];
          victim.state = 'damaged';
          victim.condition = Math.max(0, victim.condition - 30);
        }
      }
    }
  }

  setStance(stance: 'quick' | 'normal' | 'careful') {
    this.state.stance = stance;
    this.onUpdate();
  }

  getState() {
    return this.state;
  }

  clearAllExtractions() {
    const site = this.state.currentSite;
    if (!site) return;
    
    // Clear all timers first
    for (const [moduleId, timer] of this.extractionTimers) {
      clearInterval(timer);
    }
    this.extractionTimers.clear();
    
    // Reset all extracting modules
    for (const module of site.modules) {
      if (module.state === 'extracting') {
        module.state = 'available';
        module.extractProgress = 0;
      }
    }
    
    site.activeExtractions.clear();
  }

  private calculateFailureChance(siteStability: number): number {
    // At 70%+ stability: 0% failure chance
    // At 40% stability: 20% failure chance
    // At 10% stability: 50% failure chance
    // At 0% stability: 70% failure chance
    if (siteStability >= 70) return 0;
    if (siteStability >= 40) return 20 * (1 - (siteStability - 40) / 30);
    if (siteStability >= 10) return 20 + 30 * (1 - (siteStability - 10) / 30);
    return 50 + 20 * (1 - siteStability / 10);
  }
  
  private calculateFailureChanceWithModule(module: Module, siteStability: number): number {
    let base = this.calculateFailureChance(siteStability);
    if (module.affixes.includes('reinforced')) base -= 10;
    if (module.affixes.includes('encrypted')) base += 10;
    if (module.affixes.includes('booby_trapped')) base += 5;
    return Math.max(0, Math.min(90, base));
  }

  private failExtraction(moduleId: string) {
    const site = this.state.currentSite;
    if (!site) return;
    
    const module = site.modules.find(m => m.id === moduleId);
    if (!module) return;

    // Module is destroyed on failed extraction
    module.state = 'destroyed';
    module.extractProgress = 0;
    module.failureAnimation = true; // Flag for visual effect
    site.activeExtractions.delete(moduleId);

    // Visual feedback - create a failure effect
    console.log(`Extraction FAILED for ${module.name}! Module destroyed.`);
    
    // Small chance to damage adjacent modules on failure
    if (Math.random() < 0.3) {
      const index = site.modules.findIndex(m => m.id === moduleId);
      const gridSize = Math.ceil(Math.sqrt(site.modules.length));
      const row = Math.floor(index / gridSize);
      const col = index % gridSize;
      
      // Check adjacent modules
      const adjacentOffsets = [[-1,0], [1,0], [0,-1], [0,1]];
      for (const [dr, dc] of adjacentOffsets) {
        const newRow = row + dr;
        const newCol = col + dc;
        if (newRow >= 0 && newRow < gridSize && newCol >= 0 && newCol < gridSize) {
          const adjacentIndex = newRow * gridSize + newCol;
          const adjacentModule = site.modules[adjacentIndex];
          if (adjacentModule && adjacentModule.state === 'available') {
            adjacentModule.condition = Math.max(0, adjacentModule.condition - 30);
            if (adjacentModule.condition <= 0) {
              adjacentModule.state = 'damaged';
            }
          }
        }
      }
    }
    
    this.onUpdate();
  }

  tick() {
    const site = this.state.currentSite;
    if (!site) return;
    const active = site.activeExtractions.size;
    if (active > 0) {
      site.siteStability = Math.max(0, site.siteStability - 0.02 * active);
    } else {
      site.siteStability = Math.min(100, site.siteStability + 0.01);
    }
    if (site.siteStability <= 30) {
      for (const mod of site.modules) {
        if (mod.type === 'volatile' && mod.state === 'available') {
          mod.instability = Math.min(100, mod.instability + (mod.affixes.includes('unstable') ? 2 : 1));
          mod.isShaking = mod.instability > 80;
          if (mod.instability >= 100) {
            this.triggerExplosion(mod);
            break;
          }
        }
      }
    }
    if (site.siteStability <= 20 && Math.random() < 0.05) {
      const candidates = site.modules.filter(m => m.state === 'available');
      if (candidates.length) {
        const victim = candidates[Math.floor(Math.random() * candidates.length)];
        victim.state = 'damaged';
        victim.condition = Math.max(0, victim.condition - 20);
      }
    }
    for (const mod of site.modules) {
      if (mod.state === 'available' && mod.affixes.includes('time_sensitive') && mod.value > 0) {
        if (Math.random() < 0.1) mod.value = Math.max(0, mod.value - 1);
      }
    }
    this.onUpdate();
  }
}
