# Grill: PS6 UI/UX Design Brief (Document 04) scope decisions
Date: 2026-09-28

## Intent
Produce a UI/UX Design Brief (Document 04) for the PS6 supervisor dashboard that reads as a professional industrial safety operations console, not a generic SaaS dashboard, detailed enough to hand directly to implementation without further design-direction questions.

## Constraints
- Source of truth remains master_approach.md, plus decisions already frozen in 01_PRD.md, 02_TRD.md (Next.js/React/Tailwind dashboard, Firebase backend), and 03_APP_FLOW.md (real Firebase Auth login, identity-only/no role gating, push-only mobile scope, OPEN/ACKNOWLEDGED/RESOLVED incident lifecycle).
- Brief explicitly forbids sacrificing clarity for decoration, chaotic P3 animation, and color-only status signaling (icon + label + text required everywhere).

## Key decisions
- Decision: Dark-first theme with a fully specified light theme also included (not dark-only). Reason: the dashboard will be viewed both in a dim control-room-style setting and potentially on a factory-floor tablet in daylight, where a light theme reads better; the user chose to specify both rather than commit to dark-only. Alternative considered: dark-only, single token set -- this was the lower-effort recommended default, rejected by the user in favor of covering the daylight/field use case.
- Decision: Component foundation is shadcn/ui + Radix primitives, layered under Next.js/Tailwind. Reason: standard pairing for this stack; Radix's built-in accessible focus/keyboard/ARIA behavior for modals and drawers directly satisfies the brief's own accessibility section (22) and modal/drawer section (17) without bespoke work. Alternative considered: fully custom components with no named foundation -- rejected as pushing all accessibility plumbing onto custom implementation.
- Decision: A new P3 event triggers a full-screen takeover alarm state (acknowledge to dismiss back to the dense dashboard), rather than always staying inline as a card. Reason: resolves the brief's own tension between "high-information-density" and "low cognitive load" specifically for the highest-stakes case -- a confirmed fire must never be merely one card among many in a dense grid. Modeled on real control-room "master alarm" annunciator conventions. Only triggers on a genuinely new P3 arrival, not on every page visit while a P3 remains open. Alternative considered: always-inline prominence only -- rejected as relying entirely on passive visual weight plus the mobile push for attention, which the user judged insufficient for a P3.

## Surfaced assumptions
- Icon library follows directly from the shadcn/ui decision: Lucide (shadcn's default icon set) is used throughout rather than a separately chosen icon library -- not asked separately since it's implied by the component-foundation decision.
- Font choices (Inter for UI text, a monospace face for numeric/monitoring data such as timestamps, confidence values, sensor readings, and event IDs) were made by the author as ordinary design-brief judgment calls, not raised as grill questions, consistent with the session converging after three high-leverage questions.

## Out of scope
- No application code written -- this document is a design specification only.
- No new product behavior introduced beyond what 01_PRD.md, 02_TRD.md, and 03_APP_FLOW.md already established; this session's three decisions are presentation-layer only (theme scope, component foundation, P3 interaction pattern).
