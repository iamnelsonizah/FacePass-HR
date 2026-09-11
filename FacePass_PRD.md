# FacePass — Product Requirements Document

**Contactless Facial Attendance & Intelligent Geo-Fenced Timeclock**

Version: 0.1 (Draft)
Owner: Nelson Izah
Status: Concept → MVP scoping

---

## 1. Problem Statement

Fingerprint scanners are unhygienic, fail in dusty/wet field environments (construction, agro-processing, mining, oil & gas field offices), and are trivially defeated by buddy punching. GPS-only apps can be spoofed with mock-location tools. Existing facial attendance products (basic OpenCV + Postgres builds) stop at "detect a face, log a timestamp" — they have no fraud intelligence, no offline resilience, and no defensible anti-spoofing.

FacePass aims to be the attendance layer that field-heavy African businesses (construction, agritech logistics, retail chains, security firms) can trust: it should be **hard to spoof, hard to fake location for, usable with bad connectivity, and smart enough to flag suspicious patterns on its own** — while remaining a lightweight PWA that runs on any Android phone, not a $300 biometric terminal.

## 2. Goals

1. Eliminate buddy punching and location spoofing as viable fraud vectors.
2. Work reliably on low/mid-range Android devices and unstable connectivity (a core African-market constraint).
3. Give admins fraud signals and analytics, not just a raw log table.
4. Be deployable as a true multi-tenant SaaS from day one (multiple companies, multiple sites each).
5. Be defensibly "smart" — differentiated from template DeepFace/FastAPI tutorials by an actual fraud-scoring and adaptive-recognition layer.

## 3. Non-Goals (v1)

