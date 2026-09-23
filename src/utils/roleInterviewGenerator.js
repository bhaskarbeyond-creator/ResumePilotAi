/**
 * Dynamic, Open-Ended Role Interview Question & Starter Chips Generator — IME365
 *
 * Contextually detects domain across ALL professional sectors:
 * - Technology & Data (Software, Cloud, DevOps, AI, Systems)
 * - Healthcare & Medicine (Nursing, Physicians, Dental, Clinical, Pharmacy)
 * - Aviation & Aerospace (Pilots, Flight Operations, Avionics, Space)
 * - Trades & Craftsmanship (Electrical, Plumbing, Welding, HVAC, Carpentry, Machining)
 * - Engineering & Construction (Civil, Structural, Mechanical, Architecture)
 * - Finance, Accounting & Banking (Accountants, Auditors, Analysts, Actuaries)
 * - Legal, Compliance & Judiciary (Attorneys, Paralegals, Compliance)
 * - Education & Academia (Teachers, Professors, Tutors, Instructors)
 * - Culinary & Hospitality (Chefs, Hotel Managers, Sommeliers, Baristas)
 * - Sales, Marketing & Growth (Account Executives, Media Buyers, SEO, PMM)
 * - Creative & Design (UI/UX, Art, Animation, Video, Copywriting)
 * - Operations & Supply Chain (Logistics, Warehouse, Procurement)
 * - Public Safety & Emergency (Police, Fire, EMT, Paramedics, Security)
 * - Sciences & Research (Biochemists, Physicists, Environmental)
 *
 * Plus open-ended dynamic token extraction for any arbitrary or emerging profession.
 */

// Starter chips are topic hints the candidate may click into their own answer.
// Anything that reads as an achievement claim (numbers, awards, rankings,
// publications, placements) would put unverified facts into the answer, so it
// is filtered out; only neutral topic labels remain.
const CLAIM_LIKE_CHIP = /\d|%|\$|\b(award|semifinal|finalist|winner|published|co-author|honou?rs?|dean|scholar|cum laude|exhibition|fellowship|grant|1st|place|zero|kept|uptime)/i;
export function topicChipsOnly(chips = []) {
    return (Array.isArray(chips) ? chips : []).filter(chip => typeof chip === 'string' && !CLAIM_LIKE_CHIP.test(chip));
}

