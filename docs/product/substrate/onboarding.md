---
title: Onboarding
status: draft
summary: The first-launch wizard step by step, each domain's first run and empty states, the guided tour, adding a domain later, and re-running onboarding from settings.
read-this-if: You are designing first launch, empty states, or the moment a grant is first requested.
depends-on: [grants, shell, profile]
updated: 2026-09-27
---

## Goals

Get the owner to a useful Garden in under five minutes, ask for exactly the grants Phase 1 needs and no more, and explain privacy in plain words once. Every step except the welcome can be skipped and revisited in settings.

## Wizard steps (Phase 1)

| # | step | what happens | reuse |
|---|---|---|---|
| 1 | Welcome | the name, one sentence, a leaf motif, "Begin" | Crate's WelcomeStep |
| 2 | Language | English or Japanese (D-20) | Crate's LanguageStep |
| 3 | Appearance | light, dark or system; accent | Crate's AppearanceStep |
| 4 | Your name | `preferred-name`, used by greetings and the Gardener | new |
| 5 | Home | a Place of kind `home`; a city is enough, address optional; explains that `home-area` is derived and what reads it (D-38) | new |
| 6 | Domains | choose and order; Hearth, Toolbench and Sky preselected; later domains shown as "coming" | new |
| 7 | Gardener | skip, enter a key for one provider, or (Phase 2, desktop) choose a local model; the default 10 USD monthly cap is shown and editable | new |
| 8 | Privacy | the four tiers in one sentence each; what the Gardener can see, with the "can see" chip demonstrated; the two T2 grants Phase 1 asks for, `allergy` and `medical-dietary-restriction`, each with what it enables and what happens without it (D-25) | new |
| 9 | Notifications | OS permission, and the in-app default of a single morning card | new |
| 10 | Ready | the daily line (neutral until Sanctuary is enabled), "Open the Garden" | Crate's ReadyStep |

A step indicator shows progress; back is always allowed; the wizard resumes where it left off if closed.

## Per-domain first run

Each enabled domain opens to an empty state with one primary action and one sentence of purpose. Hearth: "Capture your first haul" or "Add an item". Toolbench: "Capture an idea". Sky: shows the home area's weather immediately, no action needed. Empty states may offer sample data, clearly labelled and removable in one click; sample data is defined in `design/sample-data.md`.

## Guided tour

After the wizard, an optional five-stop tour in Crate's WizardTour pattern: the sidebar and its subtitles, the Garden and edit mode, ⌘K, the Gardener chip and the "can see" idea, the **+** button for Quick Log and Capture.

## Grants requested in context

Beyond the two T2 grants in the wizard, every other grant is requested the first time a feature needs it, in a sheet that names the subject, the resource, the access and the lifetime, with a link to the privacy explanation. Camera on first Capture, OS notifications on first reminder, precise location on first Meadow use.

## Adding a domain later

Settings → Domains lists every domain with a toggle. Enabling one runs that domain's first run and requests its grants in context. Candidate domains and, later, plugins appear under an experimental heading (OQ-13).

## Re-running onboarding

Settings → General → "Run setup again" repeats the wizard with current values prefilled. Nothing is deleted.

## Mockup notes

Steps 5, 7 and 8 are the screens worth mocking first: they carry the product's privacy story. Step 8 should show a real "can see" chip, not an illustration of one.
