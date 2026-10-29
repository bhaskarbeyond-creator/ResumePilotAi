# Recovery evidence index — 2026-10-29

- Repository branch: `arena/76eeea4d-resumepilotai`
- Base/HEAD commit at index generation: `94399f2d886eb1f65e2728603f32f3e8c9ec452d`
- This is a checksum inventory, not a certification that every result passed. Current reports explicitly distinguish pass, fail, skip, mocked and blocked evidence.
- SHA-256 values cover the exact indexed files; regenerating logs or evidence changes those digests.

## Current authoritative evidence

| Evidence file | Current scope / result | Bytes | SHA-256 |
|---|---|---:|---|
| `developer-implemented/EVIDENCE/BASELINE/forensic-file-inventory.json` | Pre-implementation path/size/SHA-256 inventory for protected historical review files. | 80828 | `49ca5e1f0cd7cb93537e008ad23133d5de4c7828b5a81ec2ca92d41b700baa1d` |
| `developer-implemented/EVIDENCE/REMOTE/push-verification-20261029.txt` | Post-push remote verification of task-branch SHA; main/dev SHA, open PR state, and branch-protection limitation. | 978 | `eb01fc197350a3a58a6b11f2663e05a0325d71becf93d28aae07684ba1f0021f` |
| `developer-implemented/EVIDENCE/REGISTERS/recovery-register-validation-final-registers-20261029.txt` | Final validation of capability/finding counts, traceability IDs, evidence paths, and explicit FP-A12 mismatch handling. | 291 | `01071202760afc8a6f0fe3130eef6c5829dd05f32908beb31e99a4fb5d9d1230` |
| `developer-implemented/EVIDENCE/REGISTERS/recovery-cross-reference-audit-postpush-20261029.txt` | Final audit of the 10 authoritative reports after register/path updates; 95 repository-relative file references resolve. | 133 | `192c77c4f0aeb56e84e8ad7c004f8c85b466f12f154035f564a07a2183850519` |
| `developer-implemented/EVIDENCE/FORENSIC/check-review-integrity-release-20261029.txt` | Final protected-review integrity check after report/register updates; establishes 393/393 historical files unchanged. | 61 | `4c36c9ef1e35978cc1056d3059ee1b3e268e0574fa81145b020ee25d96e0e070` |
| `developer-implemented/EVIDENCE/UNIT/current-backend-suite-final-20261029.txt` | Authoritative default full backend suite result; FAIL 1,290/57/0 of 1,347. | 503738 | `01489bc63f7a47624bf472d55024ea11e11ad0af41acd7e1786a49bfe16ee50e` |
| `developer-implemented/EVIDENCE/UNIT/backend-non-mariadb-diagnostic-final-20261029.txt` | Separate MariaDB-disabled diagnostic; FAIL 1,292/25/30 of 1,347; skipped tests are not passes. | 477800 | `c6924d5ca403ea005826f84e952a472c92286ffae559c9e71d509362c2716533` |
| `developer-implemented/EVIDENCE/UNIT/backend-leaf-failures-20261029.csv` | Leaf failure names, locations, expected/actual values and observed-cause classification from both current runs. | 34947 | `4a0b54136dad361908a8cf15ee963391e1944d1a83551b16607f0710f1e05d49` |
| `developer-implemented/EVIDENCE/UNIT/payment-tests-final-20261029.txt` | Local payment suite, 43/43; not live settlement/provider or MariaDB evidence. | 9447 | `a726ccf8bfdbc1fead376269f74f9aa637b97a7274778acbd1d26db17bd6d2c8` |
| `developer-implemented/EVIDENCE/CONCURRENCY/enterprise-tests-final-20261029.txt` | Local enterprise suite, 187/187; not live MariaDB concurrency evidence. | 81481 | `14e320c809f2510d1e27876d88cedd3b12d3cce561b1cf45cdd2b4bbb2229605` |
| `developer-implemented/EVIDENCE/REGRESSION/disc055-and-webhook-replay-release-20261029.txt` | Focused DISC-055/payment-settings RBAC/audit/webhook tests, 16/16 with test dependencies. | 7269 | `ddb696b5be5c540704126ccc9eaa18574b82715ec65795f8c037038929577118` |
| `developer-implemented/EVIDENCE/REGRESSION/platform-registration-notification-webhook-release-20261029.txt` | Fresh registration, retired notification and webhook regression subset, 7/7. | 5283 | `d602a149eba8b11fae399b7b08180fa7b8a8e4d8541ea6372e2d0a5f423e7771` |
| `developer-implemented/EVIDENCE/REGRESSION/backend-exact-route-duplicates-20261029.json` | Whole-backend runtime literal route census and exact duplicate detector result. | 120539 | `c11fbd8a55dff8041b542860ee2972616030612da9fe9eb8375b42f22f8cc73a` |
| `developer-implemented/EVIDENCE/REGRESSION/backend-exact-route-duplicates-20261029.txt` | Human-readable summary of the whole-backend route detector run. | 761 | `a7a1569b2c203cb31d0963b5524d2fbf9ee9f7ed4399f2b62006de28c2ed113e` |
| `developer-implemented/EVIDENCE/REGRESSION/backend-route-reconciliation-20261029.json` | Machine-readable historical/current route registration comparison. | 13375 | `2164a6960b206c996f22400038b7124bfb8986ebba88b1b7c5fb209688005bdc` |
| `developer-implemented/EVIDENCE/REGRESSION/backend-route-reconciliation-run-20261029.txt` | Reconciliation generator run output. | 388 | `d46a480f04c2c25ecd6e0e4f371d8b0da4102e3727b72bd49a750db222d793d0` |
| `developer-implemented/EVIDENCE/BUILD/final-recovery-build-20261029.txt` | Root production build and distribution sync result. | 12606 | `1eef0b4131fc8bd603312d95624b70a7411a18e59fe0b0c41d4e939f202037b0` |
| `developer-implemented/EVIDENCE/STATIC/final-recovery-lint-20261029.txt` | Root lint result. | 193 | `21b23b85ec4e1aaddaf3a94296ee22297ec381e84e8cbd29738c9dbe7f019524` |
| `developer-implemented/EVIDENCE/SECURITY/final-postbuild-security-20261029.txt` | Post-build security/config verification; absent dist/.htaccess is explicitly skipped. | 473 | `510f7d7d31443f19d98a8a5e699d0be7cc28de01e6c7713ff9c0fd7aeb2cc20c` |
| `developer-implemented/EVIDENCE/BROWSER-E2E/mandate9-browser-mocked-20261029-retry.txt` | Mocked Mandate 9 browser UI run, 7/7; API traffic intercepted, not backend E2E. | 717 | `d41e9bc82b306658483a4dd2025928770e892e5c1c367dfa65addb8d970c0dfe` |
| `developer-implemented/EVIDENCE/BROWSER-E2E/full-playwright-disposable-db-preflight-20261029.txt` | Configured full Playwright attempt; refused by the required disposable-DB preflight before test execution. | 1172 | `593637a43db26eedccc46b18ad01f52be15cd6300dc489671a5ef52c44c61143` |

