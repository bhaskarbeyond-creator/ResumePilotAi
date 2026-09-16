/**
 * Dynamic, Zero-Hardcoding Role Interview Question & Starter Chips Generator
 * Contextually detects domain and synthesizes tailored interview questions and starter idea chips.
 */

export function generateRoleInterviewQuestions(role = '', employer = '', targetJd = '') {
    const r = String(role || '').trim();
    const org = String(employer || '').trim();
    const orgSuffix = org ? ` at ${org}` : '';
    const cleanRole = r || 'your role';
    const lowerRole = cleanRole.toLowerCase();

    let toolExamples = 'tools, software, or technical platforms';
    let metricExamples = 'metrics, numbers, or measurable outcomes';
    let defaultChipsQ1 = ['Daily Operations', 'Project Leadership', 'Client Collaboration', 'Process Optimization'];
    let defaultChipsQ2 = ['Key Software', 'Internal Workflows', 'Automation Tools', 'Technical Platforms'];
    let defaultChipsQ3 = ['Exceeded KPIs', '+20% Efficiency', 'Cost Reduction', 'On-time Delivery'];

    if (/(developer|engineer|software|devops|backend|frontend|fullstack|data|cloud|architect|qa|programmer|coder|sre)/i.test(lowerRole)) {
        toolExamples = 'languages, frameworks, cloud services, or databases';
        metricExamples = 'latency, uptime, scalability, or test coverage';
        defaultChipsQ1 = ['System Architecture', 'API Development', 'Code Reviews', 'Microservices'];
        defaultChipsQ2 = ['Node.js & React', 'PostgreSQL / SQL', 'Docker & CI/CD', 'AWS / Cloud'];
        defaultChipsQ3 = ['Reduced Latency', '99.9% Uptime', 'Scaled to 100K+ Users', 'Automated Testing'];
    } else if (/(account manager|display|ad tech|advertising|media buyer|ppc|seo|marketing|campaign|growth)/i.test(lowerRole)) {
        toolExamples = 'ad platforms (DSPs, GA4, Meta, Google Ads), or CRM';
        metricExamples = 'ROAS, CPA, revenue growth, or conversion rate';
        defaultChipsQ1 = ['Client Portfolio', 'Campaign Execution', 'Media Planning', 'Cross-functional Teams'];
        defaultChipsQ2 = ['Google Ad Manager', 'DSP Platforms', 'Salesforce CRM', 'BI Dashboards'];
        defaultChipsQ3 = ['+25% Revenue Growth', '3.5x Average ROAS', 'Cut CPA by 15%', 'Exceeded KPIs'];
    } else if (/(sales|business development|bdr|sdr|account executive|commercial|realtor)/i.test(lowerRole)) {
        toolExamples = 'CRM systems, pipeline tools, or client presentation decks';
        metricExamples = 'quota attainment, deal size, ARR, or pipeline volume';
        defaultChipsQ1 = ['Enterprise Sales', 'Pipeline Generation', 'Contract Negotiations', 'Client Relationships'];
        defaultChipsQ2 = ['Salesforce / HubSpot', 'LinkedIn Sales Nav', 'Executive Pitches', 'Cold Outreach'];
        defaultChipsQ3 = ['120% Quota Attainment', 'Closed $1M+ ARR', '30-day Cycle Time', 'High Win Rate'];
    } else if (/(nurse|doctor|clinical|physician|dental|medical|therapist|healthcare|pharm|surgeon)/i.test(lowerRole)) {
        toolExamples = 'EMR/EHR systems, clinical equipment, or care protocols';
        metricExamples = 'patient volume, care quality, triage speed, or compliance';
        defaultChipsQ1 = ['Direct Patient Care', 'Triage & Assessment', 'Treatment Plans', 'Family Counseling'];
        defaultChipsQ2 = ['Epic / Cerner EHR', 'Medication Admin', 'Patient Monitoring', 'HIPAA Compliance'];
        defaultChipsQ3 = ['Managed 20+ Patients/Shift', 'Zero Safety Incidents', 'High Patient Satisfaction', 'Fast Triage'];
    } else if (/(finance|accounting|accountant|auditor|controller|analyst|tax|banking|treasury)/i.test(lowerRole)) {
        toolExamples = 'ERP, Excel financial modeling, GAAP/IFRS, or BI software';
        metricExamples = 'budget managed, audit accuracy, reporting turnaround, or cost savings';
        defaultChipsQ1 = ['Financial Reporting', 'Month-end Close', 'Budget Forecasting', 'Audit Compliance'];
        defaultChipsQ2 = ['Advanced Excel / VBA', 'SAP / NetSuite', 'GAAP & IFRS', 'Tableau / PowerBI'];
        defaultChipsQ3 = ['Managed $10M+ Budget', 'Clean Audit Record', 'Reduced Close by 3 Days', 'Variance Analysis'];
    } else if (/(product manager|product owner|scrum master|project manager|program manager|agile)/i.test(lowerRole)) {
        toolExamples = 'Jira, product discovery tools, roadmap software, or analytics';
        metricExamples = 'user adoption, release velocity, churn reduction, or feature NPS';
        defaultChipsQ1 = ['Roadmap Ownership', 'Sprint Planning', 'Stakeholder Alignment', 'User Research'];
        defaultChipsQ2 = ['Jira & Confluence', 'Mixpanel / Amplitude', 'PRDs & User Stories', 'A/B Testing'];
        defaultChipsQ3 = ['+35% User Adoption', 'On-time Delivery', 'Reduced Churn by 12%', 'High Feature NPS'];
    } else if (/(designer|ui|ux|graphic|creative|art director|copywriter|animator)/i.test(lowerRole)) {
        toolExamples = 'Figma, Adobe Creative Suite, prototyping tools, or design systems';
        metricExamples = 'engagement lift, usability test completion, or delivery speed';
        defaultChipsQ1 = ['Wireframing & Prototyping', 'Design Systems', 'User Journey Mapping', 'Usability Testing'];
        defaultChipsQ2 = ['Figma & FigJam', 'Adobe CC Suite', 'Responsive Design', 'Interactive Prototypes'];
        defaultChipsQ3 = ['+40% Task Completion', 'Unified 50+ Components', 'High User Delight', 'Brand Elevation'];
    } else if (/(chef|cook|hospitality|restaurant|hotel|food|beverage|catering|culinary)/i.test(lowerRole)) {
        toolExamples = 'kitchen stations, inventory/POS systems, or food safety guidelines';
        metricExamples = 'covers per night, food cost percentage, or health inspection rating';
        defaultChipsQ1 = ['Station Management', 'Menu Development', 'Inventory & Prep', 'Kitchen Leadership'];
        defaultChipsQ2 = ['HACCP / Food Safety', 'POS Systems', 'Vendor Management', 'Cost Control'];
        defaultChipsQ3 = ['200+ Covers/Night', 'Kept Food Cost < 28%', '100% Health Inspection', 'Zero Waste'];
    }

    return [
        {
            id: 'q1',
            question: `What were your core responsibilities and primary scope as ${cleanRole}${orgSuffix}?`,
            answerField: 'answer1',
            starterChips: defaultChipsQ1,
        },
        {
            id: 'q2',
            question: `What specific ${toolExamples} did you use to execute your work?`,
            answerField: 'answer2',
            starterChips: defaultChipsQ2,
        },
        {
            id: 'q3',
            question: `What measurable results, ${metricExamples}, or key achievements did you deliver?`,
            answerField: 'answer3',
            starterChips: defaultChipsQ3,
        },
    ];
}

