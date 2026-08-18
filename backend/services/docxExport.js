const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
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

/**
 * Universal HTML and rich-text tokenizer for Word paragraphs.
 * Accurately parses <p>, <br>, <div>, <ul><li>, <ol><li>, and plain-text bullets (•, -, *)
 * into native Word Paragraph runs with zero raw HTML tag leakage.
 */
function parseRichTextToParagraphs(rawContent, style = {}, options = {}) {
  if (!rawContent) return [];
  const sanitized = cleanText(rawContent, options.maximum || 10_000);
  if (!sanitized) return [];

  // Normalize block boundaries to newlines
  let processed = String(rawContent)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .slice(0, options.maximum || 10_000)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');

  // Decode HTML entities
  processed = decodeHtmlEntities(processed);

  // Split into individual lines and strip any remaining HTML tags
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
          spacing: { before: 30, after: 30 }
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
          spacing: options.spacing || { before: 40, after: 80 }
        })
      );
    }
  }

  return paragraphs;
}

// --------------------------------------------------------------------------
// 2. Authoritative 51-Template Theme & Archetype Registry
// --------------------------------------------------------------------------

const THEMES = {
  Cv1: { name: 'Metropolitan Orange', archetype: '2-column', primary: 'EA580C', secondary: 'FB923C', sidebarBg: 'FFF7ED', sidebarText: '1E293B', font: 'Calibri' },
  Cv2: { name: 'Nordic Slate', archetype: '2-column', primary: '0F172A', secondary: '0EA5E9', sidebarBg: 'F1F5F9', sidebarText: '334155', font: 'Arial' },
  Cv3: { name: 'Emerald Executive', archetype: '2-column', primary: '065F46', secondary: '10B981', sidebarBg: 'F0FDF4', sidebarText: '166534', font: 'Calibri' },
  Cv4: { name: 'Harvard Classic ATS', archetype: '1-column', primary: '111827', secondary: '4B5563', font: 'Georgia' },
  Cv5: { name: 'Stanford Clean ATS', archetype: '1-column', primary: '1E293B', secondary: '64748B', font: 'Calibri' },
  Cv6: { name: 'Wall Street Modern', archetype: '1-column', primary: '0F172A', secondary: '2563EB', font: 'Arial' },
  Cv7: { name: 'Sapphire Modern Split', archetype: '2-column', primary: '1D4ED8', secondary: '60A5FA', sidebarBg: 'EFF6FF', sidebarText: '1E3A8A', font: 'Calibri' },
  Cv8: { name: 'Crown Executive Banner', archetype: '2-column', primary: '1E293B', secondary: '3B82F6', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Arial' },
  Cv9: { name: 'Cobalt Pro Split', archetype: '2-column', primary: '2563EB', secondary: '38BDF8', sidebarBg: 'F1F5F9', sidebarText: '1E293B', font: 'Calibri' },
  Cv10: { name: 'Titanium Executive', archetype: '2-column', primary: '334155', secondary: '64748B', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Arial' },
  Cv11: { name: 'Prism Executive Banner', archetype: '2-column', primary: '4338CA', secondary: '818CF8', sidebarBg: 'EEF2FF', sidebarText: '312E81', font: 'Calibri' },
  Cv12: { name: 'Oxford Academic ATS', archetype: '1-column', primary: '18181B', secondary: '71717A', font: 'Georgia' },
  Cv13: { name: 'Cambridge Research', archetype: '1-column', primary: '09090B', secondary: '52525B', font: 'Calibri' },
  Cv14: { name: 'Yale Corporate ATS', archetype: '1-column', primary: '1E293B', secondary: '0284C7', font: 'Calibri' },
  Cv15: { name: 'MIT Technical ATS', archetype: '1-column', primary: '0F172A', secondary: '059669', font: 'Arial' },
  Cv16: { name: 'Apex Navy Banner', archetype: '2-column', primary: '1E3A8A', secondary: '38BDF8', sidebarBg: 'EFF6FF', sidebarText: '172554', font: 'Calibri' },
  Cv17: { name: 'Teal Horizon Banner', archetype: '2-column', primary: '0F766E', secondary: '14B8A6', sidebarBg: 'F0FDFA', sidebarText: '134E4A', font: 'Calibri' },
  Cv18: { name: 'Princeton Minimal ATS', archetype: '1-column', primary: '27272A', secondary: '52525B', font: 'Georgia' },
  Cv19: { name: 'Zurich Financial ATS', archetype: '1-column', primary: '0F172A', secondary: '3B82F6', font: 'Calibri' },
  Cv20: { name: 'Pacific Blue Split', archetype: '2-column', primary: '0284C7', secondary: '38BDF8', sidebarBg: 'F0F9FF', sidebarText: '0369A1', font: 'Calibri' },
  Cv21: { name: 'Imperial Indigo Banner', archetype: '2-column', primary: '3730A3', secondary: '6366F1', sidebarBg: 'EEF2FF', sidebarText: '312E81', font: 'Calibri' },
  Cv22: { name: 'Geneva Executive ATS', archetype: '1-column', primary: '111827', secondary: '4B5563', font: 'Arial' },
  Cv23: { name: 'Burgundy Prestige Banner', archetype: '2-column', primary: '881337', secondary: 'F43F5E', sidebarBg: 'FFF1F2', sidebarText: '4C0519', font: 'Calibri' },
  Cv24: { name: 'Cyberpunk Modern Split', archetype: '2-column', primary: '4F46E5', secondary: 'EC4899', sidebarBg: 'FAF5FF', sidebarText: '3B0764', font: 'Calibri' },
  Cv25: { name: 'DevOps Terminal Tech', archetype: '2-column', primary: '0F172A', secondary: '10B981', sidebarBg: 'F8FAFC', sidebarText: '334155', font: 'Consolas' },
  Cv26: { name: 'FullStack Dark Split', archetype: '2-column', primary: '0284C7', secondary: '38BDF8', sidebarBg: 'F1F5F9', sidebarText: '0F172A', font: 'Calibri' },
  Cv27: { name: 'Creative Studio Split', archetype: '2-column', primary: 'D97706', secondary: 'FBBF24', sidebarBg: 'FFFBEB', sidebarText: '78350F', font: 'Arial' },
  Cv28: { name: 'Silicon Valley Engineer', archetype: '2-column', primary: '2563EB', secondary: '60A5FA', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv29: { name: 'Minimal Nordic Slate', archetype: '2-column', primary: '334155', secondary: '64748B', sidebarBg: 'F1F5F9', sidebarText: '0F172A', font: 'Arial' },
  Cv30: { name: 'Corporate Summit Banner', archetype: '2-column', primary: '1E293B', secondary: 'F59E0B', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv31: { name: 'Cloud Native Tech', archetype: '2-column', primary: '0284C7', secondary: '0EA5E9', sidebarBg: 'F0F9FF', sidebarText: '0369A1', font: 'Calibri' },
  Cv32: { name: 'Kubernetes Developer', archetype: '2-column', primary: '326CE5', secondary: '60A5FA', sidebarBg: 'EFF6FF', sidebarText: '1E3A8A', font: 'Arial' },
  Cv33: { name: 'Data Science Matrix', archetype: '2-column', primary: '059669', secondary: '34D399', sidebarBg: 'ECFDF5', sidebarText: '065F46', font: 'Calibri' },
  Cv34: { name: 'Fintech Executive', archetype: '2-column', primary: '0F172A', secondary: '38BDF8', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv35: { name: 'AI & ML Researcher', archetype: '2-column', primary: '7C3AED', secondary: 'A78BFA', sidebarBg: 'F5F3FF', sidebarText: '4C1D95', font: 'Arial' },
  Cv36: { name: 'BioTech Specialist', archetype: '2-column', primary: '0D9488', secondary: '2DD4BF', sidebarBg: 'F0FDFA', sidebarText: '134E4A', font: 'Calibri' },
  Cv37: { name: 'Solutions Architect ATS', archetype: '1-column', primary: 'EA580C', secondary: 'FB923C', font: 'Calibri' },
  Cv38: { name: 'Global Legal ATS', archetype: '1-column', primary: '18181B', secondary: '71717A', font: 'Georgia' },
  Cv39: { name: 'Product Manager Pro', archetype: '2-column', primary: '2563EB', secondary: '38BDF8', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv40: { name: 'Europass Classic Grid', archetype: '1-column', primary: '003399', secondary: '4169E1', font: 'Arial' },
  Cv41: { name: 'Europass Modern Slate', archetype: '1-column', primary: '1E293B', secondary: '3B82F6', font: 'Calibri' },
  Cv42: { name: 'European Academic Compact', archetype: '1-column', primary: '1E3A8A', secondary: '60A5FA', font: 'Arial' },
  Cv43: { name: 'Brussels International', archetype: '1-column', primary: '0F766E', secondary: '14B8A6', font: 'Calibri' },
  Cv44: { name: 'Scandinavia Clean Compact', archetype: '1-column', primary: '0F172A', secondary: '64748B', font: 'Arial' },
  Cv45: { name: 'Vienna Diplomatic Euro', archetype: '1-column', primary: '881337', secondary: 'E11D48', font: 'Georgia' },
  Cv46: { name: 'Frankfurt Finance Euro', archetype: '1-column', primary: '1E293B', secondary: '0284C7', font: 'Calibri' },
  Cv47: { name: 'Metro Dual Column Pro', archetype: '2-column', primary: '0369A1', secondary: '38BDF8', sidebarBg: 'F0F9FF', sidebarText: '0C4A6E', font: 'Calibri' },
  Cv48: { name: 'Modern Gradient Aurora', archetype: '2-column', primary: '6366F1', secondary: 'EC4899', sidebarBg: 'FAF5FF', sidebarText: '312E81', font: 'Calibri' },
  Cv49: { name: 'Berlin Tech Compact', archetype: '1-column', primary: '18181B', secondary: '3B82F6', font: 'Arial' },
  Cv50: { name: 'Executive Platinum Split', archetype: '2-column', primary: '0F172A', secondary: '475569', sidebarBg: 'F8FAFC', sidebarText: '1E293B', font: 'Calibri' },
  Cv51: { name: 'Standard Europass Official', archetype: '1-column', primary: '003399', secondary: '4169E1', font: 'Arial' }
};

function getTemplateStyle(templateName) {
  const name = String(templateName || 'Cv1').trim();
  const matched = THEMES[name];
  if (matched) return matched;

  const numMatch = name.match(/Cv(\d+)/i);
  if (numMatch) {
    const key = `Cv${parseInt(numMatch[1], 10)}`;
    if (THEMES[key]) return THEMES[key];
  }

  return THEMES.Cv1;
}

// --------------------------------------------------------------------------
// 3. Section & Heading Component Builders
// --------------------------------------------------------------------------

function createSectionHeading(title, style, options = {}) {
  return new Paragraph({
    text: title.toUpperCase(),
    heading: HeadingLevel.HEADING_2,
    border: options.underlined ? {
      bottom: {
        color: style.primary,
        space: 4,
        style: BorderStyle.SINGLE,
        size: 8
      }
    } : undefined,
    spacing: { before: options.beforeSpacing || 180, after: 80 },
    run: {
      color: style.primary,
      bold: true,
      size: 22,
      font: style.font
    }
  });
}

function list(value) {
  return Array.isArray(value) ? value : [];
}

// --------------------------------------------------------------------------
// 4. Two-Column Sidebar Document Builder (with <w:tbl>)
// --------------------------------------------------------------------------

function buildTwoColumnDocument(resume, style) {
  const fullName = stripAllHtmlTags(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || stripAllHtmlTags(resume.title) || 'Resume';
  const occupation = stripAllHtmlTags(resume.occupation || resume.jobTitle || resume.title || '');

  // 1. Document Header Banner
  const headerParagraphs = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [
        new TextRun({
          text: fullName,
          bold: true,
          size: 36,
          color: style.primary,
          font: style.font
        })
      ],
      spacing: { before: 0, after: 40 }
    })
  ];

  if (occupation) {
    headerParagraphs.push(
      new Paragraph({
        alignment: AlignmentType.LEFT,
        children: [
          new TextRun({
            text: occupation.toUpperCase(),
            bold: true,
            size: 20,
            color: style.secondary || '555555',
            font: style.font
          })
        ],
        spacing: { before: 0, after: 140 }
      })
    );
  }

  // 2. Left Sidebar Elements (Contact, Skills, Languages)
  const sidebarElements = [];

  // Contact Info
  const contactItems = [
    resume.phone ? `Phone: ${stripAllHtmlTags(resume.phone)}` : null,
    resume.email ? `Email: ${stripAllHtmlTags(resume.email)}` : null,
    resume.address || resume.city ? `Location: ${[stripAllHtmlTags(resume.address), stripAllHtmlTags(resume.city), stripAllHtmlTags(resume.country)].filter(Boolean).join(', ')}` : null,
    resume.website ? `Web: ${stripAllHtmlTags(resume.website)}` : null,
    resume.linkedin ? `LinkedIn: ${stripAllHtmlTags(resume.linkedin)}` : null,
    resume.github ? `GitHub: ${stripAllHtmlTags(resume.github)}` : null
  ].filter(Boolean);

  if (contactItems.length > 0) {
    sidebarElements.push(createSectionHeading('Contact', style, { beforeSpacing: 0 }));
    for (const item of contactItems) {
      sidebarElements.push(
        new Paragraph({
          children: [new TextRun({ text: item, size: 18, font: style.font, color: style.sidebarText || '334155' })],
          spacing: { before: 20, after: 40 }
        })
      );
    }
  }

  // Skills
  const skillsList = list(resume.skills);
  if (skillsList.length > 0) {
    sidebarElements.push(createSectionHeading('Skills', style, { beforeSpacing: 160 }));
    for (const skill of skillsList) {
      const skillName = typeof skill === 'string' ? skill : (skill.name || skill.skillName || skill.skill || '');
      const cleanSkill = stripAllHtmlTags(skillName);
      if (cleanSkill) {
        sidebarElements.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanSkill, size: 18, font: style.font, color: style.sidebarText || '334155' })],
            spacing: { before: 20, after: 20 }
          })
        );
      }
    }
  }

  // Languages
  const languagesList = list(resume.languages);
  if (languagesList.length > 0) {
    sidebarElements.push(createSectionHeading('Languages', style, { beforeSpacing: 160 }));
    for (const lang of languagesList) {
      const langName = typeof lang === 'string' ? lang : (lang.name || lang.language || '');
      const langLevel = typeof lang === 'object' ? (lang.level || lang.proficiency || '') : '';
      const cleanLang = [stripAllHtmlTags(langName), stripAllHtmlTags(langLevel)].filter(Boolean).join(' — ');
      if (cleanLang) {
        sidebarElements.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanLang, size: 18, font: style.font, color: style.sidebarText || '334155' })],
            spacing: { before: 20, after: 20 }
          })
        );
      }
    }
  }

  // Ensure sidebar is never empty
  if (sidebarElements.length === 0) {
    sidebarElements.push(new Paragraph({ text: '', spacing: { before: 0, after: 0 } }));
  }

  // 3. Right Main Content Elements (Summary, Experience, Education, Projects, Certifications)
  const mainElements = [];

  // Summary
  if (resume.summary) {
    const summaryParas = parseRichTextToParagraphs(resume.summary, style, { size: 20 });
    if (summaryParas.length > 0) {
      mainElements.push(createSectionHeading('Professional Summary', style, { beforeSpacing: 0, underlined: true }));
      mainElements.push(...summaryParas);
    }
  }

  // Experience
  const employmentsList = list(resume.employments || resume.experience || resume.workExperiences);
  if (employmentsList.length > 0) {
    mainElements.push(createSectionHeading('Employment History', style, { beforeSpacing: 180, underlined: true }));
    for (const emp of employmentsList) {
      const jobTitle = stripAllHtmlTags(emp.jobTitle || emp.title || emp.position || '');
      const employer = stripAllHtmlTags(emp.employer || emp.company || '');
      const dateRange = [stripAllHtmlTags(emp.startDate || emp.begin), stripAllHtmlTags(emp.endDate || emp.end || (emp.currentWork ? 'Present' : ''))].filter(Boolean).join(' – ');

      if (jobTitle || employer) {
        mainElements.push(
          new Paragraph({
            children: [
              new TextRun({ text: jobTitle, bold: true, size: 22, font: style.font, color: '111827' }),
              ...(employer ? [new TextRun({ text: ` — ${employer}`, bold: true, size: 22, font: style.font, color: style.primary })] : []),
              ...(dateRange ? [new TextRun({ text: `  (${dateRange})`, size: 18, font: style.font, color: '666666' })] : [])
            ],
            spacing: { before: 100, after: 40 }
          })
        );
      }

      if (emp.description) {
        mainElements.push(...parseRichTextToParagraphs(emp.description, style, { size: 20 }));
      }
    }
  }

  // Education
  const educationsList = list(resume.educations || resume.education);
  if (educationsList.length > 0) {
    mainElements.push(createSectionHeading('Education', style, { beforeSpacing: 180, underlined: true }));
    for (const edu of educationsList) {
      const degree = stripAllHtmlTags(edu.degree || edu.qualification || edu.title || '');
      const school = stripAllHtmlTags(edu.school || edu.institution || '');
      const dateRange = [stripAllHtmlTags(edu.startDate || edu.started || edu.start_year), stripAllHtmlTags(edu.endDate || edu.finished || edu.end_year)].filter(Boolean).join(' – ');

      if (degree || school) {
        mainElements.push(
          new Paragraph({
            children: [
              new TextRun({ text: degree, bold: true, size: 22, font: style.font, color: '111827' }),
              ...(school ? [new TextRun({ text: ` — ${school}`, bold: true, size: 22, font: style.font, color: style.primary })] : []),
              ...(dateRange ? [new TextRun({ text: `  (${dateRange})`, size: 18, font: style.font, color: '666666' })] : [])
            ],
            spacing: { before: 100, after: 40 }
          })
        );
      }

      if (edu.description) {
        mainElements.push(...parseRichTextToParagraphs(edu.description, style, { size: 20 }));
      }
    }
  }

  // Projects
  const projectsList = list(resume.projects);
  if (projectsList.length > 0) {
    mainElements.push(createSectionHeading('Projects', style, { beforeSpacing: 180, underlined: true }));
    for (const proj of projectsList) {
      const projTitle = stripAllHtmlTags(proj.title || proj.name || '');
      if (projTitle) {
        mainElements.push(
          new Paragraph({
            children: [
              new TextRun({ text: projTitle, bold: true, size: 22, font: style.font, color: '111827' }),
              ...(proj.url ? [new TextRun({ text: ` (${stripAllHtmlTags(proj.url)})`, size: 18, font: style.font, color: style.secondary || '0066CC' })] : [])
            ],
            spacing: { before: 100, after: 40 }
          })
        );
      }
      if (proj.description) {
        mainElements.push(...parseRichTextToParagraphs(proj.description, style, { size: 20 }));
      }
    }
  }

  // Certifications
  const certsList = list(resume.certifications);
  if (certsList.length > 0) {
    mainElements.push(createSectionHeading('Certifications', style, { beforeSpacing: 180, underlined: true }));
    for (const cert of certsList) {
      const certTitle = stripAllHtmlTags(cert.name || cert.title || '');
      const issuer = stripAllHtmlTags(cert.issuer || cert.organization || '');
      const cleanCert = [certTitle, issuer].filter(Boolean).join(' — ');
      if (cleanCert) {
        mainElements.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanCert, size: 20, font: style.font, color: '333333' })],
            spacing: { before: 30, after: 30 }
          })
        );
      }
    }
  }

  // Custom Sections
  const customSectionsList = list(resume.customSections);
  for (const custom of customSectionsList) {
    const customTitle = stripAllHtmlTags(custom.title) || 'Additional Information';
    mainElements.push(createSectionHeading(customTitle, style, { beforeSpacing: 180, underlined: true }));
    const items = list(custom.items);
    if (items.length > 0) {
      for (const item of items) {
        const itemTitle = stripAllHtmlTags(item.title || item.name || '');
        if (itemTitle) {
          mainElements.push(
            new Paragraph({
              children: [new TextRun({ text: itemTitle, bold: true, size: 22, font: style.font, color: '111827' })],
              spacing: { before: 80, after: 40 }
            })
          );
        }
        if (item.description || item.content) {
          mainElements.push(...parseRichTextToParagraphs(item.description || item.content, style, { size: 20 }));
        }
      }
    } else if (custom.content) {
      mainElements.push(...parseRichTextToParagraphs(custom.content, style, { size: 20 }));
    }
  }

  // Ensure main elements is never empty
  if (mainElements.length === 0) {
    mainElements.push(new Paragraph({ text: '', spacing: { before: 0, after: 0 } }));
  }

  // 4. Construct OpenXML 2-Column Table (<w:tbl>)
  const layoutTable = new Table({
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
            children: mainElements
          })
        ]
      })
    ]
  });

  return [...headerParagraphs, layoutTable];
}

