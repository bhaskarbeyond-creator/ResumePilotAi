# Recovery registers (2026-10-29)

Generated from read-only historical artifacts under `developer-review/` and current recovery reports. The script is `developer-implemented/tools/build-recovery-registers.py`; it writes only here.

- `capabilities.csv`: 112 accepted capabilities plus 5 proposals explicitly marked `PROPOSAL_NOT_ACCEPTED`; only the accepted 112 contribute to the historical denominator.
- `findings.csv`: 56 original discrepancy IDs (including DISC-042 and DISC-046 as aliases) plus M9-P01 as a provisional new finding. Original IDs are preserved.
- `traceability.csv`: one row per accepted/proposed capability and one row per historical/provisional finding; explicit gaps and mismatched crosswalks are not guessed.

Historical capability classifications are copied verbatim and are not updated by this recovery. Except where a row names specific evidence, current statuses remain `NOT_REASSESSED`; finding closure and capability parity are distinct. DISC-055 is locally verified for route registration/RBAC behavior only; this is not a global finding closure or proof of payment/database/provider workflows. The historical DISC-055 reference to FP-A12 conflicts with the current FP-A12 name; the crosswalk is flagged rather than silently remapped.

Current source base SHA: `aa24147245daa6c027d046f1f7ae6f8fc703be46`.
