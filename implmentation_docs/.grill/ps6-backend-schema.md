# Grill: PS6 Backend Schema (Document 05) datastore confirmation
Date: 2026-09-28

## Intent
Produce a Backend Schema / Data Model & Auth Architecture document (Document 05) precise enough for a coding agent to build migrations/collections and APIs without guessing -- while resolving a real tension between the brief's relational vocabulary (PK/FK/migrations/indexes) and the already-chosen Firestore (NoSQL/document) backend from 02_TRD.md.

## Constraints
- Source of truth remains master_approach.md plus decisions frozen in 01_PRD.md, 02_TRD.md (Firebase/Firestore/FCM backend), 03_APP_FLOW.md (real Firebase Auth login, identity-only/no role gating, incident OPEN/ACKNOWLEDGED/RESOLVED lifecycle), 04_UI_UX_DESIGN_BRIEF.md.
- master_approach.md itself lists "Firebase/Firestore or Realtime Database" as alternatives -- both needed to be explicitly disambiguated, not assumed.

## Key decisions
- Decision: Stay with Firestore (not revise to Postgres, not switch to Firebase Realtime Database). Reason: user's explicit choice on both forks offered. This document translates the brief's relational vocabulary (tables/PK/FK/migrations/indexes) into Firestore-idiomatic equivalents (collections/document IDs/reference fields/composite indexes/schema-version-field convention) rather than silently reinterpreting the brief or quietly contradicting 02_TRD.md and 03_APP_FLOW.md (which already assumes Firestore onSnapshot listeners for the dashboard).
- Decision: Data hierarchy nests zones, cameras, and sensor nodes under `facilities/{facility_id}` as subcollections (not flat top-level collections with only a facility_id field), using Firestore collection-group queries where a cross-facility/global lookup is needed. Reason: matches Section 27's "do not hard-code Zone 1/Zone 2" and Section 2's "support future multiple facilities without requiring a redesign" requirements naturally -- the hierarchy itself enforces facility-scoping rather than relying on every query remembering a facility_id filter. Decided by the author as ordinary schema design judgment, not raised as a separate grill question.
- Decision: High-volume event streams (AI events, PPE events, hazard events, decisions) are flat collections under `facilities/{facility_id}/...` rather than nested further under zone/camera, to keep time-range and cross-zone queries simple via composite indexes instead of collection-group queries on every read. Decided by the author, not raised as a separate question.
- Decision: Most dashboard reads are direct Firestore client-SDK queries/listeners governed by Security Rules, not a custom REST API layer -- only edge-device ingestion (from the Jetson decision engine) and a small set of validated mutations (acknowledge/resolve incident, config changes) go through Cloud Functions. Reason: reinventing a REST API over data Firestore already serves natively would be redundant; this was decided by the author as a natural consequence of the confirmed Firestore choice, not asked separately, but flagged prominently in the document since the brief's Section 23 phrasing ("API endpoints ... method, route ...") reads as if every capability needs a REST endpoint.

## Surfaced assumptions
- "Migrations" in the relational sense do not exist for Firestore (schemaless); schema evolution is instead handled via a `schema_version` field on each document type plus Cloud Functions-driven backfill scripts, documented as the direct translation of the brief's migration requirement.
- Audit logging (Section 24) is implemented via Firestore `onWrite` triggers on configuration collections rather than requiring every client call path to remember to log -- this also directly fulfills the reasoning already recorded in 03_APP_FLOW.md's grill log for why login exists at all ("identity, e.g., for audit/attribution").
- facility_access/zone_access fields exist on the user document for future use but are not enforced in this build, consistent with 03_APP_FLOW.md's identity-only/no-role-gating decision -- not re-asked here.

## Out of scope
- No actual migration/schema code written -- field definitions and index specifications only, per the brief's own instruction.
- No reopening of the Firebase Auth decision (03_APP_FLOW.md) or the no-role-gating decision -- both carried forward unchanged.
