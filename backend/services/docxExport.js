const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  AlignmentType,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  convertInchesToTwip
} = require('docx');

// --------------------------------------------------------------------------
// 1. Text & HTML Normalization Engine (Zero Tag Leakage)
// --------------------------------------------------------------------------

function cleanText(value, maximum = 10_000) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maximum);
}

function decodeHtmlEntities(str) {
  return String(str ?? '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/');
}

function stripAllHtmlTags(html, maximum = 10_000) {
  return cleanText(decodeHtmlEntities(String(html ?? '').replace(/<[^>]+>/g, '')), maximum);
}

function formatCleanDateRange(start, end, isCurrent = false) {
  const s = stripAllHtmlTags(start);
  let e = stripAllHtmlTags(end);
  if (!e && isCurrent) e = 'Present';
  if (s && e) {
    if (s.toLowerCase() === e.toLowerCase()) return s;
    return `${s} – ${e}`;
  }
  return s || e || '';
}

function parseRichTextToParagraphs(rawContent, style = {}, options = {}) {
  if (!rawContent) return [];
  const sanitized = cleanText(rawContent, options.maximum || 10_000);
  if (!sanitized) return [];

  let processed = String(rawContent)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .slice(0, options.maximum || 10_000)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');

  processed = decodeHtmlEntities(processed);
  const rawLines = processed.split(/\r?\n/);
  const paragraphs = [];

  for (const rawLine of rawLines) {
    const cleanLine = rawLine.replace(/<[^>]+>/g, '').trim();
    if (!cleanLine) continue;

    const isBullet = cleanLine.startsWith('•') || cleanLine.startsWith('-') || cleanLine.startsWith('*');
    const content = isBullet ? cleanLine.replace(/^[•\-*]\s*/, '').trim() : cleanLine;
    if (!content) continue;

    if (isBullet) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [
            new TextRun({
              text: content,
              size: options.size || 20,
              font: style.font || 'Calibri',
              color: options.color || '333333'
            })
          ],
          spacing: { before: 20, after: 20 }
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: content,
              size: options.size || 20,
              font: style.font || 'Calibri',
              color: options.color || '333333',
              bold: options.bold === true
            })
          ],
          spacing: options.spacing || { before: 30, after: 60 }
        })
      );
    }
  }

  return paragraphs;
}

// --------------------------------------------------------------------------
// 2. Authoritative 51-Template Archetypes & Theme Registry
// --------------------------------------------------------------------------

const ARCHETYPES = {
  MODERN_SPLIT: 'modern-split',
  EXECUTIVE_BANNER: 'executive-banner',
  MINIMAL_ATS: 'minimal-ats',
  TECH_GRID: 'tech-grid',
  COMPACT_EURO: 'compact-euro'
};

