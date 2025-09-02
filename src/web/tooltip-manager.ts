// Centralized tooltip manager for consistent behavior across all UIs
export class TooltipManager {
  private tooltip: HTMLDivElement | null = null;
  private currentTarget: HTMLElement | null = null;
  private hideTimeout: number | null = null;
  private showTimeout: number | null = null;
  private isVisible = false;
  private mouseX = 0;
  private mouseY = 0;
  
  constructor() {
    this.createTooltip();
    this.attachGlobalListeners();
  }
  
  private createTooltip() {
    if (!this.tooltip) {
      this.tooltip = document.createElement('div');
      this.tooltip.className = 'ui-tooltip';
      this.tooltip.style.position = 'fixed';
      this.tooltip.style.display = 'none';
      this.tooltip.style.pointerEvents = 'none';
      this.tooltip.style.zIndex = '10000';
      document.body.appendChild(this.tooltip);
    }
  }
  
  private attachGlobalListeners() {
    // Track mouse position globally
    document.addEventListener('mousemove', (e) => {
      this.mouseX = e.clientX;
      this.mouseY = e.clientY;
      if (this.isVisible && this.tooltip) {
        this.positionTooltip();
      }
    });
    
    // Use event delegation for all tooltip triggers
    document.addEventListener('mouseover', (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      
      const tip = target.getAttribute('data-tip');
      if (tip) {
        this.show(target, tip);
      }
    }, true);
    
    document.addEventListener('mouseout', (e) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      
      if (target === this.currentTarget) {
        this.scheduleHide();
      }
    }, true);
    
    // Hide on any click
    document.addEventListener('click', () => {
      this.hide();
    });
  }
  
  private show(target: HTMLElement, content: string) {
    // Clear any pending hide
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    
    // Clear any pending show
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
    
    this.currentTarget = target;
    
    // Small delay to prevent flicker
    this.showTimeout = window.setTimeout(() => {
      if (!this.tooltip) return;
      
      this.tooltip.textContent = content;
      this.tooltip.style.display = 'block';
      this.isVisible = true;
      this.positionTooltip();
    }, 10);
  }
  
  private scheduleHide() {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
    
    // Small delay to prevent flicker when moving between elements
    this.hideTimeout = window.setTimeout(() => {
      this.hide();
    }, 50);
  }
  
  private hide() {
    if (this.showTimeout) {
      clearTimeout(this.showTimeout);
      this.showTimeout = null;
    }
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
      this.hideTimeout = null;
    }
    
    if (this.tooltip) {
      this.tooltip.style.display = 'none';
    }
    this.isVisible = false;
    this.currentTarget = null;
  }
  
  private positionTooltip() {
    if (!this.tooltip || !this.isVisible) return;
    
    const padding = 12;
    const rect = this.tooltip.getBoundingClientRect();
    let left = this.mouseX + padding;
    let top = this.mouseY + padding;
    
    // Adjust if tooltip would go off-screen
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    if (left + rect.width > viewportWidth - 5) {
      left = this.mouseX - rect.width - padding;
    }
    
    if (top + rect.height > viewportHeight - 5) {
      top = this.mouseY - rect.height - padding;
    }
    
    // Ensure tooltip stays on screen
    left = Math.max(5, left);
    top = Math.max(5, top);
    
    this.tooltip.style.left = `${left}px`;
    this.tooltip.style.top = `${top}px`;
  }
  
  // Method to refresh event listeners (call after DOM updates)
  public refresh() {
    // The event delegation approach means we don't need to re-attach listeners
    // This method is here for compatibility if needed
  }
  
  // Clean up method
  public destroy() {
    this.hide();
    if (this.tooltip && this.tooltip.parentNode) {
      this.tooltip.parentNode.removeChild(this.tooltip);
    }
    this.tooltip = null;
  }
}

// Create a singleton instance
let tooltipManagerInstance: TooltipManager | null = null;

export function getTooltipManager(): TooltipManager {
  if (!tooltipManagerInstance) {
    tooltipManagerInstance = new TooltipManager();
  }
  return tooltipManagerInstance;
}
