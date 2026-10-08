# PS6 — UI/UX Design Brief

## Multimodal Industrial Safety & Hazard Monitoring System

**Document:** 04 — UI/UX Design Brief
**Source of truth:** `master_approach.md` (as amended 2026-09-28), plus decisions frozen in `01_PRD.md`, `02_TRD.md` (Next.js/React/Tailwind dashboard, Firebase backend, cloud-hosted vision/decision compute), and `03_APP_FLOW.md` (real login, no role gating, push-only mobile, incident lifecycle).
**Revision note (2026-09-28):** Network-status and error-state language revised throughout — "Edge AI" is now "cloud vision inference service," "4G" is now "ESP32 Cellular," and every claim of a local siren fallback has been removed, since the amended architecture has no local emergency-response path independent of ESP32-to-backend connectivity.
**Reads as:** a professional industrial safety operations console — not a generic SaaS dashboard.

### Decisions carried in from this document's grill session

| Decision | Resolution |
|---|---|
| Theme scope | **Dark-first, with a fully specified light theme.** Both token sets below are complete; dark is the default. |
| Component foundation | **shadcn/ui + Radix primitives**, layered on the TRD's Next.js/Tailwind stack. Radix supplies accessible focus/keyboard/ARIA behavior for modals, drawers, and dropdowns out of the box. Icon set: **Lucide** (shadcn's default). |
| P3 alarm pattern | **Full-screen takeover on a genuinely new P3 arrival**, requiring explicit acknowledgment before returning to the normal dense dashboard — modeled on control-room "master alarm" annunciator conventions. Does not re-trigger just from visiting a page with an already-open P3. |

---

## 1. Design Objective

The visual system exists to make safety state immediately legible under time pressure. In priority order:

1. Situational awareness — what's happening, facility-wide, at a glance.
2. Incident visibility — nothing critical is buried.
3. Clear priority — P0–P3 is never ambiguous.
4. Low cognitive load — dense, but not noisy.
5. Real-time status — state changes are visible as they happen.
6. Evidence visibility — proof is one click away, never buried in navigation.
7. System health — hardware/network state is always checkable without hunting.
8. Responsive operation — works at desk and on a phone.

Clarity is never traded for decoration. If a visual flourish doesn't communicate state, it doesn't belong.

---

## 2. Overall Aesthetic

Professional, industrial, technical, high-information-density, real-time-operations. Closer to a SCADA/NOC console than a startup dashboard.

**Avoid:** gradients as decoration, glassmorphism, playful illustration, motion that doesn't communicate a state change, and any component that trades information density for whitespace-as-decoration.

**Allow:** generous whitespace where it separates *unrelated* information (e.g. between zone cards) — density means "no wasted space," not "no breathing room."

---

## 3. Color System

Every status below carries **color + icon + label + text** — never color alone (accessibility requirement, Section 22).

### 3.1 Priority colors (P0–P3)

| Priority | Meaning | Dark token | Light token | Icon | Visual treatment |
|---|---|---|---|---|---|
| P0 | Normal | `#10B981` (muted emerald) | `#059669` | `ShieldCheck` | Quiet — small badge only, no card emphasis |
| P1 | PPE Warning | `#EAB308` (amber) | `#CA8A04` | `ShieldAlert` | Visible badge + amber-tinted card left-border, no sound |
| P2 | Suspicious Hazard | `#F97316` (orange) | `#EA580C` | `TriangleAlert` | Prominent badge, orange card border, zone highlighted on Dashboard/Zone Overview |
| P3 | Confirmed / High-Priority | `#EF4444` (red) | `#DC2626` | `Flame` (fire-type) / `OctagonAlert` (generic) | Full-screen takeover on arrival (Section 11); persistent red alarm bar afterward |

### 3.2 System/connectivity status colors

| State | Dark token | Light token | Icon |
|---|---|---|---|
| Online | `#22C55E` | `#16A34A` | `CircleCheck` |
| Offline | `#64748B` (slate — absence, not automatically a hazard) | `#475569` | `WifiOff` / `PowerOff` |
| Warning | `#EAB308` | `#CA8A04` | `TriangleAlert` |
| Critical | `#EF4444` | `#DC2626` | `OctagonAlert` |
| Degraded | `#F97316` | `#EA580C` | `AlertCircle` |
| Information | `#3B82F6` | `#2563EB` | `Info` |
| Unknown | `#8B5CF6` (violet — deliberately distinct from Offline's gray and Critical's red) | `#7C3AED` | `HelpCircle` (dashed outline) |