const THEMES = {
  Cv1: { name: 'Metropolitan Orange', archetype: ARCHETYPES.MODERN_SPLIT, primary: 'EA580C', secondary: 'FB923C', sidebarBg: 'FFF7ED', sidebarText: '1E293B', font: 'Calibri' },
  Cv2: { name: 'Nordic Slate', archetype: ARCHETYPES.MODERN_SPLIT, primary: '0F172A', secondary: '0EA5E9', sidebarBg: 'F1F5F9', sidebarText: '334155', font: 'Arial' },
  Cv3: { name: 'Emerald Executive', archetype: ARCHETYPES.MODERN_SPLIT, primary: '065F46', secondary: '10B981', sidebarBg: 'F0FDF4', sidebarText: '166534', font: 'Calibri' },
  Cv4: { name: 'Harvard Classic ATS', archetype: ARCHETYPES.MINIMAL_ATS, primary: '111827', secondary: '4B5563', font: 'Georgia' },
  Cv5: { name: 'Stanford Clean ATS', archetype: ARCHETYPES.MINIMAL_ATS, primary: '1E293B', secondary: '64748B', font: 'Calibri' },
  Cv6: { name: 'Wall Street Modern', archetype: ARCHETYPES.MINIMAL_ATS, primary: '0F172A', secondary: '2563EB', font: 'Arial' },
  Cv7: { name: 'Sapphire Modern Split', archetype: ARCHETYPES.MODERN_SPLIT, primary: '1D4ED8', secondary: '60A5FA', sidebarBg: 'EFF6FF', sidebarText: '1E3A8A', font: 'Calibri' },
  Cv8: { name: 'Crown Executive Banner', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '1E293B', secondary: '3B82F6', headerBg: '1E293B', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Arial' },
  Cv9: { name: 'Cobalt Pro Split', archetype: ARCHETYPES.MODERN_SPLIT, primary: '2563EB', secondary: '38BDF8', sidebarBg: '1E293B', sidebarText: 'F8FAFC', font: 'Calibri' },
  Cv10: { name: 'Titanium Executive', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '334155', secondary: '64748B', headerBg: '1E293B', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Arial' },
  Cv11: { name: 'Prism Executive Banner', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '4338CA', secondary: '818CF8', headerBg: '312E81', sidebarBg: 'EEF2FF', sidebarText: '312E81', font: 'Calibri' },
  Cv12: { name: 'Oxford Academic ATS', archetype: ARCHETYPES.MINIMAL_ATS, primary: '18181B', secondary: '71717A', font: 'Georgia' },
  Cv13: { name: 'Cambridge Research', archetype: ARCHETYPES.MINIMAL_ATS, primary: '09090B', secondary: '52525B', font: 'Calibri' },
  Cv14: { name: 'Yale Corporate ATS', archetype: ARCHETYPES.MINIMAL_ATS, primary: '1E293B', secondary: '0284C7', font: 'Calibri' },
  Cv15: { name: 'MIT Technical ATS', archetype: ARCHETYPES.MINIMAL_ATS, primary: '0F172A', secondary: '059669', font: 'Arial' },
  Cv16: { name: 'Apex Navy Banner', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '1E3A8A', secondary: '38BDF8', headerBg: '172554', sidebarBg: 'EFF6FF', sidebarText: '172554', font: 'Calibri' },
  Cv17: { name: 'Teal Horizon Banner', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '0F766E', secondary: '14B8A6', headerBg: '134E4A', sidebarBg: 'F0FDFA', sidebarText: '134E4A', font: 'Calibri' },
  Cv18: { name: 'Princeton Minimal ATS', archetype: ARCHETYPES.MINIMAL_ATS, primary: '27272A', secondary: '52525B', font: 'Georgia' },
  Cv19: { name: 'Zurich Financial ATS', archetype: ARCHETYPES.MINIMAL_ATS, primary: '0F172A', secondary: '3B82F6', font: 'Calibri' },
  Cv20: { name: 'Pacific Blue Split', archetype: ARCHETYPES.MODERN_SPLIT, primary: '0284C7', secondary: '38BDF8', sidebarBg: 'F0F9FF', sidebarText: '0369A1', font: 'Calibri' },
  Cv21: { name: 'Imperial Indigo Banner', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '3730A3', secondary: '6366F1', headerBg: '312E81', sidebarBg: 'EEF2FF', sidebarText: '312E81', font: 'Calibri' },
  Cv22: { name: 'Geneva Executive ATS', archetype: ARCHETYPES.MINIMAL_ATS, primary: '111827', secondary: '4B5563', font: 'Arial' },
  Cv23: { name: 'Burgundy Prestige Banner', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '881337', secondary: 'F43F5E', headerBg: '4C0519', sidebarBg: 'FFF1F2', sidebarText: '4C0519', font: 'Calibri' },
  Cv24: { name: 'Cyberpunk Modern Split', archetype: ARCHETYPES.MODERN_SPLIT, primary: '4F46E5', secondary: 'EC4899', sidebarBg: 'FAF5FF', sidebarText: '3B0764', font: 'Calibri' },
  Cv25: { name: 'DevOps Terminal Tech', archetype: ARCHETYPES.TECH_GRID, primary: '0F172A', secondary: '10B981', sidebarBg: 'F8FAFC', sidebarText: '334155', font: 'Consolas' },
  Cv26: { name: 'FullStack Dark Split', archetype: ARCHETYPES.MODERN_SPLIT, primary: '0284C7', secondary: '38BDF8', sidebarBg: '0F172A', sidebarText: 'F8FAFC', font: 'Calibri' },
  Cv27: { name: 'Creative Studio Split', archetype: ARCHETYPES.MODERN_SPLIT, primary: 'D97706', secondary: 'FBBF24', sidebarBg: 'FFFBEB', sidebarText: '78350F', font: 'Arial' },
  Cv28: { name: 'Silicon Valley Engineer', archetype: ARCHETYPES.TECH_GRID, primary: '2563EB', secondary: '60A5FA', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv29: { name: 'Minimal Nordic Slate', archetype: ARCHETYPES.MODERN_SPLIT, primary: '334155', secondary: '64748B', sidebarBg: 'F1F5F9', sidebarText: '0F172A', font: 'Arial' },
  Cv30: { name: 'Corporate Summit Banner', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '1E293B', secondary: 'F59E0B', headerBg: '0F172A', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv31: { name: 'Cloud Native Tech', archetype: ARCHETYPES.TECH_GRID, primary: '0284C7', secondary: '0EA5E9', font: 'Calibri' },
  Cv32: { name: 'Kubernetes Developer', archetype: ARCHETYPES.TECH_GRID, primary: '326CE5', secondary: '60A5FA', font: 'Arial' },
  Cv33: { name: 'Data Science Matrix', archetype: ARCHETYPES.TECH_GRID, primary: '059669', secondary: '34D399', font: 'Calibri' },
  Cv34: { name: 'Fintech Executive', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '0F172A', secondary: '38BDF8', headerBg: '0F172A', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv35: { name: 'AI & ML Researcher', archetype: ARCHETYPES.TECH_GRID, primary: '7C3AED', secondary: 'A78BFA', font: 'Arial' },
  Cv36: { name: 'BioTech Specialist', archetype: ARCHETYPES.EXECUTIVE_BANNER, primary: '0D9488', secondary: '2DD4BF', headerBg: '115E59', sidebarBg: 'F0FDFA', sidebarText: '134E4A', font: 'Calibri' },
  Cv37: { name: 'Solutions Architect', archetype: ARCHETYPES.TECH_GRID, primary: 'EA580C', secondary: 'FB923C', font: 'Calibri' },
  Cv38: { name: 'Global Legal ATS', archetype: ARCHETYPES.MINIMAL_ATS, primary: '18181B', secondary: '71717A', font: 'Georgia' },
  Cv39: { name: 'Product Manager Pro', archetype: ARCHETYPES.MODERN_SPLIT, primary: '2563EB', secondary: '38BDF8', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv40: { name: 'Europass Classic Grid', archetype: ARCHETYPES.COMPACT_EURO, primary: '003399', secondary: '4169E1', font: 'Arial' },
  Cv41: { name: 'Europass Modern Slate', archetype: ARCHETYPES.COMPACT_EURO, primary: '1E293B', secondary: '3B82F6', font: 'Calibri' },
  Cv42: { name: 'European Academic Compact', archetype: ARCHETYPES.COMPACT_EURO, primary: '1E3A8A', secondary: '60A5FA', font: 'Arial' },
  Cv43: { name: 'Brussels International', archetype: ARCHETYPES.COMPACT_EURO, primary: '0F766E', secondary: '14B8A6', font: 'Calibri' },
  Cv44: { name: 'Scandinavia Clean Compact', archetype: ARCHETYPES.MINIMAL_ATS, primary: '0F172A', secondary: '64748B', font: 'Arial' },
  Cv45: { name: 'Vienna Diplomatic Euro', archetype: ARCHETYPES.COMPACT_EURO, primary: '881337', secondary: 'E11D48', font: 'Georgia' },
  Cv46: { name: 'Frankfurt Finance Euro', archetype: ARCHETYPES.COMPACT_EURO, primary: '1E293B', secondary: '0284C7', font: 'Calibri' },
  Cv47: { name: 'Metro Dual Column Pro', archetype: ARCHETYPES.MODERN_SPLIT, primary: '0369A1', secondary: '38BDF8', sidebarBg: 'F0F9FF', sidebarText: '0C4A6E', font: 'Calibri' },
  Cv48: { name: 'Modern Gradient Aurora', archetype: ARCHETYPES.MODERN_SPLIT, primary: '6366F1', secondary: 'EC4899', sidebarBg: '312E81', sidebarText: 'F8FAFC', font: 'Calibri' },
  Cv49: { name: 'Berlin Tech Compact', archetype: ARCHETYPES.COMPACT_EURO, primary: '18181B', secondary: '3B82F6', font: 'Arial' },
  Cv50: { name: 'Executive Platinum Split', archetype: ARCHETYPES.MODERN_SPLIT, primary: '0F172A', secondary: '475569', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv51: { name: 'Standard Europass Official', archetype: ARCHETYPES.COMPACT_EURO, primary: '003399', secondary: '4169E1', font: 'Arial' }
};

function getTemplateStyle(templateName, customColors = null) {
  const name = String(templateName || 'Cv1').trim();
  let baseTheme = THEMES[name];

  if (!baseTheme) {
    const numMatch = name.match(/Cv(\d+)/i);
    if (numMatch) {
      const key = `Cv${parseInt(numMatch[1], 10)}`;
      if (THEMES[key]) baseTheme = THEMES[key];
    }
  }

  if (!baseTheme) baseTheme = THEMES.Cv1;

  if (customColors && typeof customColors === 'object') {
    const customPrimary = customColors.primary ? String(customColors.primary).replace('#', '') : null;
    const customSecondary = customColors.secondary ? String(customColors.secondary).replace('#', '') : null;
    return {
      ...baseTheme,
      primary: customPrimary || baseTheme.primary,
      secondary: customSecondary || baseTheme.secondary
    };
  }

  return baseTheme;
}

// --------------------------------------------------------------------------
// 3. Shared Helpers & Micro-Component Builders
// --------------------------------------------------------------------------

function list(value) {
  return Array.isArray(value) ? value : [];
}

function createSectionHeading(title, style, options = {}) {
  return new Paragraph({
    border: options.underlined ? {
      bottom: {
        color: style.secondary || style.primary,
        space: 4,
        style: BorderStyle.SINGLE,
        size: 10
      }
    } : undefined,
    spacing: { before: options.beforeSpacing !== undefined ? options.beforeSpacing : 140, after: 60 },
    children: [
      new TextRun({
        text: title.toUpperCase(),
        bold: true,
        size: 22,
        font: style.font,
        color: style.primary
      })
    ]
  });
}

function createEntryHeaderTable(title, subTitle, dateRange, style) {
  const leftRuns = [
    new TextRun({ text: title, bold: true, size: 22, font: style.font, color: '111827' })
  ];
  if (subTitle) {
    leftRuns.push(new TextRun({ text: `\n${subTitle}`, bold: true, size: 20, font: style.font, color: style.primary }));
  }

  const cells = [
    new TableCell({
      width: { size: dateRange ? 72 : 100, type: WidthType.PERCENTAGE },
      children: [
        new Paragraph({
          children: leftRuns,
          spacing: { before: 60, after: 20 }
        })
      ]
    })
  ];

  if (dateRange) {
    cells.push(
      new TableCell({
        width: { size: 28, type: WidthType.PERCENTAGE },
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: dateRange, size: 18, font: style.font, color: '64748B', bold: false })
            ],
            spacing: { before: 60, after: 20 }
          })
        ]
      })
    );
  }

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' }
    },
    rows: [new TableRow({ children: cells })]
  });
}