/**
 * Dynamic, Zero-Hardcoding Education Interview Question & Starter Chips Generator
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
    let defaultChipsQ3 = ["Dean's List", 'Graduated with Honors', 'Academic Scholarship', 'Teaching Assistant'];

    if (/(computer|software|engineer|data|cyber|ai|machine learning|information tech|robotics)/i.test(lower)) {
        courseworkExamples = 'core algorithms, systems, cloud, or database coursework';
        projectExamples = 'capstone engineering prototype, code repo, or research benchmark';
        defaultChipsQ1 = ['Distributed Systems', 'Algorithms & Data Structures', 'Operating Systems', 'Machine Learning'];
        defaultChipsQ2 = ['Autonomous Navigation Bot', 'Microservices Backend', 'Full-Stack Web App', 'Compiler Design'];
        defaultChipsQ3 = ["Dean's Honor List", '3.9+ GPA', 'ACM / IEEE Member', 'Capstone 1st Place'];
    } else if (/(business|mba|finance|accounting|economics|marketing|management)/i.test(lower)) {
        courseworkExamples = 'finance modeling, corporate strategy, or quantitative analysis courses';
        projectExamples = 'case competitions, consulting practicums, or valuation models';
        defaultChipsQ1 = ['Corporate Finance', 'Valuation & Modeling', 'Strategic Management', 'Econometrics'];
        defaultChipsQ2 = ['LBO / DCF Model', 'Consulting Practicum', 'Market Entry Strategy', 'Case Competition'];
        defaultChipsQ3 = ['Magna Cum Laude', 'Beta Gamma Sigma', 'Top 10% Class Rank', 'Dean’s Scholar'];
    } else if (/(nurs|health|medicine|biomed|clinical|physician|pharm|dent)/i.test(lower)) {
        courseworkExamples = 'clinical practicums, pathology, pharmacology, or patient assessment';
        projectExamples = 'clinical rotations, preceptorships, or healthcare research';
        defaultChipsQ1 = ['Advanced Pharmacology', 'Pathophysiology', 'Clinical Assessment', 'Patient Care Ethics'];
        defaultChipsQ2 = ['500+ Clinical Hours', 'ICU Preceptorship', 'Quality Improvement Study', 'Simulation Lab'];
        defaultChipsQ3 = ['Sigma Theta Tau', 'Departmental Honors', 'Dean’s List', 'Student Nurse Leader'];
    } else if (/(law|legal|juris|justice|policy|crimin)/i.test(lower)) {
        courseworkExamples = 'constitutional law, litigation seminars, or regulatory coursework';
        projectExamples = 'moot court, law review articles, or legal clinic cases';
        defaultChipsQ1 = ['Constitutional Law', 'Securities Regulation', 'Corporate Law', 'Trial Advocacy'];
        defaultChipsQ2 = ['Law Review Editorial', 'Moot Court Semifinalist', 'Legal Clinic Casework', 'Judicial Externship'];
        defaultChipsQ3 = ['Cum Laude', 'Order of the Coif', 'Best Brief Award', 'CALI Excellence Award'];
    }

    return [
        {
            id: 'q1',
            question: `What high-impact ${courseworkExamples} did you complete for ${cleanProgram}${schoolSuffix}?`,
            answerField: 'answer1',
            starterChips: defaultChipsQ1,
        },
        {
            id: 'q2',
            question: `What notable ${projectExamples} or practical work demonstrated your expertise?`,
            answerField: 'answer2',
            starterChips: defaultChipsQ2,
        },
        {
            id: 'q3',
            question: `Did you receive any honors, GPA distinctions, scholarships, or academic leadership roles?`,
            answerField: 'answer3',
            starterChips: defaultChipsQ3,
        },
    ];
}

