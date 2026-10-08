# Grill: PS6 PRD (Document 01) scope and boundaries
Date: 2026-09-28

## Intent
Produce an implementation-ready PRD (Document 01 of a numbered doc series) for the PS6 multimodal industrial safety system, readable without guessing by a coding agent, HW/FW dev, ML engineer, backend dev, and frontend dev -- describing WHAT and WHY, not HOW.

## Constraints
- Source of truth is `implmentation_docs/master_approach.md` (frozen architecture) and `PS6_Complete_BOM.md` (hardware baseline) -- must not invent a different architecture, drop hardware, or simplify away requirements.
- PRD must not contain implementation code; that belongs in the future TRD (Document 02).

## Key decisions
- Decision: Prototype scope described as zone-count-agnostic ("N zones, data-driven, independently configurable") everywhere in the PRD, including acceptance criteria. Reason: master_approach explicitly requires the architecture stay zone-count-agnostic even though the BOM happens to specify 2 for the hackathon build. Alternative considered: hard-pinning "2 zones/2 cameras" throughout PRD to mirror the BOM 1:1 -- rejected to avoid conflating a deployment/BOM detail with a product requirement.
- Decision: No numeric zone-count floor anywhere in acceptance criteria (Section 19) or demo scenarios. Reason: keeps PRD purely architectural; acceptance is verified by feature/behavior presence (e.g., "zone-specific PPE policy switching works," "P0-P3 events are produced correctly") rather than a scale number. Alternative considered: a "minimum 2 concurrent zones" testability floor -- rejected as an unnecessary scale commitment that belongs in the BOM/TRD, not the PRD.
- Decision: PRD file location is `implmentation_docs/01_PRD.md`, alongside `master_approach.md`, using the "01" prefix to leave room for `02_TRD.md` etc. Alternative considered: placing it at repo root next to `PS6_Complete_BOM.md` -- rejected since the implementation_docs folder is where the numbered document series belongs.
- Decision: PRD stays at prose/bullet abstraction level for all schemas -- no literal JSON event payloads, no Modbus register numbers (40001-40005 etc). Those are named explicitly as TRD-owned content. Reason: the brief's own Section 14/16 phrasing already abstracts fields into "must contain" lists rather than JSON blocks, and the task explicitly says implementation detail belongs in the TRD. Alternative considered: inlining the literal JSON examples from master_approach.md verbatim for completeness -- rejected to keep PRD a pure WHAT/WHY document.
- Decision: Tone is flat, factual engineering register throughout, including the "value proposition" and "differentiation from a simple CCTV detector" sections -- no pitch/marketing language. Reason: the stated audience is implementers (coding agent, HW/FW/ML/backend/frontend devs), not hackathon evaluators, and the rest of the document is a spec, not a pitch deck.

## Surfaced assumptions
- The user is treating this PRD as the first of a multi-document series (PRD -> TRD -> possibly others), even though only the PRD was requested now.
- "Nice to have / future extensions" (Section 5B) will use only the examples already implied by the brief (more zones, more cameras, more PPE categories, production-grade sensors, more analytics, expanded reporting) plus low-risk, non-conflicting additions (e.g., multi-site support, dashboard RBAC) -- not asked explicitly, treated as low-stakes authorial discretion.
- Example identifiers in the PRD (host/zone/camera IDs) will reuse master_approach.md's own illustrative vocabulary (e.g., WELDING_ZONE, ASSEMBLY_ZONE) for consistency, without implying a fixed zone count.

## Out of scope
- No numeric accuracy/latency targets invented beyond what master_approach.md specifies (none given -- metrics are named as categories to measure, not thresholds).
- No schedule, budget, or team-staffing content -- not requested and not part of a PRD's WHAT/WHY scope.
- No literal JSON schemas or Modbus register tables -- deferred entirely to the TRD (Document 02).