// --------------------------------------------------------------------------
// 4. Archetype 1: MODERN SPLIT (Cv1, Cv2, Cv3, Cv7, Cv9, Cv20, Cv24, etc.)
// --------------------------------------------------------------------------

function buildModernSplitDocument(resume, style) {
  const fullName = stripAllHtmlTags(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || stripAllHtmlTags(resume.title) || 'Resume';
  const occupation = stripAllHtmlTags(resume.occupation || resume.jobTitle || resume.title || '');

  const elements = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: fullName,
          bold: true,
          size: 34,
          color: style.primary,
          font: style.font
        })
      ],
      spacing: { before: 0, after: 30 }
    })
  ];

  if (occupation) {
    elements.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: occupation.toUpperCase(),
            bold: true,
            size: 20,
            color: style.secondary || style.primary,
            font: style.font
          })
        ],
        spacing: { before: 0, after: 120 }
      })
    );
  }

  // Left Sidebar Content
  const sidebarElements = [];
  const contactRows = [
    resume.phone ? `Phone: ${stripAllHtmlTags(resume.phone)}` : null,
    resume.email ? `Email: ${stripAllHtmlTags(resume.email)}` : null,
    resume.address || resume.city ? `Location: ${[stripAllHtmlTags(resume.address), stripAllHtmlTags(resume.city), stripAllHtmlTags(resume.country)].filter(Boolean).join(', ')}` : null,
    resume.website ? `Web: ${stripAllHtmlTags(resume.website)}` : null,
    resume.linkedin ? `LinkedIn: ${stripAllHtmlTags(resume.linkedin)}` : null,
    resume.github ? `GitHub: ${stripAllHtmlTags(resume.github)}` : null
  ].filter(Boolean);

  if (contactRows.length > 0) {
    sidebarElements.push(createSectionHeading('Contact', style, { beforeSpacing: 0 }));
    for (const item of contactRows) {
      sidebarElements.push(
        new Paragraph({
          children: [new TextRun({ text: item, size: 18, font: style.font, color: style.sidebarText || '334155' })],
          spacing: { before: 20, after: 30 }
        })
      );
    }
  }

  const skillsList = list(resume.skills);
  if (skillsList.length > 0) {
    sidebarElements.push(createSectionHeading('Skills', style, { beforeSpacing: 140, underlined: true }));
    for (const skill of skillsList) {
      const skillName = typeof skill === 'string' ? skill : (skill.name || skill.skillName || skill.skill || '');
      const cleanSkill = stripAllHtmlTags(skillName);
      if (cleanSkill) {
        sidebarElements.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanSkill, size: 19, font: style.font, color: '1E293B' })],
            spacing: { before: 15, after: 15 }
          })
        );
      }
    }
  }

  const languagesList = list(resume.languages);
  if (languagesList.length > 0) {
    sidebarElements.push(createSectionHeading('Languages', style, { beforeSpacing: 140, underlined: true }));
    for (const lang of languagesList) {
      const langName = typeof lang === 'string' ? lang : (lang.name || lang.language || '');
      const langLevel = typeof lang === 'object' ? (lang.level || lang.proficiency || '') : '';
      const cleanLang = [stripAllHtmlTags(langName), stripAllHtmlTags(langLevel)].filter(Boolean).join(' — ');
      if (cleanLang) {
        sidebarElements.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanLang, size: 18, font: style.font, color: style.sidebarText || '334155' })],
            spacing: { before: 15, after: 15 }
          })
        );
      }
    }
  }

  if (sidebarElements.length === 0) sidebarElements.push(new Paragraph({ text: '' }));

  // Right Hero Content
  const heroElements = [];
  if (resume.summary) {
    const summaryParas = parseRichTextToParagraphs(resume.summary, style, { size: 20 });
    if (summaryParas.length > 0) {
      heroElements.push(createSectionHeading('Professional Summary', style, { beforeSpacing: 0, underlined: true }));
      heroElements.push(...summaryParas);
    }
  }

  const employmentsList = list(resume.employments || resume.experience || resume.workExperiences);
  if (employmentsList.length > 0) {
    heroElements.push(createSectionHeading('Employment History', style, { beforeSpacing: 140, underlined: true }));
    for (const emp of employmentsList) {
      const jobTitle = stripAllHtmlTags(emp.jobTitle || emp.title || emp.position || '');
      const employer = stripAllHtmlTags(emp.employer || emp.company || '');
      const dateRange = formatCleanDateRange(emp.startDate || emp.begin, emp.endDate || emp.end, emp.currentWork);
      if (jobTitle || employer) heroElements.push(createEntryHeaderTable(jobTitle, employer, dateRange, style));
      if (emp.description) heroElements.push(...parseRichTextToParagraphs(emp.description, style, { size: 20 }));
    }
  }

  if (heroElements.length === 0) heroElements.push(new Paragraph({ text: '' }));

  // Upper Split Table
  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 34, type: WidthType.PERCENTAGE },
              shading: style.sidebarBg ? { fill: style.sidebarBg.replace('#', '') } : undefined,
              margins: { top: convertInchesToTwip(0.1), bottom: convertInchesToTwip(0.1), left: convertInchesToTwip(0.1), right: convertInchesToTwip(0.1) },
              children: sidebarElements
            }),
            new TableCell({
              width: { size: 66, type: WidthType.PERCENTAGE },
              margins: { top: convertInchesToTwip(0.1), bottom: convertInchesToTwip(0.1), left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.1) },
              children: heroElements
            })
          ]
        })
      ]
    })
  );

  // Bottom Full-Width Flow
  const educationsList = list(resume.educations || resume.education);
  if (educationsList.length > 0) {
    elements.push(createSectionHeading('Education', style, { beforeSpacing: 180, underlined: true }));
    for (const edu of educationsList) {
      const degree = stripAllHtmlTags(edu.degree || edu.qualification || edu.title || '');
      const school = stripAllHtmlTags(edu.school || edu.institution || '');
      const dateRange = formatCleanDateRange(edu.startDate || edu.started || edu.start_year, edu.endDate || edu.finished || edu.end_year);
      if (degree || school) elements.push(createEntryHeaderTable(degree, school, dateRange, style));
      if (edu.description) elements.push(...parseRichTextToParagraphs(edu.description, style, { size: 20 }));
    }
  }

  const certsList = list(resume.certifications);
  if (certsList.length > 0) {
    elements.push(createSectionHeading('Certifications', style, { beforeSpacing: 180, underlined: true }));
    const certRows = [];
    for (let i = 0; i < certsList.length; i += 2) {
      const c1 = certsList[i];
      const c2 = certsList[i + 1];
      const c1Text = c1 ? [stripAllHtmlTags(c1.name || c1.title), stripAllHtmlTags(c1.issuer || c1.organization)].filter(Boolean).join(' — ') : '';
      const c2Text = c2 ? [stripAllHtmlTags(c2.name || c2.title), stripAllHtmlTags(c2.issuer || c2.organization)].filter(Boolean).join(' — ') : '';

      certRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: c1Text, size: 20, font: style.font, color: '333333' })], spacing: { before: 20, after: 20 } })]
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              children: [c2Text ? new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: c2Text, size: 20, font: style.font, color: '333333' })], spacing: { before: 20, after: 20 } }) : new Paragraph({ text: '' })]
            })
          ]
        })
      );
    }
    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: 'auto' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
          left: { style: BorderStyle.NONE, size: 0, color: 'auto' }, right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' }
        },
        rows: certRows
      })
    );
  }

  const projectsList = list(resume.projects);
  if (projectsList.length > 0) {
    elements.push(createSectionHeading('Projects', style, { beforeSpacing: 180, underlined: true }));
    for (const proj of projectsList) {
      const projTitle = stripAllHtmlTags(proj.title || proj.name || '');
      const projUrl = stripAllHtmlTags(proj.url || proj.link || '');
      if (projTitle) elements.push(createEntryHeaderTable(projTitle, projUrl, '', style));
      if (proj.description) elements.push(...parseRichTextToParagraphs(proj.description, style, { size: 20 }));
    }
  }

  const customSectionsList = list(resume.customSections);
  for (const custom of customSectionsList) {
    const customTitle = stripAllHtmlTags(custom.title) || 'Additional Information';
    elements.push(createSectionHeading(customTitle, style, { beforeSpacing: 180, underlined: true }));
    const items = list(custom.items);
    if (items.length > 0) {
      for (const item of items) {
        const itemTitle = stripAllHtmlTags(item.title || item.name || '');
        if (itemTitle) {
          elements.push(
            new Paragraph({
              children: [new TextRun({ text: itemTitle, bold: true, size: 22, font: style.font, color: '111827' })],
              spacing: { before: 60, after: 20 }
            })
          );
        }
        if (item.description || item.content) {
          elements.push(...parseRichTextToParagraphs(item.description || item.content, style, { size: 20 }));
        }
      }
    } else if (custom.content) {
      elements.push(...parseRichTextToParagraphs(custom.content, style, { size: 20 }));
    }
  }

  return elements;
}

