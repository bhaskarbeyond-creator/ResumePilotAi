# H.1 evidence — ENTERPRISE_ENCRYPTION_KEY rotation + fail-closed drill

| Field | Value |
|---|---|
| Operator | _(name/handle)_ |
| Date (UTC) | |
| Tree SHA (printed by the drill) | |
| Branch | |
| Command | `bash scripts/dev-db/enterprise-key-rotation-drill.sh` |
| `PART1_EXIT` | |
| `H1_DRILL_EXIT` | |
| Deviations from expected-transcript.md | _(none / describe)_ |

## Full transcript (paste verbatim)

```
<paste>
```

## Optional HTTP-level A.12 extension (step 4 of the runbook)

| Field | Value |
|---|---|
| Performed? | yes / no |
| Engine boot env (redact key values) | |
| SQL read envelope observed | |
| Plaintext occurrences in `ai_providers` row | |

## Sign-off

- [ ] All part-1 checkpoints PASS
- [ ] All part-2 checkpoints PASS (or partial-run disclosed above)
- [ ] Fail-closed confirmed with code `ENTERPRISE_ENCRYPTION_UNAVAILABLE` (no plaintext in error)
- [ ] Drill ran against the sandbox bridge only (never production)

Operator signature: ______________________
