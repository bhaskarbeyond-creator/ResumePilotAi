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
  convertMillimetersToTwip,
  ExternalHyperlink,
  LevelFormat,
  TableLayoutType,
  VerticalAlign,
  UnderlineType,
  Footer,
  PageNumber,
  TabStopType,
} = require('docx');

const {
  ARCHETYPES,
  THEMES,
  getTemplateStyle,
  extractHex,
  sanitizeColorMap,
  isDarkHex,
  layoutFamily,
  resolveExportTemplate,
  EXPORTABLE_TEMPLATE,
} = require('./docxThemes');

const PAGE_WIDTH = convertMillimetersToTwip(210);
const PAGE_MARGIN = convertMillimetersToTwip(11);
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const NONE_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const NO_BORDERS = {
  top: NONE_BORDER,
  bottom: NONE_BORDER,
  left: NONE_BORDER,
  right: NONE_BORDER,
  insideHorizontal: NONE_BORDER,
  insideVertical: NONE_BORDER,
};
const BULLET_REF = 'resume-bullets';
const NUMBER_REF = 'resume-numbers';

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
    .replace(/&#160;/g, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&#x2F;/gi, '/')
    .replace(/&#(\d+);/g, (_, n) => {
      const code = Number(n);
      return Number.isFinite(code) && code > 31 ? String.fromCharCode(code) : ' ';
    });
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

function list(value) {
  if (Array.isArray(value)) return value.filter((item) => item != null && item !== '');
  if (value && typeof value === 'object') return Object.values(value);
  if (typeof value === 'string' && value.trim()) return value.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
  return [];
}

function hiddenSet(resume) {
  return new Set((Array.isArray(resume.hiddenSections) ? resume.hiddenSections : []).map((s) => String(s)));
}

function isHidden(hidden, ...keys) {
  return keys.some((key) => hidden.has(key));
}

function safeUrl(raw) {
  const value = String(raw || '').trim();
  if (!value || /[\u0000-\u001f\u007f]/.test(value)) return null;
  const candidate = /^www\./i.test(value)
    ? `https://${value}`
    : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
      ? `mailto:${value}`
      : value;
  try {
    const parsed = new URL(candidate);
    if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol)) return null;
    if (parsed.username || parsed.password) return null;
    return parsed.href;
  } catch {
    return null;
  }
}

function hrefFromTag(tag) {
  const match = String(tag).match(/href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i);
  return safeUrl(match ? (match[1] || match[2] || match[3]) : '');
}

