# Issue tracker: Local Markdown

Issues and specifications for this repository live as Markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The specification is `.scratch/<feature-slug>/spec.md`.
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`.
- Triage state is recorded as a `Status:` line near the top of each issue file.
- Comments and conversation history are appended under a `## Comments` heading.

## When a skill says “publish to the issue tracker”

Create or update a file under `.scratch/<feature-slug>/`. Do not create GitHub Issues, commit, or push unless the user explicitly requests it.

## When a skill says “fetch the relevant ticket”

Read the referenced file path. The user will normally provide the path or issue number.

## Wayfinding

- Map: `.scratch/<effort>/map.md`.
- Child tickets: `.scratch/<effort>/issues/NN-<slug>.md`.
- A `Type:` line records `research`, `prototype`, `grilling`, or `task`.
- A `Status:` line records `claimed` or `resolved` for wayfinding tickets.
- A `Blocked by:` line lists unresolved ticket numbers.
