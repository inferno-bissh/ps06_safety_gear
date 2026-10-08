# AI Agent Operating Guidelines & Workspace Rules

All AI coding assistants and agents (Gemini, Claude, Antigravity, Cursor, Windsurf, Copilot, etc.) working in this repository **must** strictly adhere to the following rules:

---

## 1. Unified Progress & Context Tracking Rule (CRITICAL)

The file [`CONTEXT_AND_PROGRESS.md`](./CONTEXT_AND_PROGRESS.md) is the **single source of truth** for project status, recent changes, architectural decisions, and active work across all developer sessions and AI agents.

### Mandatory Workflow:

1. **Session Start / Warm-Up**:
   - Before taking action or suggesting architectural alterations, **read** [`CONTEXT_AND_PROGRESS.md`](./CONTEXT_AND_PROGRESS.md).
   - Check the **Current Implementation Status**, the **Latest Session Log**, and the **Immediate Next Steps**.
   - Cross-reference with existing architectural specs in [`implmentation_docs/`](./implmentation_docs/) to avoid redundant or conflicting decisions.

2. **During the Session**:
   - If an architectural or structural decision is made (e.g. database choice, data schema alteration, state management pattern), verify that it aligns with documented plans or note why an update was needed.

3. **Session Wrap-Up (Before concluding any turn/task)**:
   - **Update [`CONTEXT_AND_PROGRESS.md`](./CONTEXT_AND_PROGRESS.md) with a new entry in `Section 4: Session History & Work Log`**:
     - **Session Date / ID**
     - **Agent Focus & Summary** of what was accomplished
     - **Key Decisions** made
     - **Files Created / Modified / Deleted**
     - **Updated Status / Checkboxes** in Section 3
     - **Clear Immediate Next Steps** for the next agent or user prompt.

---

## 2. Architectural Guidelines & Preserved Decisions

- **Datastore:** Cloud Firestore (Not Realtime Database, Not Postgres). See [`implmentation_docs/05_BACKEND_SCHEMA.md`](./implmentation_docs/05_BACKEND_SCHEMA.md).
- **Incident Escalation:** P0 (Normal), P1 (Advisory), P2 (Warning), P3 (Critical Takeover).
- **Incident State:** `OPEN` -> `ACKNOWLEDGED` -> `RESOLVED`.
- **Framework & Codebase:** Next.js 16 (App Router), React 19, Tailwind CSS v4 in `dashboard/`.
- **Demo Reliability:** Maintain simulation mode alongside live database integration so that hackathon demonstrations do not break if local network or edge devices are offline.
