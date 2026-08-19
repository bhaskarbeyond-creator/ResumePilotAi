# Portfolio / Web CV forensic report

## 1. Baseline SHA
`885f6125f236ad0a164594ac58c15b9ef248849f`

## 2. Branch
`arena/01a017ba-resumepilotai` (fast-forward from `origin/main` at the same SHA; no later main commits).

## 3. Certified ancestry
`885f612` remains an ancestor. History was not rewritten.

## 4. Architecture
```
normalizeResumeData()
        ↓
convertResumeToPortfolio()   // one-way copy
        ↓
canonical Portfolio document (data.canonical + data.templateKey + data.renderer='webcv')
        ↓
WebCvRenderer → one of 4 templates
```

Draft vs published remains the existing Firestore contract:
- unpublished edits go to `draftData`
- public slug reads published `data` only
- OCC via `revision` / `PORTFOLIO_CONFLICT`

## 5. Templates
| ID | Mood | Layout |
| --- | --- | --- |
| modernMinimal | light | centered/minimal grid, hairline cards |
| executive | light | navy header, gold timeline, sidebar credentials |
| creativeDark | dark | warm editorial, oversized type, offset project cases |
| premiumTech | dark | SaaS rail nav, glass project cards, stack grid |

They do not share a single column layout with a color swap. Cyber clones are no longer the create-from-resume path. Legacy Puck templates remain available at `/portfolio/builder?legacy=1`.

## 6. Evidence
- Adapter + isolation + sanitization tests: pass
- SSR render of all 4 templates against the rich fixture: pass (no silent omissions, no Alex Cyber / Sofia / terminal personas)
- Template switch matrix: pass
- `npm run build`: pass
- ATS, resume persistence, i18n, certifications, extras, DOCX journey: pass
- Chromium Playwright gate: **written** (`npm run test:portfolio:browser`) but **not executed** — Chrome for Testing download failed with TLS reset
- Production deploy: **not performed** (no hosting deploy credentials in this session)

## 7. Remaining limitations
- Real Chromium screenshots and overflow probes require a browser binary.
- Live production Create-from-Resume / public URL verification requires a deployed environment.
- Generated dashboard preview images are illustrative, not live captures of the renderer.
