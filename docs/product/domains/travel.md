---
title: Trails
status: candidate
summary: Candidate domain for trips: itineraries as Events and Places, packing lists as checklists, confirmations and passport scans in the Vault, and the heaviest consumer of Almanac, Meadow, Tasks and the Vault. Id `travel`.
read-this-if: You are considering a Travel domain or wondering where a trip-related feature belongs.
depends-on: [substrate/primitives, substrate/data, domains/calendar, domains/places, domains/_template]
updated: 2026-10-01
---

## Purpose

Plan a trip once and have every part of Eden know about it: the calendar, the map, the tasks, the weather, the Vault. Trails are the paths between places.

## Why it might earn its place

A trip is the one activity that touches almost every domain at the same time, so it exercises the substrate more than any other candidate. Without it, a trip is a pile of unrelated events, places and files.

## Entity sketch

`trip` (T1; destination Place, dates, purpose, status planning → booked → in progress → done), `itinerary-item` (T1; flight, lodging, reservation, activity; each is an Event of kind `trip-item` with a Place), `packing-list` (a checklist task from a template by trip type), `trip-document` (confirmations as `document` attachments; passport scans as `identity-document` in the Vault). Kinds: `trip-destination` (place, T1), `trip-item` (event, T1). Widgets: `next-trip` (S countdown), `today-away` (M itinerary while travelling).

## Facts

`home-airport` (T1), `seat-preference` (T1), `loyalty-number` (T3, Vault), `passport-expiry` (T2, typed by hand).

## Overlaps

Almanac holds the events; Meadow holds the places; Sky forecasts the destination; Orchard would hold the spend; a label-scoped Gmail grant could import confirmations later.

## Handoffs

- **Browsing a trip destination in Meadow**: Meadow is built, and a `trip-destination` Place is a `SearchArea` for it: the area of kind `named` takes a label and a point (`packages/shared/src/domains/places/types.ts`), so Trails passes the destination and Meadow's map, filters and discovery work around it with no change to its views or store (`domains/places.md`, Handoffs).

## Trigger to promote

The owner plans a trip with more than three itinerary items in Almanac by hand.
