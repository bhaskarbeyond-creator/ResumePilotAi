# Senior Developer Engineering Review & Technical Specification
## High-Fidelity Editable DOCX Export Engine for ResumePilot AI

---

### 1. Executive Summary & Problem Statement

While the PDF export pipeline renders **1:1 pixel-perfect** documents via Headless Chromium / Playwright, the current DOCX export output suffers from significant visual and structural regressions when opened in Microsoft Word or Google Docs:

1. **Raw HTML Markup Leaking into Document**:
   - The rich-text editor stores HTML (`<p class="editor-paragraph" dir="ltr"><span style="...">...</span></p>`).
   - The current `docxExport.js` dumps these strings directly into Word text runs, causing raw HTML code to appear in the exported `.docx`.
2. **Layout Flattening (Loss of 2-Column Sidebar Structure)**:
   - Templates like `Cv1` feature a distinct 2-column layout (left sidebar with contact, skills, languages + right hero column with summary and employment + full-width bottom education).
   - The current DOCX engine flattens all templates into a single vertical column with generic spacing.
3. **Color Palette Mismatch**:
   - `Cv1` in PDF uses vibrant orange (`#EA580C`) and slate accents, while DOCX exports use an arbitrary modulo palette (dark navy `#1B365D`).
4. **Dates & Typographic Hierarchy**:
   - Job dates (`2021 – Present`) and company names are concatenated into plain strings instead of styled headers with right-aligned dates and native Word bullet lists.

---

### 2. Visual Comparison & Root Cause Analysis

```
Current PDF Render (High Fidelity)               Current DOCX Render (Naive Linear)
┌──────────────────────────────────────────┐    ┌──────────────────────────────────────────┐
│ [Bhaskar Babu Madala]                    │    │ Bhaskar Babu Madala                      │
│ Frontend Developer                       │    │ bhaskar.beyond@gmail.com • +918555035068 │
│                                          │    │                                          │
│ ┌──────────────┬───────────────────────┐ │    │ Professional Summary                     │
│ │ CONTACT      │ SUMMARY               │ │    │ <p class="editor-paragraph" dir="ltr">   │
│ │ • Email      │ Experienced frontend..│ │    │ <span style="...">Frontend dev...</span> │
│ │ • Phone      │                       │ │    │ </p>                                     │
│ │              │ EMPLOYMENT            │ │    │                                          │
│ │ SKILLS       │ • Senior Engineer     │ │    │ Experience                               │
│ │ [JS] [React] │   Beyond Tech (2021-) │ │    │ Senior Software Engineer — Beyond Tech   │
│ │ [TypeScript] │   • Bullet 1          │ │    │ 2021 – Present                           │
│ │              │   • Bullet 2          │ │    │ • Delivered software project...          │
│ │ LANGUAGES    │                       │ │    │                                          │
│ │ • Telugu     │                       │ │    │ Education                                │
│ │ • English    │                       │ │    │ B.Tech — Chaitanya College               │
│ └──────────────┴───────────────────────┘ │    │                                          │
│ EDUCATION (Full-Width Bottom Flow)       │    │ Skills                                   │
│ • B.Tech in ECE — Chaitanya College      │    │ • JavaScript                             │
└──────────────────────────────────────────┘    └──────────────────────────────────────────┘
```

---

### 3. High-Fidelity Architecture & Implementation Plan

To achieve visual parity between the PDF and the editable DOCX output across all 51 templates, the DOCX engine must be upgraded with the following 4 core modules:

#### Module A: Universal HTML/Lexical Tag Stripper & Bullet Tokenizer
Before passing any text into `docx.Paragraph` or `docx.TextRun`, it must be cleaned and parsed into structured blocks:
- Strip HTML tags (`<p>`, `<span>`, `<div>`, `<br>`, `<strong>`, `<em>`) while preserving text content.
- Decode HTML entities (`&amp;` → `&`, `&lt;` → `<`, `&quot;` → `"`).
- Automatically parse `<ul><li>` lists and plain text `•` bullet markers into native Word bullet paragraphs:
  ```javascript
  new Paragraph({
    text: cleanBulletText,
    bullet: { level: 0 },
    spacing: { before: 40, after: 40 }
  })
  ```

