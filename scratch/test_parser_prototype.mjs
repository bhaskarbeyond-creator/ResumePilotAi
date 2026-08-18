import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType, Table, TableRow, TableCell, WidthType, BorderStyle } from 'docx';
import JSZip from 'jszip';
import fs from 'fs';

// Test tokenization of rich text
function cleanText(value, max = 10000) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function parseRichTextToParagraphs(rawHtml, style = {}, defaultSpacing = { after: 80 }) {
  if (!rawHtml) return [];
  const textStr = String(rawHtml).trim();
  if (!textStr) return [];

  // Replace block end tags with newlines
  let processed = textStr
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ');

  // Decode common HTML entities
  processed = processed
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Extract plain text lines while stripping all other tags
  const lines = processed
    .split('\n')
    .map(line => line.replace(/<[^>]+>/g, '').trim())
    .filter(Boolean);

  const paragraphs = [];
  for (const line of lines) {
    const isBullet = line.startsWith('•') || line.startsWith('-') || line.startsWith('*');
    const content = isBullet ? line.replace(/^[•\-*]\s*/, '').trim() : line;
    if (!content) continue;

    if (isBullet) {
      paragraphs.push(
        new Paragraph({
          bullet: { level: 0 },
          children: [new TextRun({ text: content, size: 20, font: style.font || 'Calibri' })],
          spacing: { before: 40, after: 40 }
        })
      );
    } else {
      paragraphs.push(
        new Paragraph({
          children: [new TextRun({ text: content, size: 20, font: style.font || 'Calibri' })],
          spacing: defaultSpacing
        })
      );
    }
  }

  return paragraphs;
}

console.log('Testing parseRichTextToParagraphs:');
const sampleHtml = '<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">Frontend Developer with 9+ years of experience in JavaScript and React.</span></p><ul><li>Delivered software projects on time</li><li>Engineered scalable architecture</li></ul>';
const paragraphs = parseRichTextToParagraphs(sampleHtml);
console.log('Parsed paragraphs count:', paragraphs.length);
