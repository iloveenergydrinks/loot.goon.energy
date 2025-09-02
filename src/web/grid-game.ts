// Grid-based looting game with immediate extraction and chain reactions

export type ModuleType = 'volatile' | 'fragile' | 'heavy' | 'data' | 'structural' | 'valuable' | 'empty';
export type ModuleAffix =
  // Universal affixes (any module)
  | 'secured' | 'damaged' | 'pristine'
  // Volatile specific
  | 'leaking' | 'pressurized' | 'unstable'
  // Fragile specific  
  | 'cracked' | 'sensitive' | 'calibrated'
  // Heavy specific
  | 'anchored' | 'military' | 'corroded'
  // Data specific
  | 'encrypted' | 'corrupted' | 'classified'
  // Structural specific
  | 'welded' | 'load_bearing' | 'recycled'
  // Valuable specific
  | 'booby_trapped' | 'contraband' | 'insured';
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
  createdAt?: number; // Timestamp when wreck was created
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
      createdAt: Date.now(),
      activeExtractions: new Set(),
    };
  }

  private createModule(x: number, y: number, type: ModuleType, width: number = 1, height: number = 1): Module {
    const configs = {
      volatile: {
        names: ['Fuel Tank', 'Ammo Cache', 'Plasma Cells', 'Reactor Core', 'Munitions Bay'],
        value: [1500, 2500],  // High value but dangerous
        extractTime: [2, 3],  // Quick to grab
        explosionRadius: 2,   // Bigger explosion
      },
      fragile: {
        names: ['Nav Computer', 'Data Core', 'Comm Array', 'Sensor Suite', 'AI Module'],
        value: [2000, 3000],  // Very high value
        extractTime: [4, 6],  // Takes time and care
      },
      heavy: {
        names: ['Engine Block', 'Thruster Assembly', 'Power Converter', 'Coolant System', 'Warp Drive'],
        value: [800, 1200],   // Decent value, scales with size
        extractTime: [6, 8],  // Very slow
      },
      data: {
        names: ['Ship Database', 'Black Box', 'Encrypted Logs', 'Research Files', 'Star Charts'],
        value: [1500, 2000],  // Good value
        extractTime: [3, 4],  // Medium speed
      },
      structural: {
        names: ['Hull Plating', 'Armor Segment', 'Support Frame', 'Bulkhead', 'Shield Generator'],
        value: [400, 600],    // Low value but stable
        extractTime: [3, 4],  // Medium speed
      },
      valuable: {
        names: ['Cargo Container', 'Trade Goods', 'Rare Materials', 'Medical Supplies', 'Weapon Cache'],
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
    
    // Apply affix modifiers to value and extraction time
    for (const affix of affixes) {
      switch (affix) {
        // Universal affixes
        case 'secured': extractTime *= 1.5; break; // +50% time, but guaranteed success
        case 'damaged': value *= 0.7; break; // -30% value
        case 'pristine': value *= 1.2; break; // +20% value
        // Heavy affixes
        case 'anchored': extractTime *= 2; break; // 2x time but explosion immune
        case 'military': value *= 1.1; break; // +10% value
        case 'corroded': extractTime *= 1.2; break; // Gets worse over time
        // Data affixes  
        case 'encrypted': extractTime *= 1.3; break; // +30% time to decrypt
        case 'classified': value *= 1.5; break; // +50% value but heat
        // Structural affixes
        case 'recycled': extractTime *= 0.5; value *= 0.5; break; // Fast but low value
        // Valuable affixes
        case 'insured': value = Math.max(value, 1000); break; // Minimum value guarantee
        case 'contraband': value *= 1.3; break; // +30% value but illegal
        // Fragile affixes
        case 'calibrated': value *= 1.3; break; // +30% value if careful
      }
    }
    
    let explosionRadius: number | undefined = type === 'volatile' ? 2 : undefined;
    if (type === 'volatile' && affixes.includes('pressurized')) {
      explosionRadius = 3; // Larger blast for pressurized
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
    const affixes: ModuleAffix[] = [];
    const chance = (p: number) => Math.random() < p;
    
    // Universal affixes - can appear on any module type
    const rollUniversal = () => {
      if (chance(0.15)) return 'secured';
      if (chance(0.2)) return 'damaged';
      if (chance(0.1)) return 'pristine';
      return null;
    };
    
    // First, try to add a universal affix
    const universal = rollUniversal();
    if (universal) affixes.push(universal);
    
    // Then add type-specific affixes
    switch (type) {
      case 'volatile':
        // Explosive/fuel modules
        if (chance(0.25)) affixes.push('leaking');
        else if (chance(0.2)) affixes.push('pressurized');
        else if (chance(0.3)) affixes.push('unstable');
        break;
        
      case 'fragile':
        // Delicate electronics
        if (chance(0.2)) affixes.push('cracked');
        else if (chance(0.15)) affixes.push('sensitive');
        else if (chance(0.1)) affixes.push('calibrated');
        break;
        
      case 'heavy':
        // Large machinery
        if (chance(0.2)) affixes.push('anchored');
        else if (chance(0.15)) affixes.push('military');
        else if (chance(0.1)) affixes.push('corroded');
        break;
        
      case 'data':
        // Information systems
        if (chance(0.3)) affixes.push('encrypted');
        else if (chance(0.2)) affixes.push('corrupted');
        else if (chance(0.1)) affixes.push('classified');
        break;
        
      case 'structural':
        // Basic ship components
        if (chance(0.15)) affixes.push('welded');
        else if (chance(0.1)) affixes.push('load_bearing');
        else if (chance(0.2)) affixes.push('recycled');
        break;
        
      case 'valuable':
        // Cargo and trade goods
        if (chance(0.15)) affixes.push('booby_trapped');
        else if (chance(0.1)) affixes.push('contraband');
        else if (chance(0.1)) affixes.push('insured');
        break;
        
      case 'empty':
      default:
        // No affixes for destroyed cells
        break;
    }
    
    // Limit to max 2 affixes total
    return affixes.slice(0, 2);
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
    
    // Extraction time is already modified in createModule, but apply runtime modifiers
    let actualExtractTime = module.extractTime;
    
    // Corroded modules get worse over time
    if (module.affixes.includes('corroded')) {
      const siteAge = site.createdAt ? (Date.now() - site.createdAt) / 60000 : 0;
      if (siteAge > 10) actualExtractTime *= 1.5; // Even slower if old
    }
    
    // Heavy modules take longer at low integrity (damaged machinery harder to remove)
    if (module.type === 'heavy' && site.siteStability < 50) {
      const integrityPenalty = site.siteStability < 25 ? 2.0 : 1.5;
      actualExtractTime *= integrityPenalty;
    }
    
    // Welded structural modules need adjacent cells clear
    if (module.affixes.includes('welded')) {
      // Check if adjacent modules exist
      const hasAdjacent = site.modules.some(m => 
        m.state === 'available' &&
        Math.abs(m.gridX - module.gridX) <= 1 &&
        Math.abs(m.gridY - module.gridY) <= 1 &&
        m.id !== module.id
      );
      if (hasAdjacent) actualExtractTime *= 2; // Much harder with neighbors
    }
    
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

    // Add to cargo - handle encrypted modules specially
    let payout = Math.round(module.value * (module.condition / 100));
    if (module.affixes.includes('encrypted')) {
      // Encrypted modules: roll for actual value (0.5x to 2x base)
      const multiplier = 0.5 + Math.random() * 1.5; // 0.5 to 2.0
      payout = Math.round(payout * multiplier);
      
      // Chance for bonus intel/data drop
      if (Math.random() < 0.3) {
        // 30% chance for bonus data worth extra value
        const bonusValue = Math.round(module.value * 0.5);
        payout += bonusValue;
        console.log(`Decryption successful! Found valuable intel worth ${bonusValue} credits`);
      }
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
    // Base failure chance based on integrity thresholds
    if (siteStability >= 75) return 5; // Minimal risk
    if (siteStability >= 50) return 5 + 10 * (1 - (siteStability - 50) / 25); // 5-15%
    if (siteStability >= 25) return 15 + 15 * (1 - (siteStability - 25) / 25); // 15-30%
    return 30 + 20 * (1 - siteStability / 25); // 30-50%
  }
  
  private calculateFailureChanceWithModule(module: Module, siteStability: number): number {
    let base = this.calculateFailureChance(siteStability);
    
    // Module type risk modifiers based on integrity
    let typeModifier = 0;
    if (siteStability < 75 && siteStability >= 50) {
      // 75-50%: Early degradation affects sensitive modules
      switch(module.type) {
        case 'data': typeModifier = 10; break; // Data corrupts easily
        case 'fragile': typeModifier = 5; break;
        case 'volatile': typeModifier = 3; break;
      }
    } else if (siteStability < 50 && siteStability >= 25) {
      // 50-25%: Significant risk for most modules
      switch(module.type) {
        case 'data': typeModifier = 25; break; // High corruption risk
        case 'fragile': typeModifier = 20; break;
        case 'volatile': typeModifier = 15; break;
        case 'heavy': typeModifier = 5; break;
        case 'structural': typeModifier = 0; break; // Most resilient
        case 'valuable': typeModifier = 10; break;
      }
    } else if (siteStability < 25) {
      // Below 25%: Everything is high risk
      switch(module.type) {
        case 'data': typeModifier = 40; break; // Almost certainly corrupted
        case 'fragile': typeModifier = 35; break;
        case 'volatile': typeModifier = 30; break;
        case 'heavy': typeModifier = 15; break;
        case 'structural': typeModifier = 10; break;
        case 'valuable': typeModifier = 25; break;
      }
    }
    
    // Apply affix modifiers to failure chance
    for (const affix of module.affixes) {
      switch (affix) {
        // Universal
        case 'secured': return 0; // Guaranteed success
        case 'damaged': base += 10; break;
        case 'pristine': base -= 5; break;
        // Volatile
        case 'leaking': base += 5; break;
        case 'pressurized': base += 15; break; // Very risky
        case 'unstable': base += 10; break;
        // Fragile
        case 'cracked': base += 20; break; // Very likely to break
        case 'sensitive': base += 10; break;
        case 'calibrated': base -= 10; break; // Easier if careful
        // Heavy
        case 'anchored': base -= 15; break; // Very stable
        case 'military': base -= 10; break;
        case 'corroded': base += 5; break;
        // Data
        case 'encrypted': base += 10; break;
        case 'corrupted': base += 15; break;
        case 'classified': base += 5; break;
        // Structural
        case 'welded': base += 10; break; // Harder to extract
        case 'load_bearing': base += 5; break;
        case 'recycled': base -= 5; break; // Easy to remove
        // Valuable
        case 'booby_trapped': base += 5; break;
        case 'contraband': base += 5; break;
        case 'insured': base -= 5; break;
      }
    }
    
    return Math.max(0, Math.min(80, base + typeModifier)); // Cap at 80%
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
    }
    // No recovery when idle - structural damage is permanent
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