#### Module B: Template Color & Archetype Registry
Map all 51 templates to their authentic theme presets from `src/engine/hybrid/themePresets.js`:
- **`Cv1`**: Primary `#EA580C` (Orange), Secondary `#F8FAFC` (Slate Tint)
- **`Cv2`**: Primary `#F0C30E` (Gold Accent), Secondary `#F5F5F5`
- **`Cv3`**: Primary `#BE8A95` (Rose Slate), Secondary `#000000`
- **`Cv37`–`Cv40` (ATS Single Column)**: Primary `#1E40AF` (Navy) / `#18181B` (Charcoal) with styled horizontal accent dividers.

#### Module C: 2-Column Sidebar Layout via Microsoft Word Tables (`docx.Table`)
In Microsoft Word OOXML, multi-column card layouts are implemented using borderless `Table` structures:
1. **Layout Grid**:
   - `WidthType.PERCENTAGE`: 35% Left Sidebar, 65% Right Hero Column.
   - `TableCellBorders`: Invisible (borders = `BorderStyle.NONE`).
   - `shading`: Light background for the left column (e.g., `#F8FAFC`).
2. **Left Column Content**:
   - Contact items (Email, Phone, Location, Portfolio).
   - Skills rendered as styled bullet runs or mini-badge text runs.
   - Languages with proficiency levels.
3. **Right Column Content**:
   - Professional Summary with primary color heading divider.
   - Employment entries with job title (Bold, 22pt), employer (Primary color), right-aligned date (`2021 – Present`), and native bullet points.
4. **Full-Width Bottom Flow**:
   - Education, Certifications, and Projects rendered in full page width below the upper split table.

#### Module D: Single-Column ATS Layout Engine (`Cv37`–`Cv40`)
For clean ATS single-column templates:
- Left-aligned clean typography with horizontal border underlines on section headings:
  ```javascript
  new Paragraph({
    text: 'EXPERIENCE',
    heading: HeadingLevel.HEADING_2,
    border: {
      bottom: { color: primaryColor, space: 4, style: BorderStyle.SINGLE, size: 8 }
    },
    spacing: { before: 200, after: 100 }
  })
  ```

---

### 4. Code Sample: Proposed `docxExport.js` Refactor

```javascript
const { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, BorderStyle, HeadingLevel, AlignmentType } = require('docx');

// 1. Clean HTML / Lexical Markup
function sanitizeAndExtractRuns(rawHtml) {
  if (!rawHtml) return [];
  const clean = String(rawHtml)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
  
  return clean.split('\n').map(l => l.trim()).filter(Boolean);
}

// 2. Build 2-Column Split Table for 2-Column CVs
function createTwoColumnLayout(resume, theme) {
  const sidebarCells = buildSidebarCells(resume, theme);
  const heroCells = buildHeroCells(resume, theme);

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 35, type: WidthType.PERCENTAGE },
            shading: { fill: theme.sidebarBg || 'F8FAFC' },
            margins: { top: 140, bottom: 140, left: 140, right: 140 },
            children: sidebarCells
          }),
          new TableCell({
            width: { size: 65, type: WidthType.PERCENTAGE },
            margins: { top: 140, bottom: 140, left: 180, right: 140 },
            children: heroCells
          })
        ]
      })
    ]
  });
}
```

---

### 5. Review Checklist for Senior Developer

- [ ] **Zero HTML leakage**: Confirm that all rich text fields (`summary`, `description`, `customSections`) are stripped of `<p>`, `<span>`, `dir="ltr"`, and HTML entities.
- [ ] **2-Column Table Grid**: Validate that Word/Google Docs renders the 35%/65% table without unwanted visible borders or column squishing.
- [ ] **Theme Palettes**: Verify that `Cv1` produces orange headers (`#EA580C`), `Cv2` produces gold (`#F0C30E`), and ATS templates produce charcoal/navy.
- [ ] **Full Unicode Integrity**: Ensure Telugu (`భాస్కర్`), Devanagari (`वास्तुकार`), and accented European characters (`José María Núñez`) render natively without question marks or box glyphs.
- [ ] **Test Coverage**: Run `node backend/test/docx-export.test.js` to ensure 100% passing test assertions across all 51 templates.

---

**Prepared for**: Senior/Principal Developer Review  
**Repository**: `bhaskarbeyond-creator/ResumePilotAi`  
**Status**: Ready for Architectural Review & Implementation
