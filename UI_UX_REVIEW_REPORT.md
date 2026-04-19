# UI/UX Review Report (April 2026)

## Scope
- Theme behavior (light/dark consistency, defaults, switching)
- Admin and shipment operational flows
- General visual consistency and usability risks from code review

## What was fixed now
1. **Theme mode normalization + safer default handling**
   - Invalid stored values now fall back to `light`.
   - Default remains `light` for first-time users.

2. **Consistent theme hooks for CSS + Tailwind**
   - `data-theme` is set on both `html` and `body`.
   - Dark-mode classes are synced on both `html` and `body`.
   - Dark token selectors now respond to `:root.dark`, `html.dark`, and body classes.

---

## Prioritized UX backlog (recommended order)

## P0 — Fix first (high impact / low-medium effort)

### 1) Mixed design systems create visual drift
- **Issue:** UI mixes MUI components, styled-components, and Tailwind utility classes with separate styling assumptions.
- **Symptoms:** Inconsistent spacing, typography, dark-mode surfaces, and hover/focus treatment.
- **Recommendation:** Define one source of truth for tokens and consume via wrappers for all three layers.
- **Effort:** Medium
- **Impact:** Very high

### 2) Color semantics are inconsistent across components
- **Issue:** Some components use CSS variables, others hardcoded palette values (`slate-*`, explicit hex), others MUI theme.
- **Recommendation:** Replace hardcoded colors with token aliases (`var(--...)`) or MUI theme references.
- **Effort:** Medium
- **Impact:** High

### 3) Form density and cognitive load in shipment setup
- **Issue:** Address and shipment setup forms are long and information-heavy in single views.
- **Recommendation:** Progressive disclosure (basic vs advanced fields), collapse rarely used fields, better inline validation timing.
- **Effort:** Medium
- **Impact:** High

## P1 — Next batch (high value / moderate effort)

### 4) Inconsistent feedback patterns for async actions
- **Issue:** Some pages use snackbars only; others show inline states; loading and disabled states vary by screen.
- **Recommendation:** Standardize loading/error/success patterns (button spinners, inline form errors, page-level fallbacks).
- **Effort:** Medium
- **Impact:** Medium-high

### 5) Table readability and mobile behavior
- **Issue:** Dense data tables (admin/users/orgs/finance) can be hard to scan and weak on smaller screens.
- **Recommendation:** Sticky headers, row grouping, responsive card fallback for narrow widths, clearer primary action hierarchy.
- **Effort:** Medium
- **Impact:** Medium-high

### 6) Accessibility baseline gaps
- **Issue:** Potential contrast and focus-state inconsistency due to mixed styling approach.
- **Recommendation:** Run automated a11y audit (axe), enforce minimum focus ring and contrast standards from tokens.
- **Effort:** Medium
- **Impact:** Medium-high

## P2 — Polish and trust signals

### 7) Microcopy consistency
- **Issue:** Terminology varies (`shipper/sender/origin`, `consignee/receiver/destination`) across screens.
- **Recommendation:** Standardize glossary by context and carrier conventions.
- **Effort:** Low
- **Impact:** Medium

### 8) Empty and error states
- **Issue:** Some states are generic and not action-oriented.
- **Recommendation:** Add clear CTA-driven empty/error states (retry, contact support, fix input guidance).
- **Effort:** Low-medium
- **Impact:** Medium

---

## Suggested execution plan
1. **Theme + token hardening** (1 sprint): remove hardcoded colors in shared layout components first.
2. **Shipment flow usability** (1 sprint): simplify Setup step and validation UX.
3. **Tables + accessibility pass** (1 sprint): responsive table strategy + contrast/focus audit.

## Suggested decision matrix for product selection
- **Quick wins:** P0 #1/#2
- **User conversion impact:** P0 #3
- **Operational efficiency:** P1 #4/#5
- **Quality/compliance:** P1 #6
