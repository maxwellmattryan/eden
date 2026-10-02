---
title: Meadow as code
status: draft
summary: Meadow (places, listings and the map) as code: the map seam and its generated style, the sources that reach outside (discovery, listings, details, the geocoder), the two requests of a search, the details slots, import by paste, listings, outings and the weekly search, what goes into the egress ledger, the phone's read surfaces, how it is tested, what was never run, and the handoffs.
read-this-if: You are touching the map, a map or detail source, the geocoder, discovery, import, listings or outings, Meadow's store or its views on either app, or adding a keyed provider for places.
depends-on: [product/domains/places, engineering/domain-module, engineering/data-layer, engineering/gardener, engineering/signals]
updated: 2026-10-02
---

## Where it stands

| built | not yet |
|---|---|
| the map behind a seam, MapLibre over OpenFreeMap in a style made from the tokens; saved places with facets, filters, favourites, visits and collections; discovery through the Gardener's web search, with suggestions as mirrors; details in slots (hours from OpenStreetMap, the place's page and the search; the page's picture); import by paste; listings, outings and the weekly search; the two Garden tiles; the settings; the phone's map, nearby list and listings as read surfaces, with favourite and log a visit | a keyed source of any kind (Google's place card, map or places; OQ-24); the device's location on either app; discovery, import and the listings search on the phone (#19); the palette entry running (#23); an offline tile cache and bundled label glyphs; outing reminders (#28); anything in "Never run" |

D-128 to D-136 record the decisions and `product/domains/places.md` what Meadow is; this page is how it works. Meadow's id, route and module are `places`; its store is `meadow`, since `places` already names the primitive's rows and the shell's destinations.

## The pieces

| piece | where | holds |
|---|---|---|
| shapes and rules | `packages/shared/src/domains/places/` | `types`, `rows`, `vibes`, `categories`, `filter`, `hours`, `view`, `favorites`, `formats`, `home`, `discovery`, `import`, `listings`, `outings`, `signals`: plain modules, each with its test |
| store | `…/places/store.svelte.ts` | `meadow`, shared by both apps as Sky's is |
| map seam | `…/places/map/` | `types`, `registry`, `style`, `palette`, `maplibre` |
| detail sources | `…/places/details/` | `types`, `registry`, `osm-hours`, `website` |
| geo | `packages/shared/src/geo/` | `LngLat`, `Bounds`, `rounded`, `roundedPoint`, `haversineKm`, `boundsAround`, `throttle`, the `Geocoder` seam and Photon. Substrate level, so Sky and Meadow both import it |
| desktop | `apps/desktop/src/lib/domains/places/` | `manifest.ts`, `tools.ts`, `map.ts`, `import.svelte.ts`, `seed.ts`, `views/`, `widgets/` |
| mobile | `apps/mobile/src/lib/domains/places/` | `manifest.ts`, `map.ts`, `views/{Meadow,FilterSheet,PlaceSheet}.svelte` |
| kit | `packages/ui-kit` | `MapPin`, `PinLayer`, `Rating`, the `meadowSeeds` sketch; the mocks under `src/stories/domains/places/` |

**The store is shared, so the shell is injected.** `meadow.bind({ record, discovery, listings, geocoder })` is called once in the desktop's `manifest.ts`: `record` writes a line in the Garden's feed and answers how to take it back, and the three sources are the ones below. Every write changes the store at once, is queued (`WriteQueue`) and answers its undo; the view shows the toast. A source that was not given is not there: the phone calls no `bind`, so it has no feed line, no geocoder and nothing that finds.

**Rows** are D-133's. A saved place is read as one `SavedPlace` from its `venue` Place and its `place-profile` (`joinPlaces`); a `venue` with no profile has no `profileId` and shows as a plain pin. The filter (`eden:places:filter`) and the search area (`eden:places:area`) are per device in localStorage, not rows. `favorite-vibe` is written `domain-derived` behind each save and each visit (`favorites.ts`, `#syncFavourites`), and never touches a fact of the type the owner asserted.

## The map

`MapSurface` (`map/types.ts`) draws ground and says where a point falls on it; it never owns a pin (D-129). It has `ready`, `project`, `unproject`, `view`, `bounds`, `setView`, `fit`, `setPadding`, `setPalette`, `on` (`move`, `moveend`, `idle`, `error`), `onClick` (a click on the ground, with its point) and `destroy`. A `MapSource` is one way of making a surface: an id, a name, the attribution the page must show, the ledger destination, an optional secret, and `load()`, which imports the library only when a map is first shown. `MAP_SOURCES` holds one, `OPENFREEMAP`; `mapSource(id?)` answers it.

- **`maplibre.ts`** is the one place in Eden that makes the map's canvas. MapLibre GL JS 6 is a dependency of `@eden/shared` and of both apps. Its controls and its attribution control are off, nothing tilts or turns the ground, and `still` (the apps pass reduced motion) makes every move a jump.
- **The worker.** Each app's `map.ts` imports `maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url` and the library's stylesheet, and passes the URL as `workerUrl`: under the app's own scheme the library cannot work the address out, and a worker from the app's origin is what the CSP allows. `createSurface` there is what a view calls.
- **The style is generated** (`style.ts`, `edenMapStyle(palette, lang)`): a MapLibre style over the OpenMapTiles schema with ground, land use, parks, water, roads by class, buildings and labels, no points of interest and no sprite. Tiles come through the host's TileJSON (`TILEJSON`) and label glyphs from the same host (`GLYPHS`, Noto Sans); ideographs are drawn from the system's fonts (`localIdeographFontFamily`). Labels are `name:<lang>`, then `name:latin`, then `name`.
- **The palette** (`palette.ts`) is thirteen colours mixed from ten tokens (`PALETTE_TOKENS`). `readMapPalette(el)` resolves each token where the element stands by painting one pixel on an `OffscreenCanvas`, since a token may be a `color-mix()`; `mapPalette` is the pure part. The desktop's Map tab reads it again on a theme or accent change and calls `setPalette`, which sets the whole style anew.
- **Pins** are the kit's `MapPin` in a `PinLayer`, placed by `surface.project` and a `revision` the view bumps on `move`. A saved place's pin carries its category's glyph (`categoryGlyph`); one with no category keeps the plain pin. `drawnPins` (`view.ts`) leaves out what is off the ground shown and, above sixty pins on screen, draws saved places that share a 48 px cell as one `group` pin; home, a suggestion and the picked pin always stand alone.
- **No map.** When the surface rejects, or the device is offline, the pins stand on plain ground by `flatProjection` over `flatFit` of their points, and the credit line says so. Saved places are still found.
- **The page** (`views/MapTab.svelte`) follows D-129 and D-112: the detail is an `<aside>` over the map's far edge while the page is wide and the map at least 640 px, with `setPadding` keeping the picked pin clear of it, and a pushed view otherwise. Storybook never mounts a map: the mocks draw `StaticGround.svelte`.

**CSP** (`src-tauri/tauri.conf.json`, D-131): `connect-src` names `https://tiles.openfreemap.org`, `https://photon.komoot.io` and `https://overpass-api.de`; `worker-src 'self'` is for the map's worker; `img-src` has `blob:`.

## The seams

| seam | where | first source | given to the store by |
|---|---|---|---|
| `MapSource` | `map/registry.ts` | OpenFreeMap through MapLibre | each app's `map.ts` |
| `DiscoverySource` | `discovery.ts` | `gardenerDiscovery` (`apps/desktop/…/places/tools.ts`) | `bind` |
| `ListingsSource` | `listings.ts` | `gardenerListings` (the same file) | `bind` |
| `DetailSource` | `details/types.ts` | `DETAIL_SOURCES` | the registry itself |
| `Geocoder` | `geo/types.ts` | `photon` | `bind` |

A discovery or listings source has `available(query)`, which answers who would run it and the estimate or why it cannot be asked, and `discover(query)` or `fetch(query)`, which answers a `SourceFailure` when nothing came. The query carries the area in words (`areaWords`: a city and its region), never a `SearchArea` or a coordinate. Another source, a keyed one included, is a file, an entry in a registry, its hosts in the CSP and its destination in the ledger; no view and no store changes.

**Home** is read by one function, `readHome()` in `home.ts`, from the home store (`@eden/shared/home`, D-141): the label, the rounded point (`point`: where the map opens and what a search looks near), the exact one (`exact`: the home pin and distances, `meadow.originPin`, D-142) and the area its address names. The home pin opens `HomeCard`, whose button opens the shell's change-home sheet (D-143); the map goes to the home when it moves. `areaPoint` and `areaWords` go through it. `SearchArea` is `home` or `named` (a label, a point, and a city and region when the geocoder gave them).

## Discovery

"Find more" (`views/FindMore.svelte`) shows what would be sent, to whom and the estimate from `available`, and pressing it is the consent (D-86). `gardenerDiscovery.discover` is `runtime.runDirect('places.suggest-places', inputFromFilter(…), { confirmed: true })`. The tool is a searching tool, so it is two requests (D-132; `engineering/gardener.md`, "A research request"):

1. **Research.** `researchPrompt` asks for up to eight places (`DISCOVERY_LIMIT`) in the area that fit the brief, names the saved places to leave out (sixty at most), and the request carries the provider's web search capped at five uses (`DISCOVERY_SEARCHES`). `location` gives the provider home's city, region and the device's timezone, and nothing when the conversation named an area. The context is the tool's declared reads under their grants.
2. **Reading.** `readingPrompt` wraps the notes as `untrusted('web-search', …)` and the answer is held to `candidatesSchema`, whose vibe ids include the owner's custom ones, so the schema is read when asked for.

`parseCandidates` then holds each candidate to what the search returned: a source address that is not, whole (`normalLink`), one of the returned ones is dropped, so is a website that is not, and a candidate left with no source is dropped. A name already saved is left out.

`meadow.receive` looks each candidate up with the geocoder: its name and address near the search area's point, inside a box sixty kilometres out, one request a second. A hit gives it a point and its OpenStreetMap id and it becomes a `place-suggestion` mirror (`source: 'web-search'`, the external id `candidateKey`); one with no hit gets no pin and its name is listed as not placed. A place already saved, and a suggestion the owner dismissed, are passed over. Nothing is saved: `saveSuggestion` makes the two rows and drops the mirror as one change with one undo.

In a conversation the same tool answers the model the names, why each fits and where it was read, with a note that none is saved. A failure reaches the page as its code, and `search-refused` with the provider's words.

## Details

Opening a place calls `meadow.openDetails` (D-135). A slot is tried source by source in `DETAIL_SOURCES` order until one answers (`fetchDetail`, which never throws): `ok`, `unavailable` when none covers the place or none had anything, `failed` when the last one tried could not be asked.

| slot | sources, in order |
|---|---|
| `hours` | `osm-hours` (Overpass, by the OpenStreetMap id alone; its tags also give a website and a phone, which fill what the owner left empty), `website` (schema.org `openingHours` on the place's page), `search` (the hours a search wrote; no request) |
| `photo` | `website-photo` (the picture the place's page names, sized by `sizedPicture`) |
| `rating`, `card` | none; declared so a keyed source is one more entry |

- The page is fetched by the crate (`fetchPage`, `fetchImage`), once for both slots, only at `normalLink` of the place's address. For a suggestion that address is one `parseCandidates` kept, so no address a model composed is fetched.
- Each answer is kept as a `place-detail` mirror (`source` the one that answered, external id `<place key>:<slot>`) with its status and time; a picture's bytes are never in it. A slot read `ok` is not asked again for three days, any other for one.
- A saved place keeps its hours on its profile with the source and the time, and a picture found for it becomes its `place-photo` through `setPhoto`. A suggestion's picture is held in memory until it is saved or the app closes.
- `hours.ts` parses the common subset of OpenStreetMap's `opening_hours`. A string outside it is shown as written, and "open now" is answered only for hours that parsed.
- Settings → Integrations turns each source that makes a request on or off (`settings.placesDetailsOff`).
- **Finding a picture** (D-153). `openDetails` and `meadow.findPicture(id, lang)` share one reader, `#readDetails`, which answers a `PictureOutcome` (`found`, `had`, `noWebsite`, `failed`; `details/backfill.ts`). `findPicture` passes `forcePhoto`, so the photo slot is asked whether or not it is due; hours keep their rule. It is the Find a picture item in the place's menu (`views/PlaceDetail.svelte`), there while `lacksPicture(place)`, and its outcome is a toast. Nothing runs over every place: the owner asked for one place at a time, to keep the requests few.
- **The Gardener's `update-places`** (D-154; `apps/desktop/…/places/tools.ts`). A loose batch tool on the pattern of Hearth's (`engineering/gardener.md`, "Tools"): `preview` names each place, `asks` is true for a call that deletes, and `run` checks every id, collection, kind, vibe, price and website (`normalLink`) before `meadow.changePlaces` writes the edits as one change with one feed line. Collections and deletes go through the store's own methods, and the undos are joined. A website that was set on a place with no picture is followed by `fetchPlacePicture`, which calls `meadow.findPicture` in the background and whose undo takes the picture back.

## Import

`parseNameList` (`import.ts`) reads a pasted list with no model and no network: bullets, numbers and checkboxes are dropped, what follows a dash or a colon is the name's note, a heading and a blank line are passed over, a name written twice is read once, two hundred names at most.

`PlacesImport` (`apps/desktop/…/places/import.svelte.ts`, on the model of Hearth's capture) holds the rows. Each name is looked up through `meadow.geocode`, one a second, and its row settles as it comes: `saved` (a place of that name or that OpenStreetMap id is already kept), `matched`, `ambiguous` (several hits further than about fifty metres apart; the owner says which) or `not-found`, which the owner places by a click on the map (the Map tab reads the point under the click with `surface.unproject`, or `flatInverse` when there is no map). "Tag vibes with the Gardener" is one optional `import-places` request with no search (`tagPrompt`, `tagSchema`, three vibes a row at most), its vibes marked suggested. Save all is `meadow.addPlaces`, one batch with one undo.

`ImportSheet` is the domain's `overlay`, so `import-places` called in a conversation opens it on whatever page is showing with the names and their suggested vibes; nothing is saved until the owner saves there.

## Listings and outings

A `listing` is a mirror found by `suggest-listings`, the same two requests with four searches at most (`LISTINGS_SEARCHES`). `listingWindow` is today through the coming Sunday, and on a Sunday through the next one. `parseListings` keeps a listing only with a title, a start inside the days asked for and a page that is, whole, one the search returned. `receiveListings` writes the mirrors (external id `listingKey`: the day and a slug of the title).

`markListing` makes an `outing` Event: interested is `tentative`, going `confirmed`, no mark deletes it. The Event carries the listing's `source` and `externalId`, which is how a second mark finds the first, and a snapshot (`outings.ts`). `add-to-calendar` is `markListing(id, 'going')` behind the tool's confirm (D-136).

**The weekly run** (D-134; `signals.ts`). The manifest's one schedule, `places.weekly`, is `daily` at 09:00. `weeklyMorning` runs the search when `weeklyDue`: once for each Sunday, on that Sunday or on the Monday after. What it has done is kept per device (`eden:places:weekly`, the Sunday it last ran for). `weeklyListings` (`tools.ts`) is the search the desktop binds:

| it answers | when | the week |
|---|---|---|
| `skipped` | `previewDirect` says the tool cannot run (no key, no capable model, over the cap), or it would run on the deep model, or the search failed | settled |
| `busy` | the Gardener was at another request | left open; the next morning tries again |
| `nothing`, `found` | the search ran | settled; `found` emits `listing.matched` keyed by the Sunday, with the count and the first title |

`settings.placesWeekly` turns it off, and Settings disables that toggle while discovery is off.

## Egress

| destination | what leaves | counted by |
|---|---|---|
| `openfreemap` | tile, TileJSON and glyph requests: where the owner looks | `maplibre.ts`: `transformRequest` counts each request to the tile host and enters them every two seconds as one `recordEgress` with a `requests` count, and once more on `destroy` |
| `photon` | a name, the search area's rounded point and a rounded box | `getJson` |
| `overpass` | one public OpenStreetMap id | `getJson` |
| `web-page`, `web-image` | a place's page and its picture | the crate's `fetch_page` and `fetch_image` |
| `anthropic` | the two requests of a search, and an import's tagging | `gardener_send` |

`getJson` and `OfflineError` live in `packages/shared/src/egress/fetch.ts`; Sky's providers use the same. The ledger's batch is in `engineering/data-layer.md`, "The egress ledger".

## The phone

`apps/mobile/src/lib/domains/places/views/Meadow.svelte` is one page at `/places` with a `Segmented` of three surfaces: the map, Nearby (the filtered places as a list with each one's distance) and Listings (what the desktop found, read from the mirrors, each opening its page). The map stays mounted while another surface shows, so it is made once. `FilterSheet` holds the filter and `PlaceSheet` a saved place: what it is, its hours and vibes, and the two writes the phone makes, favourite and a visit with a rating and a note, each with an undo toast.

The store is the shared one with no `bind`, so the phone has no discovery, no import, no listings search and no geocoder, and its pages offer none; they come with the Gardener's runtime (#19; `engineering/gardener.md`, Handoffs). Where the library cannot start the pins stand on plain ground and Nearby still says how far each place is. The views are the phone's own, so they do not wait on the mobile `page` container (`engineering/app-scaffold.md`).

## Testing

| where | pins |
|---|---|
| `domains/places/*.test.ts` | `filter` (any of within a facet, all of across), `hours`, `rows`, `view` (grouping, the flat projection), `favorites`, `discovery` (the address allow-list), `import` (the shapes a note writes names in), `listings` (the window, the Sunday, what is kept), `signals` (Sunday, Monday after busy, off, settled when skipped) |
| `map/style.test.ts` | every colour from the palette, one host for tiles and glyphs, no sprite, the language fallback |
| `details/details.test.ts` | the Overpass query and that it sends only the id, the page's hours, the source order, `unavailable` against `failed`, a source turned off |
| `geo/*.test.ts` | rounding, distance, bounds; Photon's URL with the rounded bias; the throttle |
| `gardener/` | `estimate`, `providers`, `links`, `tools` and the research snapshot (`engineering/gardener.md`, "Testing") |
| the crate | `a_batch_counts_its_requests_in_one_write` (`egress.rs`), `a_built_domain_writes_its_rows_at_its_own_phase` (`registry.rs`), the search fixture (`anthropic.rs`) |
| the kit | `meadow-seeds.test.ts`; the stories of `MapPin`, `PinLayer`, `Rating` and `Domains/Meadow/*` on both canvases with axe |

The store and the views have no unit tests. In the browser build the scripted transport answers a search (`engineering/gardener.md`, "The browser fallback"), so Find more, the import's tagging and the listings search can be walked there.

## Never run

- MapLibre in the Tauri webview, on desktop or in the iOS and Android webviews: the module worker under `worker-src 'self'`, glyphs from the tile host, ideographs from system fonts, the ledger's OpenFreeMap count.
- Web search through the crate's adapter with a live key: that the request is accepted, that the light model the development clamp uses takes it, what a search costs against the estimate.
- Photon and Overpass from the webview under the CSP.
- The page and picture fetch for a place (`web:unavailable` in the browser build), and the picture kept as a `place-photo`.
- A place's picture from a link (D-144): `linkedSizedPicture` throws `web:unavailable` in the browser build, so only the menu, the panel and its failure toast were seen. A picture dropped on the form or pasted into it was not driven either.
- The weekly run on a real Sunday, and `add-to-calendar` from a live conversation.
- Find a picture (D-153) against a real page: in the browser build a place with a website ends `failed` and one without ends `noWebsite`, and neither was driven: the browser build's one saved place has a picture, so only the item's absence there was seen. `update-places` (D-154) from a live conversation: its handler was run by hand in the browser build, and the picture that follows a confirmed website was not fetched.
- The phone's views on a simulator or a device: they were driven in the browser build at 1421 only. On 2026-10-01 `tauri ios dev` for the simulator stopped in the crate's build script, where `swift-rs` could not compile Sky's `EdenWeatherKit` package against the simulator SDK, before any of Meadow's code ran.
- The installed app.

## Handoffs

- **Google's place card (OQ-24).** A `DetailSource` on the `card` slot, registered in `DETAIL_SOURCES`, with `secret` naming its key and a destination in the ledger; `rating` is open the same way. The slot's data is `unknown` today and nothing draws it: the detail views need a place for the card. Google's map would be a `MapSource` beside `maplibre.ts`, and its places a `DiscoverySource`.
- **Changing home on the phone (OQ-25, #19).** The change-home sheet is the desktop shell's (`apps/desktop/src/lib/shell/home/`): the phone's home pin is a mark (`pick('home')` returns early in the mobile `Meadow.svelte`) and no geocoder is bound there. The phone needs the sheet in its own shell, `photon` given at `bind`, and the kit's `AddressForm`, which already lays out one column on a phone.
- **A found place's address.** A `PlaceCandidate` keeps the line its source wrote (`addressLine`), and saving one keeps it as the first line of the address (`#draftOf` in `store.svelte.ts`). The geocoder's hit for the candidate has the parts (`addressFromHit`); `receive` could keep them on the candidate so a saved suggestion starts with a whole address.
- **Precise location.** Not built on either app: "near me" is distance from home or from a named area. It needs `tauri-plugin-geolocation` under the `mobile` cargo feature, the iOS and Android permission strings, the `location-precise` device capability in the manifest with its grant, and `SearchArea` gaining a `device` kind that `areaPoint` and `areaWords` answer. D-131 holds: the device's point moves the map only under the grant, and what leaves is still rounded. Desktop needs its own way to a location.
- **Bundled glyphs and offline tiles.** If glyphs from the tile host fail under the CSP, bundle a few ranges of an OFL font and point `GLYPHS` at the app's origin. No tile is cached: offline, the pins stand on plain ground. A cache, or self-hosted tiles, is another `MapSource` or a layer in this one.
- **The estimate.** `SEARCH_RESULT_TOKENS` and the notes allowance are round figures until the first live searches (`engineering/gardener.md`, "Budgets and estimates").
- **A place's website by search.** `update-places` fills a website only where the model knows it (D-154), which is weak for small local places. A searching tool on D-132's two requests could look each one up; the cap on searches and the cost of a run over many places are undecided, and the addresses it returns are already ones D-135 allows.
- **Adding a place from a conversation.** `update-places` adds none, since a place needs the geocoder: `import-places` opens the sheet for several, and a prefilled Add sheet for one is not built.
- **Pictures from Google (OQ-24).** A `DetailSource` on the `photo` slot ahead of `website-photo`; `findPicture` would use it unchanged. Google's terms on keeping a photo make it a mirror that is fetched again, not a `place-photo`.
- **Import geocoding.** Photon's hit rate on venue names is unmeasured; a second geocoder is another `Geocoder` given at `bind`.
