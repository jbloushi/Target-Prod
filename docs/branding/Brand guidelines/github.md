repo: jbloushi/Target-Prod
branch: main

## Last sync
date: 2026-10-02T17:05:00Z

### Updated in this project
- Brand guidelines now use real repo assets: official logos (target-logo*.png, target-icon*.png) and brand pattern (target-pattern.svg / -dark)
- Doodle pattern (light) + triangle cluster (dark) applied as backgrounds; disabled buttons carry the doodle pattern as a non-color cue
- Component Library section catalogued from the live wizards
- Wizard redesigned: system nav header + vertical step sidebar, 4 steps / 6 screens, Google Places + map pin on address screens

### Collected assets (frontend/public/images)
- Logos: target-logo.png/@2x, -white, -tagline, -tagline-white
- Icons: target-icon.png, target-icon-white.png, shipping-icon.svg, favicons
- Patterns: target-pattern.svg, target-pattern-dark.svg
- Note: app index.css primary is #0050D4; theme.jsx lists #2563EB (light) — reconcile with brand #0019A7

## Screen map
| Screen | Source files |
|---|---|
| Target Logistics Brand Guidelines.dc.html | frontend/src/ui/tokens.css, frontend/src/tokens/kineticHorizon.js, frontend/src/theme.jsx, branding_.md |
| Target Logistics Wizard.dc.html | frontend/src/components/shipment/KineticShipmentWizard.jsx, frontend/src/ui/components/WizardHeader.jsx, frontend/src/ui/components/KineticInputs.jsx |
