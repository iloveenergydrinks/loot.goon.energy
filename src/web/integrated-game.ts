import { LootingGrid, Module, GridSite } from './grid-game.js';

// Types
interface Vec2 { x: number; y: number; }
interface MapSite {
  id: string;
  position: Vec2;
  type: 'wreck' | 'station' | 'asteroid';
  visited: boolean;
  gridSite?: GridSite;
}

// Game state
class IntegratedGame {
  // Map elements
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private player: Vec2 = { x: 400, y: 300 };
  private playerSpeed = 200;
  private sites: MapSite[] = [];
  private nearestSite: MapSite | null = null;
  private keys = new Set<string>();
  
  // UI elements
  private hudPos: HTMLElement;
  private hudCredits: HTMLElement;
  private hudCargo: HTMLElement;
  private hudSites: HTMLElement;
  private prompt: HTMLElement;
  private lootModal: HTMLElement;
  private modalTitle: HTMLElement;
  
  // Loot grid elements
  private lootGrid: HTMLElement;
  private totalValue: HTMLElement;
  private cargoStatus: HTMLElement;
  private integrityBar: HTMLElement;
  private integrityValue: HTMLElement;

  
  // Game systems
  private lootingGame: LootingGrid;
  private currentSite: MapSite | null = null;
  private totalCredits = 0;
  private cargoUsed = 0;
  private cargoMax = 100;
  
  // Module type labels
  private moduleTypeLabels: Record<string, string> = {
    volatile: 'VOL',
    fragile: 'FRG',
    heavy: 'HVY',
    data: 'DAT',
    structural: 'STR',
    valuable: 'VAL',
    empty: '',
  };

  constructor() {
    // Get canvas
    this.canvas = document.getElementById('mapCanvas') as HTMLCanvasElement;
    this.ctx = this.canvas.getContext('2d')!;
    
    // Get UI elements
    this.hudPos = document.getElementById('hudPos')!;
    this.hudCredits = document.getElementById('hudCredits')!;
    this.hudCargo = document.getElementById('hudCargo')!;
    this.hudSites = document.getElementById('hudSites')!;
    this.prompt = document.getElementById('prompt')!;
    this.lootModal = document.getElementById('lootModal')!;
    this.modalTitle = document.getElementById('modalTitle')!;
    
    // Get loot grid elements
    this.lootGrid = document.getElementById('lootGrid')!;
    this.totalValue = document.getElementById('totalValue')!;
    this.cargoStatus = document.getElementById('cargoStatus')!;
    this.integrityBar = document.getElementById('integrityBar') as HTMLDivElement;
    this.integrityValue = document.getElementById('integrityValue')!;

    
    // Initialize integrity bar with segments
    this.initializeIntegrityBar();
    
    // Initialize looting game
    this.lootingGame = new LootingGrid(
      () => this.updateLootUI(),
      (exploded, affected) => this.onExplosion(exploded, affected)
    );
    
    this.init();
  }
  
  private init() {
    // Resize canvas
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
    
    // Generate sites
    this.generateSites();
    
    // Setup input
    this.setupInput();
    
    // Close modal button
    document.getElementById('closeModal')!.addEventListener('click', () => {
      this.exitSite();
    });
    
    // Start game loop
    this.gameLoop();
  }
  
  private initializeIntegrityBar() {
    // Create 20 segments for the integrity bar
    this.integrityBar.innerHTML = '';
    for (let i = 0; i < 20; i++) {
      const segment = document.createElement('div');
      segment.className = 'integrity-segment';
      segment.dataset.index = i.toString();
      this.integrityBar.appendChild(segment);
    }
  }
  
  private resizeCanvas() {
    this.canvas.width = this.canvas.clientWidth;
    this.canvas.height = this.canvas.clientHeight;
  }
  
  private generateSites() {
    const siteTypes: Array<'wreck' | 'station' | 'asteroid'> = ['wreck', 'station', 'asteroid'];
    const siteCount = 8;
    
    for (let i = 0; i < siteCount; i++) {
      const angle = (i / siteCount) * Math.PI * 2;
      const radius = 200 + Math.random() * 150;
      
      this.sites.push({
        id: `site_${i}`,
        position: {
          x: this.canvas.width / 2 + Math.cos(angle) * radius,
          y: this.canvas.height / 2 + Math.sin(angle) * radius,
        },
        type: siteTypes[Math.floor(Math.random() * siteTypes.length)],
        visited: false,
      });
    }
  }
  
