# makefun-csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/phothan26/makefun-csv-reader-speed/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/phothan26/makefun-csv-reader-speed/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in for csv-reader 1.0.0: `solve.js` answers every CSV case exactly
as csv-reader does — same `{columns, rows, errors}`, same broken-row policy
(stray CRs, quote junk, unterminated quotes, short and long rows) — but reads
the text with `indexOf` jumps and `slice`/`split` instead of one character at
a time. On the practice set it runs the six cases in ~0.25 s of CPU, about
3× faster than the house baseline's ~0.9 s on the same machine.

`main.ts` is the driver the harness runs: it reads every case from
`/input/cases.json`, answers each one alone with `run()` from `solve.js`, and
writes `/output/answers.json`.

## Run it

```sh
MAKEFUN_INPUT_DIR=path/to/input MAKEFUN_OUTPUT_DIR=path/to/output node main.ts
```

Outside a container the two environment variables stand in for `/input` and
`/output`; with neither set it reads `/input/cases.json` and writes
`/output/answers.json`, as the grader runs it.

## How it is fast

- A record with no quote in it is cut out whole with one search and split on
  commas — no per-character loop, no per-field work.
- An unquoted field jumps straight to its next delimiter with a single regex
  search, instead of reading a character at a time.
- A quoted field with no line break inside is sliced whole, doubled quotes
  resolved with one `replaceAll`; only a field with a line break inside is
  built segment by segment.
- Everything stays pure and deterministic: two runs on the same cases write
  byte-identical `answers.json`.

## License

MIT — see `LICENSE`.

---

<sub>Entered on [make.fun](https://make.fun/?ref=t7e39kme&utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
