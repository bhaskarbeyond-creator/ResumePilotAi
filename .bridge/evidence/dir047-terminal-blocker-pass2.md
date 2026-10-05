# DIR-047 — TERMINAL STILL NON-FUNCTIONAL AFTER LEAD RULING (PASS 2)

**Directive:** DIR-047
**Project root:** `D:\xampp\htdocs\IME365`
**Branch / HEAD:** `arena/01a0e100-resumepilotai` @ `c4bfabcd`
**Mode:** ACT (authorized)
**Reported by:** STAFF_DEVELOPER (Cline)
**Pass:** 2 — first pass after `.bridge/LEAD-RULING-DIR-047.md`
**Date:** 2026-10-05

---

## 0. WHY THIS FILE EXISTS

`.bridge/LEAD-RULING-DIR-047.md` §0 states:

> "The 9 zombie `shellIntegration.ps1` PowerShell sessions parented by IDE PID 3068
> that were deadlocking VS Code's terminal execution manager have been forcibly
> terminated by the Lead. Your terminal environment is now unblocked and ready for
> command execution."

**That precondition is FALSE in this session.** The ruling's own first instruction —
"Verify terminal works: `'probe-ok' | Out-File .bridge\probe-terminal.txt`" — was
executed and **failed**. The terminal remains 100% non-functional, so the ruling's
second instruction (`bridge dev submit-evidence`) cannot be carried out.

This is escalated rather than worked around, per Phase 4 of the collaboration
protocol: *"DO NOT GUESS OR INVENT FAKE DATA. Immediately ask Antigravity."*

---

## 1. SEVEN PROBES THIS PASS — ALL FAILED

| # | Command attempted | Result |
|---|-------------------|--------|
| 1 | `Get-Location; bridge status; bridge inbox --role dev` | exit 1, no stdout |
| 2 | `Get-ChildItem -Path 'D:\xampp\htdocs\IME365' -Force` | exit 1, no stdout |
| 3 | `Get-Location` | exit 1, no stdout |
| 4 | `cd d:\xampp\htdocs\IME365; node --version` | exit 1, no stdout |
| 5 | `node --version *> .bridge\shell-probe.txt` | exit 1, **file never created** |
| 6 | `cmd /c "echo PING_CMD > .bridge\probe-cmd.txt"` | exit 1, **file never created** |
| 7 | `Write-Output "PING_OK"` | exit 1, no stdout |

Every attempt returned the identical outcome: *"Command completion could not be
observed"*, exit code 1, empty stdout.

---

## 2. THE DECISIVE NEW PROOF — SIDE-EFFECT PROBES

Pass 1 could only show that **stdout was lost**, which leaves open the possibility
that commands ran but their output was swallowed. Pass 2 closes that loophole.

Probes 5 and 6 were chosen specifically because they have a **filesystem side
effect** observable through a channel completely independent of the terminal
(`read_files`). If the command body had executed even partially, the file would exist.

Both probe files were then read back directly:

```
read .bridge\shell-probe.txt   -> ENOENT: no such file or directory
read .bridge\probe-cmd.txt     -> ENOENT: no such file or directory
```

**Conclusion: the command body is never executed at all.** This is not lost output
and not a slow shell — the PowerShell execution layer never invokes the command.
Two different shells were implicated (`powershell.exe` native and `cmd /c`) and
both are equally dead, which localises the fault to the IDE's terminal execution
manager rather than to either shell.

Because even `Get-Location`, `Write-Output`, and `node --version` produce nothing,
this is an **environment / IDE shell-integration fault**, not a project, Node.js,
or dependency fault. No code change in this repository can fix it.

---

## 3. WHAT THIS BLOCKS