// --------------------------------------------------------------------------
// 5. Archetype 2: EXECUTIVE BANNER (Cv8, Cv10, Cv11, Cv16, Cv17, Cv21, etc.)
// --------------------------------------------------------------------------

function buildExecutiveBannerDocument(resume, style) {
  const fullName = stripAllHtmlTags(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || stripAllHtmlTags(resume.title) || 'Resume';
  const occupation = stripAllHtmlTags(resume.occupation || resume.jobTitle || resume.title || '');
  const bannerBg = style.headerBg || style.primary;

  const contactParts = [
    resume.phone ? stripAllHtmlTags(resume.phone) : null,
    resume.email ? stripAllHtmlTags(resume.email) : null,
    resume.city ? [stripAllHtmlTags(resume.city), stripAllHtmlTags(resume.country)].filter(Boolean).join(', ') : null
  ].filter(Boolean);

  const bannerElements = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: fullName, bold: true, size: 36, color: 'FFFFFF', font: style.font })],
      spacing: { before: 100, after: 30 }
    })
  ];

  if (occupation) {
    bannerElements.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: occupation.toUpperCase(), bold: true, size: 20, color: style.secondary ? style.secondary.replace('#', '') : 'E2E8F0', font: style.font })],
        spacing: { before: 0, after: 60 }
      })
    );
  }

  if (contactParts.length > 0) {
    bannerElements.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: contactParts.join('  •  '), size: 18, color: 'F8FAFC', font: style.font })],
        spacing: { before: 0, after: 100 }
      })
    );
  }

  const bannerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' }, right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' }
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 100, type: WidthType.PERCENTAGE },
            shading: { fill: bannerBg.replace('#', '') },
            margins: { top: convertInchesToTwip(0.15), bottom: convertInchesToTwip(0.15), left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.2) },
            children: bannerElements
          })
        ]
      })
    ]
  });

  const elements = [bannerTable];

  // Sidebar (Skills, Languages)
  const sidebarElements = [];
  const skillsList = list(resume.skills);
  if (skillsList.length > 0) {
    sidebarElements.push(createSectionHeading('Skills', style, { beforeSpacing: 60, underlined: true }));
    for (const skill of skillsList) {
      const skillName = typeof skill === 'string' ? skill : (skill.name || skill.skillName || skill.skill || '');
      const cleanSkill = stripAllHtmlTags(skillName);
      if (cleanSkill) {
        sidebarElements.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanSkill, size: 19, font: style.font, color: '1E293B' })],
            spacing: { before: 15, after: 15 }
          })
        );
      }
    }
  }

  const languagesList = list(resume.languages);
  if (languagesList.length > 0) {
    sidebarElements.push(createSectionHeading('Languages', style, { beforeSpacing: 140, underlined: true }));
    for (const lang of languagesList) {
      const langName = typeof lang === 'string' ? lang : (lang.name || lang.language || '');
      const langLevel = typeof lang === 'object' ? (lang.level || lang.proficiency || '') : '';
      const cleanLang = [stripAllHtmlTags(langName), stripAllHtmlTags(langLevel)].filter(Boolean).join(' — ');
      if (cleanLang) {
        sidebarElements.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanLang, size: 18, font: style.font, color: style.sidebarText || '334155' })],
            spacing: { before: 15, after: 15 }
          })
        );
      }
    }
  }

  if (sidebarElements.length === 0) sidebarElements.push(new Paragraph({ text: '' }));

  // Main Section (Summary, Experience, Education, Certifications)
  const mainElements = [];
  if (resume.summary) {
    const summaryParas = parseRichTextToParagraphs(resume.summary, style, { size: 20 });
    if (summaryParas.length > 0) {
      mainElements.push(createSectionHeading('Executive Summary', style, { beforeSpacing: 60, underlined: true }));
      mainElements.push(...summaryParas);
    }
  }

  const employmentsList = list(resume.employments || resume.experience || resume.workExperiences);
  if (employmentsList.length > 0) {
    mainElements.push(createSectionHeading('Experience', style, { beforeSpacing: 140, underlined: true }));
    for (const emp of employmentsList) {
      const jobTitle = stripAllHtmlTags(emp.jobTitle || emp.title || emp.position || '');
      const employer = stripAllHtmlTags(emp.employer || emp.company || '');
      const dateRange = formatCleanDateRange(emp.startDate || emp.begin, emp.endDate || emp.end, emp.currentWork);
      if (jobTitle || employer) mainElements.push(createEntryHeaderTable(jobTitle, employer, dateRange, style));
      if (emp.description) mainElements.push(...parseRichTextToParagraphs(emp.description, style, { size: 20 }));
    }
  }

  const educationsList = list(resume.educations || resume.education);
  if (educationsList.length > 0) {
    mainElements.push(createSectionHeading('Education', style, { beforeSpacing: 140, underlined: true }));
    for (const edu of educationsList) {
      const degree = stripAllHtmlTags(edu.degree || edu.qualification || edu.title || '');
      const school = stripAllHtmlTags(edu.school || edu.institution || '');
      const dateRange = formatCleanDateRange(edu.startDate || edu.started || edu.start_year, edu.endDate || edu.finished || edu.end_year);
      if (degree || school) mainElements.push(createEntryHeaderTable(degree, school, dateRange, style));
      if (edu.description) mainElements.push(...parseRichTextToParagraphs(edu.description, style, { size: 20 }));
    }
  }

  if (mainElements.length === 0) mainElements.push(new Paragraph({ text: '' }));

  elements.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'auto' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' }, right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' }
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 32, type: WidthType.PERCENTAGE },
              shading: style.sidebarBg ? { fill: style.sidebarBg.replace('#', '') } : undefined,
              margins: { top: convertInchesToTwip(0.1), bottom: convertInchesToTwip(0.1), left: convertInchesToTwip(0.1), right: convertInchesToTwip(0.1) },
              children: sidebarElements
            }),
            new TableCell({
              width: { size: 68, type: WidthType.PERCENTAGE },
              margins: { top: convertInchesToTwip(0.1), bottom: convertInchesToTwip(0.1), left: convertInchesToTwip(0.2), right: convertInchesToTwip(0.1) },
              children: mainElements
            })
          ]
        })
      ]
    })
  );

  return elements;
}

