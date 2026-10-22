---
'@xenos1996/usa': patch
---

Carry a failing scanner's stderr into its UNKNOWN reason.

When a tool exited non-zero and wrote nothing parseable to stdout, the reason
read "output was not valid JSON" — true of every failure and useful for none.
depcruise pointed at a project with no `src/` writes
`ERROR: Can't open 'src' for reading. Does it exist?` on stderr, and the adapter
reported `Unexpected end of JSON input`.

The runner now appends the last non-empty stderr line to an UNKNOWN claim when
the process exited non-zero:

```
before  dependency-cruiser output was not valid JSON: Unexpected end of JSON input
after   dependency-cruiser output was not valid JSON: Unexpected end of JSON input
         (exit 1: ERROR: Can't open 'src' for reading. Does it exist?)
```

Verdicts are untouched. A FAIL stays exactly what the parser produced — stderr is
diagnosis, not evidence — and a zero-exit UNKNOWN is not annotated, because
nothing failed. The last line is taken because tools print warnings first and
their error last, and it is capped at 200 characters.