## Preserved supplementary and historical evidence

Files below are retained for traceability. Unless listed as current above, they are prior-run or supporting records and must not supersede the current verification report. Older files explicitly labelled `current` in their historical filenames predate this snapshot and are not necessarily current.

| Evidence file | Status | Bytes | SHA-256 |
|---|---|---:|---|
| `developer-implemented/EVIDENCE/BROWSER-E2E/mandate9-browser-mocked-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 7464 | `b68757495dc0a6c9fdbcf21c4b1598543c3620b2b44234c90f74d23666337ba9` |
| `developer-implemented/EVIDENCE/BUILD/current-platform-patch-build.txt` | Historical/supporting; not authoritative for current release verdict | 12606 | `502e2c4e3a1212bab5c93b5e918cb77a73b5af09a4ff2246577957d1c964b6db` |
| `developer-implemented/EVIDENCE/BUILD/current-production-build.log` | Historical/supporting; not authoritative for current release verdict | 12698 | `5601b5939ecc01438a6d6f0e40af09e54bd465414a4d8d83bc73f61c15e1ce1c` |
| `developer-implemented/EVIDENCE/BUILD/install-backend.log` | Historical/supporting; not authoritative for current release verdict | 532 | `76b8704af8896e5cae0ae7c4aa973342e089c0e636379093187f1a4760d9b16d` |
| `developer-implemented/EVIDENCE/BUILD/install-frontend.log` | Historical/supporting; not authoritative for current release verdict | 2370 | `f4b3a90affbd1ed16f6566aeb375f42eb604427b4c709f5cb62197c2d4dc94c9` |
| `developer-implemented/EVIDENCE/BUILD/install-root.log` | Historical/supporting; not authoritative for current release verdict | 1035 | `bff0b7a4c6673fb14cf77d5a247d2cb88e9ccba799683b56138b3952bba7af8b` |
| `developer-implemented/EVIDENCE/CONCURRENCY/current-enterprise-tests.log` | Historical/supporting; not authoritative for current release verdict | 81665 | `4969111586084f10c80f7fbee3f1959fbe543ee40368227078d088ce9044f485` |
| `developer-implemented/EVIDENCE/CONCURRENCY/enterprise-tests-after-router-mount-cleanup.txt` | Historical/supporting; not authoritative for current release verdict | 81407 | `b91cc18827ff85f34f4bc199faa8801142f3aea1de1b921d0b86e085376ce7a1` |
| `developer-implemented/EVIDENCE/FORENSIC/check-review-integrity-final-20261029.txt` | Supporting baseline/context | 61 | `4c36c9ef1e35978cc1056d3059ee1b3e268e0574fa81145b020ee25d96e0e070` |
| `developer-implemented/EVIDENCE/FORENSIC/check-review-integrity-post-change-20261029.txt` | Supporting baseline/context | 74 | `bd5f221908054d34e2fb69a50327674080f00aede3c59b9d0b772888aa7d21ef` |
| `developer-implemented/EVIDENCE/REGISTERS/recovery-cross-reference-audit-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 714 | `f780884294a48d4520a77b554879b63e5a6aa15c9b93099c6de785ef20ca2f17` |
| `developer-implemented/EVIDENCE/REGISTERS/recovery-cross-reference-audit-final-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 133 | `00f915940720bbe8eb2947d14ff315e29196dc7a793cd5b7cb46033b70b80da4` |
| `developer-implemented/EVIDENCE/REGISTERS/recovery-cross-reference-audit-final-snapshot-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 133 | `1cbc38e9388b9c29ce22d9d5ca5130040c671f71cf091ff7476a4beabf0845a3` |
| `developer-implemented/EVIDENCE/REGISTERS/recovery-cross-reference-audit-post-update-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 133 | `00f915940720bbe8eb2947d14ff315e29196dc7a793cd5b7cb46033b70b80da4` |
| `developer-implemented/EVIDENCE/REGISTERS/recovery-register-validation-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 291 | `01071202760afc8a6f0fe3130eef6c5829dd05f32908beb31e99a4fb5d9d1230` |
| `developer-implemented/EVIDENCE/REGISTERS/recovery-register-validation-final-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 291 | `01071202760afc8a6f0fe3130eef6c5829dd05f32908beb31e99a4fb5d9d1230` |
| `developer-implemented/EVIDENCE/REGISTERS/recovery-register-validation-release-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 291 | `01071202760afc8a6f0fe3130eef6c5829dd05f32908beb31e99a4fb5d9d1230` |
| `developer-implemented/EVIDENCE/REGRESSION/disc055-and-webhook-replay-final-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 7168 | `cd3c5290a5b98a2e8e8c6a1561c627591e862feb16e42f202cc7c281be479e64` |
| `developer-implemented/EVIDENCE/REGRESSION/disc055-and-webhook-replay-targeted.txt` | Historical/supporting; not authoritative for current release verdict | 7197 | `c23541bb218f961ef0ffbff011bfba0ce3ee27b7c335e360a350940aa9dd556b` |
| `developer-implemented/EVIDENCE/REGRESSION/platform-registration-notification-webhook-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 5237 | `0bd5fcc729ba07e80ed6718540f4c44ec46130255596f46444a5ca9af9b30b80` |
| `developer-implemented/EVIDENCE/REMOTE/repository-state-final-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 2715 | `fb0878758c3760949e2379cef16798aeec25f40b6b22bf7257bd400286054083` |
| `developer-implemented/EVIDENCE/SECURITY/current-postbuild-security.txt` | Historical/supporting; not authoritative for current release verdict | 473 | `510f7d7d31443f19d98a8a5e699d0be7cc28de01e6c7713ff9c0fd7aeb2cc20c` |
| `developer-implemented/EVIDENCE/SECURITY/current-security-checks.log` | Historical/supporting; not authoritative for current release verdict | 573 | `909b7409438196951a603d8122f80903c7dad4ae98ff57002fd7f97448523321` |
| `developer-implemented/EVIDENCE/STATIC/current-frontend-lint.log` | Historical/supporting; not authoritative for current release verdict | 285 | `980b4b8285a0efbc8059b4532e6c5d2fc9a0b2f0597d586584663e88e0c056ac` |
| `developer-implemented/EVIDENCE/STATIC/current-platform-patch-lint.txt` | Historical/supporting; not authoritative for current release verdict | 193 | `fce4af349c2c576db010137a648a7f03b6375f5d5e7235776b21516468271bcc` |
| `developer-implemented/EVIDENCE/UNIT/backend-non-mariadb-diagnostic-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 475809 | `18edee00c8ff24ddfe7fa189af0434663351bac7f7919dae0a55c28a792a0be4` |
| `developer-implemented/EVIDENCE/UNIT/current-backend-failure-extract.txt` | Historical/supporting; not authoritative for current release verdict | 143835 | `789733fe4bbe8a476c3fdf9b9dc1532aceca45a73f14567446a6489c58a9ca2b` |
| `developer-implemented/EVIDENCE/UNIT/current-backend-failure-summary-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 13599 | `a5a8f2563fa70fcaa41ffe8416b50df7081797d7c8265e4261a58915f1e411ee` |
| `developer-implemented/EVIDENCE/UNIT/current-backend-suite-20261029.txt` | Historical/supporting; not authoritative for current release verdict | 503725 | `e06318abe2c2a18650fd7cdea70d354454350c631f770b064965acf809d12abf` |
| `developer-implemented/EVIDENCE/UNIT/current-backend-suite.log` | Historical/supporting; not authoritative for current release verdict | 496221 | `8204cf86e4ef3502093dd38c16ea2727e80b32ea71755cf2167bcb5e8dae1d08` |
| `developer-implemented/EVIDENCE/UNIT/current-payment-tests.log` | Historical/supporting; not authoritative for current release verdict | 9625 | `0d7499c1b68076cc735bd94681bde340ae4c8e8ab4988f0d254e7272f365febd` |
| `developer-implemented/EVIDENCE/UNIT/payment-tests-after-platform-patch.txt` | Historical/supporting; not authoritative for current release verdict | 9445 | `b2bf9da10023bee8a76b94197bcb1171ef5ab0e0b277855d59383eaecaf34e2f` |
| `developer-implemented/EVIDENCE/apt-update-attempt.txt` | Historical/supporting; not authoritative for current release verdict | 820 | `8f1644ad6338ec730e2e6c48d3e57cf1cbd315c83ab8ad71b7f9a6509e9e8b4a` |
| `developer-implemented/EVIDENCE/blog-contract-unit.txt` | Historical/supporting; not authoritative for current release verdict | 342 | `3d7e12dd12573c85419990438928db05336fd9a82ac53f8602e252310d3436d0` |
| `developer-implemented/EVIDENCE/blog-visibility-test.txt` | Historical/supporting; not authoritative for current release verdict | 784 | `e7924b675c7d7f7529c2be2620b68767ed05230a10880688ee202a80fea5a9ce` |
| `developer-implemented/EVIDENCE/browser-mandate9-attempt.txt` | Historical/supporting; not authoritative for current release verdict | 24570 | `51b400803d62dd617fc50bb1e9287b64900c359838c8ecafd85d4a31aa9adcfa` |
| `developer-implemented/EVIDENCE/build-after-contact-queue.txt` | Historical/supporting; not authoritative for current release verdict | 12606 | `06f3a67cebef4a693958299f16e8e4b6fd2032a958d52002712d19c1678adf0c` |
| `developer-implemented/EVIDENCE/build-contracts-current.txt` | Historical/supporting; not authoritative for current release verdict | 12606 | `46e39af2ae64d474083f69f0305f7338f0d86dc8d4090920e2ec1169e51c6855` |
| `developer-implemented/EVIDENCE/build-final.txt` | Historical/supporting; not authoritative for current release verdict | 12606 | `23bbc2387d04aa062172ab8c8260dfff1ca12f8e3164304af4e723ce35b69ce8` |
| `developer-implemented/EVIDENCE/chromium-install-attempt.txt` | Historical/supporting; not authoritative for current release verdict | 3421 | `f7355ca1f91fe657dba4d70625cd110fce875539b04bf65b7c33455fbc771f0e` |
| `developer-implemented/EVIDENCE/chromium-npm-install.txt` | Historical/supporting; not authoritative for current release verdict | 38 | `34d6a60932a03d178e58094fd1bfe1896a0bc5224a06bc2e1e05f0b5bbee484c` |
| `developer-implemented/EVIDENCE/contact-unit.txt` | Historical/supporting; not authoritative for current release verdict | 1065 | `77299583978770e2f87842f6f7873efcae9a9385c14714ac7090f967bb16970d` |
| `developer-implemented/EVIDENCE/contracts-build.txt` | Historical/supporting; not authoritative for current release verdict | 12606 | `61737b9c0f6fd56dc999b1ae947b3d837ec6510ea1cd1e08208c84ae1adf3453` |
| `developer-implemented/EVIDENCE/contracts-lint.txt` | Historical/supporting; not authoritative for current release verdict | 193 | `f67eb82dcc3262d55b904a278dbff1efce229d9cad077669961cf98da265bf1e` |
| `developer-implemented/EVIDENCE/coupon-unit.txt` | Historical/supporting; not authoritative for current release verdict | 294 | `3aadbf57cf828aba483f71310ddbd419e4ff861f85ec93526083e0db5cbebed9` |
| `developer-implemented/EVIDENCE/enterprise-current.txt` | Historical/supporting; not authoritative for current release verdict | 81571 | `bcdf0e2c9d13328e8e2e673e8dabe44fd17424ba60270373535ab7c9887e31f1` |
| `developer-implemented/EVIDENCE/enterprise-final.txt` | Historical/supporting; not authoritative for current release verdict | 81544 | `a9ef1279d1dc1d07234970aa684847e0999d229e1f92428eacdb0ce9ae58429d` |
| `developer-implemented/EVIDENCE/jobs-build.txt` | Historical/supporting; not authoritative for current release verdict | 12606 | `ca88ab5f864feb4e1428cf83aa003464e375cb9f11c84e1d4bff1da2e5a87d13` |
| `developer-implemented/EVIDENCE/jobs-contract-unit.txt` | Historical/supporting; not authoritative for current release verdict | 533 | `d9d457c761c595437a2b90ed40eb14cf792ce04f69274d854f0afe2851aebc8f` |
| `developer-implemented/EVIDENCE/lint-after.txt` | Historical/supporting; not authoritative for current release verdict | 194 | `5b1ded3e7ac32b6800bffb7b531ed87f486ea03cca8b791790ae2c98c7d253b9` |
| `developer-implemented/EVIDENCE/lint-contracts-current.txt` | Historical/supporting; not authoritative for current release verdict | 194 | `2ddd3e786c46a7eede1f3904228fd9db89608e1653d923c3b2e2e7c88b91fb6d` |
| `developer-implemented/EVIDENCE/lint-final.txt` | Historical/supporting; not authoritative for current release verdict | 194 | `c4e97cae22763974dba6fcf1ff7b0bc5eecfa5c81f0f9ab9f5a50aeba13a089f` |
| `developer-implemented/EVIDENCE/payment-mitigation-build.txt` | Historical/supporting; not authoritative for current release verdict | 12606 | `66ae24ad57b297b7e0b8cac1468d39628a78f8c7284884b5b95bb95abae3dde0` |
| `developer-implemented/EVIDENCE/payment-source-guard.txt` | Historical/supporting; not authoritative for current release verdict | 360 | `d60815cb83bc65f824eb21126471c29f24a8c30114d8f3412df36199f4a74240` |
| `developer-implemented/EVIDENCE/payment-status-unit.txt` | Historical/supporting; not authoritative for current release verdict | 543 | `2356aa431b0c7aab37f279ca9844de2b537c1fd10cc7c01850f7ab906a44a202` |
| `developer-implemented/EVIDENCE/payments-after.txt` | Historical/supporting; not authoritative for current release verdict | 9518 | `f49569f2f3e89e6dc1c729f65afe20e18bbbe9fdc01362169507c621607a8a78` |
| `developer-implemented/EVIDENCE/payments-current.txt` | Historical/supporting; not authoritative for current release verdict | 9519 | `bf6ebaf2d63b0f9de5d867ca4450fea50e62e071108456d72b0b074b5e1e1879` |
| `developer-implemented/EVIDENCE/platform-status-unit.txt` | Historical/supporting; not authoritative for current release verdict | 322 | `9c58ed7f1e64c45818d2871f3009af1d159240af3b2a7d0982efc65a811f3265` |
| `developer-implemented/EVIDENCE/profile-after.txt` | Historical/supporting; not authoritative for current release verdict | 3408 | `068bf8f447bc5f29eaf9c47b44c1bf20152cf34eaa56f98de85b7d4623c0ae59` |
| `developer-implemented/EVIDENCE/profile-before.txt` | Historical/supporting; not authoritative for current release verdict | 2949 | `10b0f426e76750e1149ec4302962c743df9806d72bac89182aac11d3e221e7ea` |
| `developer-implemented/EVIDENCE/profile-insert-only-unit.txt` | Historical/supporting; not authoritative for current release verdict | 4449 | `d12df21756bdaaa05283ae0123707003438a718568efa025e8c69f912be9a039` |
| `developer-implemented/EVIDENCE/profile-mariadb-gate-attempt.txt` | Historical/supporting; not authoritative for current release verdict | 453 | `ee7bb57453e3bdeb4f3e1c7bb2384419f2e4b95738b473b3599f3e69358f58d6` |
| `developer-implemented/EVIDENCE/profile-memory-reproduction.txt` | Historical/supporting; not authoritative for current release verdict | 62 | `dad6f412d35b08e0ad8f34a60481d0a1f7f0f62c766b74ee1a32df7e91045ad8` |
| `developer-implemented/EVIDENCE/queue-unit.txt` | Historical/supporting; not authoritative for current release verdict | 523 | `a649a2025ad96219be79cefa069da3b148ec6412a4542279aff0a7ed2b4074a9` |
| `developer-implemented/EVIDENCE/review-integrity-contracts.txt` | Historical/supporting; not authoritative for current release verdict | 74 | `08e56894e93124b8371ea7c3342615a399c5110485eb794a699cff01574c1a05` |
| `developer-implemented/EVIDENCE/review-integrity-final.txt` | Historical/supporting; not authoritative for current release verdict | 74 | `08e56894e93124b8371ea7c3342615a399c5110485eb794a699cff01574c1a05` |
| `developer-implemented/EVIDENCE/review-integrity-milestone-1.txt` | Historical/supporting; not authoritative for current release verdict | 74 | `08e56894e93124b8371ea7c3342615a399c5110485eb794a699cff01574c1a05` |
| `developer-implemented/EVIDENCE/security-integration-current.txt` | Historical/supporting; not authoritative for current release verdict | 5833 | `03a080e978504ffef84938ba917d49a455aec4e8772c5062eb48912df7500fce` |
| `developer-implemented/EVIDENCE/targeted-contracts-current.txt` | Historical/supporting; not authoritative for current release verdict | 4180 | `0d57fb55f72d125b969f0bc7cf3f2776dc5441112a35f13f949ec3c738505b58` |
| `developer-implemented/EVIDENCE/test-contracts-current.txt` | Historical/supporting; not authoritative for current release verdict | 477681 | `15005679b961f9d3f8f9a0fa633d71e1e0157d7c9470ddf0e01a7af43bab9936` |
| `developer-implemented/EVIDENCE/test-final.txt` | Historical/supporting; not authoritative for current release verdict | 477237 | `529b45f312cfbd4dd7f18e964a5d4871ad0bae6917ccbf0ac1cdfa11b9ad6243` |

## Reports and registers

- `developer-implemented/REPORTS/verification-reports/current.md` — current claim-by-claim verification result and verdict.
- `developer-implemented/REPORTS/verification-reports/backend-failure-triage-20261029.md` — two distinct backend runs, failure categories and limits.
- `developer-implemented/REPORTS/FORENSIC-DELTA.md` — source changes, historical/current route registration reconciliation, and evidentiary limits.
- `developer-implemented/REPORTS/BACKEND-ROUTE-REGISTRATION-RECONCILIATION-20261029.md` — row-level normalized historical/current route comparison.
- `developer-implemented/REPORTS/IMPLEMENTATION-LOG-20261029.md` — file-level implementation log and verification performed.
- `developer-implemented/REGISTERS/README.md`, `capabilities.csv`, `findings.csv`, `traceability.csv` — 112 accepted capabilities, 5 proposals excluded from denominator, all 56 historical DISC IDs and provisional M9-P01; most capabilities remain not reassessed.
- `developer-implemented/RELEASE-READINESS/FINAL-READINESS-CERTIFICATION-20261029.md` — final blocked readiness decision and unverified release gates.

The index excludes itself to avoid a recursive checksum. Historical forensic source files remain under `developer-review/` and are covered by the protected inventory/integrity evidence; this index does not modify them.