// --------------------------------------------------------------------------
// 6. Archetype 3: MINIMAL ATS (Cv4, Cv5, Cv6, Cv12, Cv13, Cv14, Cv15, etc.)
// --------------------------------------------------------------------------

function buildMinimalAtsDocument(resume, style) {
  const fullName = stripAllHtmlTags(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || stripAllHtmlTags(resume.title) || 'Resume';
  const occupation = stripAllHtmlTags(resume.occupation || resume.jobTitle || resume.title || '');

  const contactParts = [
    resume.email ? stripAllHtmlTags(resume.email) : null,
    resume.phone ? stripAllHtmlTags(resume.phone) : null,
    resume.city ? [stripAllHtmlTags(resume.city), stripAllHtmlTags(resume.country)].filter(Boolean).join(', ') : null,
    resume.website ? stripAllHtmlTags(resume.website) : null,
    resume.linkedin ? stripAllHtmlTags(resume.linkedin) : null,
    resume.github ? stripAllHtmlTags(resume.github) : null
  ].filter(Boolean);

  const children = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: fullName, bold: true, size: 34, color: style.primary, font: style.font })],
      spacing: { before: 0, after: 30 }
    })
  ];

  if (occupation) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: occupation.toUpperCase(), bold: true, size: 20, color: style.secondary || style.primary, font: style.font })],
        spacing: { before: 0, after: 50 }
      })
    );
  }

  if (contactParts.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new TextRun({ text: contactParts.join('  •  '), size: 18, color: '555555', font: style.font })],
        spacing: { before: 0, after: 160 }
      })
    );
  }

  if (resume.summary) {
    const summaryParas = parseRichTextToParagraphs(resume.summary, style, { size: 20 });
    if (summaryParas.length > 0) {
      children.push(createSectionHeading('Professional Summary', style, { underlined: true }));
      children.push(...summaryParas);
    }
  }

  const employmentsList = list(resume.employments || resume.experience || resume.workExperiences);
  if (employmentsList.length > 0) {
    children.push(createSectionHeading('Experience', style, { underlined: true }));
    for (const emp of employmentsList) {
      const jobTitle = stripAllHtmlTags(emp.jobTitle || emp.title || emp.position || '');
      const employer = stripAllHtmlTags(emp.employer || emp.company || '');
      const dateRange = formatCleanDateRange(emp.startDate || emp.begin, emp.endDate || emp.end, emp.currentWork);
      if (jobTitle || employer) children.push(createEntryHeaderTable(jobTitle, employer, dateRange, style));
      if (emp.description) children.push(...parseRichTextToParagraphs(emp.description, style, { size: 20 }));
    }
  }

  const educationsList = list(resume.educations || resume.education);
  if (educationsList.length > 0) {
    children.push(createSectionHeading('Education', style, { underlined: true }));
    for (const edu of educationsList) {
      const degree = stripAllHtmlTags(edu.degree || edu.qualification || edu.title || '');
      const school = stripAllHtmlTags(edu.school || edu.institution || '');
      const dateRange = formatCleanDateRange(edu.startDate || edu.started || edu.start_year, edu.endDate || edu.finished || edu.end_year);
      if (degree || school) children.push(createEntryHeaderTable(degree, school, dateRange, style));
      if (edu.description) children.push(...parseRichTextToParagraphs(edu.description, style, { size: 20 }));
    }
  }

  const skillsList = list(resume.skills);
  if (skillsList.length > 0) {
    children.push(createSectionHeading('Skills', style, { underlined: true }));
    for (const skill of skillsList) {
      const skillName = typeof skill === 'string' ? skill : (skill.name || skill.skillName || skill.skill || '');
      const cleanSkill = stripAllHtmlTags(skillName);
      if (cleanSkill) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanSkill, size: 20, font: style.font, color: '333333' })],
            spacing: { before: 20, after: 20 }
          })
        );
      }
    }
  }

  const languagesList = list(resume.languages);
  if (languagesList.length > 0) {
    children.push(createSectionHeading('Languages', style, { underlined: true }));
    for (const lang of languagesList) {
      const langName = typeof lang === 'string' ? lang : (lang.name || lang.language || '');
      const langLevel = typeof lang === 'object' ? (lang.level || lang.proficiency || '') : '';
      const cleanLang = [stripAllHtmlTags(langName), stripAllHtmlTags(langLevel)].filter(Boolean).join(' — ');
      if (cleanLang) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanLang, size: 20, font: style.font, color: '333333' })],
            spacing: { before: 20, after: 20 }
          })
        );
      }
    }
  }

  return children;
}