  private setupInput() {
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      this.keys.add(key);
      
      if (key === 'e' && this.nearestSite && !this.lootModal.classList.contains('show')) {
        this.enterSite(this.nearestSite);
      }
      
      if (key === 'escape' && this.lootModal.classList.contains('show')) {
        this.exitSite();
      }
    });
    
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.key.toLowerCase());
    });
  }
  
  private enterSite(site: MapSite) {
    this.currentSite = site;
    
    // Generate grid site if not already generated
    if (!site.gridSite) {
      const width = site.type === 'station' ? 7 : site.type === 'wreck' ? 6 : 5;
      const height = site.type === 'station' ? 5 : 4;
      site.gridSite = this.lootingGame.generateSite(width, height);
      site.gridSite.name = this.getSiteName(site);
    }
    
    // Load the site
    this.lootingGame.loadSite(site.gridSite);
    
    // Show modal
    this.lootModal.classList.add('show');
    this.modalTitle.textContent = `LEGION [${site.gridSite.name.toUpperCase()}]`;
    
    // Mark as visited
    site.visited = true;
    
    // Initial render of the grid
    this.renderGrid();
    
    // Update UI stats
    this.updateLootUI();
  }
  
  private exitSite() {
    // Get extracted value
    const state = this.lootingGame.getState();
    this.totalCredits += state.totalValue;
    this.cargoUsed = state.cargoUsed;
    
    // Clear extractions
    this.lootingGame.clearAllExtractions();
    
    // Hide modal
    this.lootModal.classList.remove('show');
    this.currentSite = null;
    
    // Update HUD
    this.updateHUD();
  }
  
  private getSiteName(site: MapSite): string {
    const prefixes = {
      wreck: ['Derelict', 'Abandoned', 'Destroyed', 'Ruined'],
      station: ['Mining', 'Research', 'Military', 'Trading'],
      asteroid: ['Rich', 'Dense', 'Hollow', 'Metallic'],
    };
    
    const suffixes = {
      wreck: ['Freighter', 'Cruiser', 'Transport', 'Hauler'],
      station: ['Station', 'Outpost', 'Platform', 'Base'],
      asteroid: ['Asteroid', 'Rock', 'Cluster', 'Field'],
    };
    
    const prefix = prefixes[site.type][Math.floor(Math.random() * prefixes[site.type].length)];
    const suffix = suffixes[site.type][Math.floor(Math.random() * suffixes[site.type].length)];
    
    return `${prefix} ${suffix}`;
  }
  
  private update(dt: number) {
    // Don't update movement if in site
    if (this.lootModal.classList.contains('show')) {
      // Tick looting game
      this.lootingGame.tick();
      return;
    }
    
    // Movement
    let vx = 0, vy = 0;
    if (this.keys.has('w') || this.keys.has('arrowup')) vy -= 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) vy += 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) vx -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) vx += 1;
    
    const len = Math.hypot(vx, vy) || 1;
    this.player.x += (vx / len) * this.playerSpeed * dt;
    this.player.y += (vy / len) * this.playerSpeed * dt;
    
    // Keep player on screen
    this.player.x = Math.max(20, Math.min(this.canvas.width - 20, this.player.x));
    this.player.y = Math.max(20, Math.min(this.canvas.height - 20, this.player.y));
    
    // Check for nearby sites
    this.nearestSite = null;
    let nearestDist = Infinity;
    
    for (const site of this.sites) {
      const dist = Math.hypot(site.position.x - this.player.x, site.position.y - this.player.y);
      if (dist < 60 && dist < nearestDist) {
        this.nearestSite = site;
        nearestDist = dist;
      }
    }
    
    // Show/hide prompt
    this.prompt.style.display = this.nearestSite ? 'block' : 'none';
    
    // Update HUD
    this.updateHUD();
  }
  
  private updateHUD() {
    this.hudPos.textContent = `${Math.round(this.player.x)}, ${Math.round(this.player.y)}`;
    this.hudCredits.textContent = this.totalCredits.toString();
    
    // Get current cargo from the game state
    const state = this.lootingGame.getState();
    this.hudCargo.textContent = `${state.cargoUsed}/${state.cargoMax}`;
    
    // Color code cargo in HUD
    const cargoPercent = (state.cargoUsed / state.cargoMax) * 100;
    if (cargoPercent >= 100) {
      this.hudCargo.style.color = '#ff3300';
    } else if (cargoPercent >= 80) {
      this.hudCargo.style.color = '#ff9900';
    } else {
      this.hudCargo.style.color = '#ffffff';
    }
    
    this.hudSites.textContent = `${this.sites.filter(s => s.visited).length}/${this.sites.length}`;
  }
  
  private render() {
    // Clear
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Draw grid lines
    this.ctx.strokeStyle = 'rgba(255, 107, 0, 0.05)';
    this.ctx.lineWidth = 1;
    for (let x = 0; x < this.canvas.width; x += 50) {
      this.ctx.beginPath();
      this.ctx.moveTo(x, 0);
      this.ctx.lineTo(x, this.canvas.height);
      this.ctx.stroke();
    }
    for (let y = 0; y < this.canvas.height; y += 50) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y);
      this.ctx.lineTo(this.canvas.width, y);
      this.ctx.stroke();
    }
    
    // Draw sites
    for (const site of this.sites) {
      const isNear = site === this.nearestSite;
      
      // Site circle
      this.ctx.beginPath();
      this.ctx.arc(site.position.x, site.position.y, 30, 0, Math.PI * 2);
      
      if (site.visited) {
        this.ctx.fillStyle = 'rgba(128, 128, 128, 0.2)';
        this.ctx.strokeStyle = '#444';
      } else {
        const colors = {
          wreck: { fill: 'rgba(255, 51, 102, 0.2)', stroke: '#ff3366' },
          station: { fill: 'rgba(0, 255, 170, 0.2)', stroke: '#00ffaa' },
          asteroid: { fill: 'rgba(255, 204, 0, 0.2)', stroke: '#ffcc00' },
        };
        const color = colors[site.type];
        this.ctx.fillStyle = color.fill;
        this.ctx.strokeStyle = color.stroke;
      }
      
      this.ctx.lineWidth = isNear ? 3 : 2;
      this.ctx.fill();
      this.ctx.stroke();
      
      // Site icon
      this.ctx.fillStyle = site.visited ? '#444' : '#e0e0e0';
      this.ctx.font = '20px monospace';
      this.ctx.textAlign = 'center';
      this.ctx.textBaseline = 'middle';
      const icons = { wreck: '⚠', station: '◈', asteroid: '◆' };
      this.ctx.fillText(icons[site.type], site.position.x, site.position.y);
      
      // Interaction radius
      if (isNear) {
        this.ctx.beginPath();
        this.ctx.arc(site.position.x, site.position.y, 60, 0, Math.PI * 2);
        this.ctx.strokeStyle = 'rgba(255, 107, 0, 0.3)';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([5, 5]);
        this.ctx.stroke();
        this.ctx.setLineDash([]);
      }
    }
    
    // Draw player
    this.ctx.beginPath();
    this.ctx.arc(this.player.x, this.player.y, 12, 0, Math.PI * 2);
    this.ctx.fillStyle = '#ff6b00';
    this.ctx.fill();
    this.ctx.strokeStyle = '#ff6b00';
    this.ctx.lineWidth = 2;
    this.ctx.stroke();
    
    // Player direction indicator
    const angle = Math.atan2(
      (this.nearestSite?.position.y ?? this.player.y) - this.player.y,
      (this.nearestSite?.position.x ?? this.player.x + 1) - this.player.x
    );
    this.ctx.beginPath();
    this.ctx.moveTo(
      this.player.x + Math.cos(angle) * 15,
      this.player.y + Math.sin(angle) * 15
    );
    this.ctx.lineTo(
      this.player.x + Math.cos(angle + 2.5) * 8,
      this.player.y + Math.sin(angle + 2.5) * 8
    );
    this.ctx.lineTo(
      this.player.x + Math.cos(angle - 2.5) * 8,
      this.player.y + Math.sin(angle - 2.5) * 8
    );
    this.ctx.closePath();
    this.ctx.fillStyle = '#ff6b00';
    this.ctx.fill();
  }
  
  private updateLootUI() {
    const state = this.lootingGame.getState();
    const site = state.currentSite;
    
    if (!site) {
      return;
    }
    
    // Update stats
    this.totalValue.textContent = state.totalValue.toString();
    this.cargoStatus.textContent = `${state.cargoUsed}/${state.cargoMax}`;
    
    // Update HUD cargo display (always visible)
    this.hudCargo.textContent = `${state.cargoUsed}/${state.cargoMax}`;
    
    // Color code cargo status
    const cargoPercent = (state.cargoUsed / state.cargoMax) * 100;
    if (cargoPercent >= 100) {
      this.cargoStatus.style.color = '#ff3300';
      this.hudCargo.style.color = '#ff3300';
    } else if (cargoPercent >= 80) {
      this.cargoStatus.style.color = '#ff9900';
      this.hudCargo.style.color = '#ff9900';
    } else {
      this.cargoStatus.style.color = '';
      this.hudCargo.style.color = '#ff8800';
    }
    
    // Update segmented integrity bar
    const segments = this.integrityBar.querySelectorAll('.integrity-segment');
    const totalSegments = segments.length;
    const filledSegments = Math.floor((site.siteStability / 100) * totalSegments);
    
    segments.forEach((segment, index) => {
      const seg = segment as HTMLElement;
      if (index < filledSegments) {
        seg.className = 'integrity-segment';
        if (site.siteStability <= 20) {
          seg.classList.add('critical');
        } else if (site.siteStability <= 40) {
          seg.classList.add('damaged');
        }
      } else {
        seg.className = 'integrity-segment lost';
      }
    });
    
    // Update integrity value
    this.integrityValue.textContent = `[${Math.round(site.siteStability)}%]`;
    

    
    // Update existing module cells instead of re-rendering everything
    this.updateModuleCells();
  }
  
  private calculateFailureChance(siteStability: number): number {
    // Same calculation as in grid-game.ts
    if (siteStability >= 70) return 0;
    if (siteStability >= 40) return 20 * (1 - (siteStability - 40) / 30);
    if (siteStability >= 10) return 20 + 30 * (1 - (siteStability - 10) / 30);
    return 50 + 20 * (1 - siteStability / 10);
  }

  private updateModuleCells() {
    const state = this.lootingGame.getState();
    const site = state.currentSite;
    
    if (!site) return;
    
    // Update each cell's visual state without recreating
    for (const module of site.modules) {
      const cell = document.querySelector(`[data-module-id="${module.id}"]`) as HTMLElement;
      if (!cell) continue;
      
      // Update class
      cell.className = `grid-cell ${module.state}`;
      
      // Add size class if multi-cell
      if (module.width > 1 || module.height > 1) {
        cell.classList.add(`size-${module.width}x${module.height}`);
      }
      
      // Add rarity class
      if (module.state === 'available' && module.value > 0) {
        if (module.value >= 2000 || module.type === 'valuable') {
          cell.classList.add('rare');
        } else if (module.type === 'volatile' || module.type === 'fragile') {
          cell.classList.add('special');
        } else {
          cell.classList.add('common');
        }
      } else if (module.state === 'destroyed' || module.type === 'empty') {
        cell.classList.add('corrupted');
      }
      
      // Update status overlay
      let statusEl = cell.querySelector('.module-status') as HTMLElement;
      
      // Handle available modules - clean up any leftover extraction UI
      if (module.state === 'available') {
        // Remove progress bar if exists
        const progressBar = cell.querySelector('.progress-bar');
        if (progressBar) progressBar.remove();
        
        // Update or create READY status
        if (statusEl && (statusEl.classList.contains('extracting') || 
                         statusEl.classList.contains('complete') || 
                         statusEl.classList.contains('damaged') || 
                         statusEl.classList.contains('failed'))) {
          statusEl.className = 'module-status ready';
          statusEl.textContent = 'READY';
        } else if (!statusEl || !statusEl.classList.contains('ready')) {
          if (!statusEl) {
            statusEl = document.createElement('div');
            cell.appendChild(statusEl);
          }
          statusEl.className = 'module-status ready';
          statusEl.textContent = 'READY';
        }
      }
      
      if (module.state === 'extracting') {
        if (!statusEl) {
          statusEl = document.createElement('div');
          statusEl.className = 'module-status extracting';
          cell.appendChild(statusEl);
        } else {
          // Update existing status element (might be READY status)
          statusEl.className = 'module-status extracting';
        }
        const timeLeft = Math.round(module.extractTime * (1 - module.extractProgress));
        statusEl.textContent = `EXTRACTING...${timeLeft}s`;
        
        // Update progress bar
        const progressFill = cell.querySelector('.progress-fill') as HTMLElement;
        if (progressFill) {
          progressFill.style.width = `${module.extractProgress * 100}%`;
        } else {
          // Add progress bar if it doesn't exist
          const progressBar = document.createElement('div');
          progressBar.className = 'progress-bar';
          const fill = document.createElement('div');
          fill.className = 'progress-fill';
          fill.style.width = `${module.extractProgress * 100}%`;
          progressBar.appendChild(fill);
          cell.appendChild(progressBar);
        }
      } else if (module.state === 'looted') {
        // Update or create status for looted
        if (!statusEl) {
          statusEl = document.createElement('div');
          cell.appendChild(statusEl);
        }
        statusEl.className = 'module-status complete';
        statusEl.textContent = 'COMPLETE';
        
        // Remove progress bar if exists
        const progressBar = cell.querySelector('.progress-bar');
        if (progressBar) progressBar.remove();
        
      } else if (module.state === 'damaged') {
        // Update or create status for damaged
        if (!statusEl) {
          statusEl = document.createElement('div');
          cell.appendChild(statusEl);
        }
        statusEl.className = 'module-status damaged';
        statusEl.textContent = 'DAMAGED';
        
        // Remove progress bar if exists
        const progressBar = cell.querySelector('.progress-bar');
        if (progressBar) progressBar.remove();
        
      } else if (module.state === 'destroyed') {
        // Always update or create status for destroyed
        if (!statusEl) {
          statusEl = document.createElement('div');
          cell.appendChild(statusEl);
        }
        statusEl.className = 'module-status failed';
        statusEl.textContent = 'FAILED';
        
        // Remove progress bar if exists
        const progressBar = cell.querySelector('.progress-bar');
        if (progressBar) progressBar.remove();
      }
      
      // Apply failure animation if flagged
      if (module.state === 'destroyed' && module.failureAnimation) {
        cell.classList.add('extraction-failed');
        // Clear the flag after animation
        setTimeout(() => {
          module.failureAnimation = false;
          cell.classList.remove('extraction-failed');
        }, 500);
      }
      
      // Update risk indicator for available modules
      if (module.state === 'available') {
        let riskEl = cell.querySelector('.module-risk') as HTMLElement;
        const failureChance = this.calculateFailureChance(site.siteStability);
        
        if (failureChance > 0) {
          if (!riskEl) {
            riskEl = document.createElement('div');
            riskEl.className = 'module-risk';
            cell.appendChild(riskEl);
          }
          
          // Update risk class and text
          riskEl.className = 'module-risk';
          if (failureChance <= 10) {
            riskEl.classList.add('low');
            riskEl.textContent = `${Math.round(failureChance)}%`;
          } else if (failureChance <= 30) {
            riskEl.classList.add('medium');
            riskEl.textContent = `${Math.round(failureChance)}%`;
          } else {
            riskEl.classList.add('high');
            riskEl.textContent = `${Math.round(failureChance)}%!`;
          }
        } else if (riskEl) {
          riskEl.remove();
        }
      }
      
      // Update instability bar for volatile modules
      if (module.type === 'volatile' && module.instability > 0) {
        const instabilityFill = cell.querySelector('.instability-fill') as HTMLElement;
        if (instabilityFill) {
          instabilityFill.style.width = `${module.instability}%`;
        } else if (module.state === 'available') {
          // Add instability bar if it doesn't exist
          const instabilityBar = document.createElement('div');
          instabilityBar.className = 'instability-bar';
          const fill = document.createElement('div');
          fill.className = 'instability-fill';
          fill.style.width = `${module.instability}%`;
          instabilityBar.appendChild(fill);
          cell.appendChild(instabilityBar);
        }
        
        // Add visual warning for high instability
        if (module.instability > 50) {
          cell.classList.add('shaking');
        }
      }
    }
  }

  private renderGrid() {
    const state = this.lootingGame.getState();
    const site = state.currentSite;
    
    if (!site) return;
    
    // Set grid dimensions to fill available space
    this.lootGrid.style.gridTemplateColumns = `repeat(${site.width}, 1fr)`;
    this.lootGrid.style.gridTemplateRows = `repeat(${site.height}, 1fr)`;
    this.lootGrid.innerHTML = '';
    
    // Create a grid map to track which cells are occupied
    const gridMap: (Module | null)[][] = Array(site.height).fill(null).map(() => Array(site.width).fill(null));
    
    // Place modules in the grid map
    for (const module of site.modules) {
      if (module.type !== 'empty') {
        gridMap[module.gridY][module.gridX] = module;
      }
    }
    
    // Render modules in grid order, skipping cells occupied by multi-cell modules
    const renderedModules = new Set<string>();
    
    for (let y = 0; y < site.height; y++) {
      for (let x = 0; x < site.width; x++) {
        const module = gridMap[y][x];
        
        if (module && !renderedModules.has(module.id)) {
          const cell = this.createCell(module);
          
          // Set grid position
          cell.style.gridColumn = `${x + 1} / span ${module.width}`;
          cell.style.gridRow = `${y + 1} / span ${module.height}`;
          
          this.lootGrid.appendChild(cell);
          renderedModules.add(module.id);
          
          // Add click handler directly to each cell
          if (module.state === 'available') {
            cell.addEventListener('click', () => {
              this.lootingGame.startExtraction(module.id);
            });
          } else if (module.state === 'extracting') {
            cell.addEventListener('click', () => {
              this.lootingGame.cancelExtraction(module.id);
            });
            cell.addEventListener('contextmenu', (e) => {
              e.preventDefault();
              this.lootingGame.cancelExtraction(module.id);
            });
          }
        } else if (!module) {
          // Check if this cell is part of a larger module
          let isCovered = false;
          for (const mod of site.modules) {
            if (mod.type !== 'empty' && 
                x >= mod.gridX && x < mod.gridX + mod.width &&
                y >= mod.gridY && y < mod.gridY + mod.height) {
              isCovered = true;
              break;
            }
          }
          
          // If not covered, render an empty cell
          if (!isCovered) {
            const emptyModule: Module = {
              id: `empty_${x}_${y}`,
              type: 'empty',
              state: 'destroyed',
              name: 'Empty',
              value: 0,
              condition: 0,
              extractTime: 0,
              extractProgress: 0,
              gridX: x,
              gridY: y,
              width: 1,
              height: 1,
              instability: 0
            };
            const cell = this.createCell(emptyModule);
            cell.style.gridColumn = `${x + 1}`;
            cell.style.gridRow = `${y + 1}`;
            this.lootGrid.appendChild(cell);
          }
        }
      }
    }
  }
  
  private createCell(module: Module): HTMLDivElement {
    const cell = document.createElement('div');
    cell.className = `grid-cell ${module.state}`;
    cell.dataset.moduleId = module.id;
    
    // Add size class for multi-cell modules
    if (module.width > 1 || module.height > 1) {
      cell.classList.add(`size-${module.width}x${module.height}`);
    }
    
    // Determine rarity/color class based on value and type
    if (module.state === 'available' && module.value > 0) {
      if (module.value >= 2000 || module.type === 'valuable') {
        cell.classList.add('rare');
      } else if (module.type === 'volatile' || module.type === 'fragile') {
        cell.classList.add('special');
      } else {
        cell.classList.add('common');
      }
    } else if (module.state === 'destroyed' || module.type === 'empty') {
      cell.classList.add('corrupted');
    }
    
    if (module.isShaking) {
      cell.classList.add('shaking');
    }
    
    if (module.state === 'destroyed' || module.type === 'empty') {
      // Add status for destroyed/empty
      if (module.state === 'destroyed') {
        const status = document.createElement('div');
        status.className = 'module-status failed';
        status.textContent = 'FAILED';
        cell.appendChild(status);
      }
      return cell;
    }
    
    // Type indicator dot
    const typeIndicator = document.createElement('div');
    typeIndicator.className = `module-type-indicator ${module.type}`;
    cell.appendChild(typeIndicator);
    
    // Type text
    const typeText = document.createElement('div');
    typeText.className = 'module-type-text';
    typeText.textContent = this.moduleTypeLabels[module.type] || 'UNK';
    cell.appendChild(typeText);
    
    // Name
    const name = document.createElement('div');
    name.className = 'module-name';
    name.textContent = module.name.toUpperCase();
    cell.appendChild(name);
    
    // Value
    const value = document.createElement('div');
    value.className = 'module-value';
    value.textContent = module.value.toLocaleString();
    cell.appendChild(value);
    
    // Condition
    const condition = document.createElement('div');
    condition.className = 'module-condition';
    condition.textContent = `${Math.round(module.condition)}%`;
    cell.appendChild(condition);
    
    // Add status overlay based on state
    if (module.state === 'available') {
      const status = document.createElement('div');
      status.className = 'module-status ready';
      status.textContent = 'READY';
      cell.appendChild(status);
      
      // Add extraction time indicator
      const time = document.createElement('div');
      time.className = 'module-time';
      time.textContent = `${Math.round(module.extractTime)}s`;
      cell.appendChild(time);
      
      // Add cargo weight indicator (simplified as 5 units per module)
      const weight = document.createElement('div');
      weight.className = 'module-weight';
      weight.textContent = `5kg`;
      cell.appendChild(weight);
      
      // Add risk indicator based on site stability
      const state = this.lootingGame.getState();
      const site = state.currentSite;
      if (site) {
        const failureChance = this.calculateFailureChance(site.siteStability);
        if (failureChance > 0) {
          const risk = document.createElement('div');
          risk.className = 'module-risk';
          if (failureChance <= 10) {
            risk.classList.add('low');
            risk.textContent = `${Math.round(failureChance)}%`;
          } else if (failureChance <= 30) {
            risk.classList.add('medium');
            risk.textContent = `${Math.round(failureChance)}%`;
          } else {
            risk.classList.add('high');
            risk.textContent = `${Math.round(failureChance)}%!`;
          }
          cell.appendChild(risk);
        }
      }
      
      // Add volatile warning and explosion radius indicator
      if (module.type === 'volatile') {
        const warning = document.createElement('div');
        warning.className = 'volatile-warning';
        warning.textContent = '⚠';
        cell.appendChild(warning);
        
        // Add explosion preview text
        const preview = document.createElement('div');
        preview.className = 'explosion-preview';
        preview.textContent = 'BLAST 2x2';
        cell.appendChild(preview);
        
        // Make cell identifiable as volatile for hover effects
        cell.classList.add('volatile');
        
        // Add mouse events to show explosion radius
        cell.style.pointerEvents = 'auto';
        cell.addEventListener('mouseenter', () => this.showExplosionRadius(module));
        cell.addEventListener('mouseleave', () => this.hideExplosionRadius());
      }
    } else if (module.state === 'looted') {
      const status = document.createElement('div');
      status.className = 'module-status complete';
      status.textContent = 'COMPLETE';
      cell.appendChild(status);
    } else if (module.state === 'damaged') {
      const status = document.createElement('div');
      status.className = 'module-status damaged';
      status.textContent = 'DAMAGED';
      cell.appendChild(status);
    }
    
    // Progress bar for extraction
    if (module.state === 'extracting') {
      const status = document.createElement('div');
      status.className = 'module-status extracting';
      const timeLeft = Math.round(module.extractTime * (1 - module.extractProgress));
      status.textContent = `EXTRACTING...${timeLeft}s`;
      cell.appendChild(status);
      
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
    
    // Set cursor style based on state
    if (module.state === 'available' || module.state === 'extracting') {
      cell.style.cursor = 'pointer';
    }
    
    return cell;
  }
  
  private explosionRadiusIndicator: HTMLElement | null = null;
  
  private showExplosionRadius(module: Module) {
    // Remove any existing indicator
    this.hideExplosionRadius();
    
    // Calculate explosion radius (2x2 around the module)
    const explosionRadius = 2; // cells in each direction
    const cell = document.querySelector(`[data-module-id="${module.id}"]`) as HTMLElement;
    if (!cell) return;
    
    // Get grid dimensions
    const state = this.lootingGame.getState();
    const site = state.currentSite;
    if (!site) return;
    
    // Calculate affected area
    const minX = Math.max(0, module.gridX - explosionRadius);
    const maxX = Math.min(site.width - 1, module.gridX + module.width - 1 + explosionRadius);
    const minY = Math.max(0, module.gridY - explosionRadius);
    const maxY = Math.min(site.height - 1, module.gridY + module.height - 1 + explosionRadius);
    
    // Create radius indicator
    const indicator = document.createElement('div');
    indicator.className = 'explosion-radius';
    indicator.style.position = 'absolute';
    
    // Get the grid wrapper for positioning reference
    const gridWrapper = this.lootGrid.closest('.grid-wrapper') as HTMLElement;
    const containerRect = gridWrapper ? gridWrapper.getBoundingClientRect() : this.lootGrid.getBoundingClientRect();
    
    // Use getBoundingClientRect for accurate positioning
    const cellRect = cell.getBoundingClientRect();
    
    // Get a sample cell to determine cell dimensions
    const sampleCell = this.lootGrid.querySelector('.grid-cell') as HTMLElement;
    if (!sampleCell) return;
    
    const cellWidth = sampleCell.offsetWidth;
    const cellHeight = sampleCell.offsetHeight;
    const gridGap = 2; // Gap between cells
    
    // Calculate the size of the explosion area
    const width = (maxX - minX + 1) * cellWidth + (maxX - minX) * gridGap;
    const height = (maxY - minY + 1) * cellHeight + (maxY - minY) * gridGap;
    
    // Get grid position within wrapper
    const gridRect = this.lootGrid.getBoundingClientRect();
    const gridOffsetLeft = gridRect.left - containerRect.left;
    const gridOffsetTop = gridRect.top - containerRect.top;
    
    // Calculate the top-left position of the explosion area
    // Start from the current module's position and offset back to minX, minY
    const currentCellLeft = cellRect.left - containerRect.left;
    const currentCellTop = cellRect.top - containerRect.top;
    
    // Calculate offset from current module position to explosion area start
    const offsetX = (module.gridX - minX) * (cellWidth + gridGap);
    const offsetY = (module.gridY - minY) * (cellHeight + gridGap);
    
    indicator.style.width = `${width}px`;
    indicator.style.height = `${height}px`;
    indicator.style.left = `${currentCellLeft - offsetX}px`;
    indicator.style.top = `${currentCellTop - offsetY}px`;
    
    // Add to the grid wrapper which is positioned relative
    if (gridWrapper) {
      gridWrapper.appendChild(indicator);
    } else {
      // Fallback to grid itself
      this.lootGrid.appendChild(indicator);
    }
    this.explosionRadiusIndicator = indicator;
  }
  
  private hideExplosionRadius() {
    if (this.explosionRadiusIndicator) {
      this.explosionRadiusIndicator.remove();
      this.explosionRadiusIndicator = null;
    }
  }
  
  private onExplosion(exploded: Module, affected: Module[]) {
    console.log(`💥 Explosion at ${exploded.name}! Affected ${affected.length} modules`);
    
    // Find the exploded cell
    const explodedCell = document.querySelector(`[data-module-id="${exploded.id}"]`) as HTMLElement;
    if (!explodedCell) return;
    
    const rect = explodedCell.getBoundingClientRect();
    const gridRect = this.lootGrid.getBoundingClientRect();
    
    // Create blast wave effect at explosion source
    const blastWave = document.createElement('div');
    blastWave.className = 'blast-wave';
    blastWave.style.left = `${rect.left - gridRect.left + rect.width / 2}px`;
    blastWave.style.top = `${rect.top - gridRect.top + rect.height / 2}px`;
    blastWave.style.position = 'absolute';
    this.lootGrid.appendChild(blastWave);
    
    // Remove blast wave after animation
    setTimeout(() => blastWave.remove(), 600);
    
    // Add chain reaction indicator if it's a volatile
    if (exploded.type === 'volatile') {
      const chainIndicator = document.createElement('div');
      chainIndicator.className = 'chain-reaction';
      chainIndicator.textContent = 'CHAIN!';
      explodedCell.appendChild(chainIndicator);
      setTimeout(() => chainIndicator.remove(), 500);
    }
    
    // Show impact on affected cells with delay for visual effect
    setTimeout(() => {
      for (const module of affected) {
        const cell = document.querySelector(`[data-module-id="${module.id}"]`) as HTMLElement;
        if (!cell || cell === explodedCell) continue;
        
        // Add impact flash
        const impact = document.createElement('div');
        impact.className = 'explosion-impact';
        cell.appendChild(impact);
        
        // Add damage source indicator pointing to explosion
        const sourceRect = explodedCell.getBoundingClientRect();
        const targetRect = cell.getBoundingClientRect();
        const angle = Math.atan2(
          targetRect.top - sourceRect.top,
          targetRect.left - sourceRect.left
        );
        
        const damageSource = document.createElement('div');
        damageSource.className = 'damage-source';
        damageSource.style.left = `${Math.cos(angle) * -20 + 50}%`;
        damageSource.style.top = `${Math.sin(angle) * -20 + 50}%`;
        cell.appendChild(damageSource);
        
        // Show damage numbers
        const damage = document.createElement('div');
        damage.className = 'damage-number';
        damage.textContent = '-50';
        damage.style.left = '50%';
        damage.style.top = '20%';
        damage.style.transform = 'translate(-50%, -50%)';
        cell.appendChild(damage);
        
        // Add shaking
        cell.classList.add('shaking');
        
        // Clean up after animations
        setTimeout(() => {
          impact.remove();
          damage.remove();
          damageSource.remove();
          cell.classList.remove('shaking');
        }, 800);
      }
    }, 100);
    
    // Screen shake effect (less intense)
    this.lootGrid.style.animation = 'screen-shake 0.3s';
    setTimeout(() => {
      this.lootGrid.style.animation = '';
    }, 300);
  }
  
  private gameLoop() {
    let lastTime = performance.now();
    
    const loop = (currentTime: number) => {
      const dt = Math.min((currentTime - lastTime) / 1000, 0.1);
      lastTime = currentTime;
      
      this.update(dt);
      this.render();
      
      requestAnimationFrame(loop);
    };
    
    requestAnimationFrame(loop);
  }
}

// Add screen shake animation
const style = document.createElement('style');
style.textContent = `
  @keyframes screen-shake {
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

// Start the game
new IntegratedGame();
