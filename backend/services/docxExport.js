const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

const text = (value, maximum = 10_000) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
const list = value => Array.isArray(value) ? value : [];

// Template family mapping for all 51 templates
function getTemplateStyle(templateName) {
  const name = String(templateName || 'Cv1').trim();
  const numMatch = name.match(/Cv(\d+)/i);
  const num = numMatch ? parseInt(numMatch[1], 10) : 1;

  // Archetypes: 
  // 1: Classic Centered (e.g., Cv1, Cv3, Cv11, Cv22...)
  // 2: Modern Left Accent (e.g., Cv2, Cv4, Cv7, Cv16...)
  // 3: Technical Compact (e.g., Cv5, Cv9, Cv14, Cv28...)
  // 4: Executive Bold (e.g., Cv8, Cv10, Cv13, Cv38...)
  const archetype = ((num - 1) % 4) + 1;

  switch (archetype) {
    case 1:
      return { align: AlignmentType.CENTER, primaryColor: '1B365D', boldTitle: true }; // Classic Navy
    case 2:
      return { align: AlignmentType.LEFT, primaryColor: '0F766E', boldTitle: true }; // Modern Teal
    case 3:
      return { align: AlignmentType.LEFT, primaryColor: '334155', boldTitle: false }; // Tech Slate
    case 4:
    default:
      return { align: AlignmentType.LEFT, primaryColor: '18181B', boldTitle: true }; // Executive Charcoal
  }
}

function heading(value, style, level = HeadingLevel.HEADING_1) {
  return new Paragraph({
    text: value,
    heading: level,
    spacing: { before: 240, after: 100 },
    run: { color: style.primaryColor, bold: true }
  });
}

function body(value, options = {}) {
  const clean = text(value);
  if (!clean) return null;
  return new Paragraph({
    children: [new TextRun({ text: clean, bold: options.bold === true, size: options.size || 22 })],
    bullet: options.bullet ? { level: 0 } : undefined,
    spacing: { after: options.after || 80 }
  });
}

function section(title, entries, render, style) {
  if (!entries.length) return [];
  return [heading(title, style), ...entries.flatMap(render).filter(Boolean)];
}

function resumeDocument(input = {}) {
  const resume = input.item && typeof input.item === 'object' ? { ...input.item, ...input } : input;
  const templateName = resume.template || resume.resumeName || 'Cv1';
  const style = getTemplateStyle(templateName);

  const fullName = text(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || text(resume.title) || 'Resume';
  const contactParts = [resume.email, resume.phone, resume.city, resume.country, resume.website, resume.linkedin].map(value => text(value, 300)).filter(Boolean);
  const contact = contactParts.join(' • ');

  const children = [
    new Paragraph({
      alignment: style.align,
      children: [new TextRun({ text: fullName, bold: true, size: 36, color: style.primaryColor })],
      spacing: { after: 120 }
    }),
    contact ? new Paragraph({
      alignment: style.align,
      children: [new TextRun({ text: contact, size: 20, color: '555555' })],
      spacing: { after: 240 }
    }) : null,

    ...(text(resume.summary) ? [heading('Professional Summary', style), body(resume.summary)] : []),

    ...section('Experience', list(resume.employments || resume.experience), entry => [
      body([entry.jobTitle || entry.title, entry.employer || entry.company].map(value => text(value)).filter(Boolean).join(' — '), { bold: true, size: 24 }),
      body([entry.startDate, entry.endDate].map(value => text(value)).filter(Boolean).join(' – '), { size: 18 }),
      body(entry.description),
    ], style),

    ...section('Education', list(resume.educations || resume.education), entry => [
      body([entry.degree || entry.studyType, entry.school || entry.institution].map(value => text(value)).filter(Boolean).join(' — '), { bold: true, size: 24 }),
      body([entry.startDate, entry.endDate].map(value => text(value)).filter(Boolean).join(' – '), { size: 18 }),
      body(entry.description),
    ], style),

    ...section('Skills', list(resume.skills), entry => [
      body(typeof entry === 'string' ? entry : entry.name || entry.skill, { bullet: true })
    ], style),

    ...section('Languages', list(resume.languages), entry => [
      body([typeof entry === 'string' ? entry : entry.name || entry.language, entry.level || entry.proficiency].map(value => text(value)).filter(Boolean).join(' — '), { bullet: true })
    ], style),

    ...section('Projects', list(resume.projects), entry => [
      body(entry.title || entry.name, { bold: true, size: 24 }),
      body(entry.description),
      body(entry.url, { size: 18 })
    ], style),

    ...section('Certifications', list(resume.certifications), entry => [
      body([entry.name || entry.title, entry.issuer].map(value => text(value)).filter(Boolean).join(' — '), { bullet: true })
    ], style),

    ...list(resume.customSections).flatMap(custom => section(text(custom.title) || 'Additional Information', list(custom.items), entry => [
      body(entry.title || entry.name, { bold: true, size: 24 }),
      body(entry.description || entry.content)
    ], style)),
  ].filter(Boolean);

  return new Document({
    creator: 'ResumePilot AI',
    title: fullName,
    description: 'Editable professional resume document export',
    sections: [{ properties: {}, children }]
  });
}

async function createResumeDocx(input) {
  return Packer.toBuffer(resumeDocument(input));
}

module.exports = { createResumeDocx, resumeDocument, getTemplateStyle };
