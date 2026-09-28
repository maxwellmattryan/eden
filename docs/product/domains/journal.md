---
title: Rings
status: candidate
summary: Candidate domain for daily reflection and mood: dated entries, a mood score with a quick log, prompts from Sanctuary, links to anything that happened that day. Id `journal`.
read-this-if: You are considering a Journal domain, or deciding whether reflection belongs in Sanctuary or Toolbench (OQ-9).
depends-on: [substrate/primitives, domains/spirit, domains/_template]
updated: 2026-09-27
---

## Purpose

A record of the seasons: what each day was like, in a few lines, with a mood score, so patterns become visible over months. Tree rings.

## Why it might earn its place

Sanctuary's reading log is about texts; Toolbench's notes are technical. Neither is a place to write "today was heavy". A mood series next to Vigor's weight series and Sky's weather is the kind of correlation only Eden can draw.

## Entity sketch

`entry` (T1 body; a `mood` field T2), `prompt` (T0; from Sanctuary or bundled). Quick action `log-mood`. Garden widget `mood-trend` (S sparkline).

## Facts

None written. Reads nothing by default; the Gardener's reflection tools would declare `entry` and need a T2 grant for mood.

## Overlaps

Sanctuary's reading log and reflection prompts; Toolbench's notes; Wellspring, if mood is treated as health data later.

## Trigger to promote

OQ-9 is decided in favour of a separate domain, or the owner starts writing daily reflections in Sanctuary's reading log.