- Native iOS/Android app store apps (PWA-first; native wrapper is a later phase).
- Full HR/payroll suite (FacePass integrates *with* payroll, it doesn't replace it).
- Dedicated hardware terminals (kiosk mode on existing Android tablets only).

## 4. Target Users

| Role | Needs |
|---|---|
| **Field Employee** | Fast check-in (<10s), works with poor network, no manual PIN typing if avoidable |
| **Site Supervisor** | Real-time view of who's on-site, instant fraud alerts, manual override capability |
| **HR/Payroll Admin** | Exportable, auditable attendance records tied to hours/pay |
| **Company Owner (multi-site)** | Cross-site dashboard, cost-per-site labor visibility |

## 5. Core User Flows (from the base architecture)

1. **Enrollment** — Employee/admin captures 3–5 reference frames under varied angles/lighting → embeddings generated → stored.
2. **Check-in/Check-out** — Open PWA → liveness challenge → geofence validated → face matched → attendance logged.
3. **Admin Review** — Dashboard shows live check-ins on a map, flags anomalies, allows manual approval/rejection.

---

## 6. What Makes FacePass "Advanced" — Feature Set

Grouped by the layer of the system they strengthen. Each is scoped MVP / v2 / v3 so this stays buildable rather than a wish list.

### 6.1 Anti-Spoofing & Liveness (the trust layer)

- **MVP:** Client-side blink + head-turn challenge (as in the base design), randomized per session so a recorded video loop can't be replayed.
- **v2 — Passive liveness / presentation-attack detection (PAD):** Run a lightweight passive anti-spoof model (e.g., MiniFASNet / Silent-Face-Anti-Spoofing) alongside the challenge-response check. This catches printed photos and screen replays even if a bot fakes the blink signal, and removes reliance on the user cooperating with a challenge.
- **v2 — Texture & moiré detection:** Detect the fine screen-refresh/moiré patterns that appear when a phone camera captures another phone/tablet screen — a classic spoof vector challenge-response alone misses.
- **v3 — Depth-from-motion liveness:** Use the natural micro-parallax as the phone is held (accelerometer + multi-frame face landmark shift) to estimate coarse 3D structure — distinguishes a flat photo from a real face without needing a depth camera.
- **v3 — Mask/PPE compliance detection:** On construction/industrial sites, detect hard-hat or safety-mask presence at check-in and flag non-compliance to the safety officer — a genuinely differentiated, industry-specific feature.

### 6.2 Recognition Robustness (the accuracy layer)

- **MVP:** ArcFace/FaceNet 512D embeddings, cosine similarity threshold.
- **v2 — Multi-template enrollment ensemble:** Store 3–5 embeddings per employee captured across lighting/angle/expression, match against the *best* of the set (or a centroid), instead of one brittle reference vector — big accuracy win in outdoor/variable light.
- **v2 — Continuous re-enrollment / drift adaptation:** When a check-in matches with very high confidence (e.g. >0.85), optionally fold that new embedding into the employee's template set (with decay for old ones) so gradual appearance changes (haircuts, weight change, aging, new beard) don't silently degrade accuracy over months.
- **v2 — Lighting normalization pipeline:** CLAHE / histogram equalization pre-processing step before embedding extraction, since outdoor African field sites have extreme lighting variance (harsh sun vs. shaded tents).
- **v3 — Twin/lookalike disambiguation:** Optional secondary verification (voice phrase or PIN) automatically triggered only when the top-2 cosine matches are suspiciously close — avoids forcing this friction on every user, only the rare ambiguous case.

### 6.3 Geofencing Intelligence (the location layer)

- **MVP:** Haversine circular geofence around one site coordinate.
- **v2 — Polygon geofences:** Real construction/farm sites aren't circles; support arbitrary GeoJSON polygon boundaries per site (draw-on-map in admin dashboard).
- **v2 — Multi-zone sites:** A single "site" can have sub-zones (warehouse, gate, field block) so attendance can be tied to a specific work zone, not just the general premises.
- **v2 — Wi-Fi BSSID / Bluetooth beacon fallback:** For indoor sites where GPS accuracy is poor, allow check-in validation against a known site Wi-Fi network or a cheap BLE beacon as a secondary/fallback location signal.
- **v3 — Impossible-travel detection:** Flag (don't just log) a check-in at Site B that is geographically impossible to reach from the employee's last check-out at Site A within the elapsed time — a strong buddy-punching/GPS-spoofing signal that pure geofencing can't catch.
- **v3 — Mock-location / GPS-spoofing detection:** Cross-check `navigator.geolocation` accuracy metadata, IP-based geolocation, and (on native wrapper) Android's `isFromMockProvider` flag; flag mismatches for review instead of hard-blocking, since legitimate GPS drift is common in the field.

### 6.4 Fraud Intelligence (the differentiator layer — this is the "smart" part)

This is the layer that separates FacePass from every tutorial-grade version of this project.

- **Composite Trust Score per check-in**, combining: face match confidence, liveness/PAD score, geofence distance margin, device fingerprint consistency, and time-of-day pattern deviation — collapsed into a single 0–100 score shown to supervisors instead of five raw numbers.
- **Device fingerprinting:** Bind each employee's expected check-in device(s) (browser fingerprint / hashed device ID); flag check-ins from a brand-new, never-seen device as elevated risk (possible account sharing).
- **Behavioral anomaly detection:** A simple unsupervised model (e.g., Isolation Forest) trained per-employee on historical check-in time, location variance, and device — flags statistical outliers ("this employee has never checked in at 4am from this location") for supervisor review, without needing hand-written rules.
- **Cluster/collusion detection:** Flag when multiple employees repeatedly check in within seconds of each other from the exact same GPS coordinate and device — a pattern consistent with one phone being passed around.
- **Supervisor override with audit trail:** Every manual approval/rejection of a flagged check-in is logged with supervisor ID and reason — protects the business in labor disputes.

### 6.5 Offline & Low-Connectivity Resilience (an African-market-specific must-have)

- **v2 — Offline-first PWA:** Cache the enrolled-employee embedding set locally (encrypted) on kiosk/tablet devices at the site; face match and liveness run entirely on-device when offline, queue the record, and sync to the backend once connectivity returns.
- **v2 — Conflict-safe sync:** Idempotent check-in records (client-generated UUID + timestamp) so retried/duplicated syncs never double-log attendance.
- **v3 — SMS/USSD fallback check-in:** For sites with zero data connectivity, a PIN + SMS-based fallback path that logs a lower-trust-tier attendance record, clearly flagged as non-biometric in reporting.

### 6.6 Admin & Analytics Layer

- **MVP:** Simple logs table (as in base design).
- **v2 — Live ops dashboard:** Real-time map showing all currently-checked-in employees per site, with trust-score color coding.
- **v2 — Attendance analytics:** Lateness trends, absenteeism heatmaps, per-site labor-hours cost rollups.
- **v2 — Shift & roster awareness:** Attendance validated against an assigned shift schedule (flag early/late/no-show automatically rather than just logging a raw timestamp).
- **v3 — Payroll export API:** Clean CSV/webhook export mapped to hours worked, ready to feed into payroll systems (relevant to your existing Agrochain/Finara payment infrastructure work).
- **v3 — White-label multi-tenant admin:** Company-branded portals for FacePass sold as SaaS to multiple client businesses.

### 6.7 Privacy, Consent & Compliance

Biometric data is legally sensitive (Nigeria's NDPR, and GDPR-equivalent regimes elsewhere) — this needs to be designed in, not bolted on:

- Explicit, logged employee consent capture at enrollment (required before any embedding is stored).
- Store only embeddings, never raw enrollment images, after processing (embeddings are not reversible to a photo).
- Encrypt embeddings at rest; consider cancelable/revocable biometric templates (a transform applied to the embedding that can be re-issued if "compromised," rather than a raw immutable vector).
- Right-to-erasure workflow: an admin action that fully purges an employee's biometric templates on request/offboarding.
- Configurable data-retention policy per company tenant.

### 6.8 Accessibility & Fallbacks

- PIN-based fallback check-in for employees who opt out of or fail facial recognition (injury, camera issue), logged at a lower trust tier.
- Multi-language UI (English, Hausa, Yoruba, Igbo, French for wider West African reach).
- Voice-guided prompts for low-literacy users.

---

## 7. Proposed Technical Architecture

```
[ Client — PWA, installable, offline-capable ]
   ├─ MediaPipe Face Mesh (liveness challenge)
   ├─ Passive PAD model (ONNX.js, e.g. MiniFASNet) — v2
   ├─ IndexedDB cache of embeddings for offline kiosk mode — v2
   ├─ navigator.geolocation + Wi-Fi/BLE fallback signal
   └─ Device fingerprint hash

        │ POST /api/check-in (JPEG + geo + device signals)
        ▼
[ FastAPI Backend ]
   ├─ Geofence validator (polygon-aware, Haversine + point-in-polygon)
   ├─ ArcFace/InsightFace embedding extraction
   ├─ Cosine similarity match (multi-template ensemble)
   ├─ Fraud scoring engine (trust score composite)
   ├─ Anomaly detection service (Isolation Forest, per-employee)
   └─ Sync/idempotency handler for offline queue

        ▼
[ Database: Postgres + pgvector ]
   ├─ employees, sites (polygons), embeddings (versioned)
   ├─ attendance_logs (immutable, hash-chained for audit integrity)
   └─ device_fingerprints, anomaly_flags, consent_records

[ Admin Dashboard — Next.js ]
   ├─ Live map (site occupancy, trust-score overlay)
   ├─ Analytics (lateness, absenteeism, labor cost)
   └─ Review queue for flagged check-ins
```

**Suggested stack:** FastAPI + Postgres/pgvector backend (matches base design), Next.js admin dashboard, PWA frontend with service workers for offline support, ONNX Runtime Web for any client-side ML beyond MediaPipe, Redis for short-lived session/challenge state.

---

## 8. Success Metrics

- False acceptance rate (unauthorized match) < 0.1%
- False rejection rate (legitimate employee rejected) < 3%
- Check-in completion time < 8 seconds on a mid-range Android device
- % of check-ins completed offline and successfully synced
- Fraud flags reviewed and resolved within 24 hours
- Admin-reported reduction in payroll disputes after rollout

## 9. Rollout Plan

| Phase | Scope |
|---|---|
| **MVP** | Enrollment, liveness (challenge-response), circular geofence, ArcFace matching, basic logs table, single-tenant |
| **v2** | Multi-template matching, polygon geofences, offline-first PWA, live dashboard, passive PAD, device fingerprinting, basic anomaly flags |
| **v3** | Full fraud-scoring engine, collusion detection, payroll export API, multi-tenant white-label, PPE detection, SMS fallback |

## 10. Key Risks

- **On-device ML performance** on low-end Android hardware — passive PAD and depth-from-motion must be benchmarked early on real target devices, not just flagship phones.
- **Biometric regulation** — NDPR compliance work needed before commercial launch in Nigeria; legal review of consent flow required.
- **Network assumptions** — offline-first architecture adds real engineering complexity; should not be deferred to "later" if field sites are the primary market, since it's core to the value proposition, not a nice-to-have.
- **Threshold tuning** — cosine similarity threshold (0.60–0.65 in the base design) needs a proper validation dataset per deployment; a fixed global threshold will misbehave across different camera qualities.

---

*This document is a living draft — feature scope in sections 6.1–6.8 should be re-prioritized against actual pilot-site feedback before locking the v2/v3 roadmap.*
