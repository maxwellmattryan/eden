---
title: Sample data
status: draft
summary: One consistent fictional dataset for every mockup: an owner, facts, stock by location, a captured haul, recipes, a grocery list, ideas and projects, a calendar week with layers, a weather week, workouts and a weight series, places and listings, daily lines, notifications, feed and audit entries.
read-this-if: You are drawing a mockup or seeding an empty state with sample data.
depends-on: [product/domains/README]
updated: 2026-10-02
---

## The owner

Rowan Hale, they/them, a developer in Austin, Texas. Home is a `home` Place in Hyde Park, Austin, at 4301 Duval St, Austin, TX 78751 (`homeAddress`; `homeAddressJa` is a Shibuya address for the Japanese form); `home-area` derives to Duval St, Austin, Texas, 78751, United States (D-152). The address form's fields for four countries are `addressForms` (US, JP, DE, and BR for the plain layout), over the countries in `addressCountries`. Preferred name "Rowan". Locale `en`, second locale `ja` for screenshots of the Japanese UI. The week shown everywhere is Monday 2026-09-28 to Sunday 2026-10-04; "today" is Wednesday 2026-09-30, 07:40.

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

## Today

Wednesday's tasks, as the Today widget shows them: "Book the dentist" (overdue since Mon 09-28), "Renew library card" (due today), "Morning LMNT" (a routine, done 06:50). In code: `todayTasks`, which stays the tile's three rows, with the two due days in `todayDues`. The page and its seed read two more exports: the routine's detail (`todayRoutine`: every day at 06:50 since 09-01, done at 06:50 this morning) and the one habit (`todayHabit`: "Stretch", three times a week, logged on 09-28 and 09-29 so far this week, so the tally reads 2 / 3, and the two weeks before met, a streak of two).

## The Garden

