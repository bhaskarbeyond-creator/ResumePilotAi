/**
 * Forensic template-lab fixture matrix.
 * Used by the template lab page and the automated visual audit so both
 * exercise byte-identical data. These fixtures deliberately stress:
 * short/very long names, long titles, tiny/huge summaries, many/few records,
 * long URLs, Unicode (Telugu, Devanagari, CJK, accented Latin, Arabic/RTL),
 * special characters and malformed optional fields.
 */
export const FIXTURES = Object.freeze({
  minimal: {
    firstname: 'Asha',
    lastname: 'Rao',
    email: 'asha.rao@example.com',
    template: 'Cv1',
  },
  normal: {
    firstname: 'Bhaskar',
    lastname: 'Venkata',
    occupation: 'Senior Platform Engineer',
    email: 'bhaskar@example.com',
    phone: '+91 98765 43210',
    address: '14 Lake View Road',
    city: 'Vijayawada',
    country: 'India',
    postalcode: '520001',
    website: 'https://bhaskar.dev',
    linkedin: 'https://linkedin.com/in/bhaskarvenkata',
    github: 'https://github.com/bhaskar',
    photo: null,
    summary: '<p>Platform engineer with 9+ years of experience building reliable, accessible and secure systems that serve millions of users. Led distributed infrastructure teams across fintech and logistics, delivering measurable availability and cost improvements.</p>',
    employments: [
      { jobTitle: 'Staff Platform Engineer', employer: 'Meridian Financial Systems', begin: 'Jan 2021', end: 'Present', description: '<p>Led a team of 12 engineers rebuilding the core payments ledger on Kubernetes.</p><ul><li>Improved p99 latency by 41% through event-driven re-architecture.</li><li>Reduced cloud spend by 28% with rightsizing automation.</li></ul>' },
      { jobTitle: 'Senior Software Engineer', employer: 'Arclight Logistics', begin: 'Mar 2018', end: 'Dec 2020', description: '<p>Designed the shipment tracking platform handling 4M events/day.</p><ul><li>Shipped real-time ETA engine with 99.7% accuracy.</li><li>Mentored 6 engineers; introduced incident review culture.</li></ul>' },
      { jobTitle: 'Software Engineer', employer: 'Nimbus Technologies', begin: 'Jun 2015', end: 'Feb 2018', description: '<p>Built microservices for the customer onboarding platform.</p>' },
    ],
    educations: [
      { school: 'Indian Institute of Technology, Madras', degree: 'B.Tech in Computer Science', started: '2011', finished: '2015', description: '<p>Graduated with distinction; ACM ICPC regional finalist.</p>' },
    ],
    skills: [
      { name: 'Kubernetes', rating: 92 }, { name: 'Go', rating: 88 }, { name: 'TypeScript', rating: 90 },
      { name: 'AWS', rating: 85 }, { name: 'PostgreSQL', rating: 84 }, { name: 'Observability', rating: 87 },
      { name: 'System Design', rating: 91 }, { name: 'CI/CD', rating: 89 },
    ],
    languages: [
      { name: 'English', level: 'Fluent' },
      { name: 'తెలుగు', level: 'Native' },
      { name: 'हिन्दी', level: 'Professional' },
    ],
    projects: [
      { title: 'ResumePilot', description: 'Open-source resume analytics toolkit with 2.4k GitHub stars.', url: 'https://github.com/bhaskar/resumepilot' },
    ],
    certifications: [
      { title: 'Certified Kubernetes Administrator', issuer: 'CNCF', date: '2022' },
      { title: 'AWS Solutions Architect Professional', issuer: 'Amazon Web Services', date: '2021' },
    ],
    achievements: [
      { title: 'Engineering Excellence Award', description: 'For the ledger migration delivered with zero downtime.' },
    ],
    references: [
      { name: 'Priya Nair', reference: 'VP Engineering, Meridian — priya@example.com' },
    ],
  },
  long: {
    firstname: 'Alexandrina',
    lastname: 'Castellanos-Woodhouse-McAllister',
    occupation: 'Distinguished Principal Solutions Architect and Global Head of Platform Engineering Excellence, Cloud Transformation Office',
    email: 'alexandrina.castellanos.woodhouse.mcallister@example.com',
    phone: '+1 (555) 010-8899 ext. 4471',
    address: 'Apartment 17B, 1200 North Lakeshore Boulevard',
    city: 'San Francisco',
    country: 'United States of America',
    postalcode: '94123',
    website: 'https://example.com/alexandrina/profile/deep/link/path/that/keeps/going',
    summary: `<p>${'Twenty years of enterprise architecture leadership across regulated industries, global teams, and multi-billion dollar technology transformation programmes. '.repeat(12)}</p>`,
    employments: Array.from({ length: 14 }, (_, i) => ({
      jobTitle: `Global Director of ${['Platform Engineering', 'Cloud Architecture', 'Data Platforms', 'Site Reliability'][i % 4]} — ${i + 1}`,
      employer: `Multinational Corporation ${String.fromCharCode(65 + i)} with a very long legal entity name`,
      begin: `${2003 + i}`,
      end: i === 0 ? 'Present' : `${2004 + i}`,
      description: `<p>${'Delivered measurable outcomes across global teams, driving revenue, reliability, security and cost optimisation. '.repeat(8)}</p>`,
    })),
    educations: Array.from({ length: 5 }, (_, i) => ({
      school: `University of ${['Oxford', 'Cambridge', 'Stanford', 'Tsinghua', 'ETH Zürich'][i]}`,
      degree: ['B.Sc.', 'M.Eng.', 'MBA', 'Ph.D.', 'Executive Programme'][i],
      started: `${1990 + i * 5}`,
      finished: `${1994 + i * 5}`,
      description: 'Graduated with honours and multiple distinctions.',
    })),
    skills: Array.from({ length: 32 }, (_, i) => ({ name: `Enterprise Capability Domain ${i + 1} with Long Descriptive Name`, rating: 40 + (i * 2) % 60 })),
    languages: Array.from({ length: 8 }, (_, i) => ({ name: `Language ${i + 1}`, level: ['Native', 'Fluent', 'Professional', 'Working'][i % 4] })),
    projects: Array.from({ length: 8 }, (_, i) => ({ title: `Global Transformation Programme ${i + 1}`, description: 'A very long description that keeps going to test multi-line wrapping behaviour across every template layout, including narrow sidebars and two-column arrangements.', url: `https://example.com/projects/${i + 1}` })),
    certifications: Array.from({ length: 10 }, (_, i) => ({ title: `Professional Certification Number ${i + 1}`, issuer: 'Global Accreditation Institute', date: `${2010 + i}` })),
    achievements: Array.from({ length: 6 }, (_, i) => ({ title: `Award ${i + 1}`, description: 'Recognised for outstanding contribution.' })),
    references: Array.from({ length: 3 }, (_, i) => ({ name: `Reference Person ${i + 1}`, reference: 'Chief Technology Officer, Global Organisation' })),
  },
  extreme: {
    firstname: 'Ævar'.repeat(30),
    lastname: 'Þórðardóttir–Zürich–Наконечник–Qureshi',
    occupation: 'Chief Executive Officer & Chief Technology Officer — Multi-National Conglomerate (Индустрия)',
    email: 'aevar@example.com',
    phone: '+354 555 0100',
    address: 'Aðalstræti 10',
    city: 'Reykjavík',
    country: 'Ísland',
    postalcode: '101',
    website: 'https://example.com/' + 'x'.repeat(120),
    summary: '<p>' + 'Ünïcödé–Stress‽ '.repeat(300) + '</p>',
    employments: [
      { jobTitle: 'Руководитель'.repeat(10), employer: 'ООО «Промышленные Технологии»', begin: 'Сентябрь 2010', end: 'Настоящее время', description: '<p>' + 'Кириллица и длинный текст. '.repeat(20) + '</p>' },
      { jobTitle: 'Lead Engineer', employer: 'A company with an extraordinarily long name that exceeds every reasonable display width', begin: '01/01/2000', end: '12/31/2010', description: '<p>Very long description ' + 'lorem ipsum '.repeat(40) + '</p>' },
    ],
    educations: [
      { school: 'Technische Universität München — Fakultät für Informatik und Elektrotechnik', degree: 'Diplom-Ingenieur (Univ.) in Informatik mit Vertiefung Software Engineering', started: '09/1990', finished: '07/1997', description: '' },
    ],
    skills: ['JavaScript', 'System Design', { name: 'Управление проектами', rating: 95 }],
    languages: [{ name: 'Íslenska', level: 'Móðurmál' }, { name: 'Deutsch', level: 'Fließend' }, { name: 'Русский', level: 'Свободно' }],
    projects: [{ title: 'Über-Projekt'.repeat(5), description: 'Long unicode project description ' + 'проект '.repeat(15), url: 'https://例子.测试/路径/很/长' }],
    certifications: [{ title: 'Zertifikat für Projektmanagement (GPM/IPMA Level B)', issuer: 'Deutsche Gesellschaft für Projektmanagement', date: '2020' }],
  },
  unicode: {
    firstname: 'श्रीनिवास',
    lastname: 'రామానుజం',
    occupation: 'वरिष्ठ अभियंता / సీనియర్ ఇంజనీర్',
    email: 'unicode@example.com',
    phone: '+91 98480 12345',
    address: 'Hyderabad',
    city: 'హైదరాబాద్',
    country: 'भारत',
    postalcode: '500081',
    summary: '<p>तेलुगु మరియు హిందీ మిశ్రమ వచనం — संयुक्ताक्षर, ఉచ్చారణ డయాక్రిటిక్స్, и кириллица, 繁體中文，简体中文，日本語のテキスト、العربية والرموز المختلطة، emoji ✅ and symbols ★☆.</p>',
    employments: [
      { jobTitle: 'सॉफ्टवेयर अभियंता', employer: 'తెలుగు సంస్థ ప్రైవేట్ లిమిటెడ్', begin: 'జనవరి 2020', end: 'ప్రస్తుతం', description: '<p>బహుళ లిపి కంటెంట్ — काम, विवरण और उपलब्धियाँ।</p>' },
      { jobTitle: 'Développeur', employer: 'Société Générale', begin: 'janvier 2018', end: 'décembre 2019', description: '<p>Accented Latin: café, naïve, résumé, señor, São Paulo.</p>' },
    ],
    educations: [
      { school: 'भारतीय प्रौद्योगिकी संस्थान', degree: 'సాంకేతికశాస్త్రంలో స్నాతకోత్తర', started: '2014', finished: '2018' },
    ],
    skills: [
      { name: 'संस्कृत', rating: 70 }, { name: 'తెలుగు టైపింగ్', rating: 80 }, { name: 'データベース', rating: 90 }, { name: 'C++', rating: 85 },
    ],
    languages: [
      { name: 'తెలుగు', level: 'మాతృభాష' }, { name: 'हिन्दी', level: 'धाराप्रवाह' }, { name: 'العربية', level: 'بطلاقة' }, { name: '中文', level: '流利' },
    ],
    projects: [{ title: 'বহুভাষিক প্রকল্প', description: 'বাংলা, ગુજરાતી, ਪੰਜਾਬੀ, ଓଡ଼ିଆ, தமிழ், ಕನ್ನಡ, മലയാളം', url: 'https://例子.测试' }],
    certifications: [{ title: 'Certificação Internacional', issuer: 'Instituto de Certificação', date: '2023' }],
  },
});

