# Domain Docs

This repository uses a single-context domain documentation layout.

## Before exploring

- Read `GLOSSARY.md` at the repository root when it exists.
- Read relevant decisions under `docs/adr/` when they exist.
- If these files do not exist, proceed without treating their absence as a problem. Create them lazily when domain terms or architectural decisions are resolved.

## File structure

```text
/
├── GLOSSARY.md
├── docs/adr/
└── src/
```

## Vocabulary rules

Use canonical domain terms from `GLOSSARY.md` in issue titles, refactoring proposals, hypotheses, and tests. If a required concept is missing, record it as a domain-model gap rather than inventing a synonym.

## Decision conflicts

If work contradicts an existing ADR, surface the conflict explicitly and propose whether the ADR should be reopened.