// --------------------------------------------------------------------------
// 7. Archetype 4: TECH GRID (Cv25, Cv28, Cv31, Cv32, Cv33, Cv35, Cv37)
// --------------------------------------------------------------------------

function buildTechGridDocument(resume, style) {
  const fullName = stripAllHtmlTags(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || stripAllHtmlTags(resume.title) || 'Resume';
  const occupation = stripAllHtmlTags(resume.occupation || resume.jobTitle || resume.title || 'SOFTWARE ENGINEER');

  const elements = [
    new Paragraph({
      children: [
        new TextRun({ text: `< `, size: 30, color: style.secondary || '60A5FA', font: 'Consolas' }),
        new TextRun({ text: fullName, bold: true, size: 34, color: style.primary, font: style.font }),
        new TextRun({ text: ` />`, size: 30, color: style.secondary || '60A5FA', font: 'Consolas' })
      ],
      spacing: { before: 0, after: 30 }
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `[${occupation.toUpperCase()}]`, bold: true, size: 20, color: style.primary, font: 'Consolas' })
      ],
      spacing: { before: 0, after: 60 }
    })
  ];

  const contactParts = [
    resume.email ? `✉ ${stripAllHtmlTags(resume.email)}` : null,
    resume.phone ? `📱 ${stripAllHtmlTags(resume.phone)}` : null,
    resume.github ? `💻 ${stripAllHtmlTags(resume.github)}` : null,
    resume.linkedin ? `🔗 ${stripAllHtmlTags(resume.linkedin)}` : null,
    resume.city ? `📍 ${stripAllHtmlTags(resume.city)}` : null
  ].filter(Boolean);

  if (contactParts.length > 0) {
    elements.push(
      new Paragraph({
        children: [new TextRun({ text: contactParts.join('   |   '), size: 18, color: '4B5563', font: style.font })],
        spacing: { before: 0, after: 140 }
      })
    );
  }

  if (resume.summary) {
    const summaryParas = parseRichTextToParagraphs(resume.summary, style, { size: 20 });
    if (summaryParas.length > 0) {
      elements.push(createSectionHeading('Core Competencies & Profile', style, { underlined: true }));
      elements.push(...summaryParas);
    }
  }

  // Tech Skills Multi-Column Grid
  const skillsList = list(resume.skills);
  if (skillsList.length > 0) {
    elements.push(createSectionHeading('Technical Stack & Tools', style, { underlined: true }));
    const skillRows = [];
    for (let i = 0; i < skillsList.length; i += 3) {
      const s1 = skillsList[i];
      const s2 = skillsList[i + 1];
      const s3 = skillsList[i + 2];
      const getSkillName = (s) => stripAllHtmlTags(typeof s === 'string' ? s : (s?.name || s?.skill || ''));

      skillRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 33, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: getSkillName(s1), size: 19, font: style.font, color: '1E293B' })], spacing: { before: 15, after: 15 } })]
            }),
            new TableCell({
              width: { size: 33, type: WidthType.PERCENTAGE },
              children: [s2 ? new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: getSkillName(s2), size: 19, font: style.font, color: '1E293B' })], spacing: { before: 15, after: 15 } }) : new Paragraph({ text: '' })]
            }),
            new TableCell({
              width: { size: 34, type: WidthType.PERCENTAGE },
              children: [s3 ? new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: getSkillName(s3), size: 19, font: style.font, color: '1E293B' })], spacing: { before: 15, after: 15 } }) : new Paragraph({ text: '' })]
            })
          ]
        })
      );
    }

    elements.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.NONE, size: 0, color: 'auto' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
          left: { style: BorderStyle.NONE, size: 0, color: 'auto' }, right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
          insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' }
        },
        rows: skillRows
      })
    );
  }

  const employmentsList = list(resume.employments || resume.experience || resume.workExperiences);
  if (employmentsList.length > 0) {
    elements.push(createSectionHeading('Work Experience', style, { beforeSpacing: 160, underlined: true }));
    for (const emp of employmentsList) {
      const jobTitle = stripAllHtmlTags(emp.jobTitle || emp.title || emp.position || '');
      const employer = stripAllHtmlTags(emp.employer || emp.company || '');
      const dateRange = formatCleanDateRange(emp.startDate || emp.begin, emp.endDate || emp.end, emp.currentWork);
      if (jobTitle || employer) elements.push(createEntryHeaderTable(jobTitle, employer, dateRange, style));
      if (emp.description) elements.push(...parseRichTextToParagraphs(emp.description, style, { size: 20 }));
    }
  }

  const educationsList = list(resume.educations || resume.education);
  if (educationsList.length > 0) {
    elements.push(createSectionHeading('Education', style, { beforeSpacing: 160, underlined: true }));
    for (const edu of educationsList) {
      const degree = stripAllHtmlTags(edu.degree || edu.qualification || edu.title || '');
      const school = stripAllHtmlTags(edu.school || edu.institution || '');
      const dateRange = formatCleanDateRange(edu.startDate || edu.started || edu.start_year, edu.endDate || edu.finished || edu.end_year);
      if (degree || school) elements.push(createEntryHeaderTable(degree, school, dateRange, style));
      if (edu.description) elements.push(...parseRichTextToParagraphs(edu.description, style, { size: 20 }));
    }
  }

  return elements;
}