### 3.3 PPE status colors

| Status | Token (dark/light) | Icon | Notes |
|---|---|---|---|
| PASS | `#22C55E` / `#16A34A` | `Check` | Solid fill |
| FAIL | `#EF4444` / `#DC2626` | `X` | Solid fill |
| UNKNOWN | `#8B5CF6` / `#7C3AED` | `HelpCircle` | **Dashed border, not solid** — must be visually unmistakable from FAIL at a glance, never implies a violation |

### 3.4 Base / surface tokens

| Token | Dark | Light |
|---|---|---|
| `bg-base` | `#0B0F14` | `#F5F7FA` |
| `bg-surface` | `#121821` | `#FFFFFF` |
| `bg-surface-raised` | `#1A222C` | `#FFFFFF` (+ shadow, Section 24) |
| `border-default` | `#26303C` | `#D8DEE4` |
| `text-primary` | `#E6EDF3` | `#101418` |
| `text-secondary` | `#9AA7B2` | `#4B5563` |
| `text-muted` | `#6B7785` | `#6B7280` |

All status-on-background pairings target **WCAG AA (4.5:1)** for text and 3:1 for large text/icons, in both themes.

---

## 4. Typography

| Role | Font | Notes |
|---|---|---|
| Primary UI | **Inter** (variable) | Body copy, labels, navigation, headings |
| Numeric / monitoring | **JetBrains Mono** | Timestamps, confidence values, sensor readings, event IDs, register/heartbeat values — tabular figures for column alignment |

| Level | Size | Weight |
|---|---|---|
| H1 (page title) | 28px / 1.75rem | Semibold |
| H2 (section) | 20px / 1.25rem | Semibold |
| H3 (card title) | 16px / 1rem | Semibold |
| Body | 14px / 0.875rem | Regular |
| Small / metadata | 12px / 0.75rem | Regular |
| Micro (badge text) | 11px / 0.6875rem | Medium, uppercase, letter-spaced |

Numeric values (confidence %, sensor readings, timestamps) always render in the monospace face with tabular figures, so columns of numbers align — critical for scanning a dense incident/event table quickly.

---

## 5. Layout

### Desktop (≥1280px)
```text
┌─────────────┬───────────────────────────────────────────┬──────────────┐
│  Sidebar     │  Header (network status · health · bell · user)          │
│  (nav, fixed)├───────────────────────────────────────────────────────────┤
│              │  Main monitoring canvas (dense grid: cards, tables)       │
│              │                                    ┌──────────────────┐  │
│              │                                    │ Contextual panel  │  │
│              │                                    │ (drawer, optional)│  │
└─────────────┴────────────────────────────────────┴──────────────────┘
```

### Tablet (768–1279px)
Two-column adaptive: sidebar collapses to icon-only rail; contextual panels become full-width drawers instead of side panels.

### Mobile (<768px)
Single column, sidebar becomes a top hamburger menu (per `03_APP_FLOW.md` — no separate mobile nav structure). Content priority order, top to bottom:
1. Active critical (P2/P3) incidents
2. Zone status summary
3. Recent notifications
4. System health summary

P3 full-screen takeover (Section 11) works identically on mobile — it's the one state guaranteed to remain visible regardless of what else is on screen.

---

## 6. Facility Dashboard

```text
[ Total Cameras ] [ Active Zones ] [ Network Mode ] [ System Health ] [ Active Incidents ]
        ← KPI status cards, top row, always visible →

┌─────────────────────────────┬───────────────────────────┐
│ Zone status grid              │ Latest incidents (top 5)   │
│ (ZoneCard × N, hazard-first    │ Priority · Event · Location │
│  sort: any P2/P3 zone surfaces │ · Time · Confidence         │
│  to the top)                   │ [View all →]                │
├─────────────────────────────┴───────────────────────────┤
│ System health strip: Cloud Vision · ESP32 · Modbus nodes · Sensors · Network · Heartbeat │
└───────────────────────────────────────────────────────────┘
```

KPI cards use Information-blue for neutral counts (cameras, zones), and the priority/status palette (Section 3) only where the value itself represents a state (Network Mode, System Health, Active Incidents count > 0).

---

## 7. Zone View

`ZoneCard` (grid) and Zone Detail (full page) both show: zone name, zone state (derived: highest active priority in that zone), camera, worker count, PPE compliance summary, fire state, smoke state, physical sensor state, node status.

