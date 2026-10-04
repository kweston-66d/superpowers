# Evaluation return

Expands "Your turn ends when you return" in `code-coordinator.md`. Every reference out of
this file names its file.

The parent return is what a later reader scores. Prose is not a score. End every return to
the parent with the block below, after the prose, with nothing after it.

## 1 — Block

```text
evaluation:
review_rounds: 2
blockers: 0
advisories: 0
claims_checked: 3
claims_refuted: 0
mutation_limbs: 1
mutation_survivors: 0
```

The header line is exactly `evaluation:`. Each following line is one key, a colon, and an
integer. No units, no ranges, no `unscored`. Omit a key you have not measured yet. A missing
key means unknown. `0` means you measured zero. On every later return, repeat every key you
already know, including a resume and a stop for merge consent. When a number changes, the
new return carries the new integer.

## 2 — Where each integer comes from

Take the counts from the latest `falsifying-review` verdict JSON
(`verdict-shapes.md`) and from your own mutation gate. Do not sum them across rounds.

- **review_rounds** — the round number recorded on the PR for that verdict
  (`review-gate.md` §1d), including a `changes-requested` round. Omit until a verdict exists.
- **blockers** — the verdict's `blockingFindings` on `changes-requested`. On `approve`, `0`.
  Omit until a verdict exists. Merge consent is not a blocker and does not appear in this block.
- **advisories** — how many entries are in that verdict's `advisory` array. An empty array is
  `0`. Omit until a verdict exists.
- **claims_checked** — how many entries are in that verdict's `claimsVerified`.
- **claims_refuted** — how many of those entries have `result` `refuted`. Emit this with
  `claims_checked`, including when the refuted count is `0`. Omit both until a verdict exists.
- **mutation_limbs** and **mutation_survivors** — the raw counts from your mutation gate
  once it has finished (`review-gate.md` §2.4), including a survivor count of `0`. Omit both
  until that gate has finished. A light-tier ticket has no sweep, so both stay omitted.

Leave workflow failures, lessons, latency, and human interventions out of the block. The
runner measures those from the stream.