// --------------------------------------------------------------------------
// 8. Archetype 5: COMPACT EURO (Cv40, Cv41, Cv42, Cv43, Cv45, Cv46, Cv49, Cv51)
// --------------------------------------------------------------------------

function buildCompactEuroDocument(resume, style) {
  const fullName = stripAllHtmlTags(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || stripAllHtmlTags(resume.title) || 'Resume';
  const occupation = stripAllHtmlTags(resume.occupation || resume.jobTitle || resume.title || '');

  const contactParts = [
    resume.email ? `Email: ${stripAllHtmlTags(resume.email)}` : null,
    resume.phone ? `Phone: ${stripAllHtmlTags(resume.phone)}` : null,
    resume.city ? `Address: ${[stripAllHtmlTags(resume.city), stripAllHtmlTags(resume.country)].filter(Boolean).join(', ')}` : null
  ].filter(Boolean);

  const topElements = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text: fullName, bold: true, size: 32, color: style.primary, font: style.font })],
      spacing: { before: 0, after: 30 }
    })
  ];

  if (occupation) {
    topElements.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: occupation.toUpperCase(), bold: true, size: 20, color: style.secondary || style.primary, font: style.font })],
        spacing: { before: 0, after: 40 }
      })
    );
  }

  if (contactParts.length > 0) {
    topElements.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [new TextRun({ text: contactParts.join('   |   '), size: 18, color: '555555', font: style.font })],
        spacing: { before: 0, after: 140 }
      })
    );
  }

  // Construct Europass Gutter Table (Left: Dates/Section; Right: Details)
  const euroRows = [];

  if (resume.summary) {
    const summaryParas = parseRichTextToParagraphs(resume.summary, style, { size: 20 });
    if (summaryParas.length > 0) {
      euroRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              children: [new Paragraph({ children: [new TextRun({ text: 'PERSONAL STATEMENT', bold: true, size: 19, color: style.primary, font: style.font })], spacing: { before: 60, after: 40 } })]
            }),
            new TableCell({
              width: { size: 72, type: WidthType.PERCENTAGE },
              children: summaryParas
            })
          ]
        })
      );
    }
  }

  const employmentsList = list(resume.employments || resume.experience || resume.workExperiences);
  if (employmentsList.length > 0) {
    for (let i = 0; i < employmentsList.length; i++) {
      const emp = employmentsList[i];
      const jobTitle = stripAllHtmlTags(emp.jobTitle || emp.title || emp.position || '');
      const employer = stripAllHtmlTags(emp.employer || emp.company || '');
      const dateRange = formatCleanDateRange(emp.startDate || emp.begin, emp.endDate || emp.end, emp.currentWork);

      const rightParas = [];
      if (jobTitle || employer) {
        rightParas.push(
          new Paragraph({
            children: [
              new TextRun({ text: jobTitle, bold: true, size: 22, color: '111827', font: style.font }),
              ...(employer ? [new TextRun({ text: ` — ${employer}`, bold: true, size: 20, color: style.primary, font: style.font })] : [])
            ],
            spacing: { before: 60, after: 20 }
          })
        );
      }
      if (emp.description) rightParas.push(...parseRichTextToParagraphs(emp.description, style, { size: 20 }));

      euroRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [
                    ...(i === 0 ? [new TextRun({ text: 'WORK EXPERIENCE\n', bold: true, size: 19, color: style.primary, font: style.font })] : []),
                    new TextRun({ text: dateRange, size: 18, color: '64748B', font: style.font })
                  ],
                  spacing: { before: 60, after: 20 }
                })
              ]
            }),
            new TableCell({
              width: { size: 72, type: WidthType.PERCENTAGE },
              children: rightParas
            })
          ]
        })
      );
    }
  }

  const educationsList = list(resume.educations || resume.education);
  if (educationsList.length > 0) {
    for (let i = 0; i < educationsList.length; i++) {
      const edu = educationsList[i];
      const degree = stripAllHtmlTags(edu.degree || edu.qualification || edu.title || '');
      const school = stripAllHtmlTags(edu.school || edu.institution || '');
      const dateRange = formatCleanDateRange(edu.startDate || edu.started || edu.start_year, edu.endDate || edu.finished || edu.end_year);

      const rightParas = [];
      if (degree || school) {
        rightParas.push(
          new Paragraph({
            children: [
              new TextRun({ text: degree, bold: true, size: 22, color: '111827', font: style.font }),
              ...(school ? [new TextRun({ text: ` — ${school}`, bold: true, size: 20, color: style.primary, font: style.font })] : [])
            ],
            spacing: { before: 60, after: 20 }
          })
        );
      }
      if (edu.description) rightParas.push(...parseRichTextToParagraphs(edu.description, style, { size: 20 }));

      euroRows.push(
        new TableRow({
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [
                    ...(i === 0 ? [new TextRun({ text: 'EDUCATION & TRAINING\n', bold: true, size: 19, color: style.primary, font: style.font })] : []),
                    new TextRun({ text: dateRange, size: 18, color: '64748B', font: style.font })
                  ],
                  spacing: { before: 60, after: 20 }
                })
              ]
            }),
            new TableCell({
              width: { size: 72, type: WidthType.PERCENTAGE },
              children: rightParas
            })
          ]
        })
      );
    }
  }

  const euroTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE, size: 0, color: 'auto' }, bottom: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      left: { style: BorderStyle.NONE, size: 0, color: 'auto' }, right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' }, insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' }
    },
    rows: euroRows
  });

  return [...topElements, euroTable];
}

