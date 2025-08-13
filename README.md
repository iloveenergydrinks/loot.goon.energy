## Looting Simulation (Per-Item Node System)

Headless TypeScript simulation of a per-item salvage/looting system for wrecks and resource nodes.

### Quick start

```bash
npm install
npm run demo
```

### Highlights

- Discrete `LootNode`s per site (modules, crates, intel, crew)
- Single queue extraction with stance modifiers (Quick/Normal/Careful)
- One shared site hazard meter (threshold events at 30/60/90)

- Auto-queue by tag priorities and value-per-kg
- Optional once-per-site volatile stabilization

This is a core logic module; integrate with your game UI to drive controls and display events.