export function generateRoleInterviewQuestions(role = '', employer = '', targetJd = '') {
    const r = String(role || '').trim();
    const org = String(employer || '').trim();
    const orgSuffix = org ? ` at ${org}` : '';
    const cleanRole = r || 'your role';
    const lowerRole = cleanRole.toLowerCase();

    // Extract core role title keyword for dynamic chip personalization
    const cleanKeyword = cleanRole
        .replace(/^(?:Senior|Lead|Principal|Junior|Staff|Chief|Head of|Associate|Executive)\s+/i, '')
        .split(/\s+/)[0] || 'Role';

    let toolExamples = 'tools, platforms, or specialized methodologies';
    let metricExamples = 'metrics, numbers, efficiency gains, or outcomes';
    let defaultChipsQ1 = [`${cleanKeyword} Operations`, 'Project Execution', 'Team Leadership', 'Process Improvement'];
    let defaultChipsQ2 = ['Core Platforms', 'Internal Workflows', 'Specialized Software', 'Industry Standards'];

    if (/(developer|engineer|software|devops|backend|frontend|fullstack|data|cloud|architect|qa|programmer|coder|sre|kube|sysadmin)/i.test(lowerRole)) {
        toolExamples = 'languages, frameworks, cloud services, or databases';
        metricExamples = 'latency, uptime, scalability, or test coverage';
        defaultChipsQ1 = ['System Architecture', 'API Development', 'Code Reviews', 'Microservices'];
        defaultChipsQ2 = ['Node.js & React', 'PostgreSQL / SQL', 'Docker & CI/CD', 'AWS / Cloud'];
    } else if (/(pilot|flight|aero|aviat|avionics|air traffic|captain|first officer)/i.test(lowerRole)) {
        toolExamples = 'flight decks, avionics systems, navigation charts, or FAA checklists';
        metricExamples = 'flight hours, on-time departures, fuel efficiency, or safety records';
        defaultChipsQ1 = ['Flight Operations', 'Pre-flight Inspection', 'Crew Resource Mgmt', 'Route Planning'];
        defaultChipsQ2 = ['Garmin G1000', 'FMC / Autopilot', 'FAA Regulations', 'Weather Radar'];
    } else if (/(electrician|plumb|weld|carpenter|hvac|machinist|mechanic|technician|pipefitter|roofer)/i.test(lowerRole)) {
        toolExamples = 'diagnostic equipment, hand/power tools, schematics, or safety protocols';
        metricExamples = 'first-time fix rate, completed work orders, or safety compliance';
        defaultChipsQ1 = ['Diagnostic Troubleshooting', 'Installation & Repair', 'Code Compliance', 'Blueprint Reading'];
        defaultChipsQ2 = ['Multimeter / Scopes', 'Power Tools', 'OSHA Guidelines', 'Schematic Diagrams'];
    } else if (/(nurse|doctor|clinical|physician|dental|medical|therapist|healthcare|pharm|surgeon|pediat|cardio)/i.test(lowerRole)) {
        toolExamples = 'EMR/EHR systems, clinical equipment, or care protocols';
        metricExamples = 'patient volume, care quality, triage speed, or compliance';
        defaultChipsQ1 = ['Direct Patient Care', 'Triage & Assessment', 'Treatment Plans', 'Family Counseling'];
        defaultChipsQ2 = ['Epic / Cerner EHR', 'Medication Admin', 'Patient Monitoring', 'HIPAA Compliance'];
    } else if (/(lawyer|attorney|paralegal|counsel|compliance|legal|contracts|litigat)/i.test(lowerRole)) {
        toolExamples = 'legal research databases (Westlaw, LexisNexis), contract management, or docket tools';
        metricExamples = 'case resolution rate, contract turnaround, audit compliance, or deal value';
        defaultChipsQ1 = ['Legal Brief Drafting', 'Discovery & Filings', 'Contract Negotiation', 'Case Strategy'];
        defaultChipsQ2 = ['Westlaw / LexisNexis', 'Clio / Relativity', 'Contract Lifecycle Mgmt', 'Statutory Compliance'];
    } else if (/(teacher|professor|instructor|educator|tutor|lecturer|faculty|principal)/i.test(lowerRole)) {
        toolExamples = 'LMS platforms (Canvas, Blackboard), curriculum guides, or ed-tech tools';
        metricExamples = 'student pass rates, standardized test gains, retention, or engagement';
        defaultChipsQ1 = ['Lesson Planning', 'Differentiated Instruction', 'Classroom Leadership', 'Student Assessment'];
        defaultChipsQ2 = ['Canvas / Blackboard', 'Google Classroom', 'Interactive Whiteboards', 'Formative Assessments'];
    } else if (/(supply chain|logistics|warehouse|procurement|inventory|dispatcher|freight)/i.test(lowerRole)) {
        toolExamples = 'WMS, ERP (SAP, NetSuite), route planning software, or inventory scanners';
        metricExamples = 'inventory accuracy, order fulfillment speed, freight savings, or OTIF rate';
        defaultChipsQ1 = ['Inventory Management', 'Freight Logistics', 'Vendor Procurement', 'Route Optimization'];
        defaultChipsQ2 = ['SAP ERP / NetSuite', 'Warehouse Mgmt Systems (WMS)', 'RFID Scanners', 'Six Sigma / Lean'];
    } else if (/(police|firefighter|emt|paramedic|security|patrol|emergency)/i.test(lowerRole)) {
        toolExamples = 'incident management systems, radio dispatch, emergency medical kits, or safety gear';
        metricExamples = 'response time, incident resolution rate, lives saved, or training certs';
        defaultChipsQ1 = ['Emergency Response', 'Incident Command', 'Public Safety Patrol', 'Scene Triage'];
        defaultChipsQ2 = ['CAD Dispatch Systems', 'Defibrillator / BLS', 'Incident Command (ICS)', 'Tactical Gear'];
    } else if (/(finance|accounting|accountant|auditor|controller|analyst|tax|banking|treasury|actua)/i.test(lowerRole)) {
        toolExamples = 'ERP, Excel financial modeling, GAAP/IFRS, or BI software';
        metricExamples = 'budget managed, audit accuracy, reporting turnaround, or cost savings';
        defaultChipsQ1 = ['Financial Reporting', 'Month-end Close', 'Budget Forecasting', 'Audit Compliance'];
        defaultChipsQ2 = ['Advanced Excel / VBA', 'SAP / NetSuite', 'GAAP & IFRS', 'Tableau / PowerBI'];
    } else if (/(product manager|product owner|scrum master|project manager|program manager|agile)/i.test(lowerRole)) {
        toolExamples = 'Jira, product discovery tools, roadmap software, or analytics';
        metricExamples = 'user adoption, release velocity, churn reduction, or feature NPS';
        defaultChipsQ1 = ['Roadmap Ownership', 'Sprint Planning', 'Stakeholder Alignment', 'User Research'];
        defaultChipsQ2 = ['Jira & Confluence', 'Mixpanel / Amplitude', 'PRDs & User Stories', 'A/B Testing'];
    } else if (/(designer|ui|ux|graphic|creative|art director|copywriter|animator|video|photo)/i.test(lowerRole)) {
        toolExamples = 'Figma, Adobe Creative Suite, prototyping tools, or design systems';
        metricExamples = 'engagement lift, usability test completion, or delivery speed';
        defaultChipsQ1 = ['Wireframing & Prototyping', 'Design Systems', 'User Journey Mapping', 'Usability Testing'];
        defaultChipsQ2 = ['Figma & FigJam', 'Adobe CC Suite', 'Responsive Design', 'Interactive Prototypes'];
    } else if (/(chef|cook|hospitality|restaurant|hotel|food|beverage|catering|culinary|barista)/i.test(lowerRole)) {
        toolExamples = 'kitchen stations, inventory/POS systems, or food safety guidelines';
        metricExamples = 'covers per night, food cost percentage, or health inspection rating';
        defaultChipsQ1 = ['Station Management', 'Menu Development', 'Inventory & Prep', 'Kitchen Leadership'];
        defaultChipsQ2 = ['HACCP / Food Safety', 'POS Systems', 'Vendor Management', 'Cost Control'];
    } else if (/(civil|structural|architect|construction|building|estimator|surveyor)/i.test(lowerRole)) {
        toolExamples = 'AutoCAD, Revit, BIM software, structural analysis tools, or site inspection tech';
        metricExamples = 'project budget, completion timeline, safety compliance, or structural tolerance';
        defaultChipsQ1 = ['Site Engineering', 'BIM & CAD Modeling', 'Structural Calculations', 'Contractor Oversight'];
        defaultChipsQ2 = ['AutoCAD & Revit', 'ETABS / SAP2000', 'Building Codes (IBC)', 'Site Inspection Tools'];
    } else if (/(sales|business development|bdr|sdr|account executive|commercial|realtor)/i.test(lowerRole)) {
        toolExamples = 'CRM systems, pipeline tools, or client presentation decks';
        metricExamples = 'quota attainment, deal size, ARR, or pipeline volume';
        defaultChipsQ1 = ['Enterprise Sales', 'Pipeline Generation', 'Contract Negotiations', 'Client Relationships'];
        defaultChipsQ2 = ['Salesforce / HubSpot', 'LinkedIn Sales Nav', 'Executive Pitches', 'Cold Outreach'];
    }

    return [
        {
            id: 'q1',
            question: `What were your core responsibilities and primary scope as ${cleanRole}${orgSuffix}?`,
            answerField: 'answer1',
            starterChips: topicChipsOnly(defaultChipsQ1),
        },
        {
            id: 'q2',
            question: `What specific ${toolExamples} did you use to execute your work?`,
            answerField: 'answer2',
            starterChips: topicChipsOnly(defaultChipsQ2),
        },
        {
            id: 'q3',
            question: `What measurable results, ${metricExamples}, or key achievements did you deliver?`,
            answerField: 'answer3',
            // Outcome chips would put invented metrics into the candidate's answer;
            // results must come from the candidate, so no canned outcome chips.
            starterChips: [],
        },
    ];
}