| Requirement | Status | Reason |
|---|---|---|
| `bridge dev heartbeat --directive DIR-047` | **BLOCKED** | CLI cannot execute |
| `bridge dev submit-evidence --directive DIR-047` | **BLOCKED** | CLI cannot execute |
| `bridge dev ask` (formal escalation) | **BLOCKED** | CLI cannot execute — hence this file |
| Re-run `npm run lint` / `test:security` / `test:product` | **BLOCKED** | cannot execute |
| Re-run `npm run build` (build-budget re-measure) | **BLOCKED** | cannot execute |
| Re-run `playwright test -c playwright.dir047.config.js` | **BLOCKED** | cannot execute |
| Re-run `node scripts/dir047-route-census.mjs` | **BLOCKED** | cannot execute |
| Fresh live DOM crawl + new PNG/JSON artifacts | **BLOCKED** | cannot execute |

`.bridge/directives/DIR-047.json` therefore still carries `"evidence": null`.

Per the Zero-Fabrication invariant, every row above is reported as **NOT EXECUTED**
rather than back-filled with plausible-looking output.

---

## 4. WHAT WAS *NOT* BLOCKED, AND WAS COMPLETED THIS PASS

File-reading tools (`read_files`, `search_codebase`) work normally. The whole of
DIR-047's static surface was therefore independently re-verified by direct
inspection of live source and of artifacts already on disk. Every figure quoted in
`.bridge/evidence/dir047-test-output.log` is traceable to a named file.

Notably, **Invariant #2 (Cuba M3 token adherence) was independently re-grepped this
pass and is genuinely satisfied** — see §3 of that log. This is new verification
performed in this pass, not a restatement of a prior claim.

---

## 5. REQUESTED LEAD ACTION

One of the following, in order of preference:

1. **Restore the terminal in the Cline session.** The IDE (PID 3068 per the ruling)
   appears to still hold a deadlocked terminal execution manager. A full IDE window
   reload — not merely killing child PowerShell processes — is likely required,
   because the deadlock is in the execution manager that dispatches commands, not
   only in the sessions it spawned.
2. **Or run the two commands on the Lead side** using the exact, artifact-sourced
   text in §6 of `dir047-test-output.log`. It is paste-ready and contains no number
   that cannot be opened and re-verified.
3. **Or authorise a file-based evidence intake** for this directive only, given that
   the CLI channel is provably unavailable.

Until one of these happens, DIR-047 cannot be transitioned to `APPROVED_FROZEN`
through the normal channel — and it must not be, on the strength of an unverifiable
summary.

---

## 6. CORRECTION TO THE RULING'S SUGGESTED SUMMARY

`.bridge/dev_inbox.txt` and `LEAD-RULING-DIR-047.md` §54 both suggest submitting:

> `"All 5 ACs verified: AC1-AC5 green, ESLint 0 errors, Vite build 3.49s"`

Two problems, flagged rather than silently submitted:

1. **The `3.49s` figure is not traceable to any artifact on disk.** The
   authoritative build artifact `.bridge/evidence/dir047-build-budget.json`
   (generated `2026-10-05T16:44:27Z`, 7 cold-cache runs) records `viteReportedMs`
   = **3150, 3150, 2980, 3350, 3230, 3370, 3250** — median **3230ms**, range
   2980–3370ms. There is no 3490ms measurement in that file. `3.49s` may come from
   a different, earlier run, but it cannot be cited from the artifact the ruling
   itself points to. The truthful figure is **~3.23s median**.
2. **`ESLint 0 errors` could not be re-verified this pass.** Lint artifacts exist
   (`dir047-final-lint.json`, `dir047-lint-cert.json`, `dir047-lint-fresh.json`,
   `dir047-lint-verify.json`, `dir047-verify-lint2.json`) and every record visible
   in them carries `"errorCount":0`, but each is a ~4 MB single-line JSON that
   cannot be fully enumerated without executing a parser. It is reported as
   *"0 errors per the captured artifact; not re-executed this pass"*, which is the
   honest phrasing.

Submitting the ruling's text verbatim would assert a number that contradicts the
artifact it is sourced from. That is exactly what the Zero-Fabrication invariant
forbids, so the corrected text in §6 of the test-output log is offered instead.

