# Grill: PS6 App Flow (Document 03) scope decisions
Date: 2026-09-28

## Intent
Produce a complete app flow / navigation / user journey document (Document 03) detailed enough that a coding agent can build connected screens instead of isolated pages, for the PS6 supervisor dashboard -- without inventing product behavior the PRD/TRD didn't already establish.

## Constraints
- Source of truth remains master_approach.md, plus the decisions already frozen in 01_PRD.md and 02_TRD.md (e.g. Firebase/Firestore/FCM backend, N-zone-agnostic architecture, no role-based PRD requirement was ever stated).
- master_approach.md never mentions authentication, mobile app screens, or an incident acknowledge/resolve lifecycle -- all three were genuinely open and needed a call before the document could be drafted.

## Key decisions
- Decision: Implement real login via Firebase Auth, gating the dashboard. Reason: user's explicit choice, overriding the no-auth-for-hackathon recommendation. Alternative considered: no auth at all (single shared dashboard, auth flagged as future add-on) -- this was the recommended default but the user chose real login instead.
- Decision: Login is identity/audit-only -- no role-based access differences between Safety Supervisor, Facility/Operations Supervisor, and System Administrator. Every authenticated user can reach every screen, including Configuration. Reason: user's explicit choice. Alternative considered: role-based gating (only System Administrator reaches Configuration screens) -- rejected by the user in favor of the simpler model.
- Decision: "Unauthorized access" (Section 2 of the brief) means unauthenticated, not wrong-role -- there is no per-role unauthorized state, since access is identical once logged in. Follows directly from the role-gating decision above; not separately re-confirmed with the user.
- Decision: Mobile scope is push notifications only (FCM), deep-linking into the same responsive web dashboard in a mobile browser -- no separate mobile app or distinct mobile navigation structure. Reason: matches master_approach's architecture diagram, which shows "Web Dashboard" and "Mobile FCM" as two separate leaf outputs, not a mobile app; the recommended option, confirmed by the user.

## Surfaced assumptions
- Incidents get a minimal status lifecycle (OPEN / ACKNOWLEDGED / RESOLVED) even though master_approach never defines one -- the brief explicitly asks for review/acknowledge/resolve behavior (Section 15) and a supervisor dashboard is not meaningfully usable without some incident lifecycle. This is treated as a reasonable, low-risk AppFlow-level extension (not a master_approach requirement) and labeled as such in the document, not raised as a separate question given the user's preference to keep grilling short this round.
- Session was deliberately kept to 3 questions (vs. the more extensive PRD/TRD grills) based on the user's signal in the prior TRD session that they wanted grilling to converge faster.

## Out of scope
- No separate native mobile app screens/navigation -- push notifications only, per the mobile-scope decision above.
- No role-based permission model in this document, per the role-gating decision above.
