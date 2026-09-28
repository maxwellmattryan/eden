---
title: Orchard
status: stub
summary: Stub for the finance domain: a dashboard, budgets with housing and subscriptions as first-class categories, read-only accounts, holdings, spending trends. Specced after Phase 2. Id `finance`.
read-this-if: You need Orchard's intended scope, or you are deciding whether something money-related belongs here.
depends-on: [substrate/privacy, substrate/registry, domains/_template]
updated: 2026-09-27
---

## Purpose

Orchard will be one place to see money: accounts, spending, budgets, recurring charges and holdings, pulled in automatically where a read-only connection exists and entered by hand where it does not. Trees that bear fruit, tended rather than traded.

## Scope sketch

- A dashboard: net position, month-to-date spend by category, upcoming recurring charges, a trend line.
- Budgets with categories split into **fixed** (housing as rent or mortgage, utilities, insurance, subscriptions, supplements) and **variable** (groceries, dining, transport, fun), per D-16.
- Read-only account links (Plaid or SimpleFIN), with CSV import first so the domain works without any connection.
- Recurring-charge detection with a "is this still worth it" prompt.
- Holdings: stocks, funds, crypto, entered or imported, valued daily.
- The Gardener: explain a month, spot a trend, draft a budget from history, all `read` or `write-draft`, and off by default until granted.

## Why deferred

Orchard is T2 throughout with T3 identifiers inside, and it needs the grants ledger, the egress ledger and end-to-end sync to be real before the first account is linked (D-4). It also needs the Hearth grocery list to exist so grocery spend can be reconciled against it.

## Entities and facts, best guess

Entities: `account` (T2; the number field T3), `transaction` (T2), `budget` (T2), `budget-category` (T1), `recurring-charge` (T2), `holding` (T2). Kind: `receipt` (attachment, T2). Facts: `monthly-income-band` (T2), `savings-goal` (T2).

## Sensitivity notes

Everything T2; account numbers and tokens T3; AI reads default `never` until the owner grants per resource; never any `act-external` (no payments, D-8). Exports include transactions; the egress ledger must show provider traffic per account.

## Integration candidates

Plaid, SimpleFIN, bank CSV exports, brokerage CSV, a price feed for holdings.

## Substrate dependencies

Grants ledger UI, egress ledger, end-to-end sync (D-21), Vault for statements, the scheduler for daily valuation, Almanac for due dates as Events of a `bill-due` kind.

## When to spec

After Phase 2 ships and the owner has used Hearth's grocery list for a month, so budget categories can be grounded in real spending.