/**
 * Dynamic, Open-Ended Education Interview Question & Starter Chips Generator
 * Contextually detects academic domain and synthesizes targeted questions for coursework, capstone, and honors.
 */
export function generateEducationInterviewQuestions(degree = '', school = '', fieldOfStudy = '', targetJd = '') {
    const d = String(degree || '').trim();
    const s = String(school || '').trim();
    const f = String(fieldOfStudy || '').trim();
    const schoolSuffix = s ? ` at ${s}` : '';
    const cleanProgram = [d, f].filter(Boolean).join(' in ') || 'your degree program';
    const lower = `${d} ${f}`.toLowerCase();

    let courseworkExamples = 'core subjects, lab modules, or specialized electives';
    let projectExamples = 'capstone projects, thesis research, or technical deliverables';
    let defaultChipsQ1 = ['Major Electives', 'Advanced Theory', 'Applied Seminars', 'Research Methods'];
    let defaultChipsQ2 = ['Senior Capstone', 'Thesis Research', 'Prototype Design', 'Independent Study'];

    if (/(computer|software|engineer|data|cyber|ai|machine learning|information tech|robotics)/i.test(lower)) {
        courseworkExamples = 'core algorithms, systems, cloud, or database coursework';
        projectExamples = 'capstone engineering prototype, code repo, or research benchmark';
        defaultChipsQ1 = ['Distributed Systems', 'Algorithms & Data Structures', 'Operating Systems', 'Machine Learning'];
        defaultChipsQ2 = ['Autonomous Navigation Bot', 'Microservices Backend', 'Full-Stack Web App', 'Compiler Design'];
    } else if (/(business|mba|finance|accounting|economics|marketing|management)/i.test(lower)) {
        courseworkExamples = 'finance modeling, corporate strategy, or quantitative analysis courses';
        projectExamples = 'case competitions, consulting practicums, or valuation models';
        defaultChipsQ1 = ['Corporate Finance', 'Valuation & Modeling', 'Strategic Management', 'Econometrics'];
        defaultChipsQ2 = ['LBO / DCF Model', 'Consulting Practicum', 'Market Entry Strategy', 'Case Competition'];
    } else if (/(nurs|health|medicine|biomed|clinical|physician|pharm|dent)/i.test(lower)) {
        courseworkExamples = 'clinical practicums, pathology, pharmacology, or patient assessment';
        projectExamples = 'clinical rotations, preceptorships, or healthcare research';
        defaultChipsQ1 = ['Advanced Pharmacology', 'Pathophysiology', 'Clinical Assessment', 'Patient Care Ethics'];
        defaultChipsQ2 = ['500+ Clinical Hours', 'ICU Preceptorship', 'Quality Improvement Study', 'Simulation Lab'];
    } else if (/(law|legal|juris|justice|policy|crimin)/i.test(lower)) {
        courseworkExamples = 'constitutional law, litigation seminars, or regulatory coursework';
        projectExamples = 'moot court, law review articles, or legal clinic cases';
        defaultChipsQ1 = ['Constitutional Law', 'Securities Regulation', 'Corporate Law', 'Trial Advocacy'];
        defaultChipsQ2 = ['Law Review Editorial', 'Moot Court Semifinalist', 'Legal Clinic Casework', 'Judicial Externship'];
    } else if (/(art|design|humanities|history|music|english|philosophy|literature|film)/i.test(lower)) {
        courseworkExamples = 'studio seminars, critical theory, art history, or cultural analysis';
        projectExamples = 'senior thesis, gallery exhibition, film portfolio, or recital';
        defaultChipsQ1 = ['Critical Theory', 'Studio Practicum', 'Art History Seminars', 'Comparative Literature'];
        defaultChipsQ2 = ['Solo Gallery Exhibition', 'Senior Thesis Paper', 'Creative Portfolio', 'Film Production'];
    } else if (/(chemistry|biology|physics|biochem|geology|environmental|astronomy|science)/i.test(lower)) {
        courseworkExamples = 'organic chemistry, spectroscopy, field research, or advanced laboratory modules';
        projectExamples = 'laboratory research, peer-reviewed paper, or scientific simulation';
        defaultChipsQ1 = ['Organic Chemistry', 'Molecular Biology', 'Spectroscopy Lab', 'Statistical Mechanics'];
        defaultChipsQ2 = ['Published Co-Author', 'Independent Lab Thesis', 'Chromatography Research', 'Field Expedition'];
    } else if (/(psychology|sociology|education|counseling|social work|teaching)/i.test(lower)) {
        courseworkExamples = 'developmental psychology, research methods, pedagogy, or social theory';
        projectExamples = 'student teaching practicum, survey research, or clinical internship';
        defaultChipsQ1 = ['Cognitive Psychology', 'Curriculum Design', 'Research Methodology', 'Child Development'];
        defaultChipsQ2 = ['Student Teaching Practicum', 'Psychological Study Survey', 'Case Study Analysis', 'Community Outreach'];
    }

    return [
        {
            id: 'q1',
            question: `What high-impact ${courseworkExamples} did you complete for ${cleanProgram}${schoolSuffix}?`,
            answerField: 'answer1',
            starterChips: topicChipsOnly(defaultChipsQ1),
        },
        {
            id: 'q2',
            question: `What notable ${projectExamples} or practical work demonstrated your expertise?`,
            answerField: 'answer2',
            starterChips: topicChipsOnly(defaultChipsQ2),
        },
        {
            id: 'q3',
            question: `Did you receive any honors, GPA distinctions, scholarships, or academic leadership roles?`,
            answerField: 'answer3',
            // Outcome chips would put invented metrics into the candidate's answer;
            // results must come from the candidate, so no canned outcome chips.
            starterChips: [],
        },
    ];
}