The Phase 1 default layout, one list the mockup and the app both read (`gardenLayout`): `weather-now` (Sky, S), `today` (Tasks, M), `expiring-soon` (Hearth, S), `cook-tonight` (Hearth, M), `resurfaced-idea` (Toolbench, S), `active-projects` (Toolbench, M), `sun-and-moon` (Sky, S), `daily-line` (neutral, M), `quick-log` (Vigor's weight, S), `nearby-favorites` (Meadow, M), `upcoming-listings` (Meadow, M). The activity feed is a column beside the grid on desktop, not a tile.

## Hearth

**Stock by location** (`expiryEstimated` marked ~):

| location | items |
|---|---|
| Fridge | chicken thighs 900 g (exp 10-02), miso paste 400 g (12-15 ~), eggs 8 (10-14), spinach 200 g (10-01 ~), Greek yogurt 500 g (10-06; brand Fage, size 500 g), lemons 3 (10-09 ~), tofu 400 g (10-03) |
| Freezer | edamame 450 g (2027-01 ~), salmon fillets 2 (11-20 ~), corn tortillas 12 (12-01 ~) |
| Pantry | short-grain rice 2 kg, soba 300 g, canned black beans 2, olive oil 500 ml (brand H-E-B, size 500 ml), soy sauce (low sodium) 300 ml, LMNT citrus 9 packets (low-stock threshold 10) |
| Counter | avocados 2 (10-01 ~), garlic 1 head, bananas 4 (10-02 ~) |
| Household (D-122) | paper towels 4 rolls (brand Bounty, size 6 ct), dish soap 1 bottle, toothpaste 2 |

**The header motif** (`hearthMotif`, D-123): 22 in stock, 4 of them expiring by Friday 10-02 (the chicken, the spinach, the avocados, the bananas).

**Ran out** (`ranOut`, D-92; shown only by the stories that ask for it): whole milk, from the fridge, on 09-29; rolled oats, from the pantry, on 09-27.

Each item has a `category` from `haulCategories` (below), whose glyph is its picture until it has a photo: the chicken and the salmon are meat-and-fish; the eggs and the yogurt dairy-and-eggs; the spinach, lemons, avocados, garlic and bananas produce; the edamame frozen; the tortillas, the rice and the soba grains-and-pasta; the black beans canned-and-jarred; the miso, the olive oil and the soy sauce condiments-and-spices; the LMNT supplements-and-mixes; the paper towels and the dish soap cleaning-and-laundry; the toothpaste personal-care; the tofu has none. The Stock mockup gives the chicken, the spinach and the avocados a stand-in photo.

**A captured haul** (09-29 18:12, provider Anthropic, model Haiku, cost estimate 0.6 cents), read from four sources: a photo of the bags (`haul.jpg`, 2.4 MB), a photo of the receipt (`receipt.jpg`, 840 KB), the order's PDF (`heb-order.pdf`, 1.2 MB) and a pasted list of 6 lines. In the haul's rows the yogurt carries its brand (Fage), its size (500 g) and what one cost (5.49), and the lemons a price (0.50 each); the receipt names H-E-B (`haul.store`, among `haul.stores`), which is the store the sheet picks (D-104, D-105). 11 rows recognised, 9 kept, 2 merged (eggs, spinach), 1 corrected (yogurt quantity), 1 removed (a misread "napkins"). Expiries are full dates (chicken 2026-10-02). Categories (`haulCategories`) are the app's twelve, id and English name: `produce` Produce, `meat-and-fish` Meat and fish, `dairy-and-eggs` Dairy and eggs, `bakery` Bakery, `grains-and-pasta` Grains and pasta, `canned-and-jarred` Canned and jarred, `frozen` Frozen, `snacks` Snacks, `drinks` Drinks, `condiments-and-spices` Condiments and spices, `supplements-and-mixes` Supplements and mixes, `other` Other; the chicken is meat-and-fish, the eggs and the yogurt dairy-and-eggs, the spinach, lemons, avocados and bananas produce, the tortillas grains-and-pasta, the soy sauce condiments-and-spices, the napkins other, and the tofu has none. One tip, on the spinach: "Wrap in a dry towel inside the bag; it wilts fastest in the door." A merge names its stock item and says whether it is on (`{ name, on }`); both are on as captured.

**Recipes**: Miso-glazed salmon with spinach (serves 2, 25 min, tags weeknight, low-sodium); Black bean tacos (serves 2, 20 min); Soba with tofu and edamame (serves 2, 15 min). Cook-tonight suggests the salmon because the spinach expires tomorrow. Nothing suggested contains nuts or shellfish. Each carries its `ingredients` (`{ name, qty, unit?, note? }`) and its `steps`, and the salmon a `tip`:

| recipe | ingredients | steps |
|---|---|---|
| Miso-glazed salmon with spinach | 2 salmon fillets; 2 tbsp miso paste; 1 tbsp soy sauce; 200 g spinach; 1 clove garlic, sliced; 150 g short-grain rice | Cook the rice. / Stir the miso and the soy sauce together and brush it over the salmon. / Roast at 220 °C for 10 to 12 minutes, until the glaze darkens at the edges. / Wilt the spinach with the garlic in a hot pan and serve under the salmon. |
| Black bean tacos | 1 canned black beans; 6 corn tortillas; 1 avocados; 1 limes; 1 clove garlic | Warm the beans with the garlic and a splash of their liquid, and crush a few. / Char the tortillas over a flame or in a dry pan. / Fill with the beans and sliced avocado, and finish with lime. |
| Soba with tofu and edamame | 200 g soba; 200 g tofu, cubed; 150 g edamame; 2 tbsp soy sauce; 1 ginger, a thumb, grated | Boil the soba, adding the edamame for the last two minutes; rinse both cold. / Brown the tofu in a pan. / Toss everything with the soy sauce and the ginger. |

The salmon's tip: "Pat the fillets dry first: the glaze holds and the edges caramelise." Against the stock the salmon has everything (cooking it asks about the miso, tablespoons from grams, and the garlic, a clove from a head), the tacos miss the limes and the soba the ginger, which is why both are on the grocery list.

**A recipe on its way in** (`recipeDraft`), read from the link `https://example.com/recipes/lemon-yogurt-chicken-thighs` and not saved yet: Lemon-yogurt chicken thighs (serves 2, 35 min, tag weeknight). Ingredients: 500 g chicken thighs; 150 g Greek yogurt; 1 lemons, zest and juice; 2 cloves garlic, grated; 1 tbsp olive oil; 1 dill, a small bunch (the one thing not in stock). Steps: Stir the yogurt, the lemon, the garlic and the oil together and coat the chicken. / Roast at 220 °C for 25 minutes, until the edges char. / Rest for five minutes and scatter with the dill.

**Grocery**, one list per store. Stores, in this order: H-E-B (sells grocery; 2400 S Congress Ave, Austin; https://www.heb.com; a picture, the kit's stand-in mark `storePicture`; last shopped 09-26) and Target (sells grocery and home goods; no picture, so the store glyph on a tile; last shopped 09-25; note: Park on the roof; the garage fills by noon.). H-E-B's list: LMNT citrus ×1 box (origin low-stock; size 30 ct, 45.00 a box), limes ×4 (0.33 each), ginger ×1 (origin recipe: soba, checked; no price), so the list's header reads "about $46.32, 1 unpriced" (D-105); its `shop-day` Event is Saturday 10-03 10:00. Target's list: paper towels (manual; brand Bounty, size 6 ct, no price, so no sum), no shop day. Not filed to a store yet: coffee filters (manual).

## Toolbench

**Ideas**: "Pantry barcode scanner on the Pi" (exploring, homelab), "nannou sketch: flow field over Austin weather" (building → linked project), "Bike light that reads Sky's forecast" (idea, hardware), "Solar logger for the balcony" (idea, hardware), "Command palette for the Synology" (archived), "Eden plugin: seed library" (idea, app). Resurfaced idea widget shows the solar logger (untouched 41 days).

**Idea log** for the flow field (`ideaLog`): 09-12 "Captured from a sketchbook page"; 09-18 "Moved to exploring: mapped hourly wind to a vector field"; 09-26 "Moved to building: linked the weather-field project". Its brainstorm thread is two messages: Rowan asks "How do I make the field feel like the day rather than a noise demo?"; the Gardener answers that the noise scale should follow the wind speed and the palette the hour, so a still morning reads as slow, wide curves and a stormy evening as tight, dark ones, and that seed 2049 already has the right bones.

**Projects**: "weather-field" (nannou; repo `github.com/rowanhale/weather-field`; next steps: pick a palette per season, export 4K frames); "pi-pantry" (exploring; parts list: Pi Zero 2 W 15.00, barcode module 32.50, case 9.00; estimated 56.50).

**Lab**: `pi-pantry.local` (Pi 5, services: scanner-api, node-exporter; updated 09-21; backup routine weekly), `nas.local` (Synology, services: photos, backups; updated 09-14).

**Studio**: sketch "weather-field" seed 2049, parameters: noise scale 0.004, particles 12 000, palette "night forest"; three renders from 09-27 and 09-28.

## Sky

Austin week: Mon 31/22 °C clear, Tue 32/23 partly cloudy, **Wed 29/21 showers from 16:00**, Thu 27/19 clear, Fri 28/18 clear, Sat 30/19 clear, Sun 31/20 clear. Today's hours from 08:00 (`skyHours`, temperature and chance of rain): 08:00 22° 0 %, 09:00 23° 0 %, 10:00 25° 0 %, 11:00 26° 5 %, 12:00 27° 10 %, 13:00 28° 15 %, 14:00 29° 25 % cloudy, 15:00 29° 40 % cloudy, 16:00 27° 70 % rain, 17:00 26° 75 % rain, 18:00 25° 65 % rain, 19:00 24° 45 % drizzle. Today: sunrise 07:22, sunset 19:14, golden hour 18:35, moon waning gibbous 84 %. Alert: none. "Good day for": an early run before the showers. Rain-before-plans nudge: the Wednesday 17:30 workout session.

The week shown starts on Monday; with the week start on Sunday (D-58) it runs from Sunday 09-27 (30/21 partly cloudy, `skySundayBefore`) to Saturday. Days before Wednesday are observed, not forecast. Details at 07:40 (`skyDetails`, metric): feels like 23°, humidity 64 %, dew point 15°, wind 14 km/h from SSE gusting 27, pressure 1014 hPa, visibility 16 km, cloud cover 20 %, rainfall today 4.2 mm, UV index 7. Air quality (`skyAirQuality`): US index 42, good; PM2.5 8.4, PM10 17, ozone 61, NO₂ 12 µg/m³. Allergens (`skyAllergens`): tree pollen low, grass pollen moderate, ragweed pollen high, mold moderate. Sources: Open-Meteo for the forecast and the air quality, the National Weather Service for alerts. Each day's detail is in `skyWeekDetail` (the chance of rain and its depth, the highest UV index, the strongest wind, sunrise and sunset). The moon is at 0.63 of its cycle (`skyToday.moonCycle`), which draws the glyph. Changing home, a search for "Austin" finds Austin in Texas, Minnesota and Nevada (`skyPlaceResults`).

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

Home (`meadowHome`): Hyde Park, rounded to two decimals (-97.73, 30.31), shown as "Austin, Texas". Vibes by facet are `meadowFacets`, the bundled ones of D-133.

Places (`meadowPlaces`, venues with profiles; coordinates in the file):

| place | category | where, km from home | price | vibes | favourite | rating | hours (source, as of) |
|---|---|---|---|---|---|---|---|
| Cosmic Coffee + Beer Garden | cafe | 121 Pickle Rd, South Austin, 9.8 | 2 | work-friendly, unwind, cozy, outdoors, spacious, laptop crowd, social | yes | 4.6 (the search) | daily 07:00–24:00 (OpenStreetMap, Tue 09-29), open |
| Nickel City | bar | 1133 E 11th St, East Austin, 4.6 | 1 | catch up, lively, late-night, locals, social | no | | daily 12:00–02:00 (its website, Mon 09-28), closed |
| Zilker Park | park | Barton Springs Rd, Zilker, 5.9 | | read, unwind, calm, quiet, outdoors, spacious, kid-friendly, solo-friendly; alcohol-free | yes | | daily 05:00–22:00 (OpenStreetMap, Tue 09-29), open |
| Cuvée Coffee | cafe | 48 East Ave, Rainey, 6.1 | 2 | deep work, work-friendly, calm, industrial, natural light, laptop crowd, solo-friendly; alcohol-free | no | 4.4 (the search) | Mon–Fri 07:00–17:00, Sat–Sun 08:00–17:00 (OpenStreetMap, Tue 09-29), open |
| Sour Duck Market | restaurant | 1814 E Martin Luther King Jr Blvd, East Austin, 3.5 | 2 | catch up, date, cozy, outdoors, locals, kid-friendly; alcohol-free | yes | 4.5 (the search) | none |

"Open" is as of Wednesday 07:40. Every place but Cuvée Coffee has a stand-in picture (a drawn data URL, never a photograph). Notes: Cosmic "Good porch, loud inside. Chickens out back."; Sour Duck "Alcohol-free options on tap. The patio fills by seven." The motif (`meadowMotif`) counts five places, three of them favourites.

Collections (`meadowCollections`): "Coworking" (Cosmic, Cuvée; "Wifi that holds, somewhere to sit for three hours.") and "Date nights" (Sour Duck, Nickel City).

Visits (`meadowVisits`): Cosmic Sat 09-26, 4, "Good porch, loud inside."; Zilker Park Sun 09-20, 5, "Read by the water until dark."; Sour Duck Fri 09-11, 4.

Listings (`meadowListings`), each with why it fits and its source: Hot Luck food festival at Wild Onion Ranch, Sat 10-03 20:00, Food, $$$ (interested → tentative outing); Blanton late night at the Blanton Museum of Art, Thu 10-01 18:00, Art, free (not marked).

Suggestions (`meadowSuggestions`) for the search "a quiet cafe to work in" (`meadowSearch`: Austin, Texas, claude-sonnet, an estimate of $0.12), none saved, each with a reason and a source: Flitch Coffee (641 Tillery St, East Austin), Bennu Coffee (2001 E Martin Luther King Jr Blvd, East Austin), Austin Central Library (710 W Cesar Chavez St, Downtown).

The pasted list (`meadowImport`), six lines as a note's bullets, and the rows it becomes: Cosmic Coffee (already saved); Radio Coffee & Beer, with its note "good for groups", Mozart's and The Roosevelt Room (matched, each with suggested vibes); Lazarus Brewing (ambiguous, two addresses); "that taco truck on Manor" (not found).

The map fixture (`meadowMap`): the ground a mock's map stands on (D-129), central Austin drawn by hand in degrees: square bounds, Lady Bird Lake, three parks, ten roads (I-35 and MoPac heavier than the streets) and six labels (Downtown, East Austin, Zilker, South Congress, Hyde Park, Lady Bird Lake).

## Notifications and feed

Inbox (unread 2): "Spinach and avocados expire tomorrow" (Hearth), "Showers from 16:00, your 17:30 session may get wet" (Sky). Activity feed: "Logged 82.4 kg" 06:52; "Took LMNT citrus" 06:50; "Captured a haul: 9 items" yesterday 18:14; "Completed Pull A" Monday.

## Audit and grants

Audit entry: 09-30 07:31, surface Hearth chat, model claude-sonnet, read `stock-item` 22, `recipe` 3, `dietary-preference` 1, `allergy` 2, `medical-dietary-restriction` 1, tool `suggest-recipes` read, 3 120 tokens in, 410 out, 1.1 cents, outcome ok. Grants: `allergy` read standing (onboarding), `medical-dietary-restriction` read standing (onboarding), camera on this device, Google "Work" calendar read (desktop only; the phone shows "granted, not connected here"). Budget: 2.84 of 10.00 USD this month.

Usage: 2.84 USD this month (September, so the last 30 days too) over 148 requests, 11.46 all time. By model this month: claude-sonnet 79 requests, 2.02; claude-opus 8 requests, 61 cents; claude-haiku 61 requests, 21 cents. By what ran: conversations 96 requests, 1.74; `capture-haul` 14, 52 cents; `suggest-recipes` 21, 37 cents; `brainstorm` 17, 21 cents. The fourteen days to 09-30 by grade, in USD: light 0.01 to 0.03 a day, standard 0.07 to 0.30, deep on three days only (09-19 0.20, 09-23 0.25, 09-28 0.12), nothing on 09-20 and 09-27; the exact series is `usageByGrade` in `sample-data.ts`.

Egress ledger for 09-30: Anthropic (Hearth chat) 4 requests, 18.2 kB out; Open-Meteo 12 requests, 41.0 kB; Google Work 2 requests, 3.1 kB; Vault → AI 0 requests, 0 B.

## Japanese screenshots

Sidebar: 今日, 庭, 台所, 空, 工房, 暦, 活力, 聖域, 野原, 庭師, 設定. The daily line in Japanese: 「足るを知る」.

## Mirror in code

The dataset is mirrored as `packages/ui-kit/src/stories/sample-data.ts`, typed for the kit's stories and exported as `@eden/ui-kit/sample-data` so the apps' empty states can seed from it. Change both together.
