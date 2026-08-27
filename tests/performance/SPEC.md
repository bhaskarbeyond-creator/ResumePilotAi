# Performance Certification Spec — thresholds defined BEFORE execution

Environment under test: single backend process (Node 22) on 2 vCPU / 3.8 GB,
local MySQL 5.7.29, connection pool limit 15. These thresholds are
single-instance certification targets; horizontal scaling is out of scope.

## Pass/fail thresholds

| Scenario | Concurrency | p50 | p95 | p99 | Error rate | Notes |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Resume list read (auth) | 20 | < 80 ms | < 150 ms | < 400 ms | < 0.1% | MySQL primary key/index reads |
| Resume save (auth) | 10 | < 150 ms | < 300 ms | < 800 ms | < 0.5% | txn + upsert; 409 conflicts counted as expected, not errors |
| Same-document concurrent update | 5 writers | n/a | n/a | n/a | 0 corruption | exactly one writer wins per revision round; no lost/corrupt data |
| Authenticated mixed reads | 30 | < 100 ms | < 200 ms | < 500 ms | < 0.1% | profile + resumes + settings reads |
| AI generation (fallback path) | 5 | < 250 ms | < 500 ms | < 1000 ms | 0% | deterministic fallback for operations that define one (skills/certifications/bullet/autocomplete) |
| AI fallback-less operation | 1 | n/a | n/a | n/a | controlled | operation without a content-route fallback must return a CONTROLLED 502 with error code within 6 s — never hang |
| AI provider failure | 5 | n/a | controlled | controlled | 0 hang | unreachable provider must return controlled fallback/error within provider timeout, never hang |
| DOCX export | 3 | < 2.5 s | < 5 s | < 8 s | 0% | CPU-bound document build |
| Pool pressure | 50 (distinct users) | < 300 ms | < 1000 ms | < 2000 ms | < 1% | 30 s sustained; spread across 50 identities so per-uid limiters don't dominate; queue wait acceptable, no connection timeouts |

## Resource gates

- Backend RSS growth: SETTLED value (average of final samples after a 20 s post-load settle) < 30% above post-warmup baseline. Heap expansion during load is expected; persistent growth after load ends is the leak signal.
- MySQL connections: peak ≤ pool limit (15) + 2 tolerance; returns to baseline within 30 s of load end
- No `DATABASE_UNAVAILABLE` outside injected-fault scenarios
- Event loop: no request dropped due to saturation (all requests receive a response)

## Methodology

- Fixed-concurrency open-loop driver (Node harness, `tests/performance/load.mjs`)
- Warmup: 20 requests before measurement
- Percentiles computed per scenario from the measurement window only
- DB connection count sampled from `information_schema.processlist`
- RSS sampled from `/proc/<pid>/status`