// --------------------------------------------------------------------------
// 5. Single-Column ATS Document Builder
// --------------------------------------------------------------------------

function buildSingleColumnDocument(resume, style) {
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
      children: [
        new TextRun({
          text: fullName,
          bold: true,
          size: 36,
          color: style.primary,
          font: style.font
        })
      ],
      spacing: { before: 0, after: 40 }
    })
  ];

  if (occupation) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: occupation.toUpperCase(),
            bold: true,
            size: 20,
            color: style.secondary || '555555',
            font: style.font
          })
        ],
        spacing: { before: 0, after: 60 }
      })
    );
  }

  if (contactParts.length > 0) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          new TextRun({
            text: contactParts.join(' • '),
            size: 18,
            color: '555555',
            font: style.font
          })
        ],
        spacing: { before: 0, after: 200 }
      })
    );
  }

  // Summary
  if (resume.summary) {
    const summaryParas = parseRichTextToParagraphs(resume.summary, style, { size: 20 });
    if (summaryParas.length > 0) {
      children.push(createSectionHeading('Professional Summary', style, { underlined: true }));
      children.push(...summaryParas);
    }
  }

  // Experience
  const employmentsList = list(resume.employments || resume.experience || resume.workExperiences);
  if (employmentsList.length > 0) {
    children.push(createSectionHeading('Experience', style, { underlined: true }));
    for (const emp of employmentsList) {
      const jobTitle = stripAllHtmlTags(emp.jobTitle || emp.title || emp.position || '');
      const employer = stripAllHtmlTags(emp.employer || emp.company || '');
      const dateRange = [stripAllHtmlTags(emp.startDate || emp.begin), stripAllHtmlTags(emp.endDate || emp.end || (emp.currentWork ? 'Present' : ''))].filter(Boolean).join(' – ');

      if (jobTitle || employer) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: jobTitle, bold: true, size: 22, font: style.font, color: '111827' }),
              ...(employer ? [new TextRun({ text: ` — ${employer}`, bold: true, size: 22, font: style.font, color: style.primary })] : []),
              ...(dateRange ? [new TextRun({ text: `  (${dateRange})`, size: 18, font: style.font, color: '666666' })] : [])
            ],
            spacing: { before: 100, after: 40 }
          })
        );
      }

      if (emp.description) {
        children.push(...parseRichTextToParagraphs(emp.description, style, { size: 20 }));
      }
    }
  }

  // Education
  const educationsList = list(resume.educations || resume.education);
  if (educationsList.length > 0) {
    children.push(createSectionHeading('Education', style, { underlined: true }));
    for (const edu of educationsList) {
      const degree = stripAllHtmlTags(edu.degree || edu.qualification || edu.title || '');
      const school = stripAllHtmlTags(edu.school || edu.institution || '');
      const dateRange = [stripAllHtmlTags(edu.startDate || edu.started || edu.start_year), stripAllHtmlTags(edu.endDate || edu.finished || edu.end_year)].filter(Boolean).join(' – ');

      if (degree || school) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: degree, bold: true, size: 22, font: style.font, color: '111827' }),
              ...(school ? [new TextRun({ text: ` — ${school}`, bold: true, size: 22, font: style.font, color: style.primary })] : []),
              ...(dateRange ? [new TextRun({ text: `  (${dateRange})`, size: 18, font: style.font, color: '666666' })] : [])
            ],
            spacing: { before: 100, after: 40 }
          })
        );
      }

      if (edu.description) {
        children.push(...parseRichTextToParagraphs(edu.description, style, { size: 20 }));
      }
    }
  }

  // Skills
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
            spacing: { before: 30, after: 30 }
          })
        );
      }
    }
  }

  // Languages
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
            spacing: { before: 30, after: 30 }
          })
        );
      }
    }
  }

  // Projects
  const projectsList = list(resume.projects);
  if (projectsList.length > 0) {
    children.push(createSectionHeading('Projects', style, { underlined: true }));
    for (const proj of projectsList) {
      const projTitle = stripAllHtmlTags(proj.title || proj.name || '');
      if (projTitle) {
        children.push(
          new Paragraph({
            children: [
              new TextRun({ text: projTitle, bold: true, size: 22, font: style.font, color: '111827' }),
              ...(proj.url ? [new TextRun({ text: ` (${stripAllHtmlTags(proj.url)})`, size: 18, font: style.font, color: style.secondary || '0066CC' })] : [])
            ],
            spacing: { before: 100, after: 40 }
          })
        );
      }
      if (proj.description) {
        children.push(...parseRichTextToParagraphs(proj.description, style, { size: 20 }));
      }
    }
  }

  // Certifications
  const certsList = list(resume.certifications);
  if (certsList.length > 0) {
    children.push(createSectionHeading('Certifications', style, { underlined: true }));
    for (const cert of certsList) {
      const certTitle = stripAllHtmlTags(cert.name || cert.title || '');
      const issuer = stripAllHtmlTags(cert.issuer || cert.organization || '');
      const cleanCert = [certTitle, issuer].filter(Boolean).join(' — ');
      if (cleanCert) {
        children.push(
          new Paragraph({
            bullet: { level: 0 },
            children: [new TextRun({ text: cleanCert, size: 20, font: style.font, color: '333333' })],
            spacing: { before: 30, after: 30 }
          })
        );
      }
    }
  }

  // Custom Sections
  const customSectionsList = list(resume.customSections);
  for (const custom of customSectionsList) {
    const customTitle = stripAllHtmlTags(custom.title) || 'Additional Information';
    children.push(createSectionHeading(customTitle, style, { underlined: true }));
    const items = list(custom.items);
    if (items.length > 0) {
      for (const item of items) {
        const itemTitle = stripAllHtmlTags(item.title || item.name || '');
        if (itemTitle) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: itemTitle, bold: true, size: 22, font: style.font, color: '111827' })],
              spacing: { before: 80, after: 40 }
            })
          );
        }
        if (item.description || item.content) {
          children.push(...parseRichTextToParagraphs(item.description || item.content, style, { size: 20 }));
        }
      }
    } else if (custom.content) {
      children.push(...parseRichTextToParagraphs(custom.content, style, { size: 20 }));
    }
  }

  return children;
}

// --------------------------------------------------------------------------
// 6. Master Document Factory & Public API
// --------------------------------------------------------------------------

function resumeDocument(input = {}) {
  const resume = input.item && typeof input.item === 'object' ? { ...input.item, ...input } : input;
  const templateName = resume.template || resume.resumeName || 'Cv1';
  const style = getTemplateStyle(templateName);

  const fullName = stripAllHtmlTags(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || stripAllHtmlTags(resume.title) || 'Resume';

  const children = style.archetype === '2-column'
    ? buildTwoColumnDocument(resume, style)
    : buildSingleColumnDocument(resume, style);

  return new Document({
    creator: 'ResumePilot AI',
    title: fullName,
    description: 'Editable professional resume document export',
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(0.5),
              bottom: convertInchesToTwip(0.5),
              left: convertInchesToTwip(0.5),
              right: convertInchesToTwip(0.5)
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
  THEMES
};
