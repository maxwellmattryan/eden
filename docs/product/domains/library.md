---
title: Leaves
status: candidate
summary: Candidate domain for reading: books, articles and papers with status, highlights and a reading routine. Id `library`.
read-this-if: You are considering a Library domain or deciding where a reading-list feature belongs.
depends-on: [substrate/primitives, domains/spirit, domains/_template]
updated: 2026-09-27
---

## Purpose

What the owner wants to read, is reading, and has read, with the passages worth keeping. The leaves of a book.

## Why it might earn its place

Sanctuary holds readings that inspire; Toolbench holds notes that instruct. A reading list is neither, and the share sheet needs somewhere to put an article.

## Entity sketch

`reading-item` (T1; kind book, article, paper; title, author, url, status want → reading → done), `highlight` (T1; text, item, note). A reading routine task. Widget `currently-reading` (S).

## Facts

`favorite-author` is Sanctuary's; Leaves would read it and write `reading-interest` (T1).

## Overlaps

Sanctuary's sources and excerpts (decide ownership on promotion), Toolbench's notes for technical reading.

## Trigger to promote

The owner shares an article into Eden and there is nowhere for it to go.
