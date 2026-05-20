# Phase 3 UI Notes

## Overview
The Phase 3 UI refresh shifts the interface into a cinematic HUD aesthetic inspired by tactical holographic systems. The update is visual only and preserves all existing functionality.

## Visual System
- Palette: deep void backgrounds with cyan accents and low-opacity holographic panels.
- Typography: Orbitron for HUD labels, Space Grotesk for body text, Space Mono for technical labels.
- Shapes: sharp geometry with a maximum 2px radius.
- Motion: custom easing curves, scanline sweeps, and subtle glow pulses.

## HUD + Panels
- Top HUD includes version, live stats, and view toggles in uppercase labels.
- Sidebar and inspector use frosted glass panels with cyan accents.
- Toasts appear as a bottom-right stack with left accent bars.

## Graph Rendering
- Instanced meshes for all nodes with emissive holographic materials.
- Animated scan ring, fog, and deep-space star field.
- Relation-specific edge styling with animated data packets on RELATED_TO links.
- GSAP cinematic fly-to camera transitions with synchronized lookAt target.

## Seed Data
Run the seed script after the backend is running to populate the graph with demo thoughts:

```bash
python scripts/seed_brain.py --api http://localhost:8000
```

The seed list is also mirrored in `frontend/src/data/seedData.js` for quick reference.
