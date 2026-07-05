<!-- This is the bug reproduction record. Filled by `reproduce-bug`. -->

# <Bug title>

## Failing test(s)

Repo-root-relative path(s) to the `.spec.ts` or integration test file(s) written by `reproduce-bug`, with the `it(...)` name(s):

- `path/to/file.spec.ts` — `it("should <expected behavior>")`

## Repro steps

1. _Restated from the report's "Steps to reproduce"_

## Expected vs actual

**Expected:** _The correct behavior._

**Actual:** _The observed (buggy) behavior the test encodes._

## RED evidence

```
<verbatim failing-test output — the full stderr/stdout of the failed test run>
```

**Command run:** `pnpm test path/to/file.spec.ts`

**SHA:** `<commit hash this was run at>`

## Notes

_Anything `bug-analysis` or `plan-tasks` need to know (e.g. preconditions, data setup, intermittency patterns)._
