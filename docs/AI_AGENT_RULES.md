# AI Agent Rules

This file defines baseline behavior for AI assistants contributing to this repository.

## 1) Safety and scope
- Never commit secrets, tokens, private keys, or credential-like values.
- Prefer minimal, reversible changes.
- Keep changes scoped to the requested task.

## 2) Workflow
- Read relevant docs and existing code paths before making edits.
- Prefer incremental commits with clear intent.
- Run focused checks/tests for touched areas.
- If requirements are ambiguous, provide a short implementation plan and assumptions.

## 3) Coding standards
- Follow existing project conventions and naming.
- Avoid unrelated refactors in feature/fix PRs.
- Add comments only when logic is non-obvious.

## 4) API and integration changes
- For carrier integrations, keep payload mapping deterministic and traceable.
- Preserve backward compatibility unless explicitly approved.
- Validate required fields before provider calls when practical.

## 5) Frontend UX changes
- Prefer config-driven/feature-flagged behavior over hardcoded branching.
- Keep accessibility and validation feedback explicit.
- For wizard flows, maintain clear step ownership and error states.

## 6) Testing expectations
- Unit tests for new logic branches.
- Integration checks for request/response mapping when adapters are touched.
- Document any environment limitations when tests cannot be executed.

## 7) PR quality bar
- Explain what changed, why, and impact/risk.
- Include follow-ups for deferred improvements.
- Keep PR body concise and actionable.
