# Rule: Continuous Context & Progress Maintenance

**Scope:** Workspace-wide rule applying to all agents and subagents.

## Core Mandate
Whenever any coding agent operates within this codebase:
1. **Read on Entry:** Inspect [`CONTEXT_AND_PROGRESS.md`](../../CONTEXT_AND_PROGRESS.md) to understand current state, active tasks, and context before generating code or modifying architecture.
2. **Log on Exit:** Before completing your work, update [`CONTEXT_AND_PROGRESS.md`](../../CONTEXT_AND_PROGRESS.md) with:
   - Session date and high-level objective
   - Key decisions reached
   - Files created, edited, or removed
   - Updated task checklist
   - Immediate next steps for subsequent sessions/agents
