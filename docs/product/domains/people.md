---
title: Companions
status: candidate
summary: Candidate domain for relationships: people, birthdays, gift ideas, last contact, dietary notes for hosting, and the places you went together. Id `people`.
read-this-if: You are considering a People domain or wondering where a person-related feature belongs.
depends-on: [substrate/primitives, domains/_template]
updated: 2026-09-27
---

## Purpose

Remember the people who matter: when to reach out, what they like, what they cannot eat, what you did together. Companion planting, where things grow better side by side.

## Why it might earn its place

Birthdays and "call your mother" reminders are the most common request in any life app, and hosting a dinner needs guests' dietary notes next to Hearth's recipes. Nothing else in Eden holds a person.

## Entity sketch

`person` (T1; name, how you know them, birthday, contact hints, gift ideas, dietary notes, notes T2), `interaction` (T1; date, kind, note, linked Place or outing). Birthdays become yearly Events of kind `birthday` (T1). Nudges are reminder tasks.

## Facts

None written. Reads `home-area` for "who is nearby" later.

## Overlaps

Meadow's visits (a visit with people becomes an interaction), Trails (who you travelled with), Wellspring's providers (doctors are not companions; they stay in Wellspring).

## Trigger to promote

The owner asks for a birthday reminder or a guest's dietary note twice.