**Visual hierarchy rule:** a zone's card border and header accent always reflect its *highest current priority* (P3 red > P2 orange > P1 amber > P0 quiet). A zone with one open P3 incident is visually unmistakable in the Zone Overview grid without opening it.

---

## 8. Incident UI

**Incident list (table):** Priority badge · Event type · Location · Timestamp (mono) · Confidence (mono, %) · Status (OPEN/ACKNOWLEDGED/RESOLVED badge). Sortable by priority (default) and timestamp.

**Incident Detail (drawer, per Section 17):** Event ID (mono) · Camera · Zone · Worker ID (if applicable) · AI evidence block · Physical sensor evidence block · Evidence snapshot (large, above the fold — Section 15) · Network mode at time of event · Required action (prominent, top of drawer, not buried under evidence).

---

## 9. PPE UI

```text
Worker  TRACK_17
├─ Helmet        ✓ PASS      (green, solid)
├─ Vest          ✕ FAIL      (red, solid)
├─ Gloves        ✓ PASS      (green, solid)
└─ Safety Shoes  ?  UNKNOWN  (violet, dashed border)
```

`PPEStatus` renders PASS/FAIL/UNKNOWN with distinct color, icon, **and** border style (solid vs. dashed) — the dashed border on UNKNOWN is non-negotiable: it must be impossible to mistake a low-visibility read for a violation, even for a user with color vision deficiency looking only at shape.

---

## 10. Camera UI

`CameraViewer`: live/recorded video, Camera ID + Zone (header overlay), connection status badge, AI detection overlay (bounding boxes: worker=blue outline, PPE-fail item=red outline, fire/smoke=orange/red region highlight), worker tracking IDs, PPE state chips per detected worker.

**Camera offline:** video area replaced by last-known frame (dimmed) with a centered `WifiOff` icon, "OFFLINE — last seen [timestamp]" label, and the detection overlay suppressed entirely (never show stale bounding boxes as if live).

---

## 11. Priority Visual Language

| Priority | Badge | Card treatment | P3-specific |
|---|---|---|---|
| P0 | Small quiet badge, no border accent | None | — |
| P1 | Visible badge, amber left-border on card | Dashboard notification only | — |
| P2 | Prominent badge, orange left-border, zone highlighted facility-wide | Dashboard warning + mobile push | — |
| P3 | Strong badge, red border, persistent alarm bar | Dashboard alarm + mobile push + backend-commanded siren (depends on ESP32 connectivity — no fallback if unavailable) | **Full-screen takeover on new arrival** |

**P3 takeover state:** on a genuinely new P3 event, the UI interrupts with a full-screen alert: priority, event, zone/camera, evidence snapshot, confidence, required action, and an explicit **Acknowledge** action that dismisses back to the normal dashboard (the incident itself stays OPEN in the lifecycle — acknowledging the takeover is not the same as resolving the incident, Section 15 of `03_APP_FLOW.md`). No flashing; a single steady red state with a subtle (non-looping-forever) entrance animation is the ceiling for motion here (Section 23).

---

## 12. Network Status

Header badge, always visible, showing the **ESP32's** connectivity state (cameras are tracked separately per-camera, not in this badge): **LAN** (green, Wifi icon) / **CELLULAR** (amber, Signal icon) / **OFFLINE** (red, WifiOff icon). A LAN→Cellular transition animates the badge swap (Section 23) so the change itself is noticed, not just the end state. OFFLINE additionally surfaces a persistent banner across the top of the dashboard reading, explicitly, that **emergency response is currently unavailable** — not a generic "connectivity degraded" message, since the ESP32 has no local fallback (`02_TRD.md` §12).

---

## 13. System Health

`SystemHealthCard` grid, one entry per: Cloud vision inference service, ESP32, Zone Node 1, Zone Node 2 (extends per configured node count), Cameras (per camera, stream connectivity), Flame sensors (per node), Gas/smoke sensors (per node), ESP32 LAN, ESP32 Cellular, Backend, ESP32 Heartbeat.

Each entry: status dot (Online/Offline/Degraded/Unknown, Section 3.2 colors) + icon + label + last-updated timestamp (mono). Degraded rows (e.g. a Modbus node with a stuck heartbeat, per `02_TRD.md` §11) show a one-line reason, not just the badge.

---

## 14. Alert / Notification Design

Every notification (dashboard toast, drawer, or mobile push) uses the same structure:

```text
[Priority badge]  EVENT
LOCATION · TIME (mono)
CONFIDENCE (mono)
[Evidence thumbnail]
REQUIRED ACTION
```

