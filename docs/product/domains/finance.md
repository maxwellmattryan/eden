---
title: Orchard
status: draft
summary: Everything the owner owns and owes, kept current from their real accounts by Plaid on each device, with income and lean mode, Activity (built), bills, budgets, debt, investments and goals, and the Gardener reading it to find where money leaks. Id `finance`, after Phase 2, built ahead of it.
read-this-if: You are working on accounts, transactions, bills, budgets, debt, investments, goals, or the Gardener for money.
depends-on: [substrate/privacy, substrate/registry, substrate/integrations, substrate/grants, substrate/tasks, substrate/ai, domains/_template]
updated: 2026-11-09
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
- See debts with APRs and promo ends and a payoff plan (#86, built). Later: holdings, crypto and retirement limits (#76, #81, #82).
- Later: Ask the Gardener where the money went and what a change would do, and get a weekly digest (#90).

## 3. Entities

Everything is T2 unless marked. T3 is stored only on the device, and no tool ever returns it. Every amount is Money (below).

| entity | key fields | tier | links out |
|---|---|---|---|
| `provider-link` | one provider login on this device (a Plaid Item, or the device's one Coinbase key, D-204): institution with logo and colour, status, consent expiry, sync cursor, last updated; the token sits in the secret store, T3 (D-184) | T2 | |
| `account` | type and subtype, currency, last four digits, institution, the owner's share, open or closed, the account it replaced; the full number is T3 | T2 | `provider-link` |
| `file-import` | one per file read: its fingerprint, what it was (statement, letter, CSV), the account and period, how many rows it made, when; the file is not kept (D-189) | T2 | `account` |
| `balance-snapshot` | one per account per day, the history behind net worth | T2 | `account` |
| `transaction` | amount, raw and cleaned merchant, day and time where given, pending, category, kind, split parts, transfer pair, bill link, notes, flags | T2 | `account`, `merchant`, `budget-category`, `bill` |
| `budget-category` | name, fixed, variable or income (D-16), essential or not | T1 | |
| `category-rule` | a pattern and the category it maps to, learned from the owner's fixes | T2 | `budget-category` |
| `merchant` | the cleaned name and the raw names merged into it | T2 | |
| `money-rollup` | sums by month × category, merchant and account, daily totals; rebuilt from transactions in memory, never stored as rows, never edited, never exported (D-194) | T2 | |
| `bill` | payee, period (`YYYY-MM`), due day (none is Expected), amount, estimate or actual, source (a letter, a card statement, a series, by hand), how often it repeats and whether its amount is fixed, its series, a card statement's card, minimum, statement day and interest, the payee's site (`https://` only), its payments (each a matched transaction with its account, or one paid another way), the payments it asks about and the ones dismissed, and the Orchard task for its due day; whether it is an insurance premium or a medical bill, and for a medical one whether an EOB drafted it, the insurer and the day of service (D-201); the state is derived, never stored (D-196); a policy number is T3 | T2 | `transaction` (`billId`), `account`, Task (`about`, #78) |
| `recurring-charge` | cadence, expected amount, last seen, price changes, kept or cancelled | T2 | `merchant` |
| `budget` | a category's line from a month on (D-201): amount in the home currency, rollover, a sinking fund (target, due month, every), `off`, and who wrote it (draft or owner); balances are read, never stored | T2 | `budget-category` |
| `liability` | built in #86 (D-205): one live row per `credit-card` or `loan` account, found by `accountId`; the provider's `aprs` (kind, rate in basis points, balance, interest), `limit` and `loan` (rate, minimum, next due day, payoff day, original principal), which a sync overwrites, and the owner's `rate`, `ownerLimit`, `payment`, `dueDay`, `promo` (`{ rate, ends }`) and a hand-entered loan's `billId`, which it keeps. The statement balance, minimum and due day stay on the card's statement `bill` (#78) | T2 | `account` |
| `holding` | quantity, cost basis, value | T2 | `account`, `security` |
| `security` | a ticker or coin and its daily price history, in its own currency | T0 | |
| `asset` | anything not linked: cold-storage crypto by quantity (priced daily) or watching a Bitcoin or Ethereum address or a Bitcoin xpub, ypub or zpub (D-204), a car, a home; entered once, valued where possible; an extended key is T3, kept in the secret store under the asset's id and never in the row | T2 | |
| `income-source` | a detected paycheck, other repeating income, or the yearly tax refund or payment: employer, cadence, expected net amount, next day; the owner's answers on it, and the deductions of the latest pay stub the owner checked (`payStub`, D-204) | T2 | `account`, `merchant` |
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
- Built in #75 (D-193): a pass after every sync that wrote transactions (`finance.classify()`) gives each live `transaction` its own keys: `kind`, `merchantId`, `counterparty`, `categoryId` with `categoryBy`, `transferId`, `refundOf` and `review`; the owner's fixes add `repays`, `reimbursable`, `parts`, `oneOff`, and the sync adds `replaced` on a posted row that took over a pending one. `budget-category`, `category-rule` and `merchant` are live rows, the defaults seeded once. The modules: `merchants.ts` (cleaning and vague brands), `categories.ts` (defaults and the provider mapping), `classify.ts` (the pass, `spendingOf`, `fitParts`, `ruleFor`), `edits.ts` (the owner's fixes) and the store's methods over them. Activity shows them (#83).
- Built in #77 (D-194): the index and query engine, `ledger.ts` in `packages/shared/src/domains/finance`, pure TypeScript. `buildLedger` turns the live transactions, the accounts, the merchants and the home currency into a `Ledger` of one entry per money event: a row, or a transfer or card-payment pair as one entry whose id is the money-out side's (`pairId` the money-in side's, `accountId` from, `toAccountId` to; `ledger.entry(id)` finds it by either side). Every figure is a sum of lines, a row's split parts or the row, a pair's two sides. The account filter is the scope: a pair with both sides in it adds nothing to `in`, `out` and `net` and shows its out side; one side in it adds and shows that side. `spending` is `spendingOf` over the matched lines; `average` leaves one-off lines out; only home-currency lines enter a total, the rest go in `left` per currency and their rows carry `other-currency`. `queryLedger(ledger, query)` answers the measures over everything matched, a page of `rows` (`newest`, `oldest`, `largest`; 50 by default, at most 1000) with `flags`, `groups` by one or two of `category`, `merchant`, `account`, `kind`, `month`, `week`, `weekday`, `day`, and a `versus` period by one non-time key; an invalid query throws `LedgerQueryError`. `TxFilter` holds every Activity filter, full text folded and matched by substring per word; `parseSearch` reads `>N`/`<=N` words as amount bounds and `periodOf` the four presets. `rollupOf` is the `money-rollup` resource (month × category, merchant or account, and daily), memoised per ledger and never stored; `typicalOf` is the mean month over the complete months before. The store holds the live rows in memory, read once by the first `query()`, pass or fix, and re-reads exactly the transactions each batch it sends names (`touchedTransactions`); `finance.ledger` is derived from them, `finance.ledgerReady` says when it holds them all, and the pass and the fixes read from that map.
- Built in #74 (D-195): a `file-import` is one statement file brought in: `source: 'file'` with the file's SHA-256 as its `externalId`, so the engine refuses a second live record of the same file, and a payload of `what` (`csv`, `ofx`, `pdf` or `picture`), `accountId`, `from`, `to`, `rows`, `matched`, `skipped` and `at`. A row read from a statement is an ordinary `transaction` with no `source` (a statement line has no stable id) and one key of its own, `importId`, the `file-import` that made it, so the undo and later audits find it. `file-import` stays out of the export.
- Built in #78 (D-196): `bill` and `file-import` rows (a letter's is `source: 'document'` with the fingerprint as its `externalId` and the `billId` it made, so a read is known by `queryEntities({ type: 'file-import', source: 'document', externalIds: [fingerprint] })`; deleting the bill tombstones it, so the letter can be read again). A transaction's `billId` is #78's own key, kept by a sync; an unpaired money-out row with one is a `bill-payment`, which still counts in `spendingOf`. The modules: `bills.ts` (state, settled, remainder, overpaid, the next occurrence and its estimate, the draft, `sameBill`, the ops), `match.ts` (`payeeMatches`, the window, the candidates, `matchOps`, Mark paid's `paymentChoices`), `bill-pass.ts` (`billPassOps`: statement interest, matching, the series, the tasks, the signals, with their inverse) and the store's methods over them.
- Built in #76 (D-197): `holding` and `security` rows, both `source: 'plaid'`. A security's `externalId` is Plaid's `security_id`; it holds its name, ticker, type (`SECURITY_TYPES`) and `prices`, one close a day, at most 1830. A holding's `externalId` is `<provider account id>:<security id>`; it holds its account, security, quantity (an exact decimal string), currency, Plaid's `value`, `price` and `pricedOn`, and `costBasis` with `costBasisBy` (`provider`, `owner` or `carried`), and the owner's `typedValue` (a value and its day). Investment transactions are `transaction` rows with `source: 'plaid-investments'`, the provider key `investment` (type, subtype, security, quantity, price) and the pass's `reinvested`. The pure rules are `investments.ts` (`roundedMoney` and `timesDecimal` in BigInt, half away from zero; `holdingValue`, `aged`, `investmentsDue`, `investmentsWindow`, `carryBasis`, `investmentOps`, `allocationOf`, `investmentSummary`); `classify.ts` adds the investment kinds, `insideAccount` and the reinvestment pairing, and `ledger.ts` keeps an `insideAccount` row out of every measure.
- Built in #79 (D-198): the recurring pass runs in the same queue job right after the classification pass, over the rows as that pass left them (`withUpdates`), and keeps one `recurring-charge` row per series that holds a cadence. Each charge carries `recurringId`, the pass's key. A row holds `merchantId`, `counterparty`, `currency`, `cadence`, `variable`, `expected`, `firstDay`, `lastDay`, `lastAmount`, `nextDay`, `accountId`, `categoryId`, `count` and `priceChanges`, all derived, and the owner's `state` (`kept`, `cancelled`, `dismissed`) with `stateOn`, `billOffer: 'declined'` and `billId`, which the pass keeps. Nothing stored depends on today: `statusOf` computes active, lapsed, cancelled or dismissed. The module is `recurring.ts` (`recurringOps`, `statusOf`, `chargedAfterCancel`, `monthlyCostOf`, `recurringTotals`, `overlapsOf`, `offersBill`, `billDraftOf` and the owner's ops). The store holds `finance.recurring` and answers `setRecurringState`, `declineBillOffer`, `linkBill` and `recurringById`. Activity reads a row's `recurringId` (#83); no page shows the charges themselves yet ("From #83", #78).
- Built in #83 (D-199): a ledger entry carries `billId` and `recurringId` (a pair takes its out side's, else its in side's); `LedgerInput.recurring` keeps `recurringId` only when it names a listed charge that is not `dismissed`, and the store passes `finance.recurring`. `TxFilter` gains `bill` and `recurring`, and `RowFlag` gains `recurring` and `bill`, in the order `pending, split, one-off, reimbursable, refund, recurring, bill, review, other-currency`. `typicalOf` takes a `filter` and measures only the lines it keeps, ignoring its period. `formatMoney` takes `sign: 'exceptZero'` for signed amounts ("+$2,430.00").
- Built in #80 (D-200): the income pass, `income.ts`, and lean mode, `lean.ts`, both pure. `detectIncome` groups the live `income` rows of the last 400 days by merchant and counterparty (or the folded name), finds each group's cadence, expected amount and next day, and keeps the tax refunds and payments of the last 800 days as `yearly` sources; `incomeOps` writes one `income-source` per group, identified by `kind` with `merchantId` and `counterparty`, or `nameKey`. The pass's keys are `kind`, `merchantId`, `counterparty`, `nameKey`, `name`, `accountId`, `cadence`, `anchors`, `expected`, `firstDay`, `lastDay` and `nextDay`; the owner's are `endedOn`, `leanSince`, `lateOk`, `ignored`, `seenNew` and `handled` (the bonus rows answered, the newest 20), and the pass never writes them. A source with no rows left is deleted unless it carries an owner key. The store runs the pass (`finance.detectIncome()`) after every classification pass, after a sync run that wrote nothing and when the page mounts; `finance.income` is what the page reads. `income-source` stays out of the export: the sources are rebuilt from transactions and the answers stay on the device (D-184).
- Built in #85 (D-202): a `bill` gains `insurance` (`premium` or `medical`), and with `medical` only `eob: true`, `insurer` (at most 120 characters) and `serviceDay`; a series' next occurrence keeps `insurance` and never the other three. An `income-source` gains the owner key `payStub`: `{ day, deductions: [{ name, kind, amount }], importId? }`, the kinds `DEDUCTION_KINDS` (medical, dental, vision, life, disability, hsa, fsa, retirement, tax, other; the first five are insurance premiums), each amount positive per paycheck; the income pass keeps it, and a source with no rows left that carries it is kept. A `file-import` with `source: 'document'` is now `DocumentImportPayload`: a letter's (`kind: 'letter'`, `billId`) or a pay stub's (`kind: 'pay-stub'`, `day`, `sourceId`, `rows`); readers narrow on `kind`, and deleting a bill takes only the rows whose `billId` is its own. The modules: `insurance.ts` (`setAsideOf`, `captureTarget`, `draftFor`) and `paystub.ts` (`PAY_STUB_ANSWER`, `answerDeductions`, `payStubFromAnswer`, `premiumsOf`, `payStubOps`, `readPayStubCheck`).
- Built in #88 (D-203): `savings-goal` rows, one per goal, `kind` `target`, `emergency` or `rate`. The owner's keys are `name`, `accountId`, `target`, `months`, `by`, `rate` (basis points, 100–9900), `order`, `closedOn`, `closedAs` (`bought` or `closed`) and `rebuildBy`; the goal pass's one key is `high` (`{ amount, day }`), and it writes nothing else. What a goal holds is never stored: `savedOf` fills each account's owned balance in `order`. The module is `goals.ts` (`savedOf`, `paceOf`, `monthsLeft`, `goalMonthly`, `reachMonthOf`, `essentialsOf`, `emergencyTarget`, `coversOf`, `savingsRateOf`, `goalsOf`, `goalPreview`, `goalErrors`, the owner's op builders over `resetHighs`, and `goalPassOps`); `income.ts` exports `completeMonths` for it. The store holds `finance.goals`, read in `load()`, derives `finance.goalsView` once the ledger is ready (the accounts in the Accounts tab's order, the tax rows from `finance.income.exclude`) and answers `saveGoal`, `moveGoal`, `closeGoal`, `reopenGoal`, `deleteGoal`, `planRebuild`, `startFromHere` and `saveRate`, each one write with one undo through `#goalEdit`. The goal pass (`#goalPass`) is its own queue job at the end of the income pass, so it runs on page mount, after each classification pass and after a sync that wrote nothing; a balance typed by hand waits for the next one. `savings-goal` is in the export.
- Built in #81 (D-204): a Coinbase `provider-link` (`provider: 'coinbase'`, institution "Coinbase", colour `#0052FF`) has one `investment` account in the home currency; its holdings are `holding` rows with `source: 'coinbase'` and the wallet's id as `externalId`, one per wallet with a non-zero balance, and a coin's `security` has `source: 'coinbase'`, the code as `externalId` and ticker, type `cryptocurrency` (`cash` for a fiat wallet, whose holding carries its `value`), and the day's spot price in `prices` with `currency` the home one. The account's balance is the sum of its holdings' home-currency values through `balanceOps`. An `asset` gains `valuedBy: 'price'` (its value is quantity × the coin's latest price, `valuedOn` the price's day), `watch` (`{ chain, address }` or `{ chain: 'bitcoin', xpub: true, script }`) and `readOn`, the day of the last good read; a watch starts at 0 in the home currency with no `valuedOn`. The pure rules are `crypto.ts` (`coinbaseLinkOps`, `coinbaseOps`, `coinbaseBalanceOps`, `pricesDue`, `priceOps`, `assetValueOps`, `watchesDue`, `watchOps`, `watchedAsset`, `secretsToClear`, `priceAged`, `isPrivateKey`, `shortAddress`, `assetLine`); `investments.ts` exports `priced` and ages a holding priced from a `cryptocurrency` close more than 7 days old.
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

Written: `monthly-income-band` T2, `domain-derived` from `income-source` rows (#80, D-200), built. Its basis is the monthly equivalents of the active, not ended, home-currency `income` sources (weekly × 52 ÷ 12, biweekly × 26 ÷ 12, semimonthly × 2, monthly × 1, irregular the sum of its rows over the last 3 complete months ÷ 3). The value is `"<lo>-<hi> <CUR>"` in whole major units, in steps of 1,000 (100,000 for a currency with no decimals), so 4,860 USD is `"4000-5000 USD"`; the confidence is 0.9 when a source with a cadence contributes, else 0.6. The pass asserts it when there is none, updates it when the value changes and deletes it when the basis is 0, touching only facts whose provenance is `domain-derived`; the owner's own are never read or changed.

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
| `read-pay-stub` (`finance_read-pay-stub`, built in #85): the deductions on a pay stub and its pay day, from the confirmed text or the picture; a page's own run from the Income section's Read a pay stub, refused in a conversation (D-202) | none | write-draft | none: nothing is written until the owner saves the pay stub sheet | `light`, needs `vision` |

That is the seven tools #90 builds plus `read-statement` and `read-pay-stub`, which are already declared. Each is strict, with `text` and `currency` both required, so they spend none of the strict tools' optional parameters.

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

**Desktop and phone pages** under `/finance`: Overview (#87: net worth, cash flow, the forecast), Activity (#83), Accounts (#71), Bills (#78), Budget (#84), Debt (#86), Investments (#76), Goals (#88). The phone mounts the same pages (More → Orchard), and on iOS it links its own banks through Plaid's sheet (#89, D-184, D-206; §8 "Plaid on the phone"); Android stays manual.

**Sheets**: the Link sheet (#73), Plaid Link in Eden's colours; the read-and-confirm sheet (#72), a letter, statement or pay stub as text to check (D-190). **Garden widgets** come in #87, which sets their sizes. **The phone lock and privacy cover** (#68, D-185), with the hide-amounts toggle on both apps.

**Mocks** (#70, D-54): `Domains/Orchard/{Overview,Activity,Accounts,Bills,Budget,ReadConfirm}` in `packages/ui-kit/src/stories/domains/finance/`, over Orchard's sample data (`design/sample-data.md`, Orchard). They are the reference the later issues build against. The tabs are the five mocked pages; Debt, Investments and Goals take their place when #86, #76 and #88 mock them. What the mocks leave to others: grouped in/out bars for Overview's Cash flow (#87; `BarChart` only stacks, so Overview shows Out as bars and In, Out and Net as Stats); the transaction detail (#83; rows in the mock have only a menu); the header motif (D-123); the tab list growing to eight when Debt, Investments and Goals land.

### Investments (#76)

The page's second tab, `/finance/investments`, after Accounts; a `Segmented` in the header switches them and the address follows. Both apps mount it. It follows D-197 and shows:

- **Summary**: Value, Cost basis and a signed Gain in primary ink, in the home currency at each account's share; Cost basis and Gain only when a holding has a basis. Captions beneath when they apply: the holdings without a cost basis, the holdings left out for another currency, the unpriced holdings.
- **Allocation**: a `DataTable` of class, value and share, highest first, shares adding to exactly 100%; unpriced holdings and other currencies left out. Share is a percentage and stays under hide-amounts.
- **Holdings**: a group per open investment or retirement account, in the Accounts tab's order, headed by its name and "institution · ••last4". A row is the security's name with its ticker as a mono chip, the value as meta, and a second line of the quantity, "Cost … · ±gain" when there is a basis, then "as of {day}" for Plaid's value or "Valued {day}" for the owner's, "· out of date" past 90 days (meta raised with `metaWarn`), and "Not in totals" for another currency. A carried basis shows a neutral "Carried" chip. An unpriced holding's meta is "Unpriced". Rows do not act (D-118); the menu offers, in order and only when they apply, Add value or Update value (no Plaid price), Add or Edit cost basis, and Clear my cost basis (the owner's). An account with no holdings read yet says they arrive with the next sync.
- **Header**: "Link a brokerage" while a provider is bound, nothing otherwise, then "Connect Coinbase" (`coins`, secondary) while crypto is bound and no Coinbase link is live (#81); the key and the stale-link notice stay. Empty: "No investments yet", with "Link a brokerage" when bound and no action and no sample when not.
- **Sheets**: `HoldingSheet.svelte`, cost basis (a total in the holding's currency, undo toast "Cost basis set for …"; clearing toasts "Cleared your cost basis for …") or value (amount and a day no later than today). Errors sit under their field.
- **Accounts**: an asset valued more than 90 days ago reads "Valued {day} · out of date" (after its quantity, for one counted), raises its meta, and its menu leads with Update value, which opens the asset sheet. A crypto asset reads through `assetLine` (#81): "0.0412 BTC · Priced {day}" with "≈ {value}", a watch's short address or "Extended key" after the quantity, "Not read yet" before its first read, and "out of date" past 7 days for a price or a read ("Read {day}" before it for a stale read); a crypto asset with no price keeps "12 FOO · Valued {day}". A priced or watched asset's menu is Edit and Delete only.
- **Coinbase** (#81): a "Coinbase" link group on Accounts with its freshness line, and a "Coinbase" group on Investments, one holding per wallet. The group menu is Replace key, then Remove link; Reconnect, in the stale notice and the group, opens the Coinbase key sheet (`CoinbaseKeySheet.svelte`). The asset sheet's Counted by `Segmented` (Quantity, Address, Extended key) shows under Kind for a crypto asset while crypto is bound; a watched asset shows "Watching …" in its place and only its name and share can change.

### Debt (#86)

The tab `/finance/debt`, between Bills and Investments, on both apps; the palette has `go.finance.debt`. It follows D-205 and reads `finance.debt` (`debtSummary` in `debt.ts`):

- **Header**: "Add a loan" (primary). Loading shows skeletons; with no open card or loan, "No debts" with Add a loan.
- **Summary**: Owed, the open home-currency debts at full balance, and Card usage, the overall percent of the home-currency cards that have a limit with "of {total limit}" beneath and a thin decorative bar under the percent (`--warning` from 30 %); a caption names the debts left out for another currency.
- **Cards**: a row per open card in the Accounts tab's order: "institution · ••last4", the rate ("24.99% APR", "0% intro until {day}, then 24.99%", "0% intro ends {day}" in the last month, else "Add its rate"), "Used {pct} of {limit}" or "Add its limit", the latest statement's "Minimum {amount} due {day}", and "Not in totals" for another currency. Meta is the balance owed, raised at 30 % usage or in an intro rate's last month. Rows do not act (D-118); the menu has Edit terms, Add or Edit intro rate, and Clear intro rate.
- **Loans**: the rate, "{payment} a month · due the {nth}", and "Paid off around {month}" from that loan alone at its minimum ("Not paid off at this payment" past 600 months). Menu: Edit terms.
- **Payoff plan**: a `Segmented` for Highest interest first or Smallest balance first and an Extra each month field, both kept for the session only (`debtSession`); an invalid extra shows its error and keeps the last good plan. Then Debt-free and Interest for the chosen order, one line comparing the two, the debts in payoff order with their interest, and under "Not in the plan" the debts that need a rate or a minimum. Left out when no debt can be planned.
- **The terms sheet** (`views/DebtSheet.svelte`): a card's APR, credit limit and minimum payment (the plan's minimum until a statement states one); an intro rate and its end day (today or later); a loan's APR, monthly payment and due day; a new loan's name, lender, currency and balance, then its terms. On a linked account an empty field falls back to the bank's value, which each helper shows. A hand-entered loan's new payment or due day moves its series' latest unsettled bill. Every save answers an undo toast.
- **The debt pass** (`finance.debtPass()`): at shell start and each morning after the bill pass, after each sync run, and after the owner saves terms or an intro rate. It steps each hand-entered loan once per due day passed since its balance's day (`scheduleOps`, through `balanceOps`), stops a paid-off loan's series repeating, then says `finance.promo-ending`.
- **Hide amounts**: every money figure goes through `amountText`; rates and percents stay.

### Activity

One feed of every money event across every account, with a title, a kind and the bank on every row. The totals and charts follow the filter.

- **Kinds**: purchase, refund, transfer, card payment, bill payment, paycheck or income, interest earned, dividend, interest charged, fee, investment buy, investment sell. The icon says it first (from the kit's `icon-list.json`), the second line says it in words for screen readers and search; costs (interest charged, fees) tint red, money earned green. #75 derives purchase, refund, transfer, card payment, income, interest earned, dividend, interest charged and fee (D-193); #78 derives bill payment from a row's `billId` (D-196); the investment kinds are #76's.
- **Badges**: one account involved, one badge; two of the owner's accounts (a transfer, a card payment), two badges from → to, one row and never two. Filtered to one account, the row keeps both badges and the sign is that account's side. Money to someone else shows the owner's account and the payee as the row's name. Every row has a title: the merchant or payee, or for a move between the owner's accounts the kind itself. Bank pills use the institution's logo and colour from Plaid, with the last four digits, and are a one-click filter.
- **Filters**: a filter button at the end of the search row, showing how many are on, opens the kit's `Popover`; active filters are removable chips under the search, with Clear. When (presets or a range), where (bank, account, card), what (category, merchant, kind), how much (over, under, between), state (pending or posted; recurring, part of a bill, one-off, reimbursable, uncategorised) and text (merchant, description, notes; `/` focuses it, `>100` filters by amount). Filters are **kept for the session in memory only**: they survive moving between pages and are gone when the app quits. A Gardener answer or a signal can open Activity filtered (#24), joining the session's filters.
- **Insights beside the feed**: spending over time stacked by category, top merchants with count and average ticket, this period against the typical one per category, money in and out by month.

Built in #83 (D-199):

- **Where**: the first tab, `/finance/activity`, before Accounts, Bills and Investments; a bare `/finance` still opens Accounts until #87. The palette gains `go.finance.activity` from the manifest; Activity adds no quick action and no header action. Both apps mount `views/Activity.svelte`, its pills `BankPill.svelte` (a shared view, not a kit component), and the page raises its two sheets.
- **Modules**: `activity.ts` (pure: the chips, `chipKey`, `withChip`, `toggledChip`, `liveChips`, `filterOf`, `chipLabel`, `rowTitle`, `rowWords`, `kindTone`, `KIND_GLYPHS`, `topMerchantOptions` and the insight builders `spendingSeries`, `topMerchants`, `againstTypical`, `inOutByMonth`) and `activity.svelte.ts` (`activitySession`: the chips and the search text in module `$state`, never stored). Every figure is a `queryLedger` answer over `finance.ledger`; the page kicks off the read with `finance.query` and shows Retry when it fails.
- **States**: nothing until the rows are read; "Nothing linked yet" with Link a bank (or Add an account) and the sample; "No transactions yet" with Import; three skeleton rows while the transactions are read; "Nothing matches these filters" with Clear filters, also for a query the engine refuses.
- **Feed**: totals ("n transactions · Out · In") with a caption for currencies left out; day groups (Today, Yesterday, else `dayLine`), 50 rows and Show more by 50 up to the engine's 1,000, back to 50 whenever the filter changes. A row's title is a pair's kind, else the counterparty, the merchant or the provider's name; its second line the kind, the category or Split, then Pending, One-off, Recurring, Part of a bill and what is to be paid back.
- **Row fixes**: a row that is not a pair has a menu: Change category (not on a split row; a `Select` and "Use for every …" through `setCategory(id, categoryId, { remember })`), Mark one-off or Not one-off (`setOneOff`), Mark reimbursable (a money-out row; a sheet whose refusals stay under its field) or Not reimbursable. Each answers an undo toast.
- **Insights**: weekly buckets for a period of 92 days or fewer, else monthly (the last 12 that spent with no period), stacked by the two categories that spent most and everything else; the five merchants that spent most; the month the period ends in against `typicalOf` under the same filter (the mean of up to six complete months before, hidden with none); in and out for up to 12 months, newest first. A card with nothing to show is left out.

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

**Quick actions and palette**: Activity adds none beyond its tab's `go.finance.activity` (#83); #87 decides Overview's. **Capture sources**: a dropped or photographed document into the read-and-confirm sheet (#72); a CSV, OFX or PDF statement into the import (#74).

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

### Income and lean mode (#80)

D-200. The views are `views/Income.svelte`, `Lean.svelte`, `PaycheckSheet.svelte` and `BonusSheet.svelte`, mounted by `views/Orchard.svelte` on both apps.

- **The question** is one `Notice` in the page header after the stale-link notice: the most urgent unanswered one, late first, then a bonus, then new income during lean mode. Its title carries the whole sentence and its one action opens the answer. It is page content (`role="note"`), not a live region. Late is `warning`: "Your {employer} paycheck due {day} hasn't arrived", **Answer**. Bonus is `info`: "{employer} paid you extra. Where should it go?", **Choose**. New income during lean mode is `info`: "A paycheck from {employer} came in", **Leave lean mode**; dismissing it marks the source seen too. Answering on the page withdraws the inbox card.
- **The paycheck sheet** asks "Did your job at {employer} end?" with no fields. **No, it's just late** sets `lateOk` to that day, and the row reads "Late, due {day}" until a paycheck comes; **Yes, it ended** sets `endedOn` and `leanSince` to today. Each answer has an Undo, and dismissing the sheet answers nothing.
- **The bonus sheet** shows the amount, the employer, the account and the day. The destination is "Leave it in {account}" (the default), an open savings, investment or retirement account, or "Pay down {card or loan}" for one with a balance owed. Any destination but Leave it adds a todo due today, "Move the {employer} bonus to {account}", never with an amount, and the sheet says Orchard never moves the money (D-8). A separate bonus row can be left out of the monthly average (`setOneOff`), on by default; one paid in the paycheck's deposit cannot, and the sheet says why. Save and **Not a bonus** each mark the row handled, with one Undo for everything.
- **The Income section** follows the accounts, only once the ledger is ready and a source is not hidden, with no empty state. Its line is "About {monthly} a month · {n}-month average {average}". A row is the merchant's live name, then the cadence, "into {account}", a biweekly source's months with three paychecks, and its state ("Next about {day}", "Late, due {day}", "Ended {day}", "Irregular", "Tax refund · around {Month}" or "Tax payment · around {Month}"), with the expected amount as the meta. Paychecks come first, ended ones next and tax sources last. A late row is never coloured. Rows do not act (D-118). Their menus offer **This job ended**, **Still paid here**, **Start lean mode** while lean mode is off, and **Not income** (**Not a tax payment**), each with an Undo.
- **Lean mode** is on while a live source carries `leanSince`. A card above the accounts shows the runway, "{months} months on essentials" until about a month, and "{months} months at your usual spending"; when other income covers the essentials it says so instead. Under it come the essential categories with their monthly means and a total, then **What to pause**: up to 8 merchants outside the essentials seen in each of the last 3 complete months. With no complete month of spending, only the heading and "Orchard needs a full month of spending to work out a runway." show. **End lean mode** clears `leanSince` on every source. Every figure goes through `formatMoney`; the month counts are not money.
- Only the browser builds have run it (desktop and phone frontends, CSV imports); Plaid rows with provider categories, the tax sources and the fact write have been proven in tests only.

### Budget (#84)

Built in #84 (D-201). The rules are `budget.ts` (`linesOf`, `budgetMonth`, `budgetIncome`, `draftBudget`, `draftOps`, `lineOps`); the views are `views/Budget.svelte` and `BudgetLineSheet.svelte`, mounted by `views/Orchard.svelte` on both apps at `/finance/budget`, between Bills and Investments. The bar is the kit's `Meter`, which replaced the mock's story-local one.

- **The month** opens on the current one, with Previous and Next beside its label, announced politely. Back stops at the earliest month with a `budget` row, Forward at the month after the current one; a button at its end is disabled, never hidden. The month is the view's own: each visit starts on the current month, and the view tells the page through `onmonth`, for the header's actions.
- **States**, in order: three `Skeleton` rows until the transactions are read; "Couldn't read your transactions" with Retry; "No budget yet" with **Draft from history** (none for a past month); then the budget.
- **Totals**: Planned, Spent, Left, and with a basis Income ("From your paychecks", or "{n}-month average, since your income varies") and To plan, which says "{x} not planned yet" or, in the danger tone, "Planned {x} more than you earn". Captions follow when they apply: a stale link's "Spent includes {institution} as of {day}", "{x} spent outside the budget" (uncategorised spending included), "Spending in other currencies is left out" and lean mode's "a new draft keeps the essentials only".
- **Groups**: Fixed, Variable, then Sinking funds (`piggy-bank`), each largest first and left out when empty. A line reads "{spent} of {available}" (a fund's "{saved} of {target}") over its `Meter`, with "Over by {x}" in the danger tone, "{±x} rolled over" or "Rolls over", and for a fund "Due {Month YYYY} · {monthly} a month". With Hide amounts on, every figure is masked and a meter reads "{percent}% of plan" or "{percent}% saved", so no money is in `aria-valuetext`.
- **Actions**: **Draft from history** (primary, `clipboard-list`) and **Add line** (`plus`, while some category that is not income has no line) lead the header for the current and next month only; past months are read-only. A line's menu offers **Edit line** and **Remove line** (writes `off`), each with an Undo. The draft is one write with one Undo, "Drafted {n} lines for {Month}", or "Nothing to draft yet: …" when it makes none.
- **The line sheet** edits a line (or adds one, with a Category first): Amount, Roll over what's left, and Save toward a bill with its Target and Due (24 months). A fund always rolls over, so turning it on holds Roll over on, disabled, with "A sinking fund always rolls over." Errors sit under their field and the first takes focus.
- Only the browser builds have run it (desktop and phone frontends, rows written through the data layer); never against Plaid rows or in the installed app.

### Insurance and medical bills (#85)

D-202. Nothing here pays anything (D-8), and documents are read on the device first (D-189, D-190).

- **An EOB** captured on the Bills tab drafts the provider's estimate (`billDraftOf`): the provider as payee, "about {amount}", no due day, medical, the insurer and the day of service. Its row reads "One-off · Medical · Not a bill yet · From the Aetna EOB" ("From an EOB" with no insurer). One that leaves nothing to pay fails with "This EOB leaves nothing for you to pay, so there is no bill." and **Enter it by hand**.
- **Where a capture lands** is `captureTarget` (`insurance.ts`), and the form's draft `draftFor`. The form's first line says which: "Updates the {payee} bill for {month}" (a corrected letter, or a corrected EOB, which stays an estimate), "Replaces the estimate from the {insurer} EOB for {payee}" (the provider's bill over the EOB's estimate; the bill moves from Expected to its state), or "This EOB is for the {payee} bill already here. Saving keeps the bill as it is." (saving unchanged writes only the document's `file-import` row, `billOps`).
- **The bill form** has an **Insurance** select (None, Premium, Medical) after the toggles, and for Medical a **Day of service** date beside it in the same pair. None drops `insurance`, `eob`, `insurer` and the day of service on save; an edit keeps `eob` and `insurer`, which have no field.
- **Set aside**: an open repeating bill of 2 months or more that is not a card statement ends its line with "Set aside {amount} a month" (`setAsideOf`), after interest and before what is still due. A six-monthly premium of $780.00 sets aside $130.00. The line's order: cadence, Premium or Medical, Not a bill yet (an open EOB estimate) or Estimate or Actual, the source, minimum, interest, set aside, still due, over.
- **Read a pay stub** is the first menu item of a paycheck that has not ended (**Edit deductions** follows when deductions are stored). It opens the document reader ("Read the deductions"), which knows a stub read before by the shared `knownDocument` ("It recorded your {employer} deductions"), then runs `finance.read-pay-stub` from the page. **The pay stub sheet** (`PayStubSheet.svelte`, session `paystub.svelte.ts`) shows Reading, then Review (the pay day and a row per deduction: name, kind, amount and remove, each row a group named by its name or "Deduction {n}"; **Add a deduction**; "Insurance premiums {amount} a paycheck"), or Failed with **Enter them by hand**. Each row needs a name and a positive amount; a read with no rows says "Add at least one deduction"; an edit saved with no rows clears them and tombstones the stub's `file-import`, so it can be read again. Save writes it in one batch with one Undo ("Saved the {employer} deductions", "Cleared the {employer} deductions").
- **The Income row** ends with "Premiums {amount} a paycheck" when its stored stub has insurance deductions in the source's currency (`premiumsOf`). Every new figure goes through `formatMoney` and Hide amounts.
- Only the desktop browser build has run it, with the sample accounts: the bill form's Insurance and Day of service and a six-monthly premium's set-aside line. The EOB and pay stub reads have been proven in tests only: they need a Gardener key, and the sample data has no paycheck.
### Goals (#88)

Built in #88 (D-203). The rules are `goals.ts`; the views are `views/Goals.svelte`, `GoalSheet.svelte`, `RebuildSheet.svelte` and `RateSheet.svelte`, mounted by `views/Orchard.svelte` on both apps at `/finance/goals`, the last tab, after Investments. There is no Storybook mock; the view is proven by screenshots, as Investments was.

- **States**, in order: three `Skeleton` rows until the transactions are read; "Couldn't read your transactions" with Retry; with no goal and no open account that is not a debt, "No goals yet" with **Add an account**; with no goal, "No goals yet" with **Add a goal**; then the page. The two empty states show only the `EmptyState`. A rate target alone does not count as a goal.
- **The page**, top to bottom: the savings rate card, the totals, one card per earmarked account in the Accounts tab's order (a gone account's last), and Done when any goal is closed.
- **The savings rate card**: "You saved {r}% of your income over the last {n} months" with the percentage as a `Stat` (a negative one keeps its sign in the danger ink), each complete month's "{Month}: {r}%", and with a target a `Meter` and "Goal {t}%". With no income in the span, "Orchard needs a month with income to measure your savings rate". Its menu offers **Set a goal**, or **Edit goal** and **Remove goal**.
- **Totals**: Saved, To go and Needed a month over the open goals in the home currency; "Goals in other currencies are left out of the totals" when any are.
- **An account's card**: its name, "institution · ••last4" and its balance; a row per goal with "{saved} of {target}" over a `Meter`, then the first of "Reached", "Past its date" (warn), "By {Month YYYY} · {monthly} a month" or "About {Month YYYY} at your recent pace", with "· about {Month YYYY} at your recent pace" or "· behind at your recent pace" (warn) after a dated line, and an emergency fund's "Covers {n} months of essentials". A dipped goal adds "Down {dip} from {high} on {day}" with a `trending-down` icon in warn ink, and "Rebuild by {Month YYYY}: {x} a month" once planned. A goal whose account is closed or gone reads "{account} is closed" or "Its account is gone" and holds 0. The card's foot says "{x} not earmarked" and, with two or more monthlies, "{sum} a month reaches these on time".
- **Actions**: **Add a goal** (primary, `plus`) leads the header while an open account that is not a debt exists. A goal's menu offers Edit, Move up, Move down (each disabled at its end of the account's order), Plan the rebuild and Start from here (dipped goals), Mark as bought (targets), Close goal and Delete. A Done row offers Reopen (last in its account), Add as an asset and Add a loan (bought goals: the existing asset sheet with the name, `vehicle` and the target; the account sheet with "{name} loan" and `loan`) and Delete. Every write is one batch with one Undo (D-12).
- **The goal sheet**: "Saving for something" or "Emergency fund" on Add while no fund is open; Name (60 characters), Account (open, not a debt), Target in the account's currency; a fund's Months of essentials (1–12, 6 first) with "{m} months of essentials is {x}", which fills Target, or "Orchard needs a full month of spending to size it"; By ("No date" and the next 60 months, a past date kept while editing); and the live "{monthly} a month reaches it by {Month YYYY}". Errors sit under their field and the first takes focus. **Plan the rebuild** picks a month over the next 24, 6 out at first, with the monthly live; **Savings rate goal** takes a whole percent, 1 to 99.
- **Hide amounts** masks every figure; a goal's meter reads "{p}% saved" and the rate's "{p}% of goal".
- Only the browser builds have run it (desktop and phone frontends, rows written through the data layer, the sample accounts and one typed in); never against Plaid rows or in the installed app.

## 7. Kinds, signals, notifications, intents

Kinds: `bill-due` (event, T2), once Almanac exists (D-186). Orchard registers no attachment kind (D-189).

Signals, each `finance.<id>`:

| signal | when | emitted from |
|---|---|---|
| `link-broken` | a provider link needs reconnecting (`reason: 'needs-reauth'`), or its consent ends within seven days (`reason: 'expiring'`, `by` the day); payload `{ uris: [link uri], institution, reason, by?, byDay? }`, keyed `<link>:needs-reauth:<lastSyncedAt>` and `<link>:expiring:<consentExpiresAt>`; built | #73 |
| `bill-due` | a bill enters Due soon; payload `{ uris: [bill uri], payee, dueDay }` (`dueDay` formatted, never an amount), keyed `<bill>:due:<due day>`; built | #78 |
| `bill-overdue` | from the day after a bill's due day, unpaid; the same payload, keyed `<bill>:overdue:<due day>`; built | #78 |
| `flag` | a new fee, interest charged, a duplicate or an unusual amount | #90 |
| `price-rise` | a fixed recurring charge that existed before the pass, not cancelled or dismissed, got a dearer charge after its previous last day; payload `{ uris: [recurring-charge uri], merchant }` with no amount, so Hide amounts (#68) has nothing to mask; keyed `<recurring-charge>:<day>`; built | #79 |
| `promo-ending` | an open card's intro rate ends within the coming month (from `addMonthsClamped(ends, -1)` up to and including the end day); payload `{ uris: [account uri], card, endsDay }` (the day in words, never an amount), keyed `<account>:promo:<ends>`; emitted by the debt pass; built | #86 |
| `watch-crossed` | a watch's threshold is passed | #90 |
| `low-balance` | the forecast dips below zero before payday | #87 |
| `limit-missing` | next year's contribution limits are not in yet | #82 |
| `paycheck-late` | an expected paycheck is past its grace (2 days weekly, 3 otherwise) and not answered; payload `{ uris: [income-source uri], employer, day }` (the day in words, never an amount), keyed `<source>:<missed day>`; built | #80 |
| `bonus` | a posted extra row of a paying source in the last 30 days, not yet handled; payload as above, keyed `<row>`; built | #80 |
| `income-new` | the pass creates a source with a cadence whose first day is within 100 days, so a first link with two years of history announces no old job; payload as above with the first day, keyed `<source>:new`; #82 hears it; built | #80 |

| notification | channel | cadence | default |
|---|---|---|---|
| a link needs reconnecting (`link-needs-reconnecting`, built: "Chase needs you to sign in again", "Chase asks you to sign in again by Mon 2 Nov"; the warning glyph, Open goes to Accounts) | in-app | when found | on |
| a paycheck is late (`paycheck-late`, built: "Your Northwind Labs paycheck due Fri Oct 30 hasn't arrived"; Open goes to Orchard, where the header asks) | in-app | when found | on |
| a bonus (`bonus`, built: "Northwind Labs paid you extra. Where should it go?") | in-app | when found | on |
| a new paycheck (`new-income`, built: "A new paycheck from Northwind Labs") | in-app | when found | on |
| a bill due soon (`bill-due-soon`, built: "Texas Gas Service is due Thu 1 Oct") | in-app, and its Task in Today | when it enters Due soon | on |
| a bill overdue (`bill-overdue`, built: "Texas Gas Service was due Sat 26 Sep") | in-app | once, the day after | on |
| a price rise (`price-rise`, built: "Netflix costs more than last time"; Open goes to Orchard) | in-app | when found | on |
| an intro rate ending (`promo-ending`, built: "Chase Sapphire Preferred's intro rate ends Mon Nov 30"; Open goes to Orchard, since the inbox opens a domain and not a tab) | in-app | when found | on |
| a flag | in-app | when found | on |
| a watch crossed | in-app | when crossed | on |
| a low balance ahead | in-app | when the forecast changes | on |
| the weekly digest | in-app | weekly | off until the finance grant (#90) |

Schedules: `sync` hourly while Eden runs and when it opens (D-183; built in #73, `every: 3600`, with the one-shots `finance.retry` and `finance.revoke`, D-192), `bills` daily at 08:00 for the bill pass on both apps (built in #78), `digest` weekly (#90). There is no `value` schedule: holdings and prices come with the first sync run of each day (D-197, built in #76). `crypto` runs hourly while Eden runs and when it opens on the desktop (built in #81, `every: 3600`, `finance.crypto`, D-204): the Coinbase wallets every run, the prices and the watched assets once a local day. Neither an ageing price nor an ageing read raises a signal or a notification, and a Coinbase link raises no `link-broken`.

Intents handled and sent: none yet.

## 8. Integrations

| integration | access | sends | receives |
|---|---|---|---|
| Plaid: Link, Transactions, Liabilities, Investments | read only, no Auth or Transfer (D-8); token T3 per device (D-184) | the Link token request, the cursor | accounts, transactions, liabilities, holdings |
| Chase, Ally, M1, a 401(k) | through Plaid; Chase by OAuth | | as Plaid |
| Coinbase | a View-only CDP key, T3 per device; refused if it can trade or transfer (D-204) | signed requests for the key's permissions and the wallets | wallet balances (trades are not read) |
| price feeds: Plaid securities, Coinbase's public spot price | read, no key for the spot price | the coin and the home currency | daily prices |
| blockchain explorers: Blockstream's Esplora, Blockscout | none, read | the watched addresses, and every address an extended key makes | confirmed balances |
| Claude, the Gardener | the finance grant (#90) | tool results and confirmed text only | answers, drafts |
| on-device text recognition (Vision, ML Kit) | none, no egress | | text (D-190) |
| SimpleFIN | later, behind the provider seam | | |

Every call is made from Rust and counted in the egress ledger; the webview only ever sees a short-lived Link token. The crate's provider seam is one trait (link, sync accounts, sync transactions by cursor, liabilities, holdings, revoke), so Orchard above never knows which provider a row came from.

### Plaid on the desktop (#73, D-192)

- **Where.** The desktop under Tauri binds Plaid (`bindPlaid`, `packages/shared/src/domains/finance/plaid.svelte.ts`), and so does iOS (#89, "Plaid on the phone" below); Android binds nothing, and `yarn dev:web` and the phone's browser build have no crate, so `plaidStatus()` answers nothing there. The crate is `src-tauri/src/domains/finance/` (`plaid.rs` the client over a `Transport`, `provider.rs` the shapes, `link_sheet.rs` the iOS sheet registry, `mod.rs` the commands `plaid_status`, `plaid_set_keys`, `plaid_clear_keys`, `plaid_link_start`, `plaid_link_open` (#89), `plaid_link_poll`, `plaid_sync`, `plaid_investments` (#76), `plaid_revoke`, `plaid_sandbox_reset_login`).
- **Environment per build.** `production` uses `https://production.plaid.com` and the production secret; `development` and `staging` use `https://sandbox.plaid.com` and the Sandbox secret. Nothing switches it. `plaid_sandbox_reset_login` (the Sandbox's "Ask to sign in again") is refused in a production build.
- **Keys and tokens** (T3, per device, D-184), in the secret store: `plaid-client-id`, `plaid-secret-sandbox`, `plaid-secret-production`, `plaid-user-id` (the device's random `client_user_id`) and `plaid-item-<link id, lowercased>` for each access token. Keys are tried against `/institutions/get` and stored only if Plaid accepts them. The webview gets a link token, the hosted page's URL and whether keys exist; the public token never leaves the crate.
- **Link.** Hosted Link in the system browser for every bank, Chase's OAuth included. `/link/token/create` asks for `products: ["transactions"]`, `additional_consented_products: ["liabilities", "investments"]`, `transactions.days_requested: 730` (D-187), `country_codes: ["US"]` and `hosted_link.completion_redirect_uri` set to `PLAID_REDIRECT_URI` (`https://eden.palekodama.studio/plaid/oauth`); `redirect_uri` is left out, since Hosted Link handles the OAuth return on Plaid's side (if the Sandbox OAuth bank refuses a hosted session without one, set it to the same constant and say so here). Update mode (Reconnect) sends the link's own `access_token` and no products, so the Item, the row and the accounts stay the same. The sheet polls `/link/token/get` through the crate every 3 s for up to 30 minutes; closing it does not end the session. A finished session is exchanged in the crate, which reads `/item/get`, `/institutions/get_by_id` with optional metadata (the colour and the logo) and `/accounts/get`; a failed read removes the new Item again.
- **Sync** (D-183): on launch, hourly through `finance.sync`, and on retries, one link after another, one run at a time. Each run asks, per link, `/item/get` (status and consent), `/accounts/get` (cached balances) and `/transactions/sync` from the cursor, 500 a page while `has_more`, restarting from the run's first cursor on `TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION` at most three times. Every account crosses with its `balances.limit` (#86). After the pages, an Item with a credit or a loan account is asked `/liabilities/get` once (#78, #86): each card's `last_statement_balance`, `minimum_payment_amount`, `next_payment_due_date`, `last_statement_issue_date` and `aprs[]` (`apr_type`, `apr_percentage`, `balance_subject_to_apr`, `interest_charge_amount`) cross as `statements`, and each student loan's and mortgage's rate, minimum or next monthly payment, next due day, payoff or maturity day and original principal as `loans`, in the account's currency; `liabilityOps` writes them to the `liability` rows. Any failure (`PRODUCTS_NOT_SUPPORTED`, `ADDITIONAL_CONSENT_REQUIRED`, a 500, no answer) leaves them empty, is logged by its code and never fails the run. In production the first call starts that Item's Liabilities billing (D-197), a loan-only Item's too (D-205). Never `/accounts/balance/get` or a paid refresh. Amounts cross as decimal strings and become Money through `parseMoney(text, currency, 'en')`; one with more decimals than its currency is skipped (`finance:bad-amount`), as is a balance with no ISO currency (`finance:unsupported-currency`).
- **What a run writes** (`sync.ts`): a new account per unseen Plaid account (kind from `kindOf`, the mask as `last4` when it is four digits, share 100%), name and last four kept current, a moved balance or the day's first through `balanceOps`; a closed account is never reopened and one Plaid stops reporting is left alone. Transactions are ordinary `transaction` rows with `source: 'plaid'` and `externalId` the `transaction_id`, upserted (a replay changes nothing), their amount negated (money out is negative); a modify overwrites only Plaid's keys and keeps the rest; a removed one is tombstoned; a posted one takes the pending row's other keys. The link's `status: 'ok'`, `lastSyncedAt`, `failures: 0`, `consentExpiresAt` and the cursor go in the last batch, so a run cut short replays from the old cursor.
- **Failures.** `needs-reauth` (`ITEM_LOGIN_REQUIRED`, `PENDING_DISCONNECT`, `PENDING_EXPIRATION`, `INVALID_ACCESS_TOKEN`, an ended consent) at once; any other failure keeps the data and adds to `failures`, `error` from the third in a row; retries at 1, 5, 15 and 30 minutes (`finance.retry`), then the hourly run. `lastErrorCode` holds the code. The codes: `needs-reauth`, `invalid-keys`, `rate-limited`, `institution-down`, `provider-down`, `network`, `other`, `no-keys`, `not-found`. With no keys a run does nothing.
- **Remove link** sets `finance.revoke` two minutes out; it and the start of each run call `/item/remove` for every Plaid link tombstoned at least two minutes ago that still has a token here (a younger one waits, so its Undo stays true), then delete the token (`ITEM_NOT_FOUND` counts as done). A link Undo brought back is live and left alone.
- **Egress and logs.** Every request is counted under `plaid`. Logs carry codes and Plaid's `request_id`, never a body, a name, an amount or a token; the redaction also scrubs `link_token`, `client_id` and bare Plaid token shapes.

### Plaid on the phone (#89, D-206)

- **Surface per platform.** The crate picks how a build links at compile time, never the webview, and `plaid_status` says it as `link`: `hosted` on desktop (Hosted Link in the system browser, above), `sheet` on iOS (Plaid's native sheet, LinkKit 6.5.7), `none` on Android. `bindPlaid()` binds nothing on `none` or with no crate. The mobile layout calls `bindPlaid()` as the desktop's does, so on iOS the phone has everything the desktop's provider gives: the keys sheet, Link a bank and a brokerage, Reconnect, the Sandbox's "Ask to sign in again", Remove link with its revoke two minutes later, the launch sync, `finance.sync`, the retries and the day's investments read. No page code forks by platform except the Link sheet's copy ("Opening Plaid…", "Finish in Plaid", "Open Plaid again" without the external-link icon, "That Plaid session expired.").
- **Keys.** The keys sheet is the desktop's. The keys are tried against Plaid and kept in the phone's Keychain secret store under the same names, never exported or moved (D-184).
- **The sheet flow.** `plaid_link_start` makes a link token for the native SDK: no `hosted_link`, `redirect_uri` set to `PLAID_REDIRECT_URI`, the same products, consented products and 730 days; update mode still carries the link's own `access_token`. The answer has no hosted URL, and the token is begun in the crate's sheet registry (`link_sheet.rs`, a process-wide map by link token). The webview calls `plaid_link_open(linkToken)`, which presents LinkKit over the app through the Swift bridge (`src-tauri/swift/EdenPlaidLink/PlaidLinkBridge.swift`, compiled into the iOS app target); a token this run did not begin for the sheet, or no window to present over, is `plaid:other`, and a second present while LinkKit is up is ignored. LinkKit's success or exit goes from Swift straight to the crate through a C callback (`{ linkToken, outcome, publicToken?, errorCode? }`), so the public token never reaches the webview. The 3 s poll reads the registry with no request to Plaid while the sheet is open; a success goes through the desktop's `exchange_and_read` (or `reconnected` in update mode), an exit becomes Cancelled. Once a poll has its answer the entry, and its public token, leave the registry; the answer stays cached in `Sessions`. Thirty minutes without an outcome is `expired`, as on desktop.
- **OAuth.** A bank's OAuth (Chase) leaves for the bank's app or a browser and returns through the Universal Link `https://eden.palekodama.studio/plaid/oauth` (the `applinks:` entitlement; `web/.well-known/apple-app-site-association` lists the production, dev and staging app ids), where LinkKit resumes on its own. The redirect URI must be allowed in the Plaid Dashboard for Sandbox and Production, and a signed build needs Associated Domains in its provisioning profile. An app the system ends while the owner is in the bank's app is not resumed (`resumeAfterTermination` is not wired); Link starts again.
- **The phone lock** (D-185) may rise while the owner is away in a bank's app. Plaid's sheet sits above the webview and can appear above the lock screen; it shows no Eden data, which is accepted. The privacy cover still lies over everything in the app switcher.
- **Android** binds nothing: the page stays manual, and `plaid_link_start` and `plaid_link_open` refuse `plaid:other` there.
- **Two devices.** Each device's Accounts page lists only its own links, and the Remove link confirm already says to remove it on the other devices too.
- **New phone.** Remove the old phone's links on the old phone first (each revokes its Item at Plaid), then link the banks again on the new phone. Nothing moves between phones.
- **Lost phone.** Its access tokens live only in its Keychain, so Eden cannot call `/item/remove` for its Items from anywhere else, and those Items stay open and billed at Plaid. The path is Plaid's Dashboard or Plaid support: give the client ID, the environment, the institutions and roughly when each was linked, and ask for those Items to be removed. Rotating the secret does not remove Items. **Unconfirmed** until the owner has confirmed this path with Plaid (the #89 runbook); then this paragraph says so.

### Investments (#76, D-197)

- **Brokerage mode.** "Link a brokerage" opens the same Link sheet and Hosted Link flow with `plaid_link_start(brokerage: true)`: `products: ["investments"]`, `required_if_supported_products: ["transactions"]`, `additional_consented_products: ["liabilities"]`, `transactions.days_requested: 730`. The bank mode is unchanged. An Item without Transactions syncs: `/transactions/sync` refusing `PRODUCTS_NOT_SUPPORTED`, `ADDITIONAL_CONSENT_REQUIRED`, `INVALID_PRODUCT` or `NO_ACCOUNTS` answers `ok` with the accounts, no transactions and the cursor it was given.
- **The read.** At the end of each run (`valueLinks` in `plaid.svelte.ts`), every live Plaid link with an open investment or retirement account whose `investmentsReadOn` is not today, and which is not waiting on a sign-in, gets one `plaid_investments(linkId, startDay, endDay)`: `/investments/holdings/get`, then `/investments/transactions/get` 500 at a time by offset until `total_investment_transactions`, at most 40 pages (20,000 rows). The securities of both are merged by `security_id`. The first read asks for the 730 days before today, a later one from `investmentsReadOn` minus 30 days. A good read, or `none` (holdings refusing `PRODUCTS_NOT_SUPPORTED`, `NO_INVESTMENT_ACCOUNTS`, `ADDITIONAL_CONSENT_REQUIRED` or `INVALID_PRODUCT`), sets `investmentsReadOn` to today in the last batch. The same codes on the transactions call keep the holdings. A failed read is logged by its code, writes nothing and leaves the link's status and failures alone. The command refuses a link id that is not a ULID or a day that is not `YYYY-MM-DD` (`plaid:other`).
- **What it writes** (`investmentOps`): securities upserted with the day's close replacing that day's entry; holdings upserted per account and security, and one Plaid no longer lists on an account it reported tombstoned; closed accounts and accounts with no row skipped, a holding with no ISO currency skipped as `finance:unsupported-currency`. Investment transactions with a non-zero amount are upserted like a sync's, amount negated, `pending: false`. A replay writes nothing. Then the classification pass runs once if anything was written.
- **No removed list.** `/investments/transactions/get` has no removed list, so an investment transaction Plaid stops returning stays.
- **Never** `/investments/refresh`, a paid call (D-183).

### Crypto (#81, D-204)

- **Where.** The desktop under Tauri binds crypto (`bindCrypto`, `packages/shared/src/domains/finance/crypto.svelte.ts`) beside Plaid; the phone and `yarn dev:web` bind nothing (`coinbaseStatus()` answers nothing), so the asset form keeps only "by quantity" there and Investments shows no Connect Coinbase. The crate is `src-tauri/src/domains/finance/`: `fetch.rs` (the `Fetch` trait and `HttpGet`, reqwest with a 30 s timeout, HTTPS only, rustls), `coinbase.rs`, `xpub.rs` and `chain.rs`, and the commands in `mod.rs`: `coinbase_status`, `coinbase_set_key(name, privateKey)`, `coinbase_clear_key`, `coinbase_balances`, `crypto_prices(codes, quote)`, `watch_address_check(chain, address)`, `watch_xpub_set(assetId, key, script?)`, `watch_xpub_clear(assetId)` and `watch_read(assetId, chain, address?, script?)`. Every id is checked as a ULID.
- **The key.** A Coinbase CDP key: the name `organizations/<uuid>/apiKeys/<uuid>` and a P-256 private key as SEC1 or PKCS#8 PEM (line breaks, none, or literal `\n`). `coinbase_set_key` calls `GET /api/v3/brokerage/key_permissions` and stores `coinbase-key-name` and `coinbase-key-secret` only when `can_view` is true and `can_trade` and `can_transfer` are false. Each request carries a fresh ES256 JWT: header `{ alg: 'ES256', kid, nonce (32 hex), typ: 'JWT' }`, claims `{ sub, iss: 'cdp', nbf, exp: nbf + 120, uri: 'GET api.coinbase.com/<path>' }`.
- **The wallets.** `GET /v2/accounts?limit=100`, following `pagination.next_starting_after` for at most 10 pages; each wallet's id, code, name, kind (`crypto` or `fiat`) and exact amount. Read on every `finance.crypto` run through `coinbaseOps`; failures follow D-192 through `linkAfterFailure` (a 401 is `needs-reauth` at once, the third failure in a row `error`), and saving a good key in the sheet sets the link back to `ok` and reads at once. Remove link tombstones the link and closes the account, with Undo; the first run that finds no live Coinbase link and one tombstoned at least 2 minutes ago (`REVOKE_AFTER`) deletes the key. Eden cannot revoke it at Coinbase, so the toast says to.
- **Prices.** `GET /v2/prices/{CODE}-{QUOTE}/spot`, no key, once per coin a local day: the units of the crypto assets with a quantity and the codes of the Coinbase account's coins, left out once their security has the day's price in the home currency, 50 codes a call at most. A 404 or 400 leaves the coin unpriced. Then the value pass (`assetValueOps`, `coinbaseBalanceOps`) runs, and again right after an owner saves a crypto asset.
- **Watches.** Bitcoin: `GET https://blockstream.info/api/address/{address}`, `chain_stats.funded_txo_sum − spent_txo_sum` sats as BTC to 8 places. Ether: `GET https://eth.blockscout.com/api/v2/addresses/{address}`, `coin_balance` wei as ETH to 18 places (`0` for a 404 or none). An extended key (`xpub` with its chosen script, `ypub` nested SegWit, `zpub` native SegWit; mainnet, depth 3) derives `m/0/i` and `m/1/i` by CKDpub and scans each chain from 0 until 20 unused addresses in a row ("used" is any chain or mempool transaction), at most 1000 a chain. Requests run one after another; a 429 stops the read. Quantities are integer string arithmetic, never floats. A good read sets `quantity` and `readOn`; a failed one is logged by its code and writes nothing. An asset whose key is not on this device fails `not-found` and keeps its last quantity. Undoing or deleting a watched asset with an extended key tombstones it, and the first run 2 minutes later deletes its key.
- **Secrets** (T3, per device): `coinbase-key-name`, `coinbase-key-secret` and `crypto-xpub-<asset id, lowercased>`. A private extended key (`xprv`, `yprv`, `zprv`, `tprv`, `uprv`, `vprv`) is refused in the sheet and by the crate (`chain:private-key`) and never stored.
- **Codes.** `coinbase:{invalid-key|refused|not-read-only|needs-reauth|rate-limited|provider-down|network|no-key|other}` and `chain:{invalid-address|private-key|unsupported|not-found|too-many|rate-limited|provider-down|network|other}`; `cryptoErrorCode` reads them.
- **Egress and logs.** Every request is counted under `coinbase`, `blockstream` or `blockscout` (Settings → Privacy), with no CSP entry since the crate makes them; the bearer is a header and never counted (D-71). Logs carry codes only, never a body; the redaction scrubs PEM private-key blocks, JWTs, CDP key names and extended keys, public or private.

### Freshness and history

Freshness is D-183: a purchase shows within an hour of Plaid having it. History is D-187: the window is set when a link is made, so it is asked for every time, and a new account with a week of history works like any other.

## 9. Settings

- Home currency (D-188), built in #71 under Settings → General, default USD, carried by a bundle (D-191).
- Plaid keys on this device (D-184).
- The Coinbase key on this device (D-204), set from Investments → Connect Coinbase and replaced from the Coinbase group's menu; it leaves the device two minutes after Remove link.
- Linked providers, each with reconnect and remove.
- Hide amounts (#68).
- The phone lock (#68, D-185).
- The export passphrase (#69).

## 10. Non-goals and open questions

Non-goals: paying bills or moving money (D-8); paid Plaid re-checks (D-183); a desktop lock screen (D-185); exchange rates and currencies other than USD in totals (D-188); tax filing; a credit score; deductible tracking (Wellspring owns the plan); a second provider such as SimpleFIN; sync between devices (#40); moving Plaid links between devices (D-184).

Open: none.

## Registry rows

Under Orchard, live since #71 added the manifest (`packages/shared/src/domains/finance/manifest.json`), built ahead of its phase like Meadow (D-130), except the kind `bill-due`, whose row carries Phase 2 and waits on Almanac (D-186). Its export carries `account`, `balance-snapshot`, `asset`, `transaction` (#73), `budget-category`, `category-rule` and `merchant` (#75), `bill` and `file-import` (#78), `holding` and `security` (#76), `recurring-charge` (#79), `budget` (#84), `savings-goal` (#88), `liability` (#86), never `provider-link`, which is this device's (D-184, D-191). The rows: fact `monthly-income-band` T2; entities `provider-link` T2, `account` T2, `file-import` T2, `balance-snapshot` T2, `transaction` T2, `budget-category` T1, `category-rule` T2, `merchant` T2, `money-rollup` T2, `bill` T2, `recurring-charge` T2, `budget` T2, `liability` T2, `holding` T2, `security` T0, `asset` T2, `income-source` T2, `savings-goal` T2, `contribution-limit` T0, `spending-watch` T2; kind `bill-due` (event, T2). The stub's `savings-goal` fact is now an entity and its attachment kind is gone (D-189).

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
- A kit progress meter for budget lines (#84): done, the kit's `Meter`, which the Budget mock now uses.
- The transaction detail (#83): built in part (category, one-off, reimbursable); the rest is in "From #83".
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

- Done in #89: the iOS sheet sends `PLAID_REDIRECT_URI` as its `redirect_uri` and the phone calls `bindPlaid`. The ad-hoc provisioning profile must still be regenerated with Associated Domains before the next iOS build signs ("From #89").
- #76 and #86 call Investments and Liabilities on the consented Items (`additional_consented_products`), with no relink; #76 handles investments-only institutions, which cannot be linked yet since every link asks for Transactions.
- #75 owns the transaction keys that are not Plaid's (anything but `amount`, `day`, `authorizedDay`, `datetime`, `name`, `merchantName`, `pending`, `providerCategory`); a sync keeps them on modify and carries them from a pending row to its posted one.
- #74 matches imported rows against `transaction` rows with `source: 'plaid'`, found by `queryEntities({ type, source, externalIds })`.
- Money stays in TypeScript: the crate passes decimal strings, so no Rust Money port was needed (the #71 handoff above is dropped).

From #75:

- Done in #83 for `setCategory(id, categoryId, { remember })`, `setOneOff` and `setReimbursable`; the rest of the transaction detail moves to "From #83".
- Done in #77: the ledger reads `spendingOf(row)` for every spending figure, and `classify()` and the fixes read the store's row map instead of every transaction.
- #74 calls `finance.classify()` after an import.
- #90 asks about rows with `review: 'vague'` and drafts rules as `RulePayload` (`merchantId`, `counterparty` or both, and the `categoryId`).
- #78 sets `bill-payment`; #76 sets the investment kinds. The pass sets `kind` on every row it sees, so each teaches `kindOf` in `classify.ts` its own rather than writing the key beside it.
- Managing categories (the default set is seeded once) was left out of #84 and stays open ("From #84"); the budget fields live on `budget`, not on the category.
- A non-card `LOAN_PAYMENTS_*` row with no partner stays a `transfer`, so the `debt` default is only reached by a rule or the owner. Answered in #86 (D-205): a payment matched to a hand-entered loan's bill is a `bill-payment` and counts as spending, as every bill payment does (D-196); nothing else changes.
- The Hearth receipt split ("a Hearth haul with a receipt can split it for you") needs a cross-domain path, since no domain hears another's signals yet, and a currency on Hearth's prices, which are cents with none. The owner files it as its own issue.

From #79:

- Done in #83: Activity's `recurring` filter reads `recurringId` and leaves out a dismissed charge's rows. The subscriptions view moves to "From #83".
- #78: Bills offers a bill where `offersBill(charge, categories, today)` holds, maps `billDraftOf(charge, merchants)` onto its `bill` payload, then calls `linkBill(id, billId)`; "Not a bill" calls `declineBillOffer(id)`.
- Done in #84: a budget line from a recurring charge takes `monthlyCostOf(charge)`.
- #87: the forecast reads each active row's `nextDay` and `expected` (negative, the charges' sign).
- #90: `finance_recurring` reads the same helpers; overlaps between different merchants (two music services) are the Gardener's to find.
- The pass runs only at a sync's classification: an owner's fix (one-off, merge) is picked up at the next sync.
From #77:

- Done in #83: Activity binds `finance.ledger` and `finance.query`, makes one `TxFilter` from the session's chips, and reads the search through `parseSearch` and the presets through `periodOf`. Setting `notes` on a row moves to "From #83".
- #87 reads `rollupOf(finance.ledger, 'category' | 'merchant' | 'account' | 'day')` for its charts and `typicalOf(finance.ledger, { month })` for "spending vs typical"; account `share` stays net worth's and is never applied to transaction sums.
- #90 registers `finance_query` over `finance.query`, formats a `LedgerAnswer` as the D-151 table with the count and total header (`rows · 2 of 14 matching · total …`), caps `limit` at 50, and answers a `LedgerQueryError` by its `code` (`versus-group`, `period`, `amount`).
- Done in #83: the `bill` and `recurring` filters in `TxFilter` and their flags in `RowFlag`.
- The store re-reads only the transactions its own batches name, so any writer outside the store (#74's import) calls `finance.reload()` after, which reads every transaction again when something has read them.
From #74:

- Sync-side matching: a Plaid row that arrives after an import of the same day and amount is not deduplicated, since Plaid's window is fixed at link time (D-187) and imports are for older months. If the two ever overlap, the sync runs `matchRows` (`statement.ts`) over the imported rows (`importId` set, no `source`) before it creates a row.
- A column-mapping step for a CSV whose headers match no alias in `csv.ts`; today it is `no-columns`.
- A statement's closing balance as a `balance-snapshot`: the readers drop balances today.
- #78 mounts nothing new: `DocumentSheet` is mounted once in `views/Orchard.svelte` over `documentRead`, and `finance.knownImport(fingerprint)` answers Already imported from a `file-import`; a bill's letter records its own `file-import` the same way (`importOps` in `statement.ts` shows the shape).
- #90 counts `finance_read-statement` among Orchard's tools; it refuses in a conversation through its `check` and needs no grant.
- Only the browser build has run it (CSV and OFX, desktop and phone frontends); the PDF and picture path through the reader and the Gardener has not been run in the Tauri app.

From #78:

- Done in #83: Activity's "Part of a bill" filter reads a transaction's `billId`. Mark paid from a row moves to "From #83"; an Open bill action from a Today row is not built.
- #79 offers to make a bill from a detected rent or subscription through `finance.saveBill(draft)` with `repeat` (and `fixed` for rent).
- Done in #84: the draft reads `repeat` and `fixed` for its bill lines and the sinking funds of bills repeating every 3 months or more.
- #85 reads `expected` (no due day) and `estimate` for an EOB, and `sameBill` replaces the estimate when the actual bill arrives.
- Done in #86: `/liabilities/get` reads the APRs and the loans into `liability` rows; Plaid gives no intro rate's end, so the owner enters it. A card statement's `interest` is still the `interest-charged` rows on the card since its previous statement.
- #90 widens `finance_draft` to its batch and gives it reads, adds `finance_bills`, and may let the Gardener's `draft-tasks` name a bill (`about: { type: 'bill', id }`, labelled by its payee through `financeLogic.labels`).
- #74 reuses the `file-import` lookup (`source: 'document'`, `externalId` the fingerprint) and `billCapture`'s pattern for a statement.
- Never run live: AC15 (a Sandbox card's statement bill on the desktop) is the owner's, and the capture has run only in the browser build with no reader, where a picture reads as Could not read.
- No sample bills are seeded with the Orchard sample data.

From #76:

- Done in #81: the crypto price feed and the `crypto` schedule; a Ledger in a drawer is an `asset` by quantity, priced daily, or a watched address or extended key (D-204).
- #87 reads `security.prices` (one close a day) and `allocationOf` for net worth over time and allocation charts; assets still write no snapshot.
- #90's `finance_wealth` reads `investmentSummary` (`finance.investments`).
- The Storybook mock `Domains/Orchard/Investments` and the kit `OrchardPage` tab list: the real view is proven by screenshots only.
- The owner's M1 check: on the first production M1 link, see whether M1's crypto account and its holdings arrive through Plaid; if not, enter it as an `asset` of kind `crypto` by quantity, which #81 prices daily.
- Sandbox proof of the brokerage mode in a dev build: "Link a brokerage" against a Sandbox investments institution, the first read's 730 days, and an investments-only Item's hourly sync staying `ok`.
- The Accounts tab does not mask its figures under hide-amounts yet (`amountText` is used on Investments only); the #68 handoff above still stands for it.

From #83:

- The rest of the transaction detail (needs an issue; the owner files it): `split`/`unsplit`, `TransactionPayload.notes`, `linkRepayment`/`unlinkRepayment`, `renameMerchant`, `mergeMerchants`, `saveCategory`, Mark paid from a row through `finance.payBill(id, { transactionId })`, and unpairing a wrong transfer, for which no owner-made pair or unpair exists yet. Each store method answers an undo, a refusal's code (`split:*`, `repayment:*`) or nothing; Activity's row menu (`views/Activity.svelte`) and the page's `Open` union in `views/Orchard.svelte` are where they join.
- The subscriptions view (needs an issue; the owner files it): `finance.recurring` through `statusOf`, `recurringTotals`, `overlapsOf` and `chargedAfterCancel`, and the owner's answer through `setRecurringState`.
- #24 opens Activity already filtered from a Gardener answer or a signal by calling `activitySession.add(chip)` (`activity.svelte.ts`) and going to `/finance/activity`; the chip joins the session's.
- #87 makes Overview the default tab: `financeTab` in `tabs.ts` falls back to Accounts until then.
- Never run in the installed app or against a real sync: the browser builds ran with the sample accounts and imported CSV statements whose rows were given Plaid categories by hand, so the classification paired the transfer and set kinds and categories.

From #80:

- #84 reads `finance.income.average` (`incomeAverage(ledger, { month, exclude })` in `income.ts`: the mean monthly money in from `income` entries over the complete months among the last 3, one-off rows and tax refunds left out, undefined with no complete month) for the trailing average on irregular income, and `essentialLines` (`lean.ts`) for its essential lines. While lean mode is on (`leanSinceOf(finance.incomeSources)`), it drafts the essentials only.
- #87 and #90 read the sources (`finance.income.sources`, each with `cadence`, `expected` and `nextDay`) for the next paycheck and the low balance before payday, and `runwayOf` for the runway; `finance_forecast` counts `income-source` as its spec says.
- #82 hears `finance.income-new` to start the 401(k) flow on a new job.
- #79 replaces `pauseCandidates` (merchants outside the essentials seen in each of the last 3 complete months) with the recurring charges, keeping its shape for `Lean.svelte`.
- #78 may make a `tax-payment` source a yearly bill.
- The domain's export still leaves `income-source` out (D-184); if sync (#40) ever carries the owner's answers, they move with it.
- The stale-link notice keeps the kit's `alert` role; the income question uses `role="note"` so it is not announced. Whether the stale one should follow is the owner's call.

From #84:

- #90: `finance_draft` gains a budget kind over `draftBudget` and `draftOps` (the draft stays arithmetic in Eden; the model only proposes it), and the brief's budget status reads `finance.budget(month)` (planned, spent, left, the lines over).
- #90: an over-budget signal or notification and spending watches; nothing is emitted when a line goes over today.
- #87: Overview's budget widget and its Garden tile read `finance.budget(month)` and `finance.budgetIncome`.
- Managing categories (rename, add, delete, change group or essential) is still open: the "From #83" `saveCategory` item. The Add line Select lists the live categories as they are.
- The view does not show which bills or charges a drafted line came from; no sample budgets are seeded.
- `draftBudget` returns its count beside the undo (`{ undo?, count } | 'empty'`), so a redraft that changes nothing still says how many lines it drafted.

From #85:

- #84 reads `setAsideOf(bill)` (`insurance.ts`) for a sinking fund per repeating bill of 2 months or more, and `premiumsOf(source.payStub, currency)` (`paystub.ts`) with the stored deductions for its fixed insurance lines; the budget's sinking-fund line is #84's.
- #90's `finance_bills` names an open EOB estimate (`eob` and `estimate`, unsettled; `isOpenEob`) as not a bill yet, and the tool counts include `finance_read-pay-stub` (40 tools, 13 strict).
- Never run live in the installed app, against a real model or with the on-device recogniser: EOB capture, the replace and billed cases and Read a pay stub are proven in tests only.
From #88:

- #87: the low-balance forecast and `finance.low-balance` ("Low balance before a bill") read `finance.goalsView` for the earmarks; Overview's goals card and the Garden goals widget read it too (the rate, the totals and each group's rows).
- #90: `finance_forecast` `changes` answers when a goal is reached under a hypothetical, over `savedOf`, `paceOf` and `reachMonthOf`; `finance_draft` gains a goal kind over `goalErrors` and `saveGoalOps` (the model proposes, Eden works out every figure); the brief gains a goals line from `finance.goalsView`.
- A dip is noted on the page only; no signal or notification is emitted for it.
- The goal pass runs with the income pass, never on a balance typed by hand; Start from here covers that case.
- Earmarks may sit in investment and retirement accounts, since only debts are refused; whether to narrow that to cash accounts is the owner's call after use.
- No sample goals are seeded, and there is no `Domains/Orchard/Goals` mock; the kit's `OrchardPage` tab list still has the five mocked tabs.
- The tab list now holds six tabs, past the kit `Segmented`'s two to five, and on a 390-pixel phone the list runs past the screen's edge. How Orchard's tabs fit a phone is #89's.
From #81:

- Trades and transfers on Coinbase as investment transactions, and a cost basis read from them, are not built: the owner types the basis once on the holding, and it survives every read (needs an issue; the owner files it).
- Tokens (ERC-20 and others), NFTs, staking rewards, Taproot (`bc1p`) extended keys, Lightning and chains other than Bitcoin and Ethereum are not read (D-204).
- Crypto assets stay out of the Investments allocation, which is D-197's holdings only; #87 decides whether net worth's charts show them.
- #89 binds crypto on the phone: `bindCrypto` and the Coinbase key sheet, with the key entered on the phone, which is its own device (D-184).
- #90's `finance_wealth` reads an asset's `valuedBy` and `readOn` (a priced coin and its day, a watch's last read) and the Coinbase account's holdings as any brokerage's; `priceAged` says when either is out of date.
- An asset that came in a bundle with `watch.xpub` has no key on the new device: its reads fail `chain:not-found` and it keeps its last quantity until the owner deletes it and adds the key again.
- Never run live: the owner proves Connect, read and remove with a real View-only CDP key, and a watched address and the BIP-84 `zpub` in `yarn dev` (AC16, AC17 of #81's spec).

From #86:

- #87 reads `finance.debt` (`debtSummary`: owed, usage, the cards and loans) and `payoffPlans` for its Overview widgets.
- #90's `finance_wealth` and `finance_forecast` read `debtSummary`, `payoffPlans` (`debtsOf` builds their input) and the `liability` rows.
- #89 binds nothing new: the tab and the sheet already mount on the phone, where only owner-entered terms show until its Plaid links come.
- Sandbox proof is the owner's: in a dev build, a credit Item shows its APRs and limit, and a student or mortgage Sandbox Item shows its loan's terms. Never run against Plaid; the browser builds ran with the sample data and a hand-entered loan.
- The intro rate's notification opens Orchard, not the Debt tab: the inbox's Open (`shell/inbox/notices.ts`) goes to a domain only. A per-rule tab would need a manifest field.
- A hand-entered loan whose due day changes keeps its series' first due day as the anchor for later occurrences (`nextOccurrence` in `bills.ts`), so the occurrence after the moved one goes back to the old day; deleting the loan leaves its bill series, which the owner deletes from Bills.
- Card minimums that fall with the balance, balance-transfer fees and per-APR balances in the plan are not built; a card is planned at one effective rate.

From #89:

- Android linking: Android answers `link: 'none'` and binds nothing. A later issue picks Plaid's Android SDK (an Android bridge beside `PlaidLinkBridge.swift`, with `redirect_uri` replaced by the Android package name) or Hosted Link, and tests it before `LINK_SURFACE` changes in `src-tauri/src/domains/finance/mod.rs`.
- Confirm the lost-phone path with Plaid (Dashboard or support) before the phone runs with production keys, then change the "Lost phone" paragraph in §8 from unconfirmed to confirmed. Allow `https://eden.palekodama.studio/plaid/oauth` as a redirect URI in the Plaid Dashboard (Sandbox and Production), regenerate the ad-hoc provisioning profile with Associated Domains, and deploy `web/` so the dev and staging app ids are served.
- Overview and the Garden widgets (#87) reach the phone through the shared `Orchard.svelte` once they land; nothing in #89 depends on them.
- Never run on a simulator or device with Plaid keys: the sheet, OAuth through the Universal Link, Reconnect, Cancel and Remove link on the phone are proven by the crate's tests and a simulator build only, until the owner runs them (the #89 runbook).
