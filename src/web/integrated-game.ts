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
  private stabilityBar: HTMLElement;
  private stabilityValue: HTMLElement;
  private detectionBar: HTMLElement;
  private detectionValue: HTMLElement;
  
  // Game systems
  private lootingGame: LootingGrid;
  private currentSite: MapSite | null = null;
  private totalCredits = 0;
  private cargoUsed = 0;
  private cargoMax = 100;
  
  // Module icons
  private moduleIcons: Record<string, string> = {
    volatile: '💣',
    fragile: '💎',
    heavy: '🛡️',
    data: '💾',
    structural: '🏗️',
    valuable: '✨',
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
    this.stabilityBar = document.getElementById('stabilityBar') as HTMLDivElement;
    this.stabilityValue = document.getElementById('stabilityValue')!;
    this.detectionBar = document.getElementById('detectionBar') as HTMLDivElement;
    this.detectionValue = document.getElementById('detectionValue')!;
    
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
    this.modalTitle.textContent = `SALVAGE OPERATION - ${site.gridSite.name}`;
    
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
      this.cargoStatus.style.fontWeight = 'bold';
      this.hudCargo.style.color = '#ff3300';
    } else if (cargoPercent >= 80) {
      this.cargoStatus.style.color = '#ff9900';
      this.cargoStatus.style.fontWeight = 'bold';
      this.hudCargo.style.color = '#ff9900';
    } else {
      this.cargoStatus.style.color = '';
      this.cargoStatus.style.fontWeight = '';
      this.hudCargo.style.color = '#ffffff';
    }
    
    // Update meters
    this.stabilityBar.style.width = `${site.siteStability}%`;
    
    // Calculate and show failure chance
    const failureChance = this.calculateFailureChance(site.siteStability);
    if (failureChance > 0) {
      this.stabilityValue.innerHTML = `${Math.round(site.siteStability)}% <span style="color: #ff3300; font-size: 0.9em;">(${Math.round(failureChance)}% fail)</span>`;
    } else {
      this.stabilityValue.textContent = `${Math.round(site.siteStability)}%`;
    }
    
    this.detectionBar.style.width = `${site.detectionLevel}%`;
    this.detectionValue.textContent = `${Math.round(site.detectionLevel)}%`;
    
    // Color code stability bar with CSS classes
    this.stabilityBar.className = 'meter-fill stability';
    if (site.siteStability <= 20) {
      this.stabilityBar.classList.add('critical');
      // Also shake the entire meter container
      const meterContainer = this.stabilityBar.parentElement;
      if (meterContainer) {
        meterContainer.style.animation = 'shake 0.3s infinite';
      }
    } else if (site.siteStability <= 40) {
      this.stabilityBar.classList.add('danger');
      const meterContainer = this.stabilityBar.parentElement;
      if (meterContainer) {
        meterContainer.style.animation = '';
      }
    } else if (site.siteStability < 70) {
      this.stabilityBar.classList.add('warning');
      const meterContainer = this.stabilityBar.parentElement;
      if (meterContainer) {
        meterContainer.style.animation = '';
      }
    } else {
      // Safe - default green color
      const meterContainer = this.stabilityBar.parentElement;
      if (meterContainer) {
        meterContainer.style.animation = '';
      }
    }
    
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
      
      // Update visual state
      if (module.state === 'available') {
        cell.style.border = '2px solid #ffffff';
        cell.style.background = '#111111';
        cell.style.animation = '';
        cell.style.opacity = '1';
      } else if (module.state === 'extracting') {
        cell.style.border = '2px solid #ff6600';
        cell.style.background = '#1a0a00';
        cell.style.opacity = '1';
        
        // Update progress bar if it exists
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
        cell.style.border = '2px solid #333333';
        cell.style.opacity = '0.3';
        cell.style.background = '#000000';
        cell.style.animation = '';
      } else if (module.state === 'damaged') {
        cell.style.border = '2px solid #ff3300';
        cell.style.opacity = '0.6';
        cell.style.background = '#220000';
        cell.style.animation = '';
        // Remove any progress bars from damaged modules
        const progressBar = cell.querySelector('.progress-bar');
        if (progressBar) progressBar.remove();
      } else if (module.state === 'destroyed') {
        // Apply failure animation if flagged
        if (module.failureAnimation) {
          cell.classList.add('extraction-failed');
          // Clear the flag after animation
          setTimeout(() => {
            module.failureAnimation = false;
            cell.classList.remove('extraction-failed');
          }, 500);
        }
        cell.style.border = '1px solid #222222';
        cell.style.opacity = '0.1';
        cell.style.background = '#000000';
        cell.style.animation = module.failureAnimation ? 'failureFlash 0.5s ease-out' : '';
        // Remove any progress bars from destroyed modules
        const progressBar = cell.querySelector('.progress-bar');
        if (progressBar) progressBar.remove();
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
          cell.style.animation = 'shake 0.5s infinite';
        }
      }
    }
  }

  private renderGrid() {
    const state = this.lootingGame.getState();
    const site = state.currentSite;
    
    if (!site) return;
    
    // Set grid dimensions
    this.lootGrid.style.gridTemplateColumns = `repeat(${site.width}, 1fr)`;
    this.lootGrid.innerHTML = '';
    
    // Sort modules by position
    const sortedModules = [...site.modules].sort((a, b) => {
      if (a.gridY !== b.gridY) return a.gridY - b.gridY;
      return a.gridX - b.gridX;
    });
    
    for (const module of sortedModules) {
      const cell = this.createCell(module);
      this.lootGrid.appendChild(cell);
      
      // Add click handler directly to each cell (like the working grid version)
      if (module.state === 'available') {
        cell.addEventListener('click', () => {
          console.log('Direct click on available module:', module.name);
          this.lootingGame.startExtraction(module.id);
        });
      } else if (module.state === 'extracting') {
        cell.addEventListener('click', () => {
          console.log('Direct click on extracting module:', module.name);
          this.lootingGame.cancelExtraction(module.id);
        });
        cell.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          console.log('Right-click on extracting module:', module.name);
          this.lootingGame.cancelExtraction(module.id);
        });
      }
    }
  }
  
  private createCell(module: Module): HTMLDivElement {
    const cell = document.createElement('div');
    cell.className = `grid-cell ${module.state}`;
    cell.dataset.moduleId = module.id;
    
    // Industrial minimal styling
    if (module.state === 'available') {
      cell.style.border = '2px solid #ffffff';
      cell.style.background = '#111111';
    } else if (module.state === 'extracting') {
      cell.style.border = '2px solid #ff6600';
      cell.style.background = '#1a0a00';
    } else if (module.state === 'looted') {
      cell.style.border = '2px solid #333333';
      cell.style.opacity = '0.3';
      cell.style.background = '#000000';
    } else if (module.state === 'damaged') {
      cell.style.border = '2px solid #ff3300';
      cell.style.opacity = '0.6';
      cell.style.background = '#220000';
    } else if (module.state === 'destroyed' || module.type === 'empty') {
      cell.style.opacity = '0.1';
      cell.style.border = '1px solid #222222';
      cell.style.background = '#000000';
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
    icon.textContent = this.moduleIcons[module.type] || '📦';
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
    
    // Set cursor style based on state
    if (module.state === 'available' || module.state === 'extracting') {
      cell.style.cursor = 'pointer';
    }
    
    return cell;
  }
  
  private onExplosion(exploded: Module, affected: Module[]) {
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
    document.body.style.animation = 'screen-shake 0.3s';
    setTimeout(() => {
      document.body.style.animation = '';
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
