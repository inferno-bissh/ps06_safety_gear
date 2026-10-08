# Grill: PS6 TRD (Document 02) technical decisions
Date: 2026-09-28

## Intent
Produce an implementation-ready TRD (Document 02) that removes technical ambiguity left open by master_approach.md, so a coding agent and engineering team know exactly what technologies, protocols, and interfaces to use -- without silently replacing the frozen architecture.

## Constraints
- Source of truth is `implmentation_docs/master_approach.md` (frozen architecture) and `PS6_Complete_BOM.md` (hardware baseline).
- Register numbers, priority levels, and multimodal decision examples in master_approach.md are frozen and must not be reinterpreted.
- Where master_approach.md explicitly hedges ("possible stack," "HTTP/MQTT as required," "Arduino framework or ESP-IDF"), the TRD must pick one and label it as a TRD implementation decision rather than pretending the source mandated it.

## Key decisions
- Decision: ESP32 uses a defense-in-depth model -- normal operation follows Jetson-commanded priority, but the ESP32 also runs its own sensor-only threshold rule as a watchdog fallback if it stops hearing from the decision engine. Reason: master_approach lists "local failsafe behavior" as a responsibility distinct from "local event state," and never states whether the final-local-path condition ("LAN unavailable + 4G unavailable") also covers the Jetson/decision-engine itself being unreachable or crashed -- a pure command-follower ESP32 would go silent in that case, defeating the stated purpose of local safety action not depending on connectivity. Alternative considered: command-follower-only ESP32 (no independent logic) -- rejected as leaving a real single point of failure (Jetson crash silences the siren) unaddressed.
- Decision: The ESP32's watchdog against the Jetson is a separate, tighter local-link liveness check, distinct from the Section 15 dead-man's-switch (which stays scoped to Backend<->Host WAN monitoring). Reason: the local Jetson<->ESP32 link and the facility WAN<->cloud link have very different reliability characteristics and should not share one timeout. Alternative considered: reusing the same 5s/15s heartbeat for both -- rejected as coupling two links that fail independently and for different reasons.
- Decision: when the ESP32 fires via its own fallback rule rather than a Jetson-commanded priority, it is logged as a distinct event type (LOCAL_FAILSAFE_TRIGGER) once connectivity allows reporting, not folded into an ordinary P3. Reason: the fallback rule is exactly the naive "sensor alone = confirmed hazard" logic Section 9 explicitly forbids for normal operation -- acceptable only as a last resort with no vision evidence reachable, and that distinction must survive into the audit trail. Decided by the author (recommended option) after the user chose to stop mid-grill and move to drafting; not independently re-confirmed by the user.
- Decision: Jetson<->ESP32 local transport is MQTT over the facility LAN (local broker), not HTTP polling or raw serial. Reason: master_approach leaves this as "HTTP/MQTT as required" (Section 28); MQTT's built-in keep-alive/Last Will and Testament maps directly onto the watchdog-liveness requirement above, and pub/sub fits the two-way command/telemetry pattern (ESP32 publishes sensor + heartbeat, decision engine publishes relay/siren commands) better than request/response polling. Labeled in the TRD as a TRD implementation decision, not a master_approach mandate.
- Decision: Backend/store is Firebase/Firestore + Cloud Functions + FCM (matching master_approach Section 28's "possible prototype stack"), with realtime dashboard updates via Firestore listeners. Reason: FCM is used unhedged in master_approach's own architecture diagram (not just the hedged "possible stack" section), so pairing it with Firestore avoids introducing a second vendor's push infrastructure; picking the suggested stack outright is the lowest-friction choice for a hackathon timeline. Labeled explicitly in the TRD as a TRD implementation decision (master_approach did not mandate a vendor), with a Postgres+Node alternative named as a valid substitute that would not violate the frozen architecture.
- Decision: ESP32 firmware uses the Arduino framework, not ESP-IDF. Reason: master_approach explicitly leaves this as an open "or" (Section 28); Arduino framework has faster iteration and wider ready-made library support (Modbus master, MQTT, WiFi) for a hackathon timeline, even with the added watchdog/threshold logic. ESP-IDF is named as a valid future/production alternative if more low-level control is later needed.

## Surfaced assumptions
- The "Local Safety / Contextual Decision Engine" runs as a software service co-located on the Jetson (the BOM provisions only one edge AI computer, no separate facility server), not as a separate physical machine.
- Under normal operation, the ESP32 polls its own local RS-485/Modbus bus (it owns the RS-485 transceiver per the BOM) and forwards sensor telemetry to the Jetson's decision engine, which merges it with vision events and zone policy, computes P0-P3, and sends the resulting command back to the ESP32 for relay/siren actuation -- a round trip, not a one-way sensor feed.

## Open questions
- Exact watchdog timeout values (local Jetson<->ESP32 link) and the ESP32's own sensor-critical threshold/consecutive-poll count are marked TBD-after-testing in the TRD, per the same principle master_approach applies to escalation thresholds.
- The grilling session was cut short by the user before covering environment-variable naming, repo structure conventions, and a few other lower-stakes items; those are resolved directly in the TRD using the decisions above rather than through further questions.

## Out of scope
- No application code written -- TRD is specification only.
- No change to the frozen register numbers, priority levels, or multimodal decision table from master_approach.md.
