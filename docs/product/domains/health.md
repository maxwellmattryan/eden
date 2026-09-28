---
title: Wellspring
status: stub
summary: Stub for the health domain: medical notes, medications as routines, appointments as Events, doctors and pharmacies, insurance in the Vault, drug allergies and medical dietary restrictions as facts. Takes over body metrics from Vigor. Specced after Phase 2. Id `health`.
read-this-if: You need Wellspring's intended scope, or you are deciding whether something health-related belongs here or in Vigor.
depends-on: [substrate/privacy, substrate/registry, domains/fitness, domains/_template]
updated: 2026-09-27
---

## Purpose

Wellspring will hold the medical side of the body: conditions and notes, medications and supplements as routines, appointments, the people and places of care, insurance, and the facts other domains must respect. It will become Vigor's parent and take ownership of body metrics and supplements in the registry (D-5).

## Scope sketch

- Notes and conditions, with a timeline.
- Medications as routine tasks with a stricter nudge; supplements move here from Vigor.
- Appointments as Events of kind `medical-appointment` (T2), linked to a doctor and a place.
- Doctors, pharmacies and clinics as Places with profiles.
- Insurance cards and records in the Vault (T3), with typed T2 facts for the bits Eden needs (plan name, renewal date).
- Facts: `medical-dietary-restriction` (assertable by the owner today, `substrate/profile.md`), drug allergies through the shared `allergy` fact with kind `drug`.
- Wearables later: Oura, Apple Watch through HealthKit, read-only.
- The Gardener: summarise a timeline, prepare questions for an appointment, all `read`, off by default until granted, and never diagnostic.

## Why deferred

The most sensitive domain; it needs the grants ledger UI, the Vault v0, per-open Vault audit and end-to-end sync before it holds anything (D-4). Its two facts that other domains need already exist in the registry so nothing waits on it.

## Entities and facts, best guess

Entities: `condition` (T2), `medication` (T2), `appointment-note` (T2), `provider` (T1: doctor, pharmacy, clinic), `insurance-plan` (T2, documents T3). Kind: `medical-appointment` (event, T2), `insurance-card` (attachment, T3). Facts: `medical-dietary-restriction` (T2), `allergy` with kind `drug` (T2), `blood-type` (T2).

## Sensitivity notes

T2 by default, T3 for documents and identifiers. Notifications for medications hide content on the lock screen. AI reads `never` by default; grants are per resource and per request unless the owner sets standing ones.

## Integration candidates

HealthKit and Health Connect, Oura, pharmacy refill reminders by hand, no portal scraping.

## Substrate dependencies

Vault v0 with per-open audit, grants ledger UI, end-to-end sync, Tasks routines with an urgent nudge, Almanac for appointments, the registry owner move for `body-metric`, `supplement` and `intake-log`.

## When to spec

After Phase 2, once the Vault and the grants ledger have shipped and been used with a real identity document.
