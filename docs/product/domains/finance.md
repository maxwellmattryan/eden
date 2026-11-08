---
title: Orchard
status: draft
summary: Everything the owner owns and owes, kept current from their real accounts by Plaid on each device, with Activity, bills, budgets, debt, investments and goals, and the Gardener reading it to find where money leaks. Id `finance`, after Phase 2, built ahead of it.
read-this-if: You are working on accounts, transactions, bills, budgets, debt, investments, goals, or the Gardener for money.
depends-on: [substrate/privacy, substrate/registry, substrate/integrations, substrate/grants, substrate/tasks, substrate/ai, domains/_template]
updated: 2026-11-08
---

## 1. Purpose

Orchard is one place to see everything the owner owns and owes, kept current from their real accounts and entered by hand where no link exists. It is built ahead of its phase and before sync (D-182). Trees that bear fruit, tended rather than traded. The one thing it must do well: **every account current and every figure exact, with the Gardener quoting the numbers, never adding them up.**

## 2. User stories

MVP is the shortest path to real transactions in Activity: #67 → #69 → #70 → #71 → #72 → #73 → #75 → #77 → #78 → #79 → #83.

- MVP: Link my banks and cards through Plaid on this device and see every account with its balance and when it last updated (#71, #73).
- MVP: See every money event across every account in one feed, filtered any way, with totals and charts that follow the filter (#77, #83).
- MVP: Have purchases categorised, merchant names cleaned and transfers matched, and fix a category once so the rule remembers it (#75).
- MVP: Photograph or drop a bill's letter, check the text read on the device, and have the bill drafted and later marked paid by its payment (#72, #78).
- MVP: See my subscriptions, what they cost and which went up (#79).
- MVP: Import older months from a CSV, OFX or PDF statement (#74).
- Later: Budget the month from my history, with fixed lines from bills and sinking funds (#84).
- Later: See net worth over time, cash flow and the low point before payday (#87), and goals with when each is reached (#88).
- Later: See debts with APRs and promo ends and a payoff plan (#86); holdings, crypto and retirement limits (#76, #81, #82).
- Later: Ask the Gardener where the money went and what a change would do, and get a weekly digest (#90).

## 3. Entities

Everything is T2 unless marked. T3 is stored only on the device, and no tool ever returns it. Every amount is Money (below).

| entity | key fields | tier | links out |
|---|---|---|---|
| `provider-link` | one provider login on this device (a Plaid Item): institution with logo and colour, status, consent expiry, sync cursor, last updated; the token sits in the secret store, T3 (D-184) | T2 | |
| `account` | type and subtype, currency, last four digits, institution, the owner's share, open or closed, the account it replaced; the full number is T3 | T2 | `provider-link` |
| `file-import` | one per file read: its fingerprint, what it was (statement, letter, CSV), the account and period, how many rows it made, when; the file is not kept (D-189) | T2 | `account` |
| `balance-snapshot` | one per account per day, the history behind net worth | T2 | `account` |
| `transaction` | amount, raw and cleaned merchant, day and time where given, pending, category, kind, split parts, transfer pair, bill link, notes, flags | T2 | `account`, `merchant`, `budget-category`, `bill` |
| `budget-category` | name, fixed or variable (D-16), essential or not, sinking fund | T1 | |
| `category-rule` | a pattern and the category it maps to, learned from the owner's fixes | T2 | `budget-category` |
| `merchant` | the cleaned name and the raw names merged into it | T2 | |
| `money-rollup` | sums by month × category, merchant and account, daily totals; rebuilt from transactions in memory, never stored as rows, never edited, never exported (D-194) | T2 | |
| `bill` | payee, period (`YYYY-MM`), due day (none is Expected), amount, estimate or actual, source (a letter, a card statement, a series, by hand), how often it repeats and whether its amount is fixed, its series, a card statement's card, minimum, statement day and interest, the payee's site (`https://` only), its payments (each a matched transaction with its account, or one paid another way), the payments it asks about and the ones dismissed, and the Orchard task for its due day; the state is derived, never stored (D-196); a policy number is T3 | T2 | `transaction` (`billId`), `account`, Task (`about`, #78) |
| `recurring-charge` | cadence, expected amount, last seen, price changes, kept or cancelled | T2 | `merchant` |
| `budget` | per month and category: amount, rollover, sinking-fund target | T2 | `budget-category` |
| `liability` | APRs with promo end dates, statement balance, minimum due, due date, credit limit, loan terms | T2 | `account` |
| `holding` | quantity, cost basis, value | T2 | `account`, `security` |
| `security` | a ticker or coin and its daily price history, in its own currency | T0 | |
| `asset` | anything not linked: cold-storage crypto by quantity or watched address, a car, a home; entered once, valued where possible; an xpub is T3 | T2 | |
| `income-source` | a detected paycheck: employer, cadence, expected net amount | T2 | `account` |
| `savings-goal` | a savings rate, or a target with an amount and a date, earmarked within an account | T2 | `account` |
| `contribution-limit` | the yearly limits for 401(k), IRA and HSA | T0 | |
| `spending-watch` | a threshold on a category, merchant or account that raises Orchard's own signal | T2 | `budget-category`, `merchant`, `account` |

Orchard is read-only: Eden asks Plaid only for products that read, no Auth and no Transfer, so even a stolen token cannot move money (D-8). Every account shows when it last updated, and a broken link becomes a reconnect prompt, never a wrong number.

### Money

D-188 is the model. What Orchard adds:

- A value is `{ minor: -4217, currency: 'USD' }` in code: 2 decimals for USD and EUR, 0 for JPY.
- Plaid reports a currency per account, and a row takes its account's; a manual row asks for one, defaulting to the home currency.
- A holding's or an asset's value is its quantity × the security's price, in the home currency once the price is.
- Hide amounts (#68) masks every figure on both apps without changing what is stored.
- Built in #75 (D-193): a pass after every sync that wrote transactions (`finance.classify()`) gives each live `transaction` its own keys: `kind`, `merchantId`, `counterparty`, `categoryId` with `categoryBy`, `transferId`, `refundOf` and `review`; the owner's fixes add `repays`, `reimbursable`, `parts`, `oneOff`, and the sync adds `replaced` on a posted row that took over a pending one. `budget-category`, `category-rule` and `merchant` are live rows, the defaults seeded once. The modules: `merchants.ts` (cleaning and vague brands), `categories.ts` (defaults and the provider mapping), `classify.ts` (the pass, `spendingOf`, `fitParts`, `ruleFor`), `edits.ts` (the owner's fixes) and the store's methods over them. No page shows them yet (#83).
- Built in #77 (D-194): the index and query engine, `ledger.ts` in `packages/shared/src/domains/finance`, pure TypeScript. `buildLedger` turns the live transactions, the accounts, the merchants and the home currency into a `Ledger` of one entry per money event: a row, or a transfer or card-payment pair as one entry whose id is the money-out side's (`pairId` the money-in side's, `accountId` from, `toAccountId` to; `ledger.entry(id)` finds it by either side). Every figure is a sum of lines, a row's split parts or the row, a pair's two sides. The account filter is the scope: a pair with both sides in it adds nothing to `in`, `out` and `net` and shows its out side; one side in it adds and shows that side. `spending` is `spendingOf` over the matched lines; `average` leaves one-off lines out; only home-currency lines enter a total, the rest go in `left` per currency and their rows carry `other-currency`. `queryLedger(ledger, query)` answers the measures over everything matched, a page of `rows` (`newest`, `oldest`, `largest`; 50 by default, at most 1000) with `flags`, `groups` by one or two of `category`, `merchant`, `account`, `kind`, `month`, `week`, `weekday`, `day`, and a `versus` period by one non-time key; an invalid query throws `LedgerQueryError`. `TxFilter` holds every Activity filter, full text folded and matched by substring per word; `parseSearch` reads `>N`/`<=N` words as amount bounds and `periodOf` the four presets. `rollupOf` is the `money-rollup` resource (month × category, merchant or account, and daily), memoised per ledger and never stored; `typicalOf` is the mean month over the complete months before. The store holds the live rows in memory, read once by the first `query()`, pass or fix, and re-reads exactly the transactions each batch it sends names (`touchedTransactions`); `finance.ledger` is derived from them, `finance.ledgerReady` says when it holds them all, and the pass and the fixes read from that map.
- Built in #74 (D-195): a `file-import` is one statement file brought in: `source: 'file'` with the file's SHA-256 as its `externalId`, so the engine refuses a second live record of the same file, and a payload of `what` (`csv`, `ofx`, `pdf` or `picture`), `accountId`, `from`, `to`, `rows`, `matched`, `skipped` and `at`. A row read from a statement is an ordinary `transaction` with no `source` (a statement line has no stable id) and one key of its own, `importId`, the `file-import` that made it, so the undo and later audits find it. `file-import` stays out of the export.
- Built in #78 (D-196): `bill` and `file-import` rows (a letter's is `source: 'document'` with the fingerprint as its `externalId` and the `billId` it made, so a read is known by `queryEntities({ type: 'file-import', source: 'document', externalIds: [fingerprint] })`; deleting the bill tombstones it, so the letter can be read again). A transaction's `billId` is #78's own key, kept by a sync; an unpaired money-out row with one is a `bill-payment`, which still counts in `spendingOf`. The modules: `bills.ts` (state, settled, remainder, overpaid, the next occurrence and its estimate, the draft, `sameBill`, the ops), `match.ts` (`payeeMatches`, the window, the candidates, `matchOps`, Mark paid's `paymentChoices`), `bill-pass.ts` (`billPassOps`: statement interest, matching, the series, the tasks, the signals, with their inverse) and the store's methods over them.
- Built in #71 (D-191): `@eden/shared/money` holds the type and its arithmetic, proven by `money.vectors.json`. A balance is kept as the bank states it and the kind (credit card, loan) says it is owed; a share is in basis points; a `balance-snapshot` is upserted per account per local day through the account's `lastSnapshot`, and the store never reads snapshots. The home currency is a setting a bundle carries; an account or asset in another stays out of totals and the page says so.

### Encryption (#69)

The database is SQLCipher already, and since Orchard keeps no files (D-189) the database is all there is to protect. Three gaps matter once real money is in it:

| gap today | fix |
|---|---|
| On desktop the database key is a file, `db.key`, beside the database; anyone who can read the user folder can open it. | The key moves into the macOS Keychain on signed builds, as the secret store already does; dev builds keep the file. |
| Exports and backups write transactions as plain JSONL. | An optional passphrase on export; without one, the export dialog says plainly that the file is readable by anyone who has it. |
| Logs and diagnostics could pick up amounts or merchants. | No finance values in logs, and the diagnostics export is checked for them. |

Claude Code keeps conversation transcripts on the Mac in plain text, including what the Gardener's tools returned. #90 says so where the finance grant is given, and the owner can shorten how long Claude Code keeps them in its own settings. A document read is not a conversation and leaves no transcript (D-190).

## 4. Facts

Written: `monthly-income-band` T2, `domain-derived` from `income-source` rows (#80).

Read: none.

## 5. Gardener tools and guardrails

Orchard's reads are `never` until the owner grants them (D-182). The finance grant, the brief and the tools are #90.

| tool | reads | access | confirm | grade |
|---|---|---|---|---|
| `query` (`finance_query`): rows or sums over any filter Activity has, grouped by category, merchant, account, month, week or weekday; a `versus` period puts two side by side, sorted by what changed most | `transaction`, `account`, `budget-category`, `merchant`, `money-rollup` | read | none | plain |
| `recurring` (`finance_recurring`): repeating charges, cadence, last amount, price changes, overlaps | `recurring-charge`, `transaction`, `merchant` | read | none | plain |
| `bills` (`finance_bills`): expected, upcoming, overdue and paid bills, and the payment that paid each | `bill`, `transaction`, `account`, `liability` | read | none | plain |
| `forecast` (`finance_forecast`): each account's balance day by day and the low point before payday; given `changes`, when a goal is reached and the interest saved | `account`, `balance-snapshot`, `bill`, `income-source`, `recurring-charge`, `liability`, `savings-goal`, `budget` | read | none | plain |
| `wealth` (`finance_wealth`): net worth over time, holdings and allocation, debts and APRs, contributions against limits | `account`, `balance-snapshot`, `holding`, `security`, `asset`, `liability`, `contribution-limit` | read | none | plain |
| `flags` (`finance_flags`): precomputed oddities: fees, interest charged, duplicates, new merchants, unusual amounts; price rises are `recurring`'s | `transaction`, `money-rollup`, `merchant`, `account` | read | none | plain |
| `draft` (`finance_draft`): a batch of drafts: a budget from history, a goal, a bill from confirmed text, rules from the owner's fixes, a merchant merge, a watch | `budget`, `budget-category`, `category-rule`, `merchant`, `savings-goal`, `bill`, `spending-watch`, `money-rollup` | write-draft | one batch card (D-108) | `light` |
| `read-statement` (`finance_read-statement`, built in #74): the transaction lines of a statement the owner is importing, from the confirmed text or the picture; a page's own run from Import, refused in a conversation (D-194) | none | write-draft | none: nothing is written until the owner imports | `light`, needs `vision` |

That is the seven tools #90 builds plus `read-statement`, which is already declared. It is strict, with `text` and `currency` both required, so it spends none of the strict tools' optional parameters.

`finance_query` calls `queryLedger` (D-194), the engine Activity and Overview read, so the Gardener quotes the same sums the pages show.

Built in #78: `finance_draft` drafts one bill. It takes `{ text? }`, needs `vision`, reads nothing yet, sits in `LOOSE`, and answers a `{ kind: 'bill', bill }` card or `failure: 'empty'` for what is not a bill. It reads files only on a page run (Capture a bill, with no thread), never an attachment in a conversation (D-189); there the card's keep opens the Bills tab with the bill form filled, and the card settles when the owner saves or cancels it. The delegate is `domains/finance/tools.ts`, its parse `billDraftOf`. #90 widens it to its batch and gives it reads.

Three substrate tools are reused, not added: `draft-tasks` for reminders such as "cancel Hulu before the 14th", which takes an optional `about: { type, id }` naming the row a task is for (built in #78: a type in the conversation's reach, an entity type, a live row; the task is linked `about` it under its name, and a bill's Task closes when the bill is paid); `read-rows` for rows by id, where `finance_query` is for filters; and `agenda`, unchanged, where a bill's Task shows like any other. There is no compare, plan, remind or watch tool: those are `versus`, `changes`, `draft-tasks` and a row in `finance_draft`. The six read tools answer from numbers Eden has, so they declare no grade (D-74); `finance_draft` declares `light` because bill capture runs it as a tool run from a page, with the confirmed text (`engineering/gardener.md`).

The Gardener works top down, in four layers, so the model never does arithmetic it could get wrong. **The brief** (about 1.5k tokens, rebuilt after every sync) is always there: accounts and balances with when each updated, net worth and its month change, this month against typical by category, bills due in 14 days, budget status, goals, the next paycheck and anything flagged. **Rollups** are computed on sync and read by tools. **Calculators** (`forecast`, `versus`) do the math the model asks for. **Rows** come last, filtered, capped at 50, with the count and total of everything that matched. Rows are read on demand (D-148) and uniform rows go as tables (D-151); the clock heads the message (D-147). The tools join the fixed list in one order (D-150), `finance_draft` in `LOOSE` on D-108's terms, so the strict budgets are untouched. On the Mac they reach Claude Code over the MCP bridge (D-179). The eye on the reply lists the rows and tools it read (D-149), and an answer can link to the matching Activity view (#24).

```
# rows · 2 of 14 matching · total -90.95 USD · example
id     |date      |merchant   |amount|category|kind    |account   |flags
t_8k2q |2026-11-06|Blue Bottle|-6.75 |dining  |purchase|chase-card|pending
t_7m1x |2026-11-03|Sushi Ota  |-84.20|dining  |purchase|chase-card|split,reimb:42.10
```

```
# finance brief · as of 2026-11-06 14:00 · USD · example
net_worth 48,210.33 (+1,104.20 this month)
# spending, month to date vs typical
category |mtd   |typical|budget
dining   |312.40|268.00 |300.00
```

T3 never appears: accounts are named by bank and last four digits.

Never-do list: never moves money or pays a bill (D-8); never returns a T3 field; never advises buying or selling securities, only explains the owner's own numbers and options; never sums rows itself, since every figure in an answer comes from a tool; never sends a document before Read, and then only the confirmed text or the picture the owner chose (D-190).

The weekly digest, from the same tools on a schedule, and the flag signals as they appear are #90's.

## 6. Surfaces

**Desktop and phone pages** under `/finance`: Overview (#87: net worth, cash flow, the forecast), Activity (#83), Accounts (#71), Bills (#78), Budget (#84), Debt (#86), Investments (#76), Goals (#88). The phone's pages come in #89, with its own Plaid links (D-184).

**Sheets**: the Link sheet (#73), Plaid Link in Eden's colours; the read-and-confirm sheet (#72), a letter, statement or pay stub as text to check (D-190). **Garden widgets** come in #87, which sets their sizes. **The phone lock and privacy cover** (#68, D-185), with the hide-amounts toggle on both apps.

**Mocks** (#70, D-54): `Domains/Orchard/{Overview,Activity,Accounts,Bills,Budget,ReadConfirm}` in `packages/ui-kit/src/stories/domains/finance/`, over Orchard's sample data (`design/sample-data.md`, Orchard). They are the reference the later issues build against. The tabs are the five mocked pages; Debt, Investments and Goals take their place when #86, #76 and #88 mock them. What the mocks leave to others: grouped in/out bars for Overview's Cash flow (#87; `BarChart` only stacks, so Overview shows Out as bars and In, Out and Net as Stats); a kit progress meter for budget lines (#84; the mock's meter is story-local); the transaction detail (#83; rows in the mock have only a menu); the header motif (D-123); the tab list growing to eight when Debt, Investments and Goals land.

### Activity

One feed of every money event across every account, with a title, a kind and the bank on every row. The totals and charts follow the filter.

- **Kinds**: purchase, refund, transfer, card payment, bill payment, paycheck or income, interest earned, dividend, interest charged, fee, investment buy, investment sell. The icon says it first (from the kit's `icon-list.json`), the second line says it in words for screen readers and search; costs (interest charged, fees) tint red, money earned green. #75 derives purchase, refund, transfer, card payment, income, interest earned, dividend, interest charged and fee (D-193); #78 derives bill payment from a row's `billId` (D-196); the investment kinds are #76's.
- **Badges**: one account involved, one badge; two of the owner's accounts (a transfer, a card payment), two badges from → to, one row and never two. Filtered to one account, the row keeps both badges and the sign is that account's side. Money to someone else shows the owner's account and the payee as the row's name. Every row has a title: the merchant or payee, or for a move between the owner's accounts the kind itself. Bank pills use the institution's logo and colour from Plaid, with the last four digits, and are a one-click filter.
- **Filters**: a filter button at the end of the search row, showing how many are on, opens the kit's `Popover`; active filters are removable chips under the search, with Clear. When (presets or a range), where (bank, account, card), what (category, merchant, kind), how much (over, under, between), state (pending or posted; recurring, part of a bill, one-off, reimbursable, uncategorised) and text (merchant, description, notes; `/` focuses it, `>100` filters by amount). Filters are **kept for the session in memory only**: they survive moving between pages and are gone when the app quits. A Gardener answer or a signal can open Activity filtered (#24), joining the session's filters.
- **Insights beside the feed**: spending over time stacked by category, top merchants with count and average ticket, this period against the typical one per category, money in and out by month.

### A bill, from letter to paid

Expected (an EOB or an estimate) → Upcoming (a letter, rent, a card statement) → Due soon (a Task in Today, D-186) → Overdue → Paid (a matching payment). Any state before Paid moves straight to Paid when a matching payment shows up.

1. **Capture.** The owner drops or photographs the letter; it is read on the device and masked (D-190), the Gardener drafts the bill from the confirmed text, and the owner confirms. The file is dropped (D-189).
2. **Same bill twice.** A corrected letter for the same payee and period updates the bill.
3. **Paid by itself.** An outgoing payment close in amount and payee, near the due date, marks it paid; an ambiguous match asks.
4. **Estimate then actual.** A bill whose amount changes carries an estimate from its history until the real figure arrives.
5. **One-off or repeating.** A letter is usually one-off; rent is created once, or detected, and repeats monthly.
6. **Each card is a repeating bill.** A closed statement's balance, minimum and due date become that month's bill; a zero statement means nothing is due.
7. **Paying a bill with a card.** The card charge pays the bill and the card's next statement carries the money; spending counts once, at the charge, and paying the card is a transfer.
8. **Never paid by Eden.** A bill can link to the payee's site; paying is always the owner's (D-8).

Built in #78, on the rules of D-196:

- **The Bills tab** (`/finance/bills`, `views/Bills.svelte`), the second of Orchard's tabs in a `Segmented` row, on both apps. The groups, their counts, the row text, the menu (Mark paid, Edit, Not this payment, Stop repeating, Open payee's site, Delete), the empty state and the ambiguous Notice follow the `Domains/Orchard/Bills` mock; every figure goes through `formatMoney` and Hide amounts. The header on Bills captures a bill (primary) or adds one; Accounts keeps its own; the stale-link Notice and the keys button are page-wide.
- **The bill form** (`views/BillSheet.svelte`), laid out as the account form: payee, amount and currency, due day, estimate, repeats with "the amount stays the same", a card (its minimum then) and the payee's site. On a capture it shows Drafting, then the form filled from the answer, saying "Updates the … bill for …" when a live bill has the same payee and period; a failure says why in the page's words with "Enter it by hand".
- **Mark paid** (`views/PaySheet.svelte`) lists up to 20 payments in the window, the payee's first, then by how close each is to what is left; "Paid another way" records what is left, today, with no transaction. Not this payment takes a match off and dismisses it.
- **Capture a bill** (`capture.svelte.ts`, `billCapture`) opens the reader with `confirmLabel` "Draft the bill", `next`, the provider line from `runtime.previewDirect('finance.draft', …)` and `known` from the `file-import` rows, then runs `finance.draft` from the page with the confirmed text, or with the picture as in-memory `ToolFiles` read once and let go (nothing in `attachments/`). Save writes the bill and its `file-import` row in one batch with one undo; Cancel writes nothing.
- **The bill pass** (`finance.billPass()`), one queue job: when the shell starts, each morning (`finance.bills`), after each sync (after the classification) and inside every owner write to a bill, whose undo takes back what the pass made of it. Orchard writes a bill's todo itself, so no payee lands in the Garden feed, then emits the task signals and reloads Today. A failure is logged by its code.
- **Card statements**: each sync asks `/liabilities/get` of an Item with a credit account (§8) and `statementOps` in `sync.ts` writes one `bill` per card and statement day, its payee the card's name and its period the statement's month. A card entered by hand gets its statements from Add a bill or a capture (a letter naming an open card's last four digits becomes that card's).

**Quick actions and palette**: none specced yet; #83 and #87 decide them. **Capture sources**: a dropped or photographed document into the read-and-confirm sheet (#72); a CSV, OFX or PDF statement into the import (#74).

### The document reader (#72)

Built once for bills (#78) and statement import (#74), which only mount it. It follows D-190: a document is read on the device, its numbers are masked there, and only the text the owner confirms, or the picture they choose to send, leaves the sheet. It stores the file's fingerprint nowhere itself (D-189).

- **What reads where.** The crate command `read_document` (`src-tauri/src/domains/finance/`) takes one file's bytes, with its type in the header `x-eden-mime`. It makes no network call, writes no file and logs none of the text: a failure is logged by its code only. A PDF's text layer is read on every platform (`pdf-extract`). A scan, or a text layer averaging under 20 letters a page, is rendered and recognised, up to 20 pages. So is a photo (JPEG, PNG, WebP; EXIF orientation applied). On macOS and iOS that is Vision through `swift/EdenTextReader`, and on Android ML Kit's bundled Latin model through the staged `android/EdenTextReader.kt`. Windows, Linux and the browser build have no recogniser, so a photo or a scan there is `unavailable`. A panic in the PDF library counts as no text layer, and the crash hook names no detail of it.
- **Masking**, in the crate, before the webview sees anything. A run becomes `••••` and its last four letters or digits, and the read counts the runs. The labelled rule takes a value after account, acct, a/c, policy, member, subscriber, customer, card, group or meter (with number, no., #, id). The value needs a digit and 5 or more letters and digits. The unlabelled rule takes any digit run of 9 or more, except an amount, a date or a time, a phone number or a ZIP+4; a `.`, `,` or `:` makes a run an amount or a time only with a digit beyond it, so a sentence's full stop or `SSN:` does not. The rules match on a copy where every Unicode space is a space, every Unicode dash a hyphen and every full-width character its ASCII twin, so a no-break space, a thin space, an en dash or full-width digits never split a number. An issuer's own `XXXX1234` is left as it is. The rules and their table test are in `mask.rs`.
- **Quality and failures.** A read is `poor` with fewer than 40 letters, a recognised confidence under 0.6, or a text layer more than 2 % unreadable glyphs. The failures are data: `unsupported` (HEIC too), `too-large` (the caps of `gardener/attachment-limits.ts`), `locked`, `no-text`, `unavailable`.
- **The sheet** is the kit's `DocumentSheet` (`engineering/ui-kit-components.md`). Its states are Collect (one document at a time), Reading, Read, Read badly (the picture becomes the primary button), Could not read (`no-text` and `unavailable` offer the picture, the others only Cancel) and Already imported (Close only). The `Domains/Orchard/ReadConfirm` mock renders through it.
- **The session** is `documentRead` in `@eden/shared/domains/finance`. A caller awaits `documentRead.read({ confirmLabel, next, known?, preview? })`. The result is `{ kind: 'text', text, fingerprint, name, mime }` on confirm, with the text as edited, or `{ kind: 'picture', bytes, fingerprint, name, mime }`, or `undefined` for Cancel, Close or a dismissed sheet. The fingerprint is the SHA-256 hex of the bytes, worked out first. `known(fingerprint)` answering `{ day, detail }` goes straight to Already imported. The bytes are held in memory and let go when the session settles, and a read that answers after Cancel is dropped.
- **Mounting it** (#78, #74). The view binds `DocumentSheet` to the session field for field: `bind:open={documentRead.open}`, then `phase`, `quality`, `failure`, `file`, `bind:text={documentRead.text}`, `masked`, `pages` and `imported`. `confirmLabel` and `next` come from `documentRead.options`, and the provider line is worked out from `options.preview` by `readerOf`, which #78 moved to `shell/gardener/reader-line.ts` (Hearth's `words.ts` re-exports it). The callbacks map as `onfiles` to `take`, `onconfirm` to `confirm`, `onsendpicture` to `sendPicture`, and `oncancel` and `onclose` to `cancel`. Built for bills in `views/Orchard.svelte` (#78).

### Statement import (#74)

D-195. Plaid reaches 24 months at most (D-187); older months, and accounts Plaid cannot see, come from a bank's CSV, OFX or QFX export or a PDF statement.

- **Entry points**, on both apps: **Import** in the page header after Add asset, shown while there is at least one account, and **Import a statement** in each account row's menu, open or closed, after the account's own actions and before Close account and Delete. The row's opens the sheet with that account chosen.
- **The sheet** is `views/ImportSheet.svelte` over the session `statementImport` (`statement.svelte.ts`). Collect takes an account and one file (`IMPORT_ACCEPT`: CSV, OFX, QFX, PDF, JPEG, PNG, WebP; a CSV or OFX up to 5 MB, a PDF or picture within the reader's caps) and starts the read on whichever comes second; there is no Continue. Review shows the account, the period, "n new rows · m already in Orchard", money in and out through Hide amounts, the lines left out, an OFX's other account number as a warning, the first 10 new rows, and for CSV, PDF and picture the **Charges are positive in this file** toggle, which starts on for a card or loan whose rows are mostly positive. The summary card is a polite live region. Import writes; with nothing new the primary is Done, which still records the file. Already imported and Couldn't import end in Close.
- **CSV and OFX** are read on the device with no model: `csv.ts` (RFC 4180, `;` or tab, up to 10 preamble lines, the header aliases, signed amount or debit and credit, brackets and CR/DR, Y-M-D, M/D/Y or D/M/Y for the whole file) and `ofx.ts` (SGML or XML, one statement, its `CURDEF` the account's, a duplicate `FITID` kept once, the account number's last four compared in memory and never kept). Failures: `no-columns`, `no-rows`, `too-many` (over 5,000), `currency`, `several-accounts`, `unreadable`.
- **A PDF or a picture** goes through the document reader: the import sheet closes, `documentRead.read` opens `DocumentSheet` with "Find the rows" and `known: finance.knownImport`, and `documentRead.take([file])` hands it the same file. The confirmed text, or the picture, runs `finance.read-statement` as a page tool run, and the import sheet opens again on Reading and then Review. A file imported before is Already imported inside `DocumentSheet`.
- **Matching** follows D-195 and is `matchRows` in `statement.ts`, with `sameDescription` comparing the descriptions through `merchants.ts`. Matched lines are counted and never written.
- **The write** is one queue job in the store (`importStatement`): it reads and matches again, writes the rows and the `file-import` in batches (the record last), then runs `classify()`. The toast's Undo deletes every row the import made and the record, then runs `classify()` again, so the same file reads again. A failed write sets `saveFailed`, and the page's Retry runs the job again. No log carries a name, a description or an amount.

## 7. Kinds, signals, notifications, intents

Kinds: `bill-due` (event, T2), once Almanac exists (D-186). Orchard registers no attachment kind (D-189).

Signals, each `finance.<id>`:

| signal | when | emitted from |
|---|---|---|
| `link-broken` | a provider link needs reconnecting (`reason: 'needs-reauth'`), or its consent ends within seven days (`reason: 'expiring'`, `by` the day); payload `{ uris: [link uri], institution, reason, by?, byDay? }`, keyed `<link>:needs-reauth:<lastSyncedAt>` and `<link>:expiring:<consentExpiresAt>`; built | #73 |
| `bill-due` | a bill enters Due soon; payload `{ uris: [bill uri], payee, dueDay }` (`dueDay` formatted, never an amount), keyed `<bill>:due:<due day>`; built | #78 |
| `bill-overdue` | from the day after a bill's due day, unpaid; the same payload, keyed `<bill>:overdue:<due day>`; built | #78 |
| `flag` | a new fee, interest charged, a duplicate or an unusual amount | #90 |
| `price-rise` | a recurring charge costs more than last time | #79 |
| `watch-crossed` | a watch's threshold is passed | #90 |
| `low-balance` | the forecast dips below zero before payday | #87 |
| `limit-missing` | next year's contribution limits are not in yet | #82 |

| notification | channel | cadence | default |
|---|---|---|---|
| a link needs reconnecting (`link-needs-reconnecting`, built: "Chase needs you to sign in again", "Chase asks you to sign in again by Mon 2 Nov"; the warning glyph, Open goes to Accounts) | in-app | when found | on |
| a bill due soon (`bill-due-soon`, built: "Texas Gas Service is due Thu 1 Oct") | in-app, and its Task in Today | when it enters Due soon | on |
| a bill overdue (`bill-overdue`, built: "Texas Gas Service was due Sat 26 Sep") | in-app | once, the day after | on |
| a flag or a price rise | in-app | when found | on |
| a watch crossed | in-app | when crossed | on |
| a low balance ahead | in-app | when the forecast changes | on |
| the weekly digest | in-app | weekly | off until the finance grant (#90) |

Schedules: `sync` hourly while Eden runs and when it opens (D-183; built in #73, `every: 3600`, with the one-shots `finance.retry` and `finance.revoke`, D-192), `bills` daily at 08:00 for the bill pass on both apps (built in #78), `value` daily for prices (#76), `digest` weekly (#90).

Intents handled and sent: none yet.

## 8. Integrations

| integration | access | sends | receives |
|---|---|---|---|
| Plaid: Link, Transactions, Liabilities, Investments | read only, no Auth or Transfer (D-8); token T3 per device (D-184) | the Link token request, the cursor | accounts, transactions, liabilities, holdings |
| Chase, Ally, M1, a 401(k) | through Plaid; Chase by OAuth | | as Plaid |
| Coinbase | read-only API key, T3 per device | the key's requests | balances, trades |
| price feeds: Plaid securities, a crypto price API | read | tickers and coins | daily prices |
| blockchain explorers | none, read | public watched addresses | public balances |
| Claude, the Gardener | the finance grant (#90) | tool results and confirmed text only | answers, drafts |
| on-device text recognition (Vision, ML Kit) | none, no egress | | text (D-190) |
| SimpleFIN | later, behind the provider seam | | |

Every call is made from Rust and counted in the egress ledger; the webview only ever sees a short-lived Link token. The crate's provider seam is one trait (link, sync accounts, sync transactions by cursor, liabilities, holdings, revoke), so Orchard above never knows which provider a row came from.

### Plaid on the desktop (#73, D-192)

- **Where.** The desktop under Tauri binds Plaid (`bindPlaid`, `packages/shared/src/domains/finance/plaid.svelte.ts`); the phone binds nothing until #89, and `yarn dev:web` has no crate, so `plaidStatus()` answers nothing there. The crate is `src-tauri/src/domains/finance/` (`plaid.rs` the client over a `Transport`, `provider.rs` the shapes, `mod.rs` the commands `plaid_status`, `plaid_set_keys`, `plaid_clear_keys`, `plaid_link_start`, `plaid_link_poll`, `plaid_sync`, `plaid_revoke`, `plaid_sandbox_reset_login`).
- **Environment per build.** `production` uses `https://production.plaid.com` and the production secret; `development` and `staging` use `https://sandbox.plaid.com` and the Sandbox secret. Nothing switches it. `plaid_sandbox_reset_login` (the Sandbox's "Ask to sign in again") is refused in a production build.
- **Keys and tokens** (T3, per device, D-184), in the secret store: `plaid-client-id`, `plaid-secret-sandbox`, `plaid-secret-production`, `plaid-user-id` (the device's random `client_user_id`) and `plaid-item-<link id, lowercased>` for each access token. Keys are tried against `/institutions/get` and stored only if Plaid accepts them. The webview gets a link token, the hosted page's URL and whether keys exist; the public token never leaves the crate.
- **Link.** Hosted Link in the system browser for every bank, Chase's OAuth included. `/link/token/create` asks for `products: ["transactions"]`, `additional_consented_products: ["liabilities", "investments"]`, `transactions.days_requested: 730` (D-187), `country_codes: ["US"]` and `hosted_link.completion_redirect_uri` set to `PLAID_REDIRECT_URI` (`https://eden.palekodama.studio/plaid/oauth`); `redirect_uri` is left out, since Hosted Link handles the OAuth return on Plaid's side (if the Sandbox OAuth bank refuses a hosted session without one, set it to the same constant and say so here). Update mode (Reconnect) sends the link's own `access_token` and no products, so the Item, the row and the accounts stay the same. The sheet polls `/link/token/get` through the crate every 3 s for up to 30 minutes; closing it does not end the session. A finished session is exchanged in the crate, which reads `/item/get`, `/institutions/get_by_id` with optional metadata (the colour and the logo) and `/accounts/get`; a failed read removes the new Item again.
- **Sync** (D-183): on launch, hourly through `finance.sync`, and on retries, one link after another, one run at a time. Each run asks, per link, `/item/get` (status and consent), `/accounts/get` (cached balances) and `/transactions/sync` from the cursor, 500 a page while `has_more`, restarting from the run's first cursor on `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` at most three times. After the pages, an Item with a credit account is asked `/liabilities/get` once (#78): each card's `last_statement_balance`, `minimum_payment_amount`, `next_payment_due_date` and `last_statement_issue_date` cross as `statements`, in the account's currency, and any failure (`PRODUCTS_NOT_SUPPORTED`, `ADDITIONAL_CONSENT_REQUIRED`, a 500, no answer) leaves them empty, is logged by its code and never fails the run. In production the first call starts that Item's Liabilities billing (D-195). Never `/accounts/balance/get` or a paid refresh. Amounts cross as decimal strings and become Money through `parseMoney(text, currency, 'en')`; one with more decimals than its currency is skipped (`finance:bad-amount`), as is a balance with no ISO currency (`finance:unsupported-currency`).
- **What a run writes** (`sync.ts`): a new account per unseen Plaid account (kind from `kindOf`, the mask as `last4` when it is four digits, share 100%), name and last four kept current, a moved balance or the day's first through `balanceOps`; a closed account is never reopened and one Plaid stops reporting is left alone. Transactions are ordinary `transaction` rows with `source: 'plaid'` and `externalId` the `transaction_id`, upserted (a replay changes nothing), their amount negated (money out is negative); a modify overwrites only Plaid's keys and keeps the rest; a removed one is tombstoned; a posted one takes the pending row's other keys. The link's `status: 'ok'`, `lastSyncedAt`, `failures: 0`, `consentExpiresAt` and the cursor go in the last batch, so a run cut short replays from the old cursor.
- **Failures.** `needs-reauth` (`ITEM_LOGIN_REQUIRED`, `PENDING_DISCONNECT`, `PENDING_EXPIRATION`, `INVALID_ACCESS_TOKEN`, an ended consent) at once; any other failure keeps the data and adds to `failures`, `error` from the third in a row; retries at 1, 5, 15 and 30 minutes (`finance.retry`), then the hourly run. `lastErrorCode` holds the code. The codes: `needs-reauth`, `invalid-keys`, `rate-limited`, `institution-down`, `provider-down`, `network`, `other`, `no-keys`, `not-found`. With no keys a run does nothing.
- **Remove link** sets `finance.revoke` two minutes out; it and the start of each run call `/item/remove` for every Plaid link tombstoned at least two minutes ago that still has a token here (a younger one waits, so its Undo stays true), then delete the token (`ITEM_NOT_FOUND` counts as done). A link Undo brought back is live and left alone.
- **Egress and logs.** Every request is counted under `plaid`. Logs carry codes and Plaid's `request_id`, never a body, a name, an amount or a token; the redaction also scrubs `link_token`, `client_id` and bare Plaid token shapes.

### Freshness and history

Freshness is D-183: a purchase shows within an hour of Plaid having it. History is D-187: the window is set when a link is made, so it is asked for every time, and a new account with a week of history works like any other.

## 9. Settings

- Home currency (D-188), built in #71 under Settings → General, default USD, carried by a bundle (D-191).
- Plaid keys on this device (D-184).
- Linked providers, each with reconnect and remove.
- Hide amounts (#68).
- The phone lock (#68, D-185).
- The export passphrase (#69).

## 10. Non-goals and open questions

Non-goals: paying bills or moving money (D-8); paid Plaid re-checks (D-183); a desktop lock screen (D-185); exchange rates and currencies other than USD in totals (D-188); tax filing; a credit score; deductible tracking (Wellspring owns the plan); a second provider such as SimpleFIN; sync between devices (#40); moving Plaid links between devices (D-184).

Open: none.

## Registry rows

Under Orchard, live since #71 added the manifest (`packages/shared/src/domains/finance/manifest.json`), built ahead of its phase like Meadow (D-130), except the kind `bill-due`, whose row carries Phase 2 and waits on Almanac (D-186). Its export carries `account`, `balance-snapshot`, `asset`, `transaction` (#73), `budget-category`, `category-rule` and `merchant` (#75), `bill` and `file-import` (#78), never `provider-link`, which is this device's (D-184, D-191). The rows: fact `monthly-income-band` T2; entities `provider-link` T2, `account` T2, `file-import` T2, `balance-snapshot` T2, `transaction` T2, `budget-category` T1, `category-rule` T2, `merchant` T2, `money-rollup` T2, `bill` T2, `recurring-charge` T2, `budget` T2, `liability` T2, `holding` T2, `security` T0, `asset` T2, `income-source` T2, `savings-goal` T2, `contribution-limit` T0, `spending-watch` T2; kind `bill-due` (event, T2). The stub's `savings-goal` fact is now an entity and its attachment kind is gone (D-189).

## Handoffs

| issue | scope | needs |
|---|---|---|
| #67 | this spec, its decisions (D-182 to D-190) and its registry rows | – |
| #68 | phone lock: Face ID or passcode, required in phone onboarding (#26), re-lock after time away; privacy cover; Android screenshot block; hide amounts on both apps | #67 |
| #69 | encryption for money: the desktop key into the Keychain, an optional export passphrase, no finance values in logs | #67 |
| #70 | mock Overview, Accounts, Activity, Bills, Budget and the read-and-confirm sheet in Storybook; Orchard's sample data | #67 |
| #71 | accounts, provider links, daily balances, the asset form, the Money type with a home currency (USD built, JPY in tests); the manifest | #70 |
| #72 | document reader: a PDF's text layer, on-device OCR, number masking, the read-and-confirm sheet with "send the picture instead" | #70 |
| #73 | provider seam and Plaid: the Link sheet, cursor sync hourly and on open, 24 months, reconnect, logos; Sandbox for dev and staging; desktop OAuth (Chase) proven against Sandbox first. Owner: Plaid signup and production access, Chase OAuth registration, the Universal Link file on palekodama.studio | #71, #69 |
| #74 | import CSV, OFX and PDF statements, matched against linked rows; the file dropped, its fingerprint kept | #71, #72 |
| #75 | categories, rules, merchant clean-up, transfers, splits, refunds, reimbursements, one-offs | #73 or #74 |
| #76 | investments: holdings, daily prices, cost basis, allocation, broker moves (test M1) | #73 |
| #77 | the finance index and query engine behind Activity, Overview and the Gardener | #75 |
| #78 | bills: capture through the reader, repeating bills, card statements, matching, estimate and actual, Today tasks; the optional `about` on Tasks and `draft-tasks` | #75, #72 |
| #79 | recurring charges: detection, price changes, overlaps, offer to make a bill | #75 |
| #80 | income and life changes: paychecks, irregular income, job change, lean mode and runway | #75 |
| #81 | crypto: Coinbase, watched addresses and xpubs, quantities priced daily | #76 |
| #82 | retirement: 401(k), IRA, Roth, HSA, rollovers, limits across employers, vesting | #76 |
| #83 | Activity and insights | #77, #78, #79 |
| #84 | budgets: fixed lines from bills, variable from history, sinking funds, rollover, a trailing average on irregular income | #78, #79, #80 |
| #85 | insurance and medical bills: premiums, EOB to bill, pay-stub deductions | #78, #80 |
| #86 | debt and cards: APRs and promo ends, card usage, payoff plan, loans Plaid cannot see | #73, #78 |
| #87 | Overview: net worth over time, cash flow, the low-balance forecast, Garden widgets | #77, #78, #80 |
| #88 | goals: savings rate, targets, emergency-fund months, earmarks | #87 |
| #89 | the phone: Orchard's pages, its own Plaid links through Plaid's iOS sheet with the keys entered on the phone, how a lost phone's links are removed | #68, #73, #87 |
| #90 | the Gardener for money: the finance grant, the brief, the seven `finance_*` tools, watches as Orchard signals, the weekly digest | #77, #84, #80, #86, #82, #88 |

Critical path: #67, #69, #70, #71, #72, #73, #75, #77, #78, #79, #83. The Gardener (#90) comes last because its tools read every part.

- `substrate/tasks.md` and the `draft-tasks` schema gain `about` (#78, done).
- `substrate/ai.md` and `engineering/gardener.md` update their tool counts (#90).
- `design/sample-data.md` gains Orchard's data (#70); done, with the mocks in §6.
- Grouped in/out bars for Overview's Cash flow (#87): the kit's `BarChart` only stacks.
- A kit progress meter for budget lines (#84): the Budget mock draws its own `role="meter"`.
- The transaction detail (#83): Activity's rows in the mock open nothing.
- The header motif for Orchard's pages (D-123).
- The tab list grows from five to eight when Debt (#86), Investments (#76) and Goals (#88) are mocked.
- The manifest replaces the `finance` block of `packages/shared/src/registry/planned.json` (#71, done).
- The integrations catalog's per-row phases are revisited when #73 lands.

From #71:

- #73 binds `bindProvider` in `packages/shared/src/domains/finance/provider.svelte.ts` (the page then shows "Link a bank" and "Reconnect", and Reconnect updates the same `provider-link` row, never a new one); adds the `landmark` icon for Link a bank; ports Money to Rust against `packages/shared/src/money/money.vectors.json`; maps Plaid's type and subtype onto `ACCOUNT_KINDS`; fills `status`, `lastSyncedAt` and `consentExpiresAt`, which `linkState` reads; emits `link-broken` and the consent-expiry reminder.
- #87 needs snapshots for assets too: only accounts write a `balance-snapshot` today.
- #40 must keep `provider-link` rows on the device that made them.
- #68 masks what `formatMoney` writes; every figure on the page goes through it.
- #69 adds `extras` (the readable export) to `financeLogic` and the log check; the store already logs error codes only.
- #89: the page is already mounted on the phone (More → Orchard), with manual accounts and assets.

From #72:

- Bills (#78) mount `DocumentSheet` over `documentRead` (§6, "The document reader"). A `picture` choice becomes in-memory `ToolFiles` for the tool run, as `domains/kitchen/staging.svelte.ts` `files()` builds them from bytes, and the fingerprint is stored as a `file-import` so the next read of the same file is Already imported. On desktop that request runs as a page's tool run, which carries `--no-session-persistence` (D-190).
- Statement import (#74) does the same for a PDF statement, with its own `confirmLabel` and `next`, and the same `file-import` fingerprint.
- Left open by #72: Japanese recognition on Android (ML Kit's Japanese model), recognition on Windows (`Windows.Media.Ocr`), HEIC input, a rotated PDF page, which Vision reads as drawn, and Japanese labels for the labelled masking rule (口座番号, 証券番号, 会員番号): a Japanese number of 9 digits or more is masked by the unlabelled rule, a shorter one is not. A labelled value on the line after its label is not taken by the labelled rule either. The Android reader has been compiled but never run, and the data layer's Android checklist installs it.

From #73:

- #89 uses `PLAID_REDIRECT_URI` (`src-tauri/src/domains/finance/plaid.rs`) as the embedded iOS sheet's `redirect_uri`, and the `applinks:eden.palekodama.studio` entitlement now in `src-tauri/gen/apple/eden-app_iOS/eden-app_iOS.entitlements`; the phone calls `bindPlaid` once its own Link sheet exists. The ad-hoc provisioning profile must be regenerated with Associated Domains before the next iOS build signs.
- #76 and #86 call Investments and Liabilities on the consented Items (`additional_consented_products`), with no relink; #76 handles investments-only institutions, which cannot be linked yet since every link asks for Transactions.
- #75 owns the transaction keys that are not Plaid's (anything but `amount`, `day`, `authorizedDay`, `datetime`, `name`, `merchantName`, `pending`, `providerCategory`); a sync keeps them on modify and carries them from a pending row to its posted one.
- #74 matches imported rows against `transaction` rows with `source: 'plaid'`, found by `queryEntities({ type, source, externalIds })`.
- Money stays in TypeScript: the crate passes decimal strings, so no Rust Money port was needed (the #71 handoff above is dropped).

From #75:

- #83 builds the transaction detail over the store's methods: `setCategory(id, categoryId, { remember })`, `split`/`unsplit`, `setReimbursable`, `linkRepayment`/`unlinkRepayment`, `setOneOff`, `renameMerchant`, `mergeMerchants`, `saveCategory`; each answers an undo, a refusal's code (`split:*`, `reimbursable:*`, `repayment:*`) or nothing. Unpairing a wrong transfer is #83's too: no owner-made pair or unpair exists yet.
- Done in #77: the ledger reads `spendingOf(row)` for every spending figure, and `classify()` and the fixes read the store's row map instead of every transaction.
- #74 calls `finance.classify()` after an import.
- #90 asks about rows with `review: 'vague'` and drafts rules as `RulePayload` (`merchantId`, `counterparty` or both, and the `categoryId`).
- #78 sets `bill-payment`; #76 sets the investment kinds. The pass sets `kind` on every row it sees, so each teaches `kindOf` in `classify.ts` its own rather than writing the key beside it.
- #84 manages categories (the default set is seeded once; budget fields beyond name, group and essential are its own).
- A non-card `LOAN_PAYMENTS_*` row with no partner stays a `transfer`, so the `debt` default is only reached by a rule or the owner; #86 decides whether an unlinked loan's payment counts as spending.
- The Hearth receipt split ("a Hearth haul with a receipt can split it for you") needs a cross-domain path, since no domain hears another's signals yet, and a currency on Hearth's prices, which are cents with none. The owner files it as its own issue.

From #77:

- #83 binds Activity to `finance.ledger` (shown once `finance.ledgerReady`) and `finance.query(query)`, holds the session's filters as one `TxFilter`, reads the search box through `parseSearch(text, settings.homeCurrency, locale)` and the period chips through `periodOf(preset, todayIso())`. Setting `notes` on a row is its detail's: `TransactionPayload.notes` exists and the ledger searches it.
- #87 reads `rollupOf(finance.ledger, 'category' | 'merchant' | 'account' | 'day')` for its charts and `typicalOf(finance.ledger, { month })` for "spending vs typical"; account `share` stays net worth's and is never applied to transaction sums.
- #90 registers `finance_query` over `finance.query`, formats a `LedgerAnswer` as the D-151 table with the count and total header (`rows · 2 of 14 matching · total …`), caps `limit` at 50, and answers a `LedgerQueryError` by its `code` (`versus-group`, `period`, `amount`).
- #78 and #79 add the `bill` and `recurring` filters to `TxFilter` and their flags to `RowFlag`, in `ledger.ts`.
- The store re-reads only the transactions its own batches name, so any writer outside the store (#74's import) calls `finance.reload()` after, which reads every transaction again when something has read them.
From #74:

- Sync-side matching: a Plaid row that arrives after an import of the same day and amount is not deduplicated, since Plaid's window is fixed at link time (D-187) and imports are for older months. If the two ever overlap, the sync runs `matchRows` (`statement.ts`) over the imported rows (`importId` set, no `source`) before it creates a row.
- A column-mapping step for a CSV whose headers match no alias in `csv.ts`; today it is `no-columns`.
- A statement's closing balance as a `balance-snapshot`: the readers drop balances today.
- #78 mounts nothing new: `DocumentSheet` is mounted once in `views/Orchard.svelte` over `documentRead`, and `finance.knownImport(fingerprint)` answers Already imported from a `file-import`; a bill's letter records its own `file-import` the same way (`importOps` in `statement.ts` shows the shape).
- #90 counts `finance_read-statement` among Orchard's tools; it refuses in a conversation through its `check` and needs no grant.
- Only the browser build has run it (CSV and OFX, desktop and phone frontends); the PDF and picture path through the reader and the Gardener has not been run in the Tauri app.

From #78:

- #83 reads a transaction's `billId` for Activity's "part of a bill" filter and the transaction detail, and may offer Mark paid from it through `finance.payBill(id, { transactionId })`; an Open bill action from a Today row is not built.
- #79 offers to make a bill from a detected rent or subscription through `finance.saveBill(draft)` with `repeat` (and `fixed` for rent).
- #84 reads `repeat` and `fixed` for fixed budget lines and the sinking funds of six-monthly bills.
- #85 reads `expected` (no due day) and `estimate` for an EOB, and `sameBill` replaces the estimate when the actual bill arrives.
- #86 extends `/liabilities/get` (`card_statements` in `plaid.rs`, `CardStatement` in `provider.rs`) to the APRs, promo ends and `liability` rows; a card statement's `interest` is the `interest-charged` rows on the card since its previous statement.
- #90 widens `finance_draft` to its batch and gives it reads, adds `finance_bills`, and may let the Gardener's `draft-tasks` name a bill (`about: { type: 'bill', id }`, labelled by its payee through `financeLogic.labels`).
- #74 reuses the `file-import` lookup (`source: 'document'`, `externalId` the fingerprint) and `billCapture`'s pattern for a statement.
- Never run live: AC15 (a Sandbox card's statement bill on the desktop) is the owner's, and the capture has run only in the browser build with no reader, where a picture reads as Could not read.
- No sample bills are seeded with the Orchard sample data.