function styleFlags(tag, marks) {
  const next = { ...marks };
  const style = String(tag).match(/style\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
  const css = (style ? (style[1] || style[2]) : '').toLowerCase();
  if (/font-weight\s*:\s*(bold|[6-9]00)/.test(css)) next.bold = true;
  if (/font-style\s*:\s*italic/.test(css)) next.italic = true;
  if (/text-decoration\s*:[^;]*underline/.test(css)) next.underline = true;
  return next;
}

function emptyParagraph() {
  return new Paragraph({ children: [new TextRun({ text: '' })] });
}

function runFromMark(text, marks, style, options = {}) {
  const color = options.color || '334155';
  const size = options.size || 20;
  if (marks.href) {
    return new ExternalHyperlink({
      link: marks.href,
      children: [
        new TextRun({
          text,
          size,
          font: style.font || 'Calibri',
          color: options.linkColor || style.secondary || '2563EB',
          bold: marks.bold === true || options.bold === true,
          italics: marks.italic === true,
          underline: { type: UnderlineType.SINGLE },
        }),
      ],
    });
  }
  return new TextRun({
    text,
    size,
    font: style.font || 'Calibri',
    color,
    bold: marks.bold === true || options.bold === true,
    italics: marks.italic === true,
    underline: marks.underline ? { type: UnderlineType.SINGLE } : undefined,
  });
}

function paragraphFromBlock(block, style, options = {}) {
  const runs = (block.runs || []).filter((run) => run.text);
  if (!runs.length) return null;
  const children = runs.map((run) => runFromMark(run.text, run, style, options));
  if (block.kind === 'ul') {
    return new Paragraph({
      numbering: { reference: BULLET_REF, level: Math.min(2, block.level || 0) },
      children,
      spacing: { before: 40, after: 40, line: 276 },
    });
  }
  if (block.kind === 'ol') {
    return new Paragraph({
      numbering: { reference: NUMBER_REF, level: Math.min(2, block.level || 0) },
      children,
      spacing: { before: 40, after: 40, line: 276 },
    });
  }
  return new Paragraph({
    children,
    spacing: options.spacing || { before: 40, after: 80, line: 276 },
    alignment: options.alignment,
  });
}

function parseRichTextToBlocks(rawContent, maximum = 10_000) {
  if (!rawContent) return [];
  const source = String(rawContent)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, ' ')
    .slice(0, maximum)
    .replace(/<br\s*\/?>/gi, '\n');

  if (!/<[a-zA-Z]/.test(source)) {
    const blocks = [];
    for (const rawLine of decodeHtmlEntities(source).split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const bullet = line.match(/^([•\-*]|\d+[.)])\s+(.*)$/);
      if (bullet) {
        const numbered = /^\d+[.)]$/.test(bullet[1]);
        blocks.push({ kind: numbered ? 'ol' : 'ul', level: 0, runs: [{ text: bullet[2], bold: false, italic: false, underline: false }] });
      } else {
        blocks.push({ kind: 'p', level: 0, runs: [{ text: line, bold: false, italic: false, underline: false }] });
      }
    }
    return blocks;
  }

  const blocks = [];
  let marks = { bold: false, italic: false, underline: false, href: null };
  let kind = 'p';
  let level = 0;
  let runs = [];
  const listStack = [];

  const flush = (nextKind = kind, nextLevel = level) => {
    const compact = [];
    for (const run of runs) {
      if (!run.text) continue;
      const prev = compact[compact.length - 1];
      if (prev && prev.bold === run.bold && prev.italic === run.italic && prev.underline === run.underline && prev.href === run.href) {
        prev.text += run.text;
      } else {
        compact.push({ ...run });
      }
    }
    if (compact.length) blocks.push({ kind, level, runs: compact });
    runs = [];
    kind = nextKind;
    level = nextLevel;
  };

  const pushText = (text) => {
    const decoded = decodeHtmlEntities(text).replace(/\r/g, '');
    if (!decoded) return;
    const parts = decoded.split('\n');
    parts.forEach((part, index) => {
      if (part) runs.push({ text: part, bold: marks.bold, italic: marks.italic, underline: marks.underline, href: marks.href });
      if (index < parts.length - 1) flush(kind, level);
    });
  };

  const tokenRe = /<\/?([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
  let last = 0;
  let match;
  while ((match = tokenRe.exec(source))) {
    if (match.index > last) pushText(source.slice(last, match.index));
    const tag = match[0];
    const name = match[1].toLowerCase();
    const closing = tag.startsWith('</');
    if (name === 'script' || name === 'style') {
      last = tokenRe.lastIndex;
      continue;
    }
    if (!closing && (name === 'p' || name === 'div' || name === 'h1' || name === 'h2' || name === 'h3')) {
      flush('p', level);
    } else if (closing && (name === 'p' || name === 'div' || name === 'h1' || name === 'h2' || name === 'h3')) {
      flush(listStack.length ? listStack[listStack.length - 1] : 'p', level);
    } else if (!closing && (name === 'ul' || name === 'ol')) {
      flush(name, listStack.length);
      listStack.push(name);
      kind = name;
      level = Math.max(0, listStack.length - 1);
    } else if (closing && (name === 'ul' || name === 'ol')) {
      flush('p', Math.max(0, listStack.length - 1));
      listStack.pop();
      kind = listStack[listStack.length - 1] || 'p';
      level = Math.max(0, listStack.length - 1);
    } else if (!closing && name === 'li') {
      flush(listStack[listStack.length - 1] || 'ul', Math.max(0, listStack.length - 1));
    } else if (closing && name === 'li') {
      flush(listStack[listStack.length - 1] || 'p', Math.max(0, listStack.length - 1));
    } else if (!closing && (name === 'strong' || name === 'b')) {
      marks = { ...marks, bold: true };
    } else if (closing && (name === 'strong' || name === 'b')) {
      marks = { ...marks, bold: false };
    } else if (!closing && (name === 'em' || name === 'i')) {
      marks = { ...marks, italic: true };
    } else if (closing && (name === 'em' || name === 'i')) {
      marks = { ...marks, italic: false };
    } else if (!closing && name === 'u') {
      marks = { ...marks, underline: true };
    } else if (closing && name === 'u') {
      marks = { ...marks, underline: false };
    } else if (!closing && name === 'a') {
      marks = { ...marks, href: hrefFromTag(tag) };
    } else if (closing && name === 'a') {
      marks = { ...marks, href: null };
    } else if (!closing && name === 'span') {
      marks = styleFlags(tag, marks);
    } else if (closing && name === 'span') {
      marks = { ...marks, bold: false, italic: false, underline: false };
    }
    last = tokenRe.lastIndex;
  }
  if (last < source.length) pushText(source.slice(last));
  flush('p', 0);
  return blocks;
}

function parseRichTextToParagraphs(rawContent, style = {}, options = {}) {
  return parseRichTextToBlocks(rawContent, options.maximum || 10_000)
    .map((block) => paragraphFromBlock(block, style, options))
    .filter(Boolean);
}

function ensureChildren(nodes) {
  const children = (nodes || []).filter(Boolean);
  return children.length ? children : [emptyParagraph()];
}

function createSectionHeading(title, style, options = {}) {
  const color = options.color || style.primary;
  return new Paragraph({
    border: options.underlined === false ? undefined : {
      bottom: {
        color: style.secondary || style.primary,
        space: 4,
        style: BorderStyle.SINGLE,
        size: 8,
      },
    },
    spacing: { before: options.beforeSpacing !== undefined ? options.beforeSpacing : 160, after: 60 },
    children: [
      new TextRun({
        text: String(title || '').toUpperCase(),
        bold: true,
        size: options.size || 21,
        font: style.font,
        color,
      }),
    ],
  });
}

function heroInnerWidth(style) {
  const leftPct = style.sidebarWidth || 34;
  const leftWidth = Math.round(CONTENT_WIDTH * (leftPct / 100));
  const rightWidth = CONTENT_WIDTH - leftWidth;
  // Match the right-cell margins used by twoColumnTable (left 140 + right 80).
  return Math.max(2400, rightWidth - 220);
}

function createEntryHeader(title, subTitle, dateRange, style, options = {}) {
  const width = options.contentWidth || CONTENT_WIDTH;
  const titleColor = options.titleColor || '111827';
  const nodes = [];
  if (title || dateRange) {
    const children = [
      new TextRun({ text: title || '', bold: true, size: 22, font: style.font, color: titleColor }),
    ];
    if (dateRange) {
      children.push(new TextRun({ text: '\t' }));
      children.push(new TextRun({ text: dateRange, size: 18, font: style.font, color: '64748B' }));
    }
    nodes.push(new Paragraph({
      tabStops: dateRange ? [{ type: TabStopType.RIGHT, position: width }] : undefined,
      spacing: { before: 80, after: subTitle ? 0 : 20 },
      children,
    }));
  }
  if (subTitle) {
    const href = options.subTitleHref || null;
    if (href) {
      nodes.push(new Paragraph({
        spacing: { before: 20, after: 20 },
        children: [
          new ExternalHyperlink({
            link: href,
            children: [new TextRun({
              text: subTitle,
              bold: true,
              size: 20,
              font: style.font,
              color: style.secondary || style.primary,
              underline: { type: UnderlineType.SINGLE },
            })],
          }),
        ],
      }));
    } else {
      nodes.push(new Paragraph({
        spacing: { before: 20, after: 20 },
        children: [
          new TextRun({ text: subTitle, bold: true, size: 20, font: style.font, color: style.primary }),
        ],
      }));
    }
  }
  return nodes;
}

function certsBelongInSidebar(resume) {
  const skillCount = list(resume.skills).length;
  const hobbiesCount = list(resume.hobbies || resume.interests).length;
  const certCount = list(resume.certifications).length;
  return certCount > 0 && certCount <= 3 && (skillCount + hobbiesCount) <= 6;
}

function contactHyperlinkParagraph(label, display, href, style, options = {}) {
  const children = [];
  if (label) {
    children.push(new TextRun({
      text: `${label} `,
      size: options.size || 18,
      font: style.font,
      color: options.color || '334155',
      bold: true,
    }));
  }
  if (href) {
    children.push(new ExternalHyperlink({
      link: href,
      children: [
        new TextRun({
          text: display,
          size: options.size || 18,
          font: style.font,
          color: options.linkColor || style.secondary || '2563EB',
          underline: { type: UnderlineType.SINGLE },
        }),
      ],
    }));
  } else {
    children.push(new TextRun({
      text: display,
      size: options.size || 18,
      font: style.font,
      color: options.color || '334155',
    }));
  }
  return new Paragraph({ children, spacing: { before: 20, after: 30 } });
}

function collectContactItems(resume) {
  const location = [stripAllHtmlTags(resume.address), [stripAllHtmlTags(resume.city), stripAllHtmlTags(resume.postalcode || resume.postalCode)].filter(Boolean).join(' '), stripAllHtmlTags(resume.country)]
    .filter(Boolean)
    .join(', ');
  const website = stripAllHtmlTags(resume.website || resume.websiteUrl);
  const linkedin = stripAllHtmlTags(resume.linkedin || resume.linkedinUrl);
  const github = stripAllHtmlTags(resume.github || resume.githubUrl);
  return [
    resume.phone ? { label: 'Phone', display: stripAllHtmlTags(resume.phone), href: null } : null,
    resume.email ? { label: 'Email', display: stripAllHtmlTags(resume.email), href: safeUrl(resume.email) } : null,
    location ? { label: 'Location', display: location, href: null } : null,
    website ? { label: 'Web', display: website.replace(/^https?:\/\//i, ''), href: safeUrl(website) } : null,
    linkedin ? { label: 'LinkedIn', display: linkedin.replace(/^https?:\/\/(www\.)?linkedin\.com\/in\//i, ''), href: safeUrl(linkedin) } : null,
    github ? { label: 'GitHub', display: github.replace(/^https?:\/\/(www\.)?github\.com\//i, ''), href: safeUrl(github) } : null,
  ].filter(Boolean);
}

function skillNameOf(skill) {
  if (typeof skill === 'string') return stripAllHtmlTags(skill);
  return stripAllHtmlTags(skill?.name || skill?.skillName || skill?.skill || skill?.title || skill?.value || '');
}

function languageLine(lang) {
  if (typeof lang === 'string') return stripAllHtmlTags(lang);
  const name = stripAllHtmlTags(lang?.name || lang?.language || '');
  const level = stripAllHtmlTags(lang?.level || lang?.proficiency || '');
  return [name, level].filter(Boolean).join(' — ');
}

function hobbyName(item) {
  if (typeof item === 'string') return stripAllHtmlTags(item);
  return stripAllHtmlTags(item?.name || item?.title || item?.hobby || item?.interest || '');
}

function normalizeResume(input = {}) {
  const resume = input.item && typeof input.item === 'object' ? { ...input.item, ...input } : { ...input };
  const hidden = hiddenSet(resume);
  if (isHidden(hidden, 'heading')) {
    resume.firstname = '';
    resume.lastname = '';
    resume.occupation = '';
    resume.email = '';
    resume.phone = '';
    resume.address = '';
    resume.city = '';
    resume.country = '';
    resume.website = '';
    resume.linkedin = '';
    resume.github = '';
  }
  if (isHidden(hidden, 'summary')) resume.summary = '';
  if (isHidden(hidden, 'employment', 'employments')) resume.employments = [];
  if (isHidden(hidden, 'education', 'educations')) resume.educations = [];
  if (isHidden(hidden, 'skills')) resume.skills = [];
  if (isHidden(hidden, 'languages')) resume.languages = [];
  if (isHidden(hidden, 'projects')) resume.projects = [];
  if (isHidden(hidden, 'certifications')) resume.certifications = [];
  if (isHidden(hidden, 'achievements', 'awards')) resume.achievements = [];
  if (isHidden(hidden, 'hobbies')) resume.hobbies = [];
  if (isHidden(hidden, 'references')) resume.references = [];
  return resume;
}

function fullNameOf(resume) {
  return stripAllHtmlTags(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`)
    || stripAllHtmlTags(resume.name)
    || stripAllHtmlTags(resume.title)
    || 'Resume';
}

function occupationOf(resume) {
  return stripAllHtmlTags(resume.occupation || resume.jobTitle || '');
}

function buildIdentityHeader(resume, style, options = {}) {
  const nodes = [];
  const nameColor = options.nameColor || style.primary;
  const roleColor = options.roleColor || style.secondary || style.primary;
  nodes.push(new Paragraph({
    alignment: options.alignment || AlignmentType.LEFT,
    spacing: { before: 0, after: 40 },
    children: [new TextRun({ text: fullNameOf(resume), bold: true, size: options.nameSize || 36, color: nameColor, font: style.font })],
  }));
  const occupation = occupationOf(resume);
  if (occupation) {
    nodes.push(new Paragraph({
      alignment: options.alignment || AlignmentType.LEFT,
      spacing: { before: 0, after: 60 },
      children: [new TextRun({
        text: options.uppercaseRole === false ? occupation : occupation.toUpperCase(),
        bold: true,
        size: options.roleSize || 20,
        color: roleColor,
        font: options.roleFont || style.font,
      })],
    }));
  }
  return nodes;
}

function buildContactBlock(resume, style, options = {}) {
  const items = collectContactItems(resume);
  if (!items.length) return [];
  const nodes = [];
  if (options.heading) nodes.push(createSectionHeading(options.heading, style, { beforeSpacing: options.beforeSpacing || 0, color: options.headingColor, underlined: options.underlined }));
  if (options.inline) {
    const children = [];
    items.forEach((item, index) => {
      if (index) {
        children.push(new TextRun({
          text: options.separator || '  •  ',
          size: 18,
          color: options.color || '475569',
          font: style.font,
        }));
      }
      if (item.href) {
        children.push(new ExternalHyperlink({
          link: item.href,
          children: [new TextRun({
            text: item.display,
            size: 18,
            font: style.font,
            color: options.linkColor || style.secondary || '2563EB',
            underline: { type: UnderlineType.SINGLE },
          })],
        }));
      } else {
        children.push(new TextRun({
          text: item.display,
          size: 18,
          color: options.color || '475569',
          font: style.font,
        }));
      }
    });
    nodes.push(new Paragraph({
      alignment: options.alignment || AlignmentType.LEFT,
      spacing: { before: 0, after: 120 },
      children,
    }));
    return nodes;
  }
  for (const item of items) {
    nodes.push(contactHyperlinkParagraph(options.showLabels === false ? '' : `${item.label}:`, item.display, item.href, style, {
      color: options.color || style.sidebarText || '334155',
      linkColor: options.linkColor || style.secondary,
      size: options.size || 18,
    }));
  }
  return nodes;
}

function buildSkillsBlock(skills, style, options = {}) {
  const names = list(skills).map(skillNameOf).filter(Boolean);
  if (!names.length) return [];
  const nodes = [createSectionHeading(options.title || 'Skills', style, { beforeSpacing: options.beforeSpacing ?? 140, color: options.headingColor, underlined: options.underlined })];
  const variant = options.variant || style.skillVariant || 'pills';
  if (variant === 'inline') {
    nodes.push(new Paragraph({
      spacing: { before: 20, after: 40 },
      children: [new TextRun({ text: names.join('  •  '), size: 20, font: style.font, color: options.color || '333333' })],
    }));
    return nodes;
  }
  if (options.columns && options.columns > 1) {
    const cols = options.columns;
    const colWidth = Math.floor(CONTENT_WIDTH / cols);
    const rows = [];
    for (let i = 0; i < names.length; i += cols) {
      rows.push(new TableRow({
        children: Array.from({ length: cols }, (_, c) => new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          borders: NO_BORDERS,
          children: names[i + c]
            ? [new Paragraph({
              numbering: { reference: BULLET_REF, level: 0 },
              children: [new TextRun({ text: names[i + c], size: 19, font: style.font, color: options.color || '1E293B' })],
              spacing: { before: 20, after: 20 },
            })]
            : [emptyParagraph()],
        })),
      }));
    }
    nodes.push(new Table({
      width: { size: CONTENT_WIDTH, type: WidthType.DXA },
      columnWidths: Array.from({ length: cols }, () => colWidth),
      layout: TableLayoutType.FIXED,
      borders: NO_BORDERS,
      rows,
    }));
    return nodes;
  }
  for (const name of names) {
    nodes.push(new Paragraph({
      numbering: { reference: BULLET_REF, level: 0 },
      children: [new TextRun({ text: name, size: options.size || 19, font: style.font, color: options.color || '1E293B' })],
      spacing: { before: 20, after: 20 },
    }));
  }
  return nodes;
}

function buildLanguagesBlock(languages, style, options = {}) {
  const lines = list(languages).map(languageLine).filter(Boolean);
  if (!lines.length) return [];
  const nodes = [createSectionHeading(options.title || 'Languages', style, { beforeSpacing: options.beforeSpacing ?? 140, color: options.headingColor, underlined: options.underlined })];
  for (const line of lines) {
    nodes.push(new Paragraph({
      numbering: { reference: BULLET_REF, level: 0 },
      children: [new TextRun({ text: line, size: 18, font: style.font, color: options.color || style.sidebarText || '334155' })],
      spacing: { before: 15, after: 15 },
    }));
  }
  return nodes;
}

function buildHobbiesBlock(hobbies, style, options = {}) {
  const names = list(hobbies).map(hobbyName).filter(Boolean);
  if (!names.length) return [];
  return [
    createSectionHeading(options.title || 'Hobbies & Interests', style, { beforeSpacing: options.beforeSpacing ?? 140, color: options.headingColor, underlined: options.underlined }),
    new Paragraph({
      spacing: { before: 20, after: 40 },
      children: [new TextRun({ text: names.join('  •  '), size: 18, font: style.font, color: options.color || '334155' })],
    }),
  ];
}

function buildSummaryBlock(summary, style, options = {}) {
  const paragraphs = parseRichTextToParagraphs(summary, style, { size: options.size || 20, color: options.color || '334155' });
  if (!paragraphs.length) return [];
  return [
    createSectionHeading(options.title || 'Professional Summary', style, { beforeSpacing: options.beforeSpacing ?? 0, color: options.headingColor, underlined: options.underlined }),
    ...paragraphs,
  ];
}

function buildEmploymentBlock(employments, style, options = {}) {
  const items = list(employments);
  if (!items.length) return [];
  const nodes = [createSectionHeading(options.title || 'Employment History', style, { beforeSpacing: options.beforeSpacing ?? 140, color: options.headingColor, underlined: options.underlined })];
  for (const emp of items) {
    const jobTitle = stripAllHtmlTags(emp.jobTitle || emp.title || emp.position || '');
    const employer = stripAllHtmlTags(emp.employer || emp.company || emp.organization || '');
    const place = [employer, stripAllHtmlTags(emp.city)].filter(Boolean).join(' · ');
    const dateRange = formatCleanDateRange(emp.begin || emp.startDate || emp.started, emp.end || emp.endDate || emp.finished, emp.currentWork || emp.current);
    if (jobTitle || place || dateRange) nodes.push(...createEntryHeader(jobTitle, place, dateRange, style, options));
    if (emp.description) nodes.push(...parseRichTextToParagraphs(emp.description, style, { size: 20 }));
  }
  return nodes;
}

function buildEducationBlock(educations, style, options = {}) {
  const items = list(educations);
  if (!items.length) return [];
  const nodes = [createSectionHeading(options.title || 'Education', style, { beforeSpacing: options.beforeSpacing ?? 160, color: options.headingColor, underlined: options.underlined })];
  for (const edu of items) {
    const degree = stripAllHtmlTags(edu.degree || edu.qualification || edu.title || '');
    const school = stripAllHtmlTags(edu.school || edu.institution || edu.university || '');
    const dateRange = formatCleanDateRange(edu.started || edu.startDate || edu.begin, edu.finished || edu.endDate || edu.end);
    if (degree || school || dateRange) nodes.push(...createEntryHeader(degree, school, dateRange, style, options));
    if (edu.description) nodes.push(...parseRichTextToParagraphs(edu.description, style, { size: 20 }));
  }
  return nodes;
}

function buildProjectsBlock(projects, style, options = {}) {
  const items = list(projects);
  if (!items.length) return [];
  const nodes = [createSectionHeading(options.title || 'Projects', style, { beforeSpacing: options.beforeSpacing ?? 160, color: options.headingColor, underlined: options.underlined })];
  for (const proj of items) {
    const title = stripAllHtmlTags(proj.title || proj.name || '');
    const url = stripAllHtmlTags(proj.url || proj.link || '');
    const href = safeUrl(url);
    const displayUrl = url.replace(/^https?:\/\//i, '');
    if (title || displayUrl) {
      nodes.push(...createEntryHeader(title, displayUrl, '', style, { ...options, subTitleHref: href }));
    }
    if (proj.description) nodes.push(...parseRichTextToParagraphs(proj.description, style, { size: 20 }));
  }
  return nodes;
}

function buildCertificationsBlock(certs, style, options = {}) {
  const items = list(certs);
  if (!items.length) return [];
  const nodes = [createSectionHeading(options.title || 'Certifications', style, { beforeSpacing: options.beforeSpacing ?? 160, color: options.headingColor, underlined: options.underlined })];
  const twoCol = options.columns !== 1 && items.length > 1;
  if (!twoCol) {
    for (const cert of items) {
      const title = stripAllHtmlTags(cert.name || cert.title || '');
      const issuer = stripAllHtmlTags(cert.issuer || cert.organization || '');
      const line = [title, issuer].filter(Boolean).join(' — ');
      if (!line) continue;
      nodes.push(new Paragraph({
        numbering: { reference: BULLET_REF, level: 0 },
        children: [new TextRun({ text: line, size: 20, font: style.font, color: '333333' })],
        spacing: { before: 20, after: 20 },
      }));
    }
    return nodes;
  }
  const colWidth = Math.floor(CONTENT_WIDTH / 2);
  const rows = [];
  for (let i = 0; i < items.length; i += 2) {
    const cellText = (cert) => {
      if (!cert) return '';
      return [stripAllHtmlTags(cert.name || cert.title || ''), stripAllHtmlTags(cert.issuer || cert.organization || '')].filter(Boolean).join(' — ');
    };
    const left = cellText(items[i]);
    const right = cellText(items[i + 1]);
    rows.push(new TableRow({
      children: [
        new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          borders: NO_BORDERS,
          children: left ? [new Paragraph({
            numbering: { reference: BULLET_REF, level: 0 },
            children: [new TextRun({ text: left, size: 20, font: style.font, color: '333333' })],
            spacing: { before: 20, after: 20 },
          })] : [emptyParagraph()],
        }),
        new TableCell({
          width: { size: colWidth, type: WidthType.DXA },
          borders: NO_BORDERS,
          children: right ? [new Paragraph({
            numbering: { reference: BULLET_REF, level: 0 },
            children: [new TextRun({ text: right, size: 20, font: style.font, color: '333333' })],
            spacing: { before: 20, after: 20 },
          })] : [emptyParagraph()],
        }),
      ],
    }));
  }
  nodes.push(new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [colWidth, colWidth],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows,
  }));
  return nodes;
}

function buildAchievementsBlock(items, style, options = {}) {
  const listItems = list(items);
  if (!listItems.length) return [];
  const nodes = [createSectionHeading(options.title || 'Key Achievements', style, { beforeSpacing: options.beforeSpacing ?? 160, color: options.headingColor, underlined: options.underlined })];
  for (const item of listItems) {
    const title = stripAllHtmlTags(item.title || item.name || '');
    if (title) {
      nodes.push(new Paragraph({
        spacing: { before: 60, after: 20 },
        children: [new TextRun({ text: title, bold: true, size: 21, font: style.font, color: '111827' })],
      }));
    }
    if (item.description) nodes.push(...parseRichTextToParagraphs(item.description, style, { size: 20 }));
  }
  return nodes;
}

function buildReferencesBlock(items, style, options = {}) {
  const listItems = list(items);
  if (!listItems.length) return [];
  const nodes = [createSectionHeading(options.title || 'References', style, { beforeSpacing: options.beforeSpacing ?? 160, color: options.headingColor, underlined: options.underlined })];
  for (const item of listItems) {
    const name = stripAllHtmlTags(item.name || item.title || '');
    const detail = stripAllHtmlTags(item.reference || item.description || item.content || '');
    if (name) {
      nodes.push(new Paragraph({
        spacing: { before: 50, after: 10 },
        children: [new TextRun({ text: name, bold: true, size: 21, font: style.font, color: '111827' })],
      }));
    }
    if (detail) {
      nodes.push(new Paragraph({
        spacing: { before: 0, after: 40 },
        children: [new TextRun({ text: detail, size: 20, font: style.font, color: '334155' })],
      }));
    }
  }
  return nodes;
}

function buildCustomSections(resume, style, options = {}) {
  const nodes = [];
  for (const custom of list(resume.customSections)) {
    const title = stripAllHtmlTags(custom.title) || 'Additional Information';
    nodes.push(createSectionHeading(title, style, { beforeSpacing: options.beforeSpacing ?? 160, color: options.headingColor, underlined: options.underlined }));
    const items = list(custom.items);
    if (items.length) {
      for (const item of items) {
        const itemTitle = stripAllHtmlTags(item.title || item.name || '');
        if (itemTitle) {
          nodes.push(new Paragraph({
            spacing: { before: 50, after: 20 },
            children: [new TextRun({ text: itemTitle, bold: true, size: 21, font: style.font, color: '111827' })],
          }));
        }
        if (item.description || item.content) {
          nodes.push(...parseRichTextToParagraphs(item.description || item.content, style, { size: 20 }));
        }
      }
    } else if (custom.content) {
      nodes.push(...parseRichTextToParagraphs(custom.content, style, { size: 20 }));
    }
  }
  for (const component of list(resume.components)) {
    const title = stripAllHtmlTags(component.name || component.title || 'Additional');
    nodes.push(createSectionHeading(title, style, { beforeSpacing: 160, color: options.headingColor, underlined: options.underlined }));
    if (Array.isArray(component.content)) {
      for (const line of component.content) {
        const text = stripAllHtmlTags(line);
        if (!text) continue;
        nodes.push(new Paragraph({
          numbering: { reference: BULLET_REF, level: 0 },
          children: [new TextRun({ text, size: 20, font: style.font, color: '333333' })],
          spacing: { before: 20, after: 20 },
        }));
      }
    } else if (component.content) {
      nodes.push(...parseRichTextToParagraphs(component.content, style, { size: 20 }));
    }
  }
  return nodes;
}

function twoColumnTable(sidebarChildren, mainChildren, style, sidebarPercent) {
  const sidebarPct = sidebarPercent || style.sidebarWidth || 34;
  const sidebarWidth = Math.round(CONTENT_WIDTH * (sidebarPct / 100));
  const mainWidth = CONTENT_WIDTH - sidebarWidth;
  const dark = style.sidebarBg && isDarkHex(style.sidebarBg);
  // Cv50's whole visual identity is a RIGHT-hand sidebar. `sidebarPosition`
  // was carried in the DOCX theme registry but never read here, so the DOCX
  // rendered the sidebar on the left while the browser and the PDF rendered it
  // on the right — a template-level parity break for that design.
  const sidebarOnRight = style.sidebarPosition === 'right';
  const sidebarCell = new TableCell({
    width: { size: sidebarWidth, type: WidthType.DXA },
    shading: style.sidebarBg ? { fill: style.sidebarBg } : undefined,
    margins: sidebarOnRight
      ? { top: 80, bottom: 80, left: 80, right: 100 }
      : { top: 80, bottom: 80, left: 100, right: 80 },
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.TOP,
    children: ensureChildren(sidebarChildren),
  });
  const mainCell = new TableCell({
    width: { size: mainWidth, type: WidthType.DXA },
    shading: dark ? { fill: 'FFFFFF' } : undefined,
    margins: sidebarOnRight
      ? { top: 80, bottom: 80, left: 80, right: 140 }
      : { top: 80, bottom: 80, left: 140, right: 80 },
    borders: NO_BORDERS,
    verticalAlign: VerticalAlign.TOP,
    children: ensureChildren(mainChildren),
  });
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: sidebarOnRight ? [mainWidth, sidebarWidth] : [sidebarWidth, mainWidth],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: sidebarOnRight ? [mainCell, sidebarCell] : [sidebarCell, mainCell],
      }),
    ],
  });
}

function bannerTable(children, fill) {
  return new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [CONTENT_WIDTH],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: CONTENT_WIDTH, type: WidthType.DXA },
            shading: { fill: fill || '1E293B' },
            margins: { top: 140, bottom: 140, left: 160, right: 160 },
            borders: NO_BORDERS,
            children: ensureChildren(children),
          }),
        ],
      }),
    ],
  });
}

function sidebarTone(style) {
  const dark = style.sidebarBg && isDarkHex(style.sidebarBg);
  return {
    headingColor: dark ? (style.sidebarText || 'F8FAFC') : style.primary,
    color: style.sidebarText || (dark ? 'F8FAFC' : '334155'),
    underlined: true,
  };
}

function buildSidebarStack(resume, style, options = {}) {
  const tone = sidebarTone(style);
  const nodes = [];
  if (options.includeIdentity !== false) {
    nodes.push(...buildIdentityHeader(resume, style, {
      nameColor: tone.headingColor,
      roleColor: style.secondary,
      nameSize: 28,
      roleSize: 18,
    }));
    nodes.push(...buildContactBlock(resume, style, {
      heading: 'Contact',
      headingColor: tone.headingColor,
      color: tone.color,
      linkColor: style.secondary,
      underlined: true,
      beforeSpacing: 80,
    }));
  }
  nodes.push(...buildSkillsBlock(resume.skills, style, { ...tone, beforeSpacing: 140, size: 18 }));
  if (options.includeHobbies !== false) {
    nodes.push(...buildHobbiesBlock(resume.hobbies || resume.interests, style, { ...tone, beforeSpacing: 140 }));
  }
  if (options.includeCerts) {
    nodes.push(...buildCertificationsBlock(resume.certifications, style, { ...tone, columns: 1, beforeSpacing: 140 }));
  }
  nodes.push(...buildLanguagesBlock(resume.languages, style, { ...tone, beforeSpacing: 140 }));
  return nodes;
}

function buildHeroStack(resume, style, options = {}) {
  const nodes = [];
  const contentWidth = options.contentWidth || heroInnerWidth(style);
  nodes.push(...buildSummaryBlock(resume.summary || resume.professionalSummary, style, {
    title: options.summaryTitle || 'Professional Summary',
    beforeSpacing: 0,
  }));
  nodes.push(...buildEmploymentBlock(resume.employments || resume.experience || resume.workExperiences, style, {
    title: options.experienceTitle || 'Employment History',
    beforeSpacing: 140,
    contentWidth,
  }));
  return nodes;
}

function buildBottomStack(resume, style, options = {}) {
  const nodes = [];
  nodes.push(...buildEducationBlock(resume.educations || resume.education, style, { beforeSpacing: 180 }));
  if (options.includeSkills) nodes.push(...buildSkillsBlock(resume.skills, style, { beforeSpacing: 180, variant: style.skillVariant }));
  nodes.push(...buildProjectsBlock(resume.projects, style, { beforeSpacing: 180 }));
  if (options.includeCerts !== false) nodes.push(...buildCertificationsBlock(resume.certifications, style, { beforeSpacing: 180, columns: 2 }));
  if (options.includeHobbies) nodes.push(...buildHobbiesBlock(resume.hobbies || resume.interests, style, { beforeSpacing: 180 }));
  nodes.push(...buildAchievementsBlock(resume.achievements || resume.awards, style, { beforeSpacing: 180 }));
  nodes.push(...buildReferencesBlock(resume.references, style, { beforeSpacing: 180 }));
  if (options.includeLanguages) nodes.push(...buildLanguagesBlock(resume.languages, style, { beforeSpacing: 180 }));
  nodes.push(...buildCustomSections(resume, style, { beforeSpacing: 180 }));
  return nodes;
}

function buildModernSplitDocument(resume, style) {
  const certsInSidebar = certsBelongInSidebar(resume);
  const sidebar = buildSidebarStack(resume, style, { includeIdentity: true, includeHobbies: true, includeCerts: certsInSidebar });
  const hero = buildHeroStack(resume, style, { contentWidth: heroInnerWidth(style) });
  const bottom = buildBottomStack(resume, style, { includeCerts: !certsInSidebar });
  return [
    twoColumnTable(sidebar, hero, style, style.sidebarWidth),
    ...bottom,
  ];
}

function buildExecutiveBannerDocument(resume, style) {
  const bannerFill = style.headerBg || style.primary;
  const banner = [
    ...buildIdentityHeader(resume, style, {
      alignment: AlignmentType.CENTER,
      nameColor: style.headerText || 'FFFFFF',
      roleColor: style.secondary || 'E2E8F0',
      nameSize: 40,
    }),
    ...buildContactBlock(resume, style, {
      inline: true,
      alignment: AlignmentType.CENTER,
      color: 'F8FAFC',
      separator: '  •  ',
    }),
  ];
  const certsInSidebar = certsBelongInSidebar(resume);
  const sidebar = buildSidebarStack(resume, { ...style, sidebarBg: style.sidebarBg || 'F8FAFC' }, {
    includeIdentity: false,
    includeHobbies: true,
    includeCerts: certsInSidebar,
  });
  const hero = buildHeroStack(resume, style, {
    summaryTitle: 'Executive Summary',
    experienceTitle: 'Experience',
    contentWidth: heroInnerWidth({ ...style, sidebarWidth: style.sidebarWidth || 34 }),
  });
  const bottom = buildBottomStack(resume, style, { includeCerts: !certsInSidebar });
  return [
    bannerTable(banner, bannerFill),
    twoColumnTable(sidebar, hero, { ...style, sidebarBg: style.sidebarBg || 'F8FAFC' }, style.sidebarWidth || 34),
    ...bottom,
  ];
}

function buildMinimalAtsDocument(resume, style) {
  return [
    ...buildIdentityHeader(resume, style, { alignment: AlignmentType.CENTER, nameSize: 36 }),
    ...buildContactBlock(resume, style, { inline: true, alignment: AlignmentType.CENTER, color: '555555' }),
    ...buildSummaryBlock(resume.summary || resume.professionalSummary, style, { beforeSpacing: 80 }),
    ...buildEmploymentBlock(resume.employments || resume.experience || resume.workExperiences, style, { title: 'Experience', beforeSpacing: 140 }),
    ...buildEducationBlock(resume.educations || resume.education, style, { beforeSpacing: 140 }),
    ...buildSkillsBlock(resume.skills, style, { beforeSpacing: 140, variant: style.skillVariant }),
    ...buildProjectsBlock(resume.projects, style, { beforeSpacing: 140 }),
    ...buildCertificationsBlock(resume.certifications, style, { beforeSpacing: 140, columns: 2 }),
    ...buildLanguagesBlock(resume.languages, style, { beforeSpacing: 140 }),
    ...buildHobbiesBlock(resume.hobbies || resume.interests, style, { beforeSpacing: 140 }),
    ...buildAchievementsBlock(resume.achievements || resume.awards, style, { beforeSpacing: 140 }),
    ...buildReferencesBlock(resume.references, style, { beforeSpacing: 140 }),
    ...buildCustomSections(resume, style, { beforeSpacing: 140 }),
  ];
}

function buildTechGridDocument(resume, style) {
  // Mirrors the PDF tech-grid archetype: a full-width left-bold technical
  // identity band, then a two-column body (skills/certifications/languages rail
  // beside the narrative). Previously this delegated to the modern-split
  // builder, which placed the identity INSIDE the sidebar — the DOCX therefore
  // no longer matches the PDF once tech-grid got its own composer branch.
  const techStyle = {
    ...style,
    sidebarBg: style.sidebarBg || 'F8FAFC',
    sidebarWidth: style.sidebarWidth || 34,
  };
  const header = [
    ...buildIdentityHeader(resume, techStyle, {
      alignment: AlignmentType.LEFT,
      nameColor: techStyle.primary,
      roleColor: techStyle.secondary,
      nameSize: 38,
      roleSize: 20,
    }),
    ...buildContactBlock(resume, techStyle, {
      inline: true,
      alignment: AlignmentType.LEFT,
      color: '475569',
      linkColor: techStyle.secondary,
      separator: '  •  ',
    }),
  ];
  const certsInSidebar = certsBelongInSidebar(resume);
  const sidebar = buildSidebarStack(resume, techStyle, {
    includeIdentity: false,
    includeHobbies: true,
    includeCerts: certsInSidebar,
  });
  const hero = buildHeroStack(resume, techStyle, { contentWidth: heroInnerWidth(techStyle) });
  const bottom = buildBottomStack(resume, techStyle, { includeCerts: !certsInSidebar });
  return [
    ...header,
    twoColumnTable(sidebar, hero, techStyle, techStyle.sidebarWidth),
    ...bottom,
  ];
}

function euroRow(leftNodes, rightNodes, leftWidth, rightWidth) {
  return new TableRow({
    children: [
      new TableCell({
        width: { size: leftWidth, type: WidthType.DXA },
        borders: NO_BORDERS,
        verticalAlign: VerticalAlign.TOP,
        margins: { top: 40, bottom: 40, left: 0, right: 80 },
        children: ensureChildren(leftNodes),
      }),
      new TableCell({
        width: { size: rightWidth, type: WidthType.DXA },
        borders: NO_BORDERS,
        verticalAlign: VerticalAlign.TOP,
        margins: { top: 40, bottom: 40, left: 80, right: 0 },
        children: ensureChildren(rightNodes),
      }),
    ],
  });
}

function buildCompactEuroDocument(resume, style) {
  const leftWidth = Math.round(CONTENT_WIDTH * 0.28);
  const rightWidth = CONTENT_WIDTH - leftWidth;
  const rows = [];

  const summaryParas = parseRichTextToParagraphs(resume.summary || resume.professionalSummary, style, { size: 20 });
  if (summaryParas.length) {
    rows.push(euroRow(
      [new Paragraph({
        spacing: { before: 40, after: 20 },
        children: [new TextRun({ text: 'PERSONAL STATEMENT', bold: true, size: 19, color: style.primary, font: style.font })],
      })],
      summaryParas,
      leftWidth,
      rightWidth,
    ));
  }

  const employments = list(resume.employments || resume.experience || resume.workExperiences);
  employments.forEach((emp, index) => {
    const jobTitle = stripAllHtmlTags(emp.jobTitle || emp.title || emp.position || '');
    const employer = stripAllHtmlTags(emp.employer || emp.company || '');
    const dateRange = formatCleanDateRange(emp.begin || emp.startDate, emp.end || emp.endDate, emp.currentWork);
    const right = [];
    if (jobTitle || employer) {
      right.push(new Paragraph({
        spacing: { before: 40, after: 20 },
        children: [
          new TextRun({ text: jobTitle, bold: true, size: 22, color: '111827', font: style.font }),
          ...(employer ? [new TextRun({ text: ` — ${employer}`, bold: true, size: 20, color: style.primary, font: style.font })] : []),
        ],
      }));
    }
    if (emp.description) right.push(...parseRichTextToParagraphs(emp.description, style, { size: 20 }));
    rows.push(euroRow(
      [new Paragraph({
        spacing: { before: 40, after: 20 },
        children: [
          ...(index === 0 ? [new TextRun({ text: 'WORK EXPERIENCE', bold: true, size: 19, color: style.primary, font: style.font }), new TextRun({ text: ' ', size: 19 })] : []),
          new TextRun({ text: dateRange, size: 18, color: '64748B', font: style.font }),
        ],
      })],
      right,
      leftWidth,
      rightWidth,
    ));
  });

  const educations = list(resume.educations || resume.education);
  educations.forEach((edu, index) => {
    const degree = stripAllHtmlTags(edu.degree || edu.qualification || edu.title || '');
    const school = stripAllHtmlTags(edu.school || edu.institution || '');
    const dateRange = formatCleanDateRange(edu.started || edu.startDate, edu.finished || edu.endDate);
    const right = [];
    if (degree || school) {
      right.push(new Paragraph({
        spacing: { before: 40, after: 20 },
        children: [
          new TextRun({ text: degree, bold: true, size: 22, color: '111827', font: style.font }),
          ...(school ? [new TextRun({ text: ` — ${school}`, bold: true, size: 20, color: style.primary, font: style.font })] : []),
        ],
      }));
    }
    if (edu.description) right.push(...parseRichTextToParagraphs(edu.description, style, { size: 20 }));
    rows.push(euroRow(
      [new Paragraph({
        spacing: { before: 40, after: 20 },
        children: [
          ...(index === 0 ? [new TextRun({ text: 'EDUCATION & TRAINING', bold: true, size: 19, color: style.primary, font: style.font }), new TextRun({ text: ' ', size: 19 })] : []),
          new TextRun({ text: dateRange, size: 18, color: '64748B', font: style.font }),
        ],
      })],
      right,
      leftWidth,
      rightWidth,
    ));
  });

  const top = [
    ...buildIdentityHeader(resume, style, { nameSize: 32, uppercaseRole: true }),
    ...buildContactBlock(resume, style, { inline: true, color: '555555', separator: '   |   ' }),
  ];
  const table = rows.length ? [new Table({
    width: { size: CONTENT_WIDTH, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    layout: TableLayoutType.FIXED,
    borders: NO_BORDERS,
    rows,
  })] : [];
  return [
    ...top,
    ...table,
    ...buildSkillsBlock(resume.skills, style, { beforeSpacing: 160, variant: style.skillVariant }),
    ...buildProjectsBlock(resume.projects, style, { beforeSpacing: 160 }),
    ...buildCertificationsBlock(resume.certifications, style, { beforeSpacing: 160, columns: 2 }),
    ...buildLanguagesBlock(resume.languages, style, { beforeSpacing: 160 }),
    ...buildHobbiesBlock(resume.hobbies || resume.interests, style, { beforeSpacing: 160 }),
    ...buildAchievementsBlock(resume.achievements || resume.awards, style, { beforeSpacing: 160 }),
    ...buildReferencesBlock(resume.references, style, { beforeSpacing: 160 }),
    ...buildCustomSections(resume, style, { beforeSpacing: 160 }),
  ];
}

function buildCoverLetterDocument(resume, style) {
  const recipient = stripAllHtmlTags(resume.employerFullName || resume.recipientName || 'Hiring Manager');
  const company = stripAllHtmlTags(resume.recipientCompany || resume.employer || '');
  const address = stripAllHtmlTags(resume.recipientAddress || '');
  const body = resume.coverLetterContent || resume.letterBody || resume.summary || '';
  const nodes = [
    ...buildIdentityHeader(resume, style, { nameSize: 32 }),
    ...buildContactBlock(resume, style, { inline: true, color: '475569' }),
    new Paragraph({
      spacing: { before: 200, after: 40 },
      children: [new TextRun({ text: recipient, bold: true, size: 22, font: style.font, color: '111827' })],
    }),
  ];
  if (company) {
    nodes.push(new Paragraph({
      spacing: { before: 0, after: 20 },
      children: [new TextRun({ text: company, size: 20, font: style.font, color: style.primary })],
    }));
  }
  if (address) {
    nodes.push(new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [new TextRun({ text: address, size: 20, font: style.font, color: '475569' })],
    }));
  }
  nodes.push(new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: `Dear ${recipient},`, size: 22, font: style.font, color: '111827' })],
  }));
  nodes.push(...parseRichTextToParagraphs(body, style, { size: 22, spacing: { before: 60, after: 80, line: 300 } }));
  nodes.push(new Paragraph({
    spacing: { before: 160, after: 20 },
    children: [new TextRun({ text: 'Sincerely,', size: 22, font: style.font, color: '111827' })],
  }));
  nodes.push(new Paragraph({
    spacing: { before: 80, after: 0 },
    children: [new TextRun({ text: fullNameOf(resume), bold: true, size: 22, font: style.font, color: style.primary })],
  }));
  return nodes;
}

function numberingConfig() {
  const bulletLevel = (level) => ({
    level,
    format: LevelFormat.BULLET,
    text: level === 0 ? '•' : level === 1 ? '◦' : '▪',
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: { left: 360 + level * 240, hanging: 180 },
      },
    },
  });
  const numberLevel = (level) => ({
    level,
    format: LevelFormat.DECIMAL,
    text: `%${level + 1}.`,
    alignment: AlignmentType.LEFT,
    style: {
      paragraph: {
        indent: { left: 360 + level * 240, hanging: 180 },
      },
    },
  });
  return {
    config: [
      { reference: BULLET_REF, levels: [0, 1, 2].map(bulletLevel) },
      { reference: NUMBER_REF, levels: [0, 1, 2].map(numberLevel) },
    ],
  };
}

function resumeDocument(input = {}) {
  const resume = normalizeResume(input);
  const templateName = resume.template || resume.resumeName || 'Cv1';
  const style = getTemplateStyle(templateName);
  const fullName = fullNameOf(resume);
  const isCover = /^Cover[1-4]$/.test(String(templateName));

  let children;
  if (isCover) {
    children = buildCoverLetterDocument(resume, style);
  } else {
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
  }

  return new Document({
    creator: 'ResumePilot AI',
    title: fullName,
    description: 'Editable professional resume document export',
    numbering: numberingConfig(),
    styles: {
      default: {
        document: {
          run: { font: style.font || 'Calibri', size: 20 },
        },
      },
    },
    sections: [
      {
        properties: {
          page: {
            size: { width: PAGE_WIDTH, height: convertMillimetersToTwip(297) },
            margin: {
              top: PAGE_MARGIN,
              bottom: PAGE_MARGIN,
              left: PAGE_MARGIN,
              right: PAGE_MARGIN,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                border: { top: { style: BorderStyle.SINGLE, size: 6, color: 'E2E8F0', space: 8 } },
                spacing: { before: 80 },
                children: [
                  new TextRun({ text: fullName, size: 16, color: '94A3B8', font: style.font }),
                  new TextRun({ text: '    ', size: 16 }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '94A3B8', font: style.font }),
                ],
              }),
            ],
          }),
        },
        children: ensureChildren(children),
      },
    ],
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
  sanitizeColorMap,
  extractHex,
  resolveExportTemplate,
  layoutFamily,
  THEMES,
  ARCHETYPES,
  EXPORTABLE_TEMPLATE,
};