| Priority | Delivery |
|---|---|
| P1 | Dashboard notification (toast + Incident Center entry) |
| P2 | Dashboard warning (toast, persists until dismissed) + mobile push |
| P3 | Full-screen dashboard takeover + high-priority mobile push + backend-commanded siren (depends on ESP32 connectivity) |

---

## 15. Evidence Presentation

Evidence is shown **inline on open**, never behind a secondary click. Incident Detail's first fold shows: evidence snapshot (large), then immediately below it: detection metadata, AI evidence, sensor evidence, timestamp, camera, zone, confidence. `EvidenceViewer` supports a lightbox expand for the image itself but the surrounding metadata is always visible without expanding anything.

---

## 16. Tables

Shared `EventTable` component used for Incidents, Event History, Sensor Nodes, Cameras, and System Health, with consistent conventions:

- Priority/status column always leftmost, as a badge (color + icon + label).
- Timestamps in monospace, sortable, newest-first default.
- Sortable columns show a visible sort indicator; default sort is priority-desc for incident-bearing tables, most-recent-first elsewhere.
- Row hover reveals a "view detail" affordance; row click opens the detail drawer/page.
- Dense row height (32–36px) to serve information-density without a horizontal scroll on desktop.

---

## 17. Modals / Drawers

| Pattern | Used for |
|---|---|
| **Modal** | Confirmations, destructive actions, configuration saves ("this changes live zone policy") |
| **Drawer** (right-side, Radix Dialog variant) | Incident Detail, Worker Detail, contextual info reached from a table row |
| **Full page** | Camera monitoring, System Configuration, Event History / historical analytics |

Never stack more than one modal; a drawer may open a confirmation modal on top of it, but a modal never opens another modal. The P3 takeover (Section 11) is its own top-level state, not a modal — it suppresses the rest of the UI rather than layering over it.

---

## 18. Loading States

Skeleton components (not spinners) for Dashboard KPI cards, Zone cards, Incident list rows, Camera viewer (placeholder frame + spinner until first frame), Event detail drawer, System Health rows. Skeletons match the real component's shape/size to avoid layout shift on resolve.

---

## 19. Empty States

Each includes: an icon, a one-line explanation, and — where applicable — a next action.

| State | Message pattern | Action |
|---|---|---|
| No incidents | "No active incidents" | — |
| No zones | "No zones configured yet" | "Add a zone" → Zone Configuration |
| No cameras | "No cameras configured yet" | "Add a camera" → Camera Configuration |
| No sensor data | "Awaiting first sensor reading" | — |
| No workers | "No workers currently tracked in this zone" | — |
| No event history | "No events recorded yet" | — |
| No evidence image | "No image captured for this event" | — |
| No active alerts | Header incident badge shows 0, no bell highlight | — |

---

## 20. Error States

| State | Treatment |
|---|---|
| Camera offline (stream interrupted) | Section 10 |
| Cloud vision inference service offline | Inline banner on affected zone/camera views: "AI inference unavailable" |
| ESP32 offline | System Health critical row + dashboard-wide banner stating plainly that **emergency response (relay/siren) is currently unavailable** — no reassurance language, since no local fallback exists |
| Modbus node offline | Sensor/System Health row: Offline, last-known values marked stale |
| Sensor error (FAULT) | Distinct badge from Offline — same row, different status color/icon |
| Backend offline | Top-of-dashboard banner; ESP32-side sensor readings queue locally until a path is available; camera streams simply fail to be received |
| ESP32 LAN unavailable | Network badge → Cellular or degraded (Section 12) |
| ESP32 cellular unavailable | Network badge → OFFLINE |
| Total ESP32 connectivity loss | Persistent red banner, explicit "emergency response unavailable" wording, not just a badge |
| Evidence unavailable | `EvidenceViewer` shows "Evidence unavailable" placeholder, distinct copy from "no image captured" |
| Notification failure (FCM) | Silent to the dashboard — no user-facing error for this alone (dashboard alarm still fires) |

---

## 21. Responsive Design

| Breakpoint | Behavior |
|---|---|
| Desktop | Full density: sidebar + main canvas + contextual panel simultaneously |
| Tablet | Two-column adaptive; contextual panel becomes a full-width drawer |
| Mobile | Single column, priority-ordered (Section 5); P3 takeover behaves identically to desktop |

---

## 22. Accessibility

