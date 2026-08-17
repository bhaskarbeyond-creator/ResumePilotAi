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
    hobbies: [
      'Photography',
      'Chess',
      'Marathon Running',
      'Open Source Contributor',
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
  // A (entry level, ~1 page) — compact realistic graduate.
  sparse: {
    firstname: 'Kavya',
    lastname: 'Nair',
    email: 'kavya.nair@example.com',
    phone: '+91 90000 12345',
    city: 'Kochi',
    country: 'India',
    occupation: 'Engineering Graduate',
    summary: '<p>Computer science graduate seeking an entry-level software engineering role.</p>',
    employments: [{ jobTitle: 'Software Engineering Intern', employer: 'Zephyr Labs', begin: 'May 2025', end: 'Aug 2025', description: '<p>Built internal dashboards and wrote unit tests for a payments service.</p>' }],
    educations: [{ school: 'Cochin University of Science and Technology', degree: 'B.Tech in Computer Science', started: '2021', finished: '2025', description: '<p>CGPA 8.9/10; final-year project on distributed caching.</p>' }],
    skills: [{ name: 'Python', rating: 80 }, { name: 'JavaScript', rating: 75 }, { name: 'SQL', rating: 70 }],
    languages: [{ name: 'English', level: 'Fluent' }, { name: 'Malayalam', level: 'Native' }],
    projects: [{ title: 'Campus events app', description: 'Full-stack event platform used by 1,200 students.', url: 'https://github.com/kavya/events' }],
  },
  // C (mid-level, 2 pages) — five roles, several projects/certs.
  senior: {
    firstname: 'Rohan',
    lastname: 'Mehta',
    occupation: 'Staff Software Engineer',
    email: 'rohan.mehta@example.com',
    phone: '+91 98100 45678',
    address: 'Hiranandani Gardens, Powai',
    city: 'Mumbai',
    country: 'India',
    postalcode: '400076',
    website: 'https://rohanmehta.dev',
    linkedin: 'https://linkedin.com/in/rohanmehta',
    github: 'https://github.com/rohanm',
    summary: '<p>Staff engineer with 11 years building distributed platforms for fintech scale. Led three platform migrations, grew a team of 16, and cut infrastructure cost by 34% while improving SLO attainment from 99.2% to 99.95%.</p>',
    employments: [
      { jobTitle: 'Staff Software Engineer', employer: 'RazorPay-Like Fintech (anonymised)', begin: 'Jan 2021', end: 'Present', description: '<p>Leading the ledger platform group. Rebuilt the write path to achieve 12k TPS with exactly-once semantics.</p><ul><li>Reduced p99 write latency from 640ms to 84ms.</li><li>Introduced chaos engineering practice adopted by 6 teams.</li></ul>' },
      { jobTitle: 'Senior Software Engineer', employer: 'CloudScale Systems', begin: 'Mar 2018', end: 'Dec 2020', description: '<p>Designed the multi-tenant control plane for 40k customers.</p><ul><li>Cut onboarding time from 2 days to 18 minutes.</li><li>Shipped usage metering accurate to 0.02%.</li></ul>' },
      { jobTitle: 'Software Engineer II', employer: 'Orbit Commerce', begin: 'Jun 2015', end: 'Feb 2018', description: '<p>Built the order management service handling 2M orders/month.</p><ul><li>Reduced duplicate-order incidents by 92%.</li></ul>' },
      { jobTitle: 'Software Engineer', employer: 'Bluebox Consulting', begin: 'Jul 2013', end: 'May 2015', description: '<p>Delivered integration projects for retail clients on tight schedules.</p>' },
      { jobTitle: 'Junior Developer', employer: 'Aster Webworks', begin: 'Aug 2012', end: 'Jun 2013', description: '<p>Maintained PHP e-commerce platforms; automated regression suite reduced QA effort 60%.</p>' },
    ],
    educations: [
      { school: 'Veermata Jijabai Technological Institute', degree: 'B.E. Computer Engineering', started: '2008', finished: '2012', description: '<p>First class with distinction; IEEE chapter lead.</p>' },
      { school: 'St. Xavier’s College, Mumbai', degree: 'Higher Secondary Certificate', started: '2006', finished: '2008', description: '' },
    ],
    skills: [
      { name: 'Distributed Systems', rating: 95 }, { name: 'Go', rating: 92 }, { name: 'Kafka', rating: 90 },
      { name: 'Kubernetes', rating: 88 }, { name: 'PostgreSQL', rating: 87 }, { name: 'Java', rating: 85 },
      { name: 'System Design', rating: 93 }, { name: 'Observability', rating: 89 }, { name: 'AWS', rating: 86 },
      { name: 'Leadership', rating: 90 }, { name: 'Incident Management', rating: 88 }, { name: 'gRPC', rating: 84 },
    ],
    languages: [
      { name: 'English', level: 'Fluent' }, { name: 'हिन्दी', level: 'Native' }, { name: 'मराठी', level: 'Native' },
    ],
    projects: [
      { title: 'ExactBank — open-source ledger', description: 'Exactly-once double-entry ledger library with 2.1k GitHub stars.', url: 'https://github.com/rohanm/exactbank' },
      { title: 'SLOTracker', description: 'SLO dashboards and burn-rate alerting for microservices.', url: 'https://github.com/rohanm/slotracker' },
      { title: 'loadgen-rs', description: 'Rust load generator able to sustain 250k rps on modest hardware.', url: 'https://github.com/rohanm/loadgen-rs' },
    ],
    certifications: [
      { title: 'AWS Solutions Architect Professional', issuer: 'Amazon Web Services', date: '2022' },
      { title: 'Certified Kubernetes Administrator', issuer: 'CNCF', date: '2021' },
      { title: 'Google Cloud Professional Data Engineer', issuer: 'Google', date: '2020' },
    ],
    achievements: [
      { title: 'Engineering Excellence Award 2023', description: 'For the ledger migration completed with zero downtime.' },
      { title: 'Patent — US 12/345,678', description: 'Deterministic event-sourcing compaction method.' },
    ],
    references: [
      { name: 'Ananya Iyer', reference: 'VP Engineering — rohan@refs.example' },
    ],
  },
  // D (executive, 3 pages) — leadership history + achievements + references.
  executive: {
    firstname: 'Meera',
    lastname: 'Chopra',
    occupation: 'Chief Technology Officer',
    email: 'meera.chopra@example.com',
    phone: '+65 9123 4567',
    address: '9 Marina Boulevard',
    city: 'Singapore',
    country: 'Singapore',
    postalcode: '018989',
    website: 'https://meerachopra.com',
    linkedin: 'https://linkedin.com/in/meerachopra',
    summary: '<p>Technology executive with 20+ years across banking, logistics and SaaS. Led organisations of 400+ engineers, delivered three platform businesses from zero to $100M ARR, and served on two boards. Known for building durable engineering cultures and turning technology into commercial advantage.</p>',
    employments: [
      { jobTitle: 'Chief Technology Officer', employer: 'Meridian Financial Group', begin: 'Jan 2018', end: 'Present', description: '<p>Member of the group executive committee; responsible for 480 engineers across 5 countries and a $95M technology budget.</p><ul><li>Drove the core-banking modernisation that lifted NPS from 18 to 54.</li><li>Reduced technology cost-to-income ratio from 22% to 14%.</li><li>Launched a merchant-payments platform now processing $4B annually.</li></ul>' },
      { jobTitle: 'VP Engineering', employer: 'CargoLink Global', begin: 'Mar 2013', end: 'Dec 2017', description: '<p>Built and scaled the engineering organisation from 40 to 260 people across 4 hubs.</p><ul><li>Shipped the freight-visibility platform used by 60% of global forwarders.</li><li>Established the SRE function; availability improved from 99.1% to 99.95%.</li></ul>' },
      { jobTitle: 'Director of Engineering', employer: 'Nexus Retail Systems', begin: 'Aug 2008', end: 'Feb 2013', description: '<p>Led the product engineering group through IPO readiness and PCI-DSS Level 1 certification.</p>' },
      { jobTitle: 'Engineering Manager', employer: 'Pinnacle Software', begin: 'Feb 2004', end: 'Jul 2008', description: '<p>Managed 5 teams delivering ERP modules across 30+ enterprise deployments.</p>' },
      { jobTitle: 'Senior Software Engineer', employer: 'Orion Technologies', begin: 'Jul 1999', end: 'Jan 2004', description: '<p>Developed real-time trading systems for the Singapore exchange ecosystem.</p>' },
    ],
    educations: [
      { school: 'INSEAD', degree: 'Executive MBA', started: '2006', finished: '2008', description: '' },
      { school: 'National University of Singapore', degree: 'B.Sc. Computer Science (First Class Honours)', started: '1995', finished: '1999', description: '' },
    ],
    skills: [
      { name: 'Executive Leadership', rating: 95 }, { name: 'Digital Transformation', rating: 94 }, { name: 'Platform Strategy', rating: 92 },
      { name: 'M&A Due Diligence', rating: 90 }, { name: 'Board Governance', rating: 88 }, { name: 'Organisation Design', rating: 93 },
      { name: 'Cloud Economics', rating: 87 }, { name: 'Cybersecurity Strategy', rating: 86 },
    ],
    languages: [
      { name: 'English', level: 'Native' }, { name: 'हिन्दी', level: 'Fluent' }, { name: 'Mandarin', level: 'Conversational' },
    ],
    projects: [
      { title: 'Meridian Pay', description: 'Greenfield merchant payments platform — 0 to $4B annual volume in 5 years.' },
      { title: 'CargoLink Visibility', description: 'Global shipment visibility network covering 120 ports.' },
    ],
    certifications: [
      { title: 'Certified Board Director', issuer: 'Singapore Institute of Directors', date: '2021' },
      { title: 'AWS Certified Cloud Practitioner — Executive', issuer: 'Amazon Web Services', date: '2022' },
    ],
    achievements: [
      { title: 'CIO100 ASEAN Honouree (2022, 2023)', description: 'Recognised for the core-banking modernisation programme.' },
      { title: 'Forbes Technology Council — Member', description: 'Published quarterly columns on platform economics.' },
      { title: 'Women in Tech Leadership Award', issuer: 'TechSG', description: 'For building one of the region’s most diverse engineering organisations.' },
    ],
    references: [
      { name: 'Dr. Arun Vaswani', reference: 'Chairman, Meridian Financial Group — arun@refs.example' },
      { name: 'Prof. Lim Wei Jian', reference: 'INSEAD — lim.wj@refs.example' },
    ],
  },
  // F (academic, 3-4 pages) — publications, teaching, grants, service.
  academic: {
    firstname: 'Priya',
    lastname: 'Srinivasan',
    occupation: 'Associate Professor of Computer Science',
    email: 'priya.srinivasan@university.example',
    phone: '+1 (617) 555-0198',
    address: 'Stata Center 32-G800',
    city: 'Cambridge',
    country: 'USA',
    postalcode: '02139',
    website: 'https://people.university.example/priya',
    summary: '<p>Associate Professor researching formal verification of distributed systems. Published 60+ peer-reviewed papers (h-index 34), advised 9 PhD students to completion, and received three best-paper awards. Research funded by NSF, DARPA and industry partners.</p>',
    employments: [
      { jobTitle: 'Associate Professor', employer: 'Massachusetts Institute of Technology', begin: 'Sep 2020', end: 'Present', description: '<p>Leads the Systems Verification Group (12 members).</p><ul><li>Teaching: Distributed Systems (enrolment 350), Program Analysis (150).</li><li>Service: Graduate admissions chair; faculty hiring committee.</li></ul>' },
      { jobTitle: 'Assistant Professor', employer: 'University of Washington', begin: 'Sep 2014', end: 'Aug 2020', description: '<p>Founded the Secure Systems Lab; won NSF CAREER award (2017).</p>' },
      { jobTitle: 'Postdoctoral Researcher', employer: 'Max Planck Institute for Software Systems', begin: 'Sep 2012', end: 'Aug 2014', description: '<p>Worked on concurrent program verification with Prof. V. Chen.</p>' },
      { jobTitle: 'Research Intern', employer: 'Microsoft Research Redmond', begin: 'Jun 2010', end: 'Aug 2010', description: '<p>Prototyped a static analyser for Azure service contracts.</p>' },
    ],
    educations: [
      { school: 'Carnegie Mellon University', degree: 'Ph.D. Computer Science', started: '2006', finished: '2012', description: '<p>Thesis: "Compositional Verification of Distributed Protocols" — ACM Doctoral Dissertation Award Honorable Mention.</p>' },
      { school: 'Indian Institute of Technology, Madras', degree: 'B.Tech Computer Science', started: '2002', finished: '2006', description: '<p>Gold medal, batch of 2006.</p>' },
    ],
    skills: [
      { name: 'Formal Verification', rating: 95 }, { name: 'TLA+', rating: 94 }, { name: 'Coq', rating: 90 },
      { name: 'Distributed Systems', rating: 93 }, { name: 'Program Analysis', rating: 92 }, { name: 'Research Leadership', rating: 91 },
    ],
    languages: [
      { name: 'English', level: 'Fluent' }, { name: 'தமிழ்', level: 'Native' }, { name: 'हिन्दी', level: 'Fluent' },
    ],
    projects: [
      { title: 'Verdi2 — verified Raft', description: 'Mechanically verified implementation of Raft used in teaching and industry forks.', url: 'https://github.com/priyas/verdi2' },
      { title: 'StaticRaft', description: 'Static analysis toolkit for finding liveness bugs in consensus code.' },
      { title: 'DSSPEC', description: 'A specification language for distributed systems semantics.' },
      { title: 'VerifiedKV', description: 'End-to-end verified key-value store (NSF-funded, 2021-2025).' },
    ],
    certifications: [
      { title: 'NSF CAREER Award', issuer: 'National Science Foundation', date: '2017' },
      { title: 'SIGOPS Hall of Fame Paper', issuer: 'ACM SIGOPS', date: '2020' },
      { title: 'Distinguished Reviewer', issuer: 'ACM TOCS', date: '2023' },
    ],
    achievements: [
      { title: 'Best Paper Award — SOSP 2019', description: '"IronKV: Verified Consistency at Scale".' },
      { title: 'Test of Time Award — OSDI 2021', description: 'For the 2011 paper "Paxos Made Practical".' },
      { title: 'Google Faculty Research Award', description: '2018, 2021.' },
    ],
    references: [
      { name: 'Prof. Victor Chen', reference: 'MPI-SWS — vchen@refs.example' },
      { name: 'Prof. Alice Henderson', reference: 'CMU — aliceh@refs.example' },
    ],
  },
  // G (technical, 2-3 pages) — many projects and certifications.
  technical: {
    firstname: 'Arjun',
    lastname: 'Reddy',
    occupation: 'Principal Site Reliability Engineer',
    email: 'arjun.reddy@example.com',
    phone: '+49 170 555 0123',
    address: 'Torstraße 140',
    city: 'Berlin',
    country: 'Germany',
    postalcode: '10119',
    website: 'https://arjunreddy.dev',
    linkedin: 'https://linkedin.com/in/arjunreddy',
    github: 'https://github.com/arjunr',
    summary: '<p>Principal SRE with 14 years across ad-tech, e-commerce and fintech. Specialist in reliability engineering, capacity planning and incident command. Built observability platforms serving 40k engineers; holds four relevant certifications.</p>',
    employments: [
      { jobTitle: 'Principal Site Reliability Engineer', employer: 'Nubank-Acme Digital Bank (anonymised)', begin: 'Mar 2020', end: 'Present', description: '<p>Leads the global SRE chapter (65 engineers).</p><ul><li>Drove availability from 99.9% to 99.99% on core banking services.</li><li>Built golden-signal dashboards adopted by 400+ services.</li></ul>' },
      { jobTitle: 'Senior SRE', employer: 'Zalando-style Retail Platform', begin: 'Aug 2016', end: 'Feb 2020', description: '<p>Owned the Kubernetes platform across 3 regions.</p><ul><li>Automated canary deployments cutting failed releases by 78%.</li></ul>' },
      { jobTitle: 'DevOps Engineer', employer: 'AdTech GmbH', begin: 'Jan 2013', end: 'Jul 2016', description: '<p>Migrated bare-metal estate to containers; wrote the first runbooks library.</p>' },
      { jobTitle: 'Systems Administrator', employer: 'HostingCo', begin: 'Sep 2010', end: 'Dec 2012', description: '<p>Managed 900+ Linux hosts and the monitoring stack.</p>' },
    ],
    educations: [
      { school: 'Hochschule für Technik und Wirtschaft Berlin', degree: 'M.Sc. Applied Computer Science', started: '2008', finished: '2010', description: '' },
      { school: 'Jawaharlal Nehru Technological University', degree: 'B.Tech Information Technology', started: '2004', finished: '2008', description: '' },
    ],
    skills: [
      { name: 'Kubernetes', rating: 96 }, { name: 'Prometheus', rating: 94 }, { name: 'Grafana', rating: 92 },
      { name: 'Terraform', rating: 90 }, { name: 'Go', rating: 88 }, { name: 'Linux', rating: 95 },
      { name: 'Incident Command', rating: 93 }, { name: 'Capacity Planning', rating: 91 }, { name: 'eBPF', rating: 84 },
      { name: 'Chaos Engineering', rating: 90 }, { name: 'PostgreSQL', rating: 85 }, { name: 'Kafka', rating: 87 },
    ],
    languages: [
      { name: 'English', level: 'Fluent' }, { name: 'Deutsch', level: 'B2' }, { name: 'తెలుగు', level: 'Native' },
    ],
    projects: [
      { title: 'observe-kit', description: 'Golden-signal bootstrap for Kubernetes services (2.8k stars).', url: 'https://github.com/arjunr/observe-kit' },
      { title: 'canaryd', description: 'Progressive delivery controller with automatic rollback.', url: 'https://github.com/arjunr/canaryd' },
      { title: 'burnbook', description: 'Incident runbook generator from historical postmortems.' },
      { title: 'ebpf-top', description: 'Low-overhead CPU profiler for production nodes.' },
      { title: 'slo-ctl', description: 'SLO/SLI-as-code with burn-rate alerting.' },
    ],
    certifications: [
      { title: 'CKA — Certified Kubernetes Administrator', issuer: 'CNCF', date: '2023' },
      { title: 'CKAD — Certified Kubernetes Application Developer', issuer: 'CNCF', date: '2022' },
      { title: 'Google Cloud Professional Cloud Architect', issuer: 'Google', date: '2021' },
      { title: 'AWS Certified DevOps Engineer Professional', issuer: 'Amazon Web Services', date: '2020' },
    ],
    achievements: [
      { title: 'Availability Excellence Award', description: 'For leading the 99.99% availability programme (2023).' },
    ],
    references: [
      { name: 'Katrin Weber', reference: 'VP Infrastructure — katrin@refs.example' },
    ],
  },
});

export const FIXTURE_ORDER = Object.freeze(['minimal', 'normal', 'long', 'extreme', 'unicode', 'sparse', 'senior', 'executive', 'academic', 'technical']);

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

