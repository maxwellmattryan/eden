---
title: Companions
status: candidate
summary: Candidate domain for relationships: people, birthdays, gift ideas, last contact, dietary notes for hosting, and the places you went together. Id `people`.
read-this-if: You are considering a People domain or wondering where a person-related feature belongs.
depends-on: [substrate/primitives, domains/_template]
updated: 2026-10-01
---

## Purpose

Remember the people who matter: when to reach out, what they like, what they cannot eat, what you did together. Companion planting, where things grow better side by side.

## Why it might earn its place

Birthdays and "call your mother" reminders are the most common request in any life app, and hosting a dinner needs guests' dietary notes next to Hearth's recipes. Nothing else in Eden holds a person.

## Entity sketch

`person` (T1; name, how you know them, birthday, contact hints, gift ideas, dietary notes, notes T2), `interaction` (T1; date, kind, note, linked Place or outing). Birthdays become yearly Events of kind `birthday` (T1); the Gardener's `agenda` tool (`engineering/gardener.md`, D-125) answers a day's Events, so a birthday is in it once the kind exists, and its row should then say whose it is. Nudges are reminder tasks.

## Facts

None written. Reads `home-area` for "who is nearby" later.

## Overlaps

Meadow's visits (a visit with people becomes an interaction), Trails (who you travelled with), Wellspring's providers (doctors are not companions; they stay in Wellspring).

## Trigger to promote

The owner asks for a birthday reminder or a guest's dietary note twice.

## Later: message sources as interactions

Deferred until the domain is promoted; recorded here so the option is not lost. Message apps (iMessage on macOS, SMS on Android, Gmail, Slack) could emit a generic contact event (handle, timestamp, direction, kind) that becomes an `interaction`. People consumes contact events and never knows the source, so new apps are new emitters. Message bodies are never ingested; only metadata, which stays T1 and keeps content away from the Gardener. iOS has no Messages API, so this is a desktop emitter and the phone sees interactions through sync (Phase 3). Handle-to-person matching (Contacts access or a one-time manual mapping into contact hints) is the hard part; unmatched handles stay out of People. Needs a catalog row in `substrate/integrations.md` and a decision on content when picked up.