- WCAG AA contrast minimum for all text and status colors, in both themes (Section 3).
- Full keyboard navigation; Radix primitives (Section "Component foundation") provide this for interactive components by default.
- Visible focus states on every interactive element (2px offset ring, uses the Information-blue token so it never collides with status colors).
- Every status is icon + label + text, never color alone (enforced throughout Sections 3, 9, 11, 13).
- Minimum 12px body text (Section 4), no text below that size anywhere in the interface.
- Semantic HTML/ARIA status labels (`role="status"` / `aria-live="polite"` for toasts, `aria-live="assertive"` for the P3 takeover).
- Tables use proper header semantics and are screen-reader navigable by row/column.
- The P3 takeover traps focus (Radix Dialog behavior) and is announced immediately via `aria-live="assertive"`.

---

## 23. Animation

Animation is used only to communicate a state change, never as decoration:

| Trigger | Animation |
|---|---|
| New incident arrives in a list | Brief highlight-fade on the new row (draws the eye once, does not loop) |
| Status transition (Online→Offline, etc.) | Badge cross-fade, ~150ms |
| ESP32 network mode transition (LAN→Cellular) | Badge swap with a brief transitional state shown, not instant (Section 12) |
| New P3 arrival | Full-screen takeover entrance (single steady transition in, no flashing, no looping motion) |

**Explicitly avoided:** continuous pulsing/flashing on any status (including P3 — "prominent, not chaotic" per the brief), decorative micro-interactions, and any animation on data that hasn't changed.

---

## 24. Design Tokens

| Category | Values |
|---|---|
| Colors | Section 3 (priority, status, PPE, base/surface — dark + light) |
| Typography | Section 4 |
| Spacing scale | 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64 (px) |
| Border radius | `sm` 4px (badges, inputs) · `md` 8px (cards) · `lg` 12px (modals, drawers) · `full` (pills, avatars) |
| Shadows | Dark theme: border-driven elevation (shadows are barely visible on dark backgrounds, so a lighter `bg-surface-raised` token does the work instead). Light theme: `sm`/`md`/`lg` soft shadow scale for card elevation. |
| Icon sizing | 16px (inline/badge) · 20px (default UI) · 24px (card headers/nav) · 32px (empty states, P3 takeover) |
| Component states | default / hover / active / focus-visible / disabled / loading — specified per component in Section 25 |

---

## 25. Component Inventory

| Component | Purpose |
|---|---|
| `Sidebar` | Desktop nav; collapses to icon rail (tablet) / hamburger (mobile) |
| `Header` | Network status, system health badge, incident bell, user menu |
| `FacilityStatusCard` | Dashboard KPI cards (cameras, zones, network mode, health, incidents) |
| `ZoneCard` | Zone Overview grid item; hazard-priority-colored border |
| `IncidentCard` | Compact incident summary (used in lists and the Dashboard's latest-incidents panel) |
| `PriorityBadge` | P0–P3 badge — color + icon + label, reused everywhere a priority appears |
| `NetworkStatus` | ESP32 LAN/Cellular/OFFLINE header badge + banner variant |
| `SystemHealthCard` | Single subsystem's Online/Offline/Degraded/Unknown status row |
| `CameraCard` | Camera list item (thumbnail, ID, zone, status) |
| `CameraViewer` | Full live/recorded video + AI overlay (Section 10) |
| `PPEStatus` | Per-item PASS/FAIL/UNKNOWN chip (Section 9) |
| `WorkerCard` | Worker ID + full PPE status set |
| `SensorStatus` | Flame/gas-smoke sensor reading + derived state |
| `ModbusNodeStatus` | Node health, last poll, heartbeat state (`02_TRD.md` §11) |
| `EvidenceViewer` | Snapshot + lightbox expand (Section 15) |
| `IncidentDetail` | Drawer/page combining evidence, metadata, required action, ack/resolve actions |
| `EventTable` | Shared dense table (Section 16) |
| `EmptyState` | Icon + message + optional action (Section 19) |
| `ErrorState` | Icon + message, used inline per Section 20 |
| `LoadingSkeleton` | Shape-matched skeleton per component |
| `ConfirmationModal` | Destructive/configuration-change confirmation (Section 17) |
| `P3Takeover` | Full-screen alarm state (Section 11) — not reused elsewhere, deliberately singular |

---

## 26. Design Consistency

Every page draws from the same token set (Section 24), the same `PriorityBadge`/status-color vocabulary (Section 3), the same icon set (Lucide), the same navigation shell (Section 5), and the same component behaviors (Section 25) — no page invents its own priority colors, its own status iconography, or its own table styling. Any new screen added later reuses these primitives rather than introducing new visual language.
