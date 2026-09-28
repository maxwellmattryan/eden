---
title: Sample data
status: draft
summary: One consistent fictional dataset for every mockup: an owner, facts, stock by location, a captured haul, recipes, a grocery list, ideas and projects, a calendar week with layers, a weather week, workouts and a weight series, places and listings, daily lines, notifications, feed and audit entries.
read-this-if: You are drawing a mockup or seeding an empty state with sample data.
depends-on: [product/domains/README]
updated: 2026-09-27
---

## The owner

Rowan Hale, they/them, a developer in Austin, Texas. Home is a `home` Place in Hyde Park, Austin; `home-area` derives to Austin, Texas, US. Preferred name "Rowan". Locale `en`, second locale `ja` for screenshots of the Japanese UI. The week shown everywhere is Monday 2026-09-28 to Sunday 2026-10-04; "today" is Wednesday 2026-09-30, 07:40.

## Facts

| type | value | provenance |
|---|---|---|
| `allergy` | food, tree nuts, severe | user-asserted |
| `allergy` | food, shellfish, moderate | user-asserted |
| `dietary-preference` | low-sodium | user-asserted |
| `medical-dietary-restriction` | low sodium (asserted before Wellspring exists) | user-asserted |
| `disliked-ingredient` | cilantro | ai-inferred, confirmed |
| `cuisine-preference` | Japanese, Mexican, Mediterranean | user-asserted |
| `household-size` | 2 | user-asserted |
| `skill` | Rust, advanced; Svelte, advanced; PCB design, beginner | user-asserted |
| `owned-hardware` | Raspberry Pi 5, Synology DS923+, Elgato Key Light | user-asserted |
| `preferred-tool` | Rust, Svelte, nannou, Neovim | user-asserted |
| `gym-preference` | Castle Hill Fitness, mornings | user-asserted |
| `training-limitation` | left shoulder impingement, no overhead pressing | user-asserted |
| `favorite-supplement` | LMNT citrus | user-asserted |
| `followed-tradition` | Buddhism, Stoicism | user-asserted |
| `value` | patience, craft, generosity | user-asserted |

## Hearth

**Stock by location** (`expiryEstimated` marked ~):

| location | items |
|---|---|
| Fridge | chicken thighs 900 g (exp 10-02), miso paste 400 g (12-15 ~), eggs 8 (10-14), spinach 200 g (10-01 ~), Greek yogurt 500 g (10-06), lemons 3 (10-09 ~), tofu 400 g (10-03) |
| Freezer | edamame 450 g (2027-01 ~), salmon fillets 2 (11-20 ~), corn tortillas 12 (12-01 ~) |
| Pantry | short-grain rice 2 kg, soba 300 g, canned black beans 2, olive oil 500 ml, soy sauce (low sodium) 300 ml, LMNT citrus 9 packets (low-stock threshold 10) |
| Counter | avocados 2 (10-01 ~), garlic 1 head, bananas 4 (10-02 ~) |

**A captured haul** (photo, 09-29 18:12, provider Anthropic, cost estimate 0.6 cents): 11 rows recognised, 9 kept, 2 merged (eggs, spinach), 1 corrected (yogurt quantity), 1 removed (a misread "napkins").

**Recipes**: Miso-glazed salmon with spinach (serves 2, 25 min, tags weeknight, low-sodium); Black bean tacos (serves 2, 20 min); Soba with tofu and edamame (serves 2, 15 min). Cook-tonight suggests the salmon because the spinach expires tomorrow. Nothing suggested contains nuts or shellfish.

**Grocery list** "H-E-B Saturday": LMNT citrus ×1 box (origin low-stock), limes ×4, ginger ×1 (origin recipe: soba), paper towels (manual). `shop-day` Event Saturday 10-03 10:00.

## Toolbench

**Ideas**: "Pantry barcode scanner on the Pi" (exploring, homelab), "nannou sketch: flow field over Austin weather" (building → linked project), "Bike light that reads Sky's forecast" (idea, hardware), "Solar logger for the balcony" (idea, hardware), "Command palette for the Synology" (archived), "Eden plugin: seed library" (idea, app). Resurfaced idea widget shows the solar logger (untouched 41 days).

**Projects**: "weather-field" (nannou; repo `github.com/rowanhale/weather-field`; next steps: pick a palette per season, export 4K frames); "pi-pantry" (exploring; parts list: Pi Zero 2 W 15.00, barcode module 32.50, case 9.00; estimated 56.50).