// --------------------------------------------------------------------------
// 9. Master Document Factory & Public API
// --------------------------------------------------------------------------

function resumeDocument(input = {}) {
  const resume = input.item && typeof input.item === 'object' ? { ...input.item, ...input } : input;
  const templateName = resume.template || resume.resumeName || 'Cv1';
  const style = getTemplateStyle(templateName, resume.colors);

  const fullName = stripAllHtmlTags(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || stripAllHtmlTags(resume.title) || 'Resume';

  let children;
  switch (style.archetype) {
    case ARCHETYPES.EXECUTIVE_BANNER:
      children = buildExecutiveBannerDocument(resume, style);
      break;
    case ARCHETYPES.TECH_GRID:
      children = buildTechGridDocument(resume, style);
      break;
    case ARCHETYPES.COMPACT_EURO:
      children = buildCompactEuroDocument(resume, style);
      break;
    case ARCHETYPES.MINIMAL_ATS:
      children = buildMinimalAtsDocument(resume, style);
      break;
    case ARCHETYPES.MODERN_SPLIT:
    default:
      children = buildModernSplitDocument(resume, style);
      break;
  }

  return new Document({
    creator: 'ResumePilot AI',
    title: fullName,
    description: 'Editable professional resume document export',
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.45),
              bottom: convertInchesToTwip(0.45),
              left: convertInchesToTwip(0.45),
              right: convertInchesToTwip(0.45)
            }
          }
        },
        children
      }
    ]
  });
}

async function createResumeDocx(input) {
  return Packer.toBuffer(resumeDocument(input));
}

module.exports = {
  createResumeDocx,
  resumeDocument,
  getTemplateStyle,
  parseRichTextToParagraphs,
  stripAllHtmlTags,
  THEMES,
  ARCHETYPES
};
