# V5 logs — which ones may be cited

| File | Status | Command | Result |
|---|---|---|---|
| `backend-canonical-suite.log` | **VALID — cite this one** | `cd backend && npm test` | 1,315 tests, 1,269 pass, 46 fail, 0 skip, exit 1 |
| `backend-canonical-suite.triage.md` | **VALID** (derived) | analysis of the log above | 46/46 failures attributed to the absent database |
| `backend-suite.log` | **INVALID — do not cite** | `node --test test/` | 1 test, 0 pass, 1 fail: the runner resolved `test/` to the directory `backend/test`, which has no entry module, so no test file was executed |

`backend-suite.log` is kept rather than deleted because it documents a harness error that produced a
misleading "the suite fails" result. It is not evidence about the application. The canonical command is
`npm test`, which runs `backend/scripts/run-tests-with-annotations.js` and turns the MariaDB integration
gate **on** by default.
