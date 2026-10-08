# Gemini & Antigravity Agent Guidelines

This file is loaded automatically by the Antigravity IDE and Gemini agents for this workspace.

---

## Mandatory Requirement: Context & Progress Log

Every agent operating in this repository must keep [`CONTEXT_AND_PROGRESS.md`](./CONTEXT_AND_PROGRESS.md) continuously updated.

### Protocol:
1. **Always Check Context First:** At the beginning of your task, inspect [`CONTEXT_AND_PROGRESS.md`](./CONTEXT_AND_PROGRESS.md) to understand the current build status, active tasks, and recent modifications.
2. **Always Log Changes Upon Completion:** Before completing your task, append a session log to Section 4 of [`CONTEXT_AND_PROGRESS.md`](./CONTEXT_AND_PROGRESS.md) detailing:
   - What actions were taken
   - Which files were created, edited, or removed
   - Architectural decisions or parameters agreed upon
   - Updated checklist items
   - Next steps for subsequent agents

Refer to [AGENTS.md](./AGENTS.md) for full workspace policies and architectural invariants.