**Lab**: `pi-pantry.local` (Pi 5, services: scanner-api, node-exporter; updated 09-21; backup routine weekly), `nas.local` (Synology, services: photos, backups; updated 09-14).

**Studio**: sketch "weather-field" seed 2049, parameters: noise scale 0.004, particles 12 000, palette "night forest"; three renders from 09-27 and 09-28.

## Sky

Austin week: Mon 31/22 °C clear, Tue 32/23 partly cloudy, **Wed 29/21 showers from 16:00**, Thu 27/19 clear, Fri 28/18 clear, Sat 30/19 clear, Sun 31/20 clear. Today: sunrise 07:22, sunset 19:14, golden hour 18:35, moon waning gibbous 84 %. Alert: none. "Good day for": an early run before the showers. Rain-before-plans nudge: the Wednesday 17:30 workout session.

## Almanac week

Layers on: local, Google "Work" (T1), Google "Family" (T2, greyed for the Gardener), tasks, workout sessions, shop day, US and Japan holidays, sun and moon, weather.

| day | items |
|---|---|
| Mon 09-28 | Google Work: standup 09:30; workout-session 07:00 (done) |
| Tue 09-29 | Google Work: design review 14:00; haul captured 18:12 (feed) |
| Wed 09-30 | task: renew library card (due); workout-session 17:30 (rain nudge); Google Family: dinner at Mom's 19:00 |
| Thu 10-01 | Google Work: 1:1 11:00 |
| Fri 10-02 | local-event: Ren's birthday drinks 19:00 at Nickel City; workout-session 07:00 |
| Sat 10-03 | shop-day 10:00; outing (tentative): Hot Luck listing 20:00 |
| Sun 10-04 | reading routine 08:00; moon 🌗 |

Holiday annotations that week: none in the US; Japan none. A future month shows 体育の日 on 10-12.

## Vigor

Templates: "Push A", "Pull A", "Legs". Logs: Mon Pull A (5 exercises, RPE 7, 52 min), Fri Push A planned. Gyms: Castle Hill Fitness (venue, 1112 N Lamar), home rack. Weight series (kg), daily 09-17 to 09-30: 83.6, 83.4, 83.5, 83.1, 83.2, 82.9, 83.0, 82.8, 82.7, 82.9, 82.6, 82.5, 82.6, **82.4**; seven-day average 82.7; goal line 80.0 by 12-31. Supplements: LMNT citrus, 1 packet daily, pre-workout; intake logged today 06:50. Streak: 6 sessions.

## Sanctuary

Daily lines: Mon "Nothing in the world is permanent, and we are foolish when we ask anything to last." (Somerset Maugham, public domain check pending, OQ-5); Wed "Waste no more time arguing what a good man should be. Be one." (Marcus Aurelius); the neutral fallback "Tend what you can reach." Reading log: 09-28, Dhammapada 1–5, reflection "Slower mornings this week." Values: patience, craft, generosity.

## Meadow

Places (venues with profiles): Cosmic Coffee (cozy, outdoors, work-friendly, alcohol served, 4.6), Nickel City (lively, dive), Zilker Park (outdoors, quiet), Cuvée Coffee (industrial, work-friendly, 4.4), Sour Duck Market (cozy, alcohol-free option, 4.5). Collections: "coworking", "date nights". Listings: Hot Luck food festival Sat 10-03 20:00 (interested → tentative outing), Blanton Museum late night Thu 10-01 18:00. Visit: Cosmic Coffee 09-26, "good porch, loud inside", 4.

## Notifications and feed

Inbox (unread 2): "Spinach and avocados expire tomorrow" (Hearth), "Showers from 16:00, your 17:30 session may get wet" (Sky). Activity feed: "Logged 82.4 kg" 06:52; "Took LMNT citrus" 06:50; "Captured a haul: 9 items" yesterday 18:14; "Completed Pull A" Monday.

## Audit and grants

Audit entry: 09-30 07:31, surface Hearth chat, model claude-sonnet, read `stock-item` 22, `recipe` 3, `dietary-preference` 1, `allergy` 2, `medical-dietary-restriction` 1, tool `suggest-recipes` read, 3 120 tokens in, 410 out, 1.1 cents, outcome ok. Grants: `allergy` read standing (onboarding), `medical-dietary-restriction` read standing (onboarding), camera on this device, Google "Work" calendar read (desktop only; the phone shows "granted, not connected here"). Budget: 2.84 of 10.00 USD this month.

## Japanese screenshots

Sidebar: 庭, 今日, 台所, 工房, 空, 暦, 活力, 聖域, 野原, 庭師, 設定. The daily line in Japanese: 「足るを知る」.
