const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

const text = (value, maximum = 10_000) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, maximum);
const list = value => Array.isArray(value) ? value : [];

function heading(value, level = HeadingLevel.HEADING_1) {
  return new Paragraph({ text: value, heading: level, spacing: { before: 240, after: 100 } });
}
function body(value, options = {}) {
  const clean = text(value);
  return clean ? new Paragraph({ children: [new TextRun({ text: clean, bold: options.bold === true })], bullet: options.bullet ? { level: 0 } : undefined, spacing: { after: 80 } }) : null;
}
function section(title, entries, render) {
  if (!entries.length) return [];
  return [heading(title), ...entries.flatMap(render).filter(Boolean)];
}

function resumeDocument(input = {}) {
  const resume = input.item && typeof input.item === 'object' ? { ...input.item, ...input } : input;
  const fullName = text(`${resume.firstname || resume.firstName || ''} ${resume.lastname || resume.lastName || ''}`) || text(resume.title) || 'Resume';
  const contact = [resume.email, resume.phone, resume.city, resume.country].map(value => text(value, 300)).filter(Boolean).join(' • ');
  const children = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: fullName, bold: true, size: 34 })], spacing: { after: 100 } }),
    contact ? new Paragraph({ alignment: AlignmentType.CENTER, text: contact, spacing: { after: 240 } }) : null,
    ...(text(resume.summary) ? [heading('Professional Summary'), body(resume.summary)] : []),
    ...section('Experience', list(resume.employments || resume.experience), entry => [
      body([entry.jobTitle || entry.title, entry.employer || entry.company].map(value => text(value)).filter(Boolean).join(' — '), { bold: true }),
      body([entry.startDate, entry.endDate].map(value => text(value)).filter(Boolean).join(' – ')), body(entry.description),
    ]),
    ...section('Education', list(resume.educations || resume.education), entry => [
      body([entry.degree || entry.studyType, entry.school || entry.institution].map(value => text(value)).filter(Boolean).join(' — '), { bold: true }),
      body([entry.startDate, entry.endDate].map(value => text(value)).filter(Boolean).join(' – ')), body(entry.description),
    ]),
    ...section('Skills', list(resume.skills), entry => [body(typeof entry === 'string' ? entry : entry.name || entry.skill, { bullet: true })]),
    ...section('Languages', list(resume.languages), entry => [body([typeof entry === 'string' ? entry : entry.name || entry.language, entry.level || entry.proficiency].map(value => text(value)).filter(Boolean).join(' — '), { bullet: true })]),
    ...section('Projects', list(resume.projects), entry => [body(entry.title || entry.name, { bold: true }), body(entry.description), body(entry.url)]),
    ...section('Certifications', list(resume.certifications), entry => [body([entry.name || entry.title, entry.issuer].map(value => text(value)).filter(Boolean).join(' — '), { bullet: true })]),
    ...list(resume.customSections).flatMap(custom => section(text(custom.title) || 'Additional Information', list(custom.items), entry => [body(entry.title || entry.name, { bold: true }), body(entry.description || entry.content)])),
  ].filter(Boolean);
  return new Document({ creator: 'ResumePilot AI', title: fullName, description: 'Resume export', sections: [{ properties: {}, children }] });
}

async function createResumeDocx(input) {
  return Packer.toBuffer(resumeDocument(input));
}

module.exports = { createResumeDocx, resumeDocument };
