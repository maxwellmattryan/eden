---
title: Toolbench
status: draft
summary: Capture any idea and grow the good ones into projects; keep homelab devices, generative-art sketches and technical notes in one workbench. Id `toolbench`, Phase 1.
read-this-if: You are working on ideas, projects, the homelab, the studio, or technical notes.
depends-on: [substrate/registry, substrate/primitives, substrate/tasks, substrate/ai, substrate/shell, substrate/ai]
updated: 2026-10-02
---

## 1. Purpose

Toolbench is the maker's bench: the universal inbox for ideas, the place a building idea becomes a project, and the home of the homelab, the generative-art studio and the technical notes that go with them. It links out to Forge and Crate rather than rebuilding them (D-15). The one thing it must do well: **capture an idea in five seconds and find it again.**

## 2. User stories

- MVP: Capture an idea from anywhere in two gestures and file it later.
- MVP: Move an idea through idea → exploring → building → done or archived, with a log of what changed.
- MVP: Brainstorm an idea with the Gardener and keep that thread attached to the idea.
- MVP: Turn a building idea into a project with a repo link, notes and next steps as tasks.
- MVP: Keep a parts list for a hardware build with a cost estimate.
- MVP: List homelab devices with what runs on them and their update and backup routines.
- MVP: Keep a gallery of generative-art sketches with renders, seeds and parameters.
- MVP: Keep technical notes, commands and config recipes searchable.
- Later: Watch a render folder on desktop so new nannou output appears in the studio by itself.
- Later: See GitHub issues on a project and create one, confirmed each time.

## 3. Entities

| entity | key fields | tier | links out |
|---|---|---|---|
| `idea` | title, body, category (tool, app, homelab, hardware, art, other), status, tags, effort, impact, log entries | T1 | project, brainstorm session |
| `project` | title, summary, status, repo URL, README summary, log entries | T1 | idea, tasks (next steps), sketches |
| `device` | name, kind (Pi, NAS, server, router, other), hostname, services, last updated, backup routine | T2 | routine tasks |
| `parts-list` | title, items (name, qty, unit cost, vendor URL), estimated total, wishlist flag | T1 | idea, project |
| `sketch` | title, tool (nannou, other), seed, parameters, notes, repo path | T1 | `render` attachments, project |
| `note` | title, body (Markdown), tags | T1 | any |
| `brainstorm-session` | Gardener thread id, summary | T1 | idea |

## 4. Facts

Written: `skill` T1 (name, level), `owned-hardware` T1, `preferred-tool` T1 (languages, frameworks, editors). Read: none from other domains.

## 5. Gardener tools and guardrails

| tool | reads | access | confirm | grade |
|---|---|---|---|---|
| `brainstorm` | `idea`, `skill`, `preferred-tool`, `owned-hardware` | read | none | `deep` |
| `critique` | `idea`, `project` | read | none | `deep` |
| `expand-to-plan` | `idea`, `project`, `task` | write-draft | a plan card; commit creates tasks linked to the project | `deep` |
| `find-similar` | `idea`, `project`, `note` | read | none | plain (OQ-22) |
| `estimate-parts-cost` | `parts-list` | read | none | plain |
| `summarize-project` | `project`, `task` | read | none | `standard` |
| `draft-sketch-scaffold` | `sketch`, `preferred-tool` | write-draft | text to copy; never writes a file | `deep` |

Never-do list: never sees credentials, keys or tokens (Lab holds hostnames only, and `device` is T2, so reading it needs a grant); never runs commands or writes files; never creates a GitHub issue without a per-request confirm.

## 6. Surfaces

**Desktop views (Phase 1)**: Ideas (inbox with status filter and a detail pane showing the log and brainstorm thread), Projects (list; detail with repo, next steps as tasks, log), Lab (devices with services and routine status), Studio (render gallery; sketch detail with seed and parameters), Notes (search-first).

**Mobile (Phase 2)**: capture an idea, browse ideas, read notes. Built: `/toolbench/[[tab]]` behind More (or pinned, D-160), mounting desktop's page from `@eden/shared`. Ideas is the shared view in its narrow layout, the picked idea pushed over the list, and Android's back closes it; an idea is also captured from the floating **+**. Projects, Lab, Studio and Notes show their empty states, as on desktop.

**Garden widgets**: `active-projects` (M), `resurfaced-idea` (S; one idea the owner has not touched in a while), `recent-renders` (M), `lab-status` (S, later).

**Palette**: capture idea, go to Ideas, Projects, Lab, Studio, Notes; search ideas, projects and notes.

**Quick actions**: `capture-idea`.

**Capture sources**: a photo of a whiteboard or sketchbook page becomes an idea with the photo attached (Phase 2); a shared URL becomes an idea (Phase 2).

## 7. Kinds, signals, notifications, intents

Kinds: `render` (attachment, T0).

Signals: `idea.stale`, `project.updated`.

| notification | channel | cadence | default |
|---|---|---|---|
| stale-idea nudge | in-app | weekly | off |
| device maintenance due | through the routine task | per routine | on when a routine exists |

Intents handled: `toolbench.open-idea`. Intents sent: none.

## 8. Integrations

| integration | phase | access | notes |
|---|---|---|---|
| camera, share sheet | 2 | per device | idea capture |
| render folder watch (desktop) | later | local | imports new images as `render` attachments on a sketch |
| GitHub | later | read; `act-external` to create an issue, confirmed each time | issues and pull requests on a project |
| uptime probe for Lab | later | local network | device reachability for the widget |

## 9. Settings

Stale threshold in days; default idea category; render folder path; whether Lab hostnames display in lists.

## 10. Non-goals and open questions

Non-goals: an IDE, an issue tracker, kanban, dev-environment orchestration (that is Forge), code hosting, running scripts, a general note-taking app.

Open: OQ-9, for whether Rings would live here; OQ-22, for whether `find-similar` gains a graded mode.

## Handoffs

- **The phone (issue 19).** Left for later:
  - *A phone canvas for `Domains/Toolbench/Ideas`.* The story draws the desktop only; the phone's narrow layout has no mock to check it against.
  - *The floating + in select mode.* It stays up while Ideas selects (`engineering/ui-kit-components.md`, `List`).
  - *Swipe on an idea's row* (D-167), if use asks for one; today the row has its menu and a held press.
  - *The five tabs in Japanese* have not been checked for width on a phone.

## Registry rows

Appended under Toolbench: facts `skill` T1, `owned-hardware` T1, `preferred-tool` T1; entities `idea` T1, `project` T1, `device` T2, `parts-list` T1, `sketch` T1, `note` T1, `brainstorm-session` T1; kind `render` (attachment, T0).