export const FIXTURE_ORDER = Object.freeze(['minimal', 'normal', 'long', 'extreme', 'unicode']);

export const TEMPLATE_IDS = Object.freeze(Array.from({ length: 51 }, (_, i) => `Cv${i + 1}`));

/**
 * Mirrors BuildResume.getTemplateDefaultColors so the lab renders templates
 * with the same colors the production builder injects on template switch.
 * Cv21-Cv51 use their own hardcoded defaults (null here).
 */
export const TEMPLATE_DEFAULT_COLORS = Object.freeze({
  Cv1: { primary: '#1E40AF', secondary: '#F1F5F9' },
  Cv2: { primary: '#f0c30e', secondary: '#f5f5f5' },
  Cv3: { primary: '#be8a95', secondary: '#000000' },
  Cv4: { primary: '#3d3e42', secondary: '#3d3e42' },
  Cv5: { primary: '#000000', secondary: '#2d3039' },
  Cv6: { primary: '#000000', secondary: '#09043c' },
  Cv7: { primary: '#000000', secondary: '#f5f5f5' },
  Cv8: { primary: '#353f58', secondary: '#3d3e42' },
  Cv9: { primary: '#555555', secondary: '#000000' },
  Cv10: { primary: '#0369c4', secondary: '#000000' },
  Cv11: { primary: '#86198f', secondary: '#fdf4ff' },
  Cv12: { primary: '#166534', secondary: '#f0fdf4' },
  Cv13: { primary: '#1e40af', secondary: '#eff6ff' },
  Cv14: { primary: '#b91c1c', secondary: '#fef2f2' },
  Cv15: { primary: '#9333ea', secondary: '#faf5ff' },
  Cv16: { primary: '#0d9488', secondary: '#f0fdfa' },
  Cv17: { primary: '#374151', secondary: '#f9fafb' },
  Cv18: { primary: '#f59e0b', secondary: '#fffbeb' },
  Cv19: { primary: '#3730a3', secondary: '#eef2ff' },
  Cv20: { primary: '#be185d', secondary: '#fdf2f8' },
});

