/**
 * Universal Candidate Context Engine — Backend Service
 * ResumePilot AI
 *
 * Provides server-side domain detection, terminology mapping, geographic awareness,
 * and role-tailored fallback suggestions for ANY job, ANY role, ANY country, and ANY career stage.
 * Unknown and niche professions are handled as valid production states.
 * ZERO hardcoded IT defaults. ZERO cross-industry contamination.
 */

const DOMAINS = Object.freeze({
    DENTISTRY: 'dentistry',
    MEDICINE: 'medicine',
    PHARMACY: 'pharmacy',
    NURSING: 'nursing',
    LAW: 'law',
    JUDICIARY: 'judiciary',
    EDUCATION: 'education',
    HIGHER_EDUCATION: 'higher_education',
    ACCOUNTING: 'accounting',
    FINANCE: 'finance',
    HUMAN_RESOURCES: 'human_resources',
    SALES: 'sales',
    MARKETING: 'marketing',
    GRAPHIC_DESIGN: 'graphic_design',
    ARCHITECTURE: 'architecture',
    CIVIL_ENGINEERING: 'civil_engineering',
    MECHANICAL_ENGINEERING: 'mechanical_engineering',
    ELECTRICAL_ENGINEERING: 'electrical_engineering',
    SCIENTIFIC_RESEARCH: 'scientific_research',
    HOSPITALITY: 'hospitality',
    HOTEL_MANAGEMENT: 'hotel_management',
    AVIATION: 'aviation',
    JOURNALISM: 'journalism',
    GOVERNMENT: 'government',
    PUBLIC_SAFETY: 'public_safety',
    DEFENSE: 'defense',
    NON_PROFIT: 'non_profit',
    PERFORMING_ARTS: 'performing_arts',
    SPORTS: 'sports',
    PHOTOGRAPHY: 'photography',
    SKILLED_TRADES: 'skilled_trades',
    INTERIOR_DESIGN: 'interior_design',
    PHYSIOTHERAPY: 'physiotherapy',
    PSYCHOLOGY: 'psychology',
    VETERINARY: 'veterinary',
    AGRICULTURE: 'agriculture',
    CORPORATE_SECRETARIAL: 'corporate_secretarial',
    SUPPLY_CHAIN: 'supply_chain',
    REAL_ESTATE: 'real_estate',
    CONSTRUCTION: 'construction',
    WRITING: 'writing',
    VISUAL_ARTS: 'visual_arts',
    ACTING: 'acting',
    SOFTWARE_ENGINEERING: 'software_engineering',
    DATA_SCIENCE: 'data_science',
    GENERAL_BUSINESS: 'general_business',
    UNKNOWN_NICHE: 'unknown_niche',
    UNSPECIFIED: 'unspecified',
});

function cleanText(val) {
    return String(val || '').toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function detectGeographicRegion(resumeData = {}) {
    const raw = cleanText(`${resumeData.country || ''} ${resumeData.city || ''} ${resumeData.address || ''}`);
    if (/\b(india|bharat|in|delhi|mumbai|bengaluru|bangalore|hyderabad|chennai|pune|kolkata|ahmedabad|noida|gurugram)\b/i.test(raw)) {
        return 'IN';
    }
    if (/\b(united states|usa|us|u s a|new york|california|texas|boston|chicago|san francisco|seattle|miami|los angeles|washington)\b/i.test(raw)) {
        return 'US';
    }
    if (/\b(united kingdom|uk|u k|great britain|england|scotland|wales|london|manchester|birmingham|edinburgh|glasgow)\b/i.test(raw)) {
        return 'UK';
    }
    if (/\b(canada|ca|toronto|vancouver|montreal|ottawa|calgary|alberta|ontario)\b/i.test(raw)) {
        return 'CA';
    }
    if (/\b(australia|au|sydney|melbourne|brisbane|perth|adelaide)\b/i.test(raw)) {
        return 'AU';
    }
    if (/\b(germany|deutschland|france|spain|italy|netherlands|berlin|paris|madrid|rome|amsterdam)\b/i.test(raw)) {
        return 'EU';
    }
    return 'GLOBAL';
}

// Full domain taxonomy with 32+ global industry clusters
const DOMAIN_DATA = Object.freeze({
    [DOMAINS.DENTISTRY]: {
        label: 'Dentistry & Oral Healthcare',
        keywords: ['dentist', 'dental', 'orthodont', 'periodont', 'endodont', 'prosthodont', 'bds', 'mds', 'dds', 'dmd', 'teeth', 'oral surgery', 'caries', 'dentition', 'hygienist', 'implantology'],
        skills: ['Oral Surgery', 'Endodontics', 'Restorative Dentistry', 'Dental Radiography', 'Periodontics', 'Local Anesthesia', 'Treatment Planning', 'Infection Control', 'Patient Care', 'Dental EMR / Dentrix', 'Sterilization Protocols'],
        certifications: [
            { title: 'State Dental Practice License', issuer: 'State Dental Board / Dental Council', category: 'mandatory' },
            { title: 'Basic Life Support (BLS) for Healthcare Providers', issuer: 'American Heart Association', category: 'mandatory' },
            { title: 'Invisalign Certified Provider', issuer: 'Align Technology', category: 'recommended' },
            { title: 'Fellowship in Oral Implantology', issuer: 'International Congress of Oral Implantologists', category: 'recommended' },
        ],
        actionVerbs: ['Diagnosed', 'Treated', 'Administered', 'Performed', 'Rehabilitated', 'Restored', 'Prescribed', 'Monitored'],
        bullets: [
            'Examined, diagnosed, and formulated comprehensive treatment plans for 25+ patients daily across preventive and restorative procedures.',
            'Performed root canal treatments, complex aesthetic restorations, and crown preparations with 99% patient satisfaction.',
            'Implemented digital radiography and intraoral scanning protocols, reducing diagnostic turnaround time by 30%.',
            'Enforced stringent sterilization and infection control protocols in compliance with health authority standards.'
        ]
    },

    [DOMAINS.MEDICINE]: {
        label: 'Medicine & Clinical Healthcare',
        keywords: ['doctor', 'physician', 'surgeon', 'cardiologist', 'oncologist', 'pediatrician', 'internist', 'mbbs', 'md', 'medical residency', 'clinical physician', 'hospitalist', 'general physician', 'internal medicine', 'pathology', 'radiology', 'dnb', 'medical fellowship'],
        skills: ['Clinical Diagnosis', 'Patient Triage & Resuscitation', 'Pharmacotherapy', 'Inpatient Management', 'Bedside Procedures', 'Emergency Care', 'ICU Protocol Adherence', 'Ventilator Management', 'Infection Prevention & Control', 'Hospital EHR / EMR Systems'],
        certifications: [
            { title: 'Permanent Medical Practice License', issuer: 'State Medical Board / Medical Council', category: 'mandatory' },
            { title: 'Advanced Cardiovascular Life Support (ACLS)', issuer: 'American Heart Association', category: 'mandatory' },
            { title: 'Board Certification in Specialty', issuer: 'National Board of Medical Specialties', category: 'recommended' },
            { title: 'Basic Life Support (BLS)', issuer: 'American Heart Association', category: 'mandatory' },
        ],
        actionVerbs: ['Diagnosed', 'Treated', 'Evaluated', 'Prescribed', 'Managed', 'Stabilized', 'Monitored', 'Coordinated'],
        bullets: [
            'Diagnosed and managed acute and chronic medical conditions for 35+ inpatient and outpatient cases daily.',
            'Conducted multidisciplinary daily rounds with intensive care consultants, optimizing pharmacotherapy and clinical pathways.',
            'Decreased average hospital length-of-stay by 18% through evidence-based diagnostic pathways and proactive care coordination.',
            'Maintained 100% statutory compliance and documentation accuracy in electronic health records (EHR).'
        ]
    },

    [DOMAINS.PHARMACY]: {
        label: 'Pharmacy & Pharmacology',
        keywords: ['pharmacist', 'pharmacy', 'pharm.d', 'b.pharm', 'm.pharm', 'pharmacologist', 'dispensary', 'medication therapy', 'drug interaction', 'apothecary', 'formulary'],
        skills: ['Prescription Verification', 'Drug Utilization Review (DUR)', 'Medication Therapy Management (MTM)', 'Sterile Compounding', 'Patient Medication Counseling', 'Drug-Drug Interaction Screening', 'Hospital Formulary Management', 'Controlled Substance Compliance'],
        certifications: [
            { title: 'Registered Pharmacist Practice License (R.Ph)', issuer: 'State Board of Pharmacy / National Council', category: 'mandatory' },
            { title: 'Pharmacy-Based Immunization Delivery Credential', issuer: 'American Pharmacists Association (APhA)', category: 'mandatory' },
            { title: 'Board Certified Pharmacotherapy Specialist (BCPS)', issuer: 'Board of Pharmacy Specialties', category: 'recommended' },
        ],
        actionVerbs: ['Dispensed', 'Compounded', 'Verified', 'Evaluated', 'Counseled', 'Screened', 'Reconciled', 'Educated'],
        bullets: [
            'Dispensed and verified 250+ prescriptions daily, conducting drug-utilization reviews that prevented adverse drug interactions.',
            'Collaborated with hospital physicians to recommend therapeutic dosage adjustments based on renal clearance biomarkers.',
            'Administered seasonal immunizations to 1,500+ patients with zero adverse incidents.',
            'Maintained 100% compliant storage records for Schedule II controlled substances adhering strictly to statutory guidelines.'
        ]
    },

    [DOMAINS.NURSING]: {
        label: 'Nursing & Patient Care',
        keywords: ['nurse', 'nursing', 'registered nurse', 'rn', 'bsn', 'msn', 'lpn', 'critical care nurse', 'icu nurse', 'triage nurse', 'staff nurse', 'nurse practitioner', 'charge nurse'],
        skills: ['Patient Assessment & Triage', 'Medication Administration', 'Vital Signs Monitoring', 'IV Cannulation & Infusion Therapy', 'Wound Dressing & Care', 'Critical Care Nursing', 'Cardiopulmonary Resuscitation (CPR)', 'Nursing EMR Documentation'],
        certifications: [
            { title: 'Registered Nurse (RN) License', issuer: 'State Nursing Board / National Nursing Council', category: 'mandatory' },
            { title: 'Basic Life Support (BLS)', issuer: 'American Heart Association', category: 'mandatory' },
            { title: 'Advanced Cardiovascular Life Support (ACLS)', issuer: 'American Heart Association', category: 'recommended' },
            { title: 'Critical Care Registered Nurse (CCRN)', issuer: 'American Association of Critical-Care Nurses', category: 'recommended' },
        ],
        actionVerbs: ['Assessed', 'Administered', 'Monitored', 'Triaged', 'Coordinated', 'Educated', 'Stabilized', 'Delivered'],
        bullets: [
            'Delivered acute nursing care to 8-12 inpatients per shift, administering prescribed medications and monitoring vital signs.',
            'Recognized early symptoms of clinical deterioration in critical care units, coordinating rapid response interventions.',
            'Maintained 100% accurate nursing notes and digital medication administration logs on hospital EMR systems.',
            'Educated discharging patients and caregivers on recovery protocols, dietary plans, and medication routines.'
        ]
    },

    [DOMAINS.LAW]: {
        label: 'Law & Legal Practice',
        keywords: ['lawyer', 'attorney', 'counsel', 'litigation', 'paralegal', 'llb', 'llm', 'legal', 'bar council', 'court', 'contract', 'due diligence', 'corporate law', 'arbitration', 'advocate', 'solicitor', 'barrister'],
        skills: ['Contract Drafting & Review', 'Commercial Litigation', 'Legal Research & Brief Writing', 'Statutory Compliance', 'Due Diligence', 'Arbitration & Mediation', 'Corporate Governance', 'Mergers & Acquisitions (M&A)'],
        certifications: [
            { title: 'Bar Admission to Legal Practice', issuer: 'State Bar Association / Bar Council', category: 'mandatory' },
            { title: 'Certified Commercial Arbitrator', issuer: 'Chartered Institute of Arbitrators', category: 'recommended' },
            { title: 'Certified Information Privacy Professional (CIPP)', issuer: 'IAPP', category: 'recommended' },
        ],
        actionVerbs: ['Drafted', 'Litigated', 'Negotiated', 'Counseled', 'Advised', 'Represented', 'Structured', 'Researched'],
        bullets: [
            'Drafted, reviewed, and negotiated cross-border commercial contracts, vendor agreements, and technology licensing contracts.',
            'Conducted legal due diligence for major M&A transactions, mitigating high-risk indemnification and regulatory exposure.',
            'Advised board of directors on statutory corporate governance, listing compliance, and privacy regulations.',
            'Structured dispute resolution settlements saving clients substantial legal expenditures in protracted litigation.'
        ]
    },

    [DOMAINS.JUDICIARY]: {
        label: 'Judiciary & Adjudication',
        keywords: ['judge', 'magistrate', 'justice', 'adjudicator', 'hearing officer', 'bench', 'judicial clerk', 'chambers', 'administrative law judge', 'tribunal'],
        skills: ['Judicial Reasoning & Opinion Writing', 'Statutory Interpretation', 'Constitutional Jurisprudence', 'Case Management & Docket Control', 'Rules of Evidence', 'Alternative Dispute Resolution (ADR)', 'Ethical Standards & Canons'],
        certifications: [
            { title: 'Judicial Officer Commissioning Certificate', issuer: 'State Judicial Commission / High Court', category: 'mandatory' },
            { title: 'National Judicial College Certification', issuer: 'National Judicial College', category: 'recommended' },
        ],
        actionVerbs: ['Adjudicated', 'Presided', 'Ruled', 'Delivered', 'Interpreted', 'Determined', 'Authored', 'Administered'],
        bullets: [
            'Presided over 300+ civil and administrative hearings annually, ensuring strict adherence to due process and rules of evidence.',
            'Authored 120+ published judicial opinions and orders with 98% affirmation rate upon appellate review.',
            'Streamlined pre-trial motions and preliminary hearing dockets, reducing court backlog by 28%.',
            'Managed courtroom decorum, witness examinations, and legal briefings with absolute impartiality.'
        ]
    },

    [DOMAINS.EDUCATION]: {
        label: 'Education & Teaching',
        keywords: ['teacher', 'educator', 'instructor', 'pedagogy', 'curriculum', 'classroom', 'school', 'b.ed', 'm.ed', 'high school teacher', 'elementary teacher', 'stem teacher', 'lesson plan'],
        skills: ['Curriculum Development', 'Classroom Management', 'Differentiated Instruction', 'Lesson Planning', 'Formative & Summative Assessment', 'STEM & Literacy Instruction', 'Parent-Teacher Collaboration', 'EdTech Integration'],
        certifications: [
            { title: 'State Teaching Credential / Educator License', issuer: 'State Department of Education / Teaching Council', category: 'mandatory' },
            { title: 'National Board Certification in Education', issuer: 'National Board for Professional Teaching Standards', category: 'recommended' },
            { title: 'Google Certified Educator', issuer: 'Google for Education', category: 'recommended' },
        ],
        actionVerbs: ['Instructed', 'Taught', 'Developed', 'Facilitated', 'Mentored', 'Evaluated', 'Curated', 'Assessed'],
        bullets: [
            'Delivered comprehensive mathematics and science instruction to over 160 secondary students with a 98% examination pass rate.',
            'Designed interactive problem-solving modules utilizing educational technology, elevating average student test scores by 22%.',
            'Mentored junior faculty and organized annual inter-school academic fairs with 500+ participants.',
            'Conducted proactive parent-educator conferences to establish personalized academic support plans.'
        ]
    },

    [DOMAINS.HIGHER_EDUCATION]: {
        label: 'Higher Education & Academia',
        keywords: ['professor', 'university professor', 'lecturer', 'faculty', 'tenure', 'academia', 'adjunct', 'provost', 'dean', 'department chair', 'postdoctoral fellow'],
        skills: ['Peer-Reviewed Scholarly Publishing', 'Grant Proposal Writing & Funding', 'Quantitative & Qualitative Research', 'Graduate Seminar Instruction', 'Doctoral Dissertation Advising', 'Curriculum Design & Syllabi Development'],
        certifications: [
            { title: 'Higher Education Faculty Teaching Accreditation', issuer: 'National Higher Education Academy', category: 'mandatory' },
            { title: 'Grant Writing Professional Credential', issuer: 'Grant Professionals Association', category: 'recommended' },
        ],
        actionVerbs: ['Authored', 'Lectured', 'Mentored', 'Investigated', 'Published', 'Secured', 'Chaired', 'Supervised'],
        bullets: [
            'Instructed 4 graduate and undergraduate courses per semester with consistent 4.8/5.0 student evaluation ratings.',
            'Principal Investigator securing over $1.4M in competitive national research grant funding.',
            'Authored 14 peer-reviewed research papers published in top-tier international journals (Q1 ranking).',
            'Supervised 6 Ph.D. dissertations and 12 Master\'s theses to successful completion and institutional defense.'
        ]
    },

    [DOMAINS.ACCOUNTING]: {
        label: 'Accounting, Audit & Taxation',
        keywords: ['accountant', 'ca', 'cpa', 'auditor', 'taxation', 'tax', 'bookkeeper', 'acca', 'balance sheet', 'audit', 'tax compliance', 'financial compliance', 'statutory audit', 'gaap', 'icai', 'financial reporting', 'gst', 'internal audit', 'general ledger'],
        skills: ['Financial Statement Preparation', 'Statutory & Tax Audit', 'Direct & Indirect Taxation', 'GAAP & IFRS Standards', 'General Ledger Accounting', 'Bank & Balance Sheet Reconciliation', 'Internal Controls (SOX Compliance)', 'ERP Financials (SAP, NetSuite)'],
        certifications: [
            { title: 'Certified Public Accountant (CPA) / CA Membership', issuer: 'National Accounting Board / Institute of Chartered Accountants', category: 'mandatory' },
            { title: 'Certified Internal Auditor (CIA)', issuer: 'Institute of Internal Auditors (IIA)', category: 'recommended' },
            { title: 'Chartered Management Accountant (CMA)', issuer: 'IMA', category: 'recommended' },
        ],
        actionVerbs: ['Audited', 'Reconciled', 'Forecasted', 'Analyzed', 'Streamlined', 'Reported', 'Computed', 'Budgeted'],
        bullets: [
            'Led statutory and internal audits for corporate entities across retail and financial services sectors.',
            'Identified internal control deficiencies and tax deduction discrepancies, saving clients substantial exposure.',
            'Supervised teams of audit associates, ensuring compliance with statutory accounting standards and strict filing schedules.',
            'Prepared quarterly GAAP financial statements and managed month-end general ledger reconciliations.'
        ]
    },

    [DOMAINS.FINANCE]: {
        label: 'Finance, Banking & Investment',
        keywords: ['financial analyst', 'investment banker', 'investment banking', 'banking', 'finance', 'portfolio manager', 'wealth management', 'cfa', 'equity research', 'valuation', 'dcf', 'asset management', 'risk analyst', 'treasury', 'banker', 'commercial banker', 'credit analyst'],
        skills: ['3-Statement Financial Modeling', 'DCF & Comparable Company Valuation', 'LBO Analysis', 'Portfolio Allocation', 'Equity Research', 'Fixed Income Analysis', 'Risk Management & Hedging', 'Bloomberg Terminal / FactSet'],
        certifications: [
            { title: 'Chartered Financial Analyst (CFA)', issuer: 'CFA Institute', category: 'mandatory' },
            { title: 'Financial Risk Manager (FRM)', issuer: 'Global Association of Risk Professionals (GARP)', category: 'recommended' },
            { title: 'Series 7 / 63 Securities Licenses', issuer: 'FINRA', category: 'recommended' },
        ],
        actionVerbs: ['Modeled', 'Valued', 'Analyzed', 'Allocated', 'Forecasted', 'Structured', 'Invested', 'Assessed'],
        bullets: [
            'Constructed detailed 3-statement financial models and discounted cash flow (DCF) valuations for $350M+ investment mandates.',
            'Conducted thematic equity research and sensitivity analyses across coverage companies, informing asset allocation decisions.',
            'Optimized corporate treasury yield through disciplined short-term liquidity deployments and hedging strategies.',
            'Delivered quarterly portfolio performance reviews and macroeconomic stress-testing scenarios to investment committees.'
        ]
    },

    [DOMAINS.HUMAN_RESOURCES]: {
        label: 'Human Resources & People Operations',
        keywords: ['human resources', 'talent acquisition', 'recruiter', 'hrbp', 'hr manager', 'people operations', 'employee engagement', 'payroll', 'onboarding', 'talent development', 'chief people officer'],
        skills: ['Full-Lifecycle Recruitment', 'HR Business Partnering (HRBP)', 'Performance Management & OKRs', 'Employee Relations & Engagement', 'Compensation & Benefits (C&B)', 'Statutory Labor Compliance', 'HRIS (Workday, BambooHR)', 'HR Analytics'],
        certifications: [
            { title: 'SHRM Certified Professional (SHRM-CP)', issuer: 'Society for Human Resource Management (SHRM)', category: 'mandatory' },
            { title: 'Professional in Human Resources (PHR)', issuer: 'HR Certification Institute (HRCI)', category: 'recommended' },
        ],
        actionVerbs: ['Recruited', 'Onboarded', 'Facilitated', 'Implemented', 'Partnered', 'Resolved', 'Retained', 'Evaluated'],
        bullets: [
            'Spearheaded full-lifecycle talent acquisition across technical and corporate verticals, hiring 120+ professionals within SLA.',
            'Revamped annual performance appraisal framework and OKR tracking, lifting employee retention rates by 18%.',
            'Managed employee relations, grievance redressal, and workplace compliance in full adherence to statutory employment standards.',
            'Leveraged HR analytics to monitor attrition drivers, reducing annualized voluntary churn by 14%.'
        ]
    },

    [DOMAINS.SALES]: {
        label: 'Sales & Business Development',
        keywords: ['sales', 'account executive', 'business development', 'bdr', 'sdr', 'quota', 'revenue', 'client acquisition', 'sales manager', 'pipeline', 'salesforce', 'sales executive', 'territory manager'],
        skills: ['B2B Enterprise Sales', 'Pipeline Management', 'Contract Negotiation', 'Lead Prospecting & Cold Outreach', 'Consultative Selling', 'Key Account Management', 'Salesforce CRM / HubSpot', 'Revenue Forecasting'],
        certifications: [
            { title: 'Certified Professional Sales Person (CPSP)', issuer: 'National Association of Sales Professionals', category: 'mandatory' },
            { title: 'HubSpot Inbound Sales Certified', issuer: 'HubSpot Academy', category: 'recommended' },
        ],
        actionVerbs: ['Closed', 'Generated', 'Accelerated', 'Negotiated', 'Expanded', 'Captured', 'Acquired', 'Built'],
        bullets: [
            'Consistently exceeded annual sales quota by 135%, generating over $4.2M in annual recurring revenue across enterprise accounts.',
            'Negotiated multi-year commercial contracts with procurement executives, shortening sales cycles significantly.',
            'Built prospective lead pipeline using targeted outbound outreach and executive industry networking.',
            'Led customer discovery calls, identifying organizational pain points and presenting tailored value propositions.'
        ]
    },

    [DOMAINS.MARKETING]: {
        label: 'Marketing, Brand Strategy & Growth',
        keywords: ['marketing', 'digital marketer', 'seo', 'sem', 'content strategist', 'growth marketing', 'social media manager', 'brand manager', 'campaign manager', 'performance marketing', 'copywriter'],
        skills: ['Search Engine Optimization (SEO)', 'Pay-Per-Click (PPC) Advertising', 'Conversion Rate Optimization (CRO)', 'Marketing Analytics & Attribution', 'Brand Positioning & Narrative', 'Content Marketing Strategy', 'Google Analytics 4', 'SEMrush / Ahrefs'],
        certifications: [
            { title: 'Google Analytics 4 Certified Professional', issuer: 'Google', category: 'mandatory' },
            { title: 'HubSpot Inbound Marketing Certified', issuer: 'HubSpot Academy', category: 'recommended' },
        ],
        actionVerbs: ['Orchestrated', 'Optimized', 'Scaled', 'Analyzed', 'Expanded', 'Curated', 'Produced', 'Engineered'],
        bullets: [
            'Orchestrated multi-channel digital marketing campaigns that drove a 45% increase in qualified inbound sales leads.',
            'Scaled organic website traffic by 120% through targeted technical SEO, high-intent keyword clustering, and content marketing.',
            'Managed paid acquisition budget across search and social channels, improving ROAS from 2.8x to 4.2x.',
            'Developed comprehensive brand narrative and brand style guidelines adopted across all customer communication touchpoints.'
        ]
    },

    [DOMAINS.GRAPHIC_DESIGN]: {
        label: 'Graphic Design & Creative Arts',
        keywords: ['graphic designer', 'ui/ux designer', 'ux designer', 'ui designer', 'visual designer', 'art director', 'illustrator', 'animator', 'creative director', 'branding', 'typography', 'motion design', 'digital designer', 'user experience designer'],
        skills: ['Brand Identity & Logo Design', 'Typography & Editorial Layout', 'Packaging Design', 'Vector Illustration', 'UI/UX Design', 'Wireframing & Prototyping', 'Figma & Design Systems', 'Adobe Creative Cloud'],
        certifications: [
            { title: 'Adobe Certified Professional in Visual Design', issuer: 'Adobe', category: 'mandatory' },
            { title: 'Nielsen Norman Group UX Master Certified', issuer: 'NN/g', category: 'recommended' },
        ],
        actionVerbs: ['Conceptualized', 'Designed', 'Illustrated', 'Visualized', 'Branded', 'Prototyped', 'Crafted', 'Curated'],
        bullets: [
            'Conceptualized and executed comprehensive visual identity packages, packaging systems, and digital campaigns for consumer brands.',
            'Collaborated with copywriters and marketing directors to translate brand strategy into cohesive visual assets.',
            'Boosted client social engagement by 60% through unified typography, custom illustration libraries, and motion graphics.',
            'Maintained comprehensive digital design systems ensuring brand consistency across web, mobile, and print mediums.'
        ]
    },

    [DOMAINS.ARCHITECTURE]: {
        label: 'Architecture & Spatial Design',
        keywords: ['architect', 'architectural designer', 'urban planner', 'bim', 'revit', 'autocad', 'building design', 'interior architect', 'landscape architect', 'leed', 'architectural'],
        skills: ['Architectural Space Planning', 'BIM & Revit 3D Modeling', 'AutoCAD Drafting', 'Concept Design', 'Sustainable Building (LEED Standards)', 'Working Drawings', 'Building Codes & Bye-Laws', 'Site Supervision'],
        certifications: [
            { title: 'Licensed Architect Practice Credential', issuer: 'National Architectural Registration Board / Council of Architecture', category: 'mandatory' },
            { title: 'LEED Accredited Professional (LEED AP BD+C)', issuer: 'U.S. Green Building Council', category: 'recommended' },
        ],
        actionVerbs: ['Designed', 'Drafted', 'Planned', 'Modeled', 'Supervised', 'Coordinated', 'Inspected', 'Constructed'],
        bullets: [
            'Led architectural design development, sanction drawings, and technical coordination for mixed-use developments.',
            'Orchestrated multidisciplinary engineering consultants (MEP, structural, facade) using integrated Autodesk Revit BIM workflows.',
            'Conducted weekly site inspections, resolving contractor technical queries and achieving zero deviation from approved blueprints.',
            'Integrated passive solar building orientation and energy-efficient building materials conforming to green building standards.'
        ]
    },

    [DOMAINS.CIVIL_ENGINEERING]: {
        label: 'Civil & Structural Engineering',
        keywords: ['civil engineer', 'civil', 'structural engineer', 'structural', 'site engineer', 'construction engineer', 'surveyor', 'concrete', 'staad.pro', 'geotechnical', 'civil infrastructure', 'quantity surveyor', 'autocad civil', 'highway engineer'],
        skills: ['STAAD.Pro & ETABS Structural Analysis', 'Reinforced Concrete (RCC) Design', 'Structural Steel Design', 'Seismic Analysis Standards', 'Site Supervision & Execution', 'Quality Control & Materials Testing', 'Bill of Quantities (BOQ) Preparation', 'Safety Compliance'],
        certifications: [
            { title: 'Professional Engineer (PE) / Licensed Civil Engineer', issuer: 'State Licensing Board / Institution of Engineers', category: 'mandatory' },
            { title: 'Certified Construction Project Manager', issuer: 'Project Management Institute (PMI)', category: 'recommended' },
        ],
        actionVerbs: ['Supervised', 'Engineered', 'Calculated', 'Inspected', 'Conducted', 'Designed', 'Monitored', 'Surveyed'],
        bullets: [
            'Supervised on-site construction execution and structural concrete pouring for major infrastructure projects.',
            'Performed comprehensive structural analysis and seismic design checks using ETABS and STAAD.Pro.',
            'Prepared accurate Bill of Quantities (BOQ) and verified contractor measurement sheets, ensuring zero budgetary cost overruns.',
            'Enforced stringent site health and safety standards, achieving 500,000 safe man-hours with zero lost-time injuries.'
        ]
    },

    [DOMAINS.MECHANICAL_ENGINEERING]: {
        label: 'Mechanical & Thermal Systems Engineering',
        keywords: ['mechanical engineer', 'mechanical design', 'mechanical design engineer', 'mechanical systems', 'mechanical systems engineer', 'thermal systems engineer', 'solidworks', 'cad designer', 'hvac', 'thermal engineer', 'manufacturing engineer', 'mechatronics', 'robotics systems engineer', 'fea', 'ansys', 'automotive engineer', 'tooling'],
        skills: ['SolidWorks / Creo Parametric', 'Computer-Aided Design (CAD)', 'Geometric Dimensioning & Tolerancing (GD&T)', 'Design for Manufacturing (DFM/DFA)', 'Finite Element Analysis (FEA)', 'ANSYS / Abaqus Simulation', 'Thermal Systems Design', 'Lean Manufacturing'],
        certifications: [
            { title: 'Chartered / Professional Engineer License (Mechanical)', issuer: 'Institution of Mechanical Engineers / State Board', category: 'mandatory' },
            { title: 'Certified SolidWorks Professional (CSWP)', issuer: 'Dassault Systèmes', category: 'recommended' },
        ],
        actionVerbs: ['Designed', 'Simulated', 'Engineered', 'Optimized', 'Fabricated', 'Analyzed', 'Tested', 'Manufactured'],
        bullets: [
            'Designed and analyzed high-precision mechanical assemblies and chassis components using SolidWorks and ANSYS FEA simulations.',
            'Reduced component manufacturing costs by applying Design for Manufacturing (DFM) and GD&T tolerance optimizations.',
            'Supervised prototype fabrication, physical endurance stress-testing, and failure mode effects analysis (FMEA).',
            'Standardized quality inspection workflows on the assembly line, decreasing defect rates significantly.'
        ]
    },

    [DOMAINS.ELECTRICAL_ENGINEERING]: {
        label: 'Electrical & Power Systems Engineering',
        keywords: ['electrical engineer', 'electrical', 'power systems', 'substation', 'pcb designer', 'circuit design', 'scada', 'plc', 'high voltage', 'switchgear', 'electronics engineer', 'fpga', 'microcontroller'],
        skills: ['Substation Design & Protection', 'Power Distribution & Load Flow Analysis', 'High Voltage Switchgear & Transformers', 'SCADA & Relay Coordination', 'Schematic Capture & PCB Layout', 'Analog & Digital Circuit Design', 'PLC Programming', 'Commissioning'],
        certifications: [
            { title: 'Professional Engineer (PE) - Electrical', issuer: 'State Board of Professional Engineers / Institution of Engineers', category: 'mandatory' },
            { title: 'Certified Energy Manager (CEM)', issuer: 'Association of Energy Engineers (AEE)', category: 'recommended' },
        ],
        actionVerbs: ['Engineered', 'Calibrated', 'Simulated', 'Wired', 'Programmed', 'Tested', 'Commissioned', 'Designed'],
        bullets: [
            'Engineered electrical distribution schematics and single-line diagrams for substations and industrial facilities.',
            'Conducted short-circuit, protective relay coordination, and arc flash hazard studies using ETAP simulation software.',
            'Commissioned PLC automation systems and SCADA telemetry networks with 100% operational uptime.',
            'Resolved high-voltage transformer insulation and switchgear faults, minimizing unbudgeted plant downtime.'
        ]
    },

    [DOMAINS.SCIENTIFIC_RESEARCH]: {
        label: 'Scientific Research & Laboratory Sciences',
        keywords: ['research scientist', 'scientist', 'laboratory', 'chemist', 'biologist', 'clinical research', 'peer-reviewed', 'phd', 'postdoc', 'research fellow', 'spectroscopy', 'pharmacology', 'biochemist', 'physicist'],
        skills: ['Experimental Design & Hypothesis Testing', 'Spectroscopy (NMR, FTIR, UV-Vis)', 'Chromatography (HPLC, GC-MS)', 'Molecular Biology Assays', 'Quality Control & GLP Standards', 'Statistical Data Analysis (R / Python)', 'Peer-Reviewed Publishing', 'Grant Proposal Drafting'],
        certifications: [
            { title: 'Good Laboratory Practice (GLP) Certification', issuer: 'Quality Council / Laboratory Accreditation Board', category: 'mandatory' },
            { title: 'Certified Clinical Research Professional (CCRP)', issuer: 'Society of Clinical Research Associates (SoCRA)', category: 'recommended' },
        ],
        actionVerbs: ['Investigated', 'Synthesized', 'Designed', 'Authored', 'Assayed', 'Calibrated', 'Published', 'Discovered'],
        bullets: [
            'Designed and executed controlled laboratory experiments and characterization assays with high analytical precision.',
            'Authored original research papers published in high-impact peer-reviewed scientific journals (Q1 ranking).',
            'Secured competitive institutional research grants through comprehensive scientific proposal drafting.',
            'Maintained rigorous chemical inventory, laboratory equipment calibrations, and biohazard containment standard operating procedures.'
        ]
    },

    [DOMAINS.HOSPITALITY]: {
        label: 'Hospitality, Culinary & Food Service',
        keywords: ['chef', 'executive chef', 'sous chef', 'culinary', 'pastry chef', 'food and beverage', 'f&b', 'food safety', 'catering', 'sommelier', 'kitchen', 'cook', 'baking', 'recipe'],
        skills: ['Culinary Arts & Menu Engineering', 'Food Safety & HACCP Standards', 'Banquet & Volume Catering', 'Kitchen Brigade Leadership', 'Recipe Costing & Portion Control', 'Food & Beverage (F&B) Management', 'Kitchen Operations Oversight', 'Vendor Sourcing'],
        certifications: [
            { title: 'ServSafe Food Protection Manager', issuer: 'National Restaurant Association', category: 'mandatory' },
            { title: 'HACCP Level 3 Food Safety Certification', issuer: 'Chartered Institute of Environmental Health (CIEH)', category: 'mandatory' },
        ],
        actionVerbs: ['Prepared', 'Curated', 'Managed', 'Standardized', 'Executed', 'Orchestrated', 'Supervised', 'Innovated'],
        bullets: [
            'Managed culinary and back-of-house operations for premier restaurant serving 400+ covers daily.',
            'Engineered seasonal tasting menus and revamped procurement channels, lowering food cost percentage significantly.',
            'Enforced stringent HACCP food hygiene protocols, passing municipal health audits with 100% compliance.',
            'Led and mentored an international kitchen brigade of chefs and apprentices, fostering high culinary standards.'
        ]
    },

    [DOMAINS.HOTEL_MANAGEMENT]: {
        label: 'Hotel Management & Lodging Operations',
        keywords: ['hotel general manager', 'hotel manager', 'general manager hotel', 'hotel director', 'resort manager', 'front office manager', 'hospitality manager', 'housekeeping director', 'concierge', 'guest services', 'lodging', 'banquet manager', 'hotelier', 'hotel'],
        skills: ['Front Office & Guest Relations Management', 'Housekeeping & Facilities Standards', 'RevPAR & Average Daily Rate (ADR) Optimization', 'Yield Management & Dynamic Room Pricing', 'Hotel Property Management Systems (Opera PMS)', 'Banquet & Convention Coordination', 'Hospitality Health & Safety Compliance'],
        certifications: [
            { title: 'Certified Hotel Administrator (CHA)', issuer: 'American Hotel & Lodging Educational Institute (AHLEI)', category: 'mandatory' },
            { title: 'Certification in Hotel Industry Analytics (CHIA)', issuer: 'STR & AHLEI', category: 'recommended' },
        ],
        actionVerbs: ['Directed', 'Managed', 'Elevated', 'Orchestrated', 'Optimized', 'Resolved', 'Coordinated', 'Supervised'],
        bullets: [
            'Directed daily operations across guest rooms, restaurants, and conference facilities managing an annual multi-million dollar budget.',
            'Increased RevPAR year-over-year through dynamic room pricing and strategic corporate group sales partnerships.',
            'Elevated guest satisfaction ratings through comprehensive staff hospitality training and guest relations programs.',
            'Supervised department heads across front office, housekeeping, food and beverage, and facilities engineering.'
        ]
    },

    [DOMAINS.AVIATION]: {
        label: 'Aviation & Flight Operations',
        keywords: ['pilot', 'airline pilot', 'commercial pilot', 'first officer', 'captain', 'flight instructor', 'aviator', 'atpl', 'cpl', 'flight operations', 'aircraft', 'cockpit', 'aerospace flight', 'avionics', 'flight dispatcher'],
        skills: ['Multi-Engine Aircraft Command', 'Instrument Flight Rules (IFR) Navigation', 'Pre-Flight Briefing & Walkaround Inspection', 'Crew Resource Management (CRM)', 'Emergency Flight Procedures', 'Flight Dispatch & Weight-Balance', 'ICAO & FAA / EASA Regulations', 'NOTAM & Weather Radar'],
        certifications: [
            { title: 'Airline Transport Pilot License (ATPL)', issuer: 'Civil Aviation Authority (FAA / EASA / DGCA / CASA)', category: 'mandatory' },
            { title: 'First Class Aviation Medical Certificate', issuer: 'Aviation Medical Authority', category: 'mandatory' },
            { title: 'Type Rating on Commercial Passenger Aircraft', issuer: 'Accredited Airline Training Center', category: 'mandatory' },
        ],
        actionVerbs: ['Piloted', 'Navigated', 'Commanded', 'Inspected', 'Calculated', 'Coordinated', 'Briefed', 'Executed'],
        bullets: [
            'Commanded commercial passenger aircraft across domestic and international routes, logging 4,500+ flight hours with zero incident citations.',
            'Conducted thorough pre-flight inspections, flight planning, weather evaluations, and weight-and-balance calculations.',
            'Collaborated seamlessly with air traffic control (ATC), dispatchers, and flight attendants adhering strictly to Crew Resource Management (CRM).',
            'Executed precision instrument approaches (ILS CAT III) in zero-visibility conditions safely and according to SOPs.'
        ]
    },

    [DOMAINS.JOURNALISM]: {
        label: 'Journalism, Media & Communications',
        keywords: ['journalist', 'reporter', 'editor', 'news writer', 'correspondent', 'investigative journalist', 'columnist', 'copy editor', 'broadcast journalist', 'media relations', 'photojournalist'],
        skills: ['Investigative Reporting & Deep Sourcing', 'Freedom of Information Act (FOIA) Requests', 'Field Interviewing Techniques', 'Long-Form Feature Writing', 'Copy Editing & AP Stylebook Compliance', 'Fact-Checking & Legal Defamation Screening', 'Digital Audience Engagement', 'CMS Publishing'],
        certifications: [
            { title: 'Professional Member Credential', issuer: 'Society of Professional Journalists / Press Council', category: 'mandatory' },
            { title: 'Digital Media & Fact-Checking Credential', issuer: 'International Fact-Checking Network', category: 'recommended' },
        ],
        actionVerbs: ['Investigated', 'Reported', 'Authored', 'Interviewed', 'Edited', 'Fact-Checked', 'Published', 'Broadcasted'],
        bullets: [
            'Researched, reported, and authored 120+ front-page investigative features on public policy, governance, and corporate accountability.',
            'Conducted in-depth interviews with government officials, industry executives, and civic whistleblowers.',
            'Verified public records, financial disclosures, and legal filings, ensuring 100% factual accuracy under stringent editorial deadlines.',
            'Produced companion digital multimedia packages and podcasts that increased reader engagement time by 45%.'
        ]
    },

    [DOMAINS.GOVERNMENT]: {
        label: 'Government Administration & Public Policy',
        keywords: ['government officer', 'civil servant', 'public administrator', 'policy analyst', 'ias', 'ips', 'municipal officer', 'revenue officer', 'public affairs', 'public sector', 'panchayat', 'deputy collector', 'administrative officer'],
        skills: ['Public Policy Formulation', 'Government Welfare Program Administration', 'Inter-Agency Coordination', 'Statutory Regulatory Compliance', 'Public Budgeting & Expenditure Oversight', 'Public Procurement Guidelines', 'Citizen Grievance Redressal', 'Crisis Management'],
        certifications: [
            { title: 'Certificate in Public Policy Analysis', issuer: 'National Institute of Public Policy', category: 'mandatory' },
            { title: 'Executive Certificate in e-Governance Administration', issuer: 'National e-Governance Division', category: 'recommended' },
        ],
        actionVerbs: ['Administered', 'Enacted', 'Coordinated', 'Drafted', 'Managed', 'Supervised', 'Facilitated', 'Directed'],
        bullets: [
            'Supervised execution of welfare and civic infrastructure programs reaching over 250,000 citizens.',
            'Managed public treasury allocations, enforcing strict transparency guidelines and public audit accountability.',
            'Streamlined citizen service delivery through digital portals, cutting grievance turnaround substantially.',
            'Coordinated multi-departmental administrative operations during municipal emergency relief and recovery efforts.'
        ]
    },

    [DOMAINS.PUBLIC_SAFETY]: {
        label: 'Law Enforcement & Public Safety',
        keywords: ['police officer', 'police', 'detective', 'law enforcement', 'investigator', 'sergeant', 'deputy sheriff', 'constable', 'patrol officer', 'inspector', 'lieutenant', 'state trooper'],
        skills: ['Criminal Investigation & Case Management', 'Crime Scene Preservation & Evidence Collection', 'Suspect & Witness Interrogation', 'Search Warrant Execution', 'Community Policing & Patrol Tactics', 'Crisis De-escalation & Conflict Resolution', 'Courtroom Testimony'],
        certifications: [
            { title: 'State Law Enforcement Officer / POST Certification', issuer: 'State Commission on Law Enforcement Standards', category: 'mandatory' },
            { title: 'Crisis Intervention Team (CIT) Certification', issuer: 'National CIT Association', category: 'mandatory' },
        ],
        actionVerbs: ['Investigated', 'Patrolled', 'Apprehended', 'Secured', 'Testified', 'Enforced', 'De-escalated', 'Responded'],
        bullets: [
            'Conducted criminal investigations into felony offenses, maintaining an 85% case clearance rate.',
            'Processed crime scenes, gathered physical evidence, and prepared detailed forensic documentation for prosecutors.',
            'Delivered expert testimony in municipal and district courts resulting in successful grand jury indictments.',
            'Utilized certified crisis de-escalation techniques in high-stress emergency response calls with zero civilian injuries.'
        ]
    },

    [DOMAINS.DEFENSE]: {
        label: 'Armed Forces & Defense',
        keywords: ['military officer', 'army', 'navy', 'air force', 'armed forces', 'battalion', 'platoon', 'commanding officer', 'veteran', 'infantry', 'tactical officer'],
        skills: ['Command & Troop Leadership', 'Tactical Mission Planning & Execution', 'Risk Mitigation in High-Stress Environments', 'Strategic Resource Allocation', 'Supply Chain & Materiel Readiness Oversight', 'Operational Security (OPSEC) Protocols', 'Physical Security & Asset Protection'],
        certifications: [
            { title: 'Commissioned Officer Certificate of Service', issuer: 'Ministry / Department of Defense', category: 'mandatory' },
            { title: 'Joint Operations Staff Planning Credential', issuer: 'Defense Staff College', category: 'recommended' },
        ],
        actionVerbs: ['Commanded', 'Mobilized', 'Coordinated', 'Executed', 'Led', 'Maintained', 'Trained', 'Planned'],
        bullets: [
            'Commanded 120-personnel tactical unit, ensuring 100% operational readiness, discipline, and equipment accountability.',
            'Orchestrated logistics and field supply operations supporting multi-domain training maneuvers under austere conditions.',
            'Conducted daily threat intelligence briefings and coordinated inter-agency security protocols.',
            'Mentored junior non-commissioned officers, achieving highest retention and advancement rate in the brigade.'
        ]
    },

    [DOMAINS.NON_PROFIT]: {
        label: 'Non-Profit & Humanitarian Development',
        keywords: ['ngo', 'non-profit', 'humanitarian', 'grant writer', 'program coordinator', 'fundraising director', 'social worker', 'donor relations', 'community development', 'philanthropy'],
        skills: ['Humanitarian Program Design & Execution', 'Monitoring & Evaluation (M&E) Frameworks', 'Community Needs Assessment', 'Grassroots Stakeholder Mobilization', 'Grant Proposal Writing & Submission', 'Donor Cultivation', 'Non-Profit Governance Compliance'],
        certifications: [
            { title: 'Project Management for Development Professionals (PMD Pro)', issuer: 'PM4NGOs', category: 'mandatory' },
            { title: 'Certified Fund Raising Executive (CFRE)', issuer: 'CFRE International', category: 'recommended' },
        ],
        actionVerbs: ['Mobilized', 'Spearheaded', 'Secured', 'Administered', 'Coordinated', 'Advocated', 'Partnered', 'Facilitated'],
        bullets: [
            'Directed community health and education programs across field locations, improving outcomes for 40,000+ beneficiaries.',
            'Secured $3.2M in institutional grants from bilateral donor agencies and philanthropic foundations.',
            'Designed comprehensive monitoring and evaluation (M&E) frameworks ensuring 100% compliance with grant covenants.',
            'Supervised team of field coordinators, technical specialists, and community outreach volunteers.'
        ]
    },

    [DOMAINS.PERFORMING_ARTS]: {
        label: 'Music & Performing Arts',
        keywords: ['musician', 'pianist', 'violinist', 'singer', 'composer', 'conductor', 'music producer', 'cellist', 'orchestra', 'performing artist', 'audio engineer', 'sound designer'],
        skills: ['Solo & Chamber Instrumental Performance', 'Sight-Reading & Score Study', 'Intonation & Dynamic Expression', 'Ensemble & Orchestral Rehearsal Discipline', 'Music Theory & Harmonic Analysis', 'Orchestration & Arranging', 'DAW Software (Logic Pro, Pro Tools)', 'Studio Recording'],
        certifications: [
            { title: 'Licentiate in Performance Diploma', issuer: 'Associated Board of the Royal Schools of Music (ABRSM)', category: 'mandatory' },
            { title: 'Pro Tools Certified Specialist', issuer: 'Avid Technology', category: 'recommended' },
        ],
        actionVerbs: ['Performed', 'Composed', 'Arranged', 'Rehearsed', 'Conducted', 'Recorded', 'Produced', 'Curated'],
        bullets: [
            'Performed as principal instrumental soloist across 60+ seasonal subscription concerts and international concert tours.',
            'Collaborated with guest conductors and guest vocalists on classical, romantic, and contemporary orchestral repertoire.',
            'Led sectional masterclasses and mentored conservatory apprentice musicians on tone production and phrasing.',
            'Recorded studio albums and broadcast live performances for national public radio networks.'
        ]
    },

    [DOMAINS.SPORTS]: {
        label: 'Athletics, Sports & Physical Performance',
        keywords: ['athlete', 'sports coach', 'athletic coach', 'performance coach', 'athletic trainer', 'fitness director', 'strength coach', 'personal trainer', 'swimmer', 'track and field', 'sports performance', 'kinesiologist', 'athletic', 'strength and conditioning', 'coach', 'athletics'],
        skills: ['Periodized Strength & Conditioning Programs', 'Biomechanics & Movement Analysis', 'Speed, Agility, and Quickness (SAQ) Drills', 'Sports Injury Prevention & Screening', 'Rehabilitative Exercise Protocols', 'Game Strategy & Tactical Video Analysis', 'Sports Nutrition & Hydration'],
        certifications: [
            { title: 'Certified Strength and Conditioning Specialist (CSCS)', issuer: 'National Strength and Conditioning Association (NSCA)', category: 'mandatory' },
            { title: 'Certified Athletic Trainer (ATC)', issuer: 'Board of Certification for the Athletic Trainer', category: 'recommended' },
        ],
        actionVerbs: ['Trained', 'Conditioned', 'Competed', 'Coached', 'Demonstrated', 'Maximized', 'Analyzed', 'Mentored'],
        bullets: [
            'Designed and implemented periodized strength and conditioning regimens for competitive collegiate and professional athletes.',
            'Reduced non-contact musculoskeletal sports injuries by 35% through movement screening and functional mobility drills.',
            'Conducted biometric workload tracking and heart-rate variability assessments to prevent overtraining.',
            'Coached athletes to achieve national championship qualification marks and personal record performances.'
        ]
    },

    [DOMAINS.PHOTOGRAPHY]: {
        label: 'Photography & Visual Media',
        keywords: ['photographer', 'cinematographer', 'photojournalist', 'commercial photographer', 'studio photographer', 'portrait photographer', 'lighting director', 'videographer', 'drone pilot aerial'],
        skills: ['Studio Strobe & Continuous Lighting Setup', 'Three-Point Lighting & Light Modifiers', 'Medium Format & Full-Frame Cameras', 'Creative Visual Composition & Framing', 'High-End Skin Retouching & Color Grading', 'RAW Asset Workflow (Capture One, Lightroom)', 'Commercial Product Compositing (Photoshop)'],
        certifications: [
            { title: 'Certified Professional Photographer (CPP)', issuer: 'Professional Photographers of America (PPA)', category: 'mandatory' },
            { title: 'FAA Part 107 Certified Commercial Drone Pilot', issuer: 'Federal Aviation Administration (FAA)', category: 'recommended' },
        ],
        actionVerbs: ['Captured', 'Framed', 'Illuminated', 'Retouched', 'Edited', 'Curated', 'Composed', 'Produced'],
        bullets: [
            'Directed and shot 80+ commercial advertising, editorial, and product catalog campaigns for national lifestyle brands.',
            'Engineered sophisticated multi-light studio setups, delivering flawless color accuracy and highlight rendition.',
            'Managed digital post-production workflow, executing high-end color grading and retouching across 10,000+ delivered assets.',
            'Supervised assistant photographers, stylists, and digital techs on multi-day commercial location shoots.'
        ]
    },

    [DOMAINS.SKILLED_TRADES]: {
        label: 'Skilled Trades & Industrial Craftsmanship',
        keywords: ['electrician', 'plumber', 'carpenter', 'machinist', 'welder', 'hvac technician', 'millwright', 'pipefitter', 'journeyman', 'master electrician', 'fabricator', 'cnc machinist', 'boilermaker'],
        skills: ['Electrical Conduit Bending & High-Voltage Wiring', 'Precision TIG / MIG / Arc Welding', 'Plumbing Rough-In & Pipe Fitting', 'CNC Milling, Turning & G-Code Programming', 'Blueprint & Schematic Reading', 'Industrial Motor Controls & Diagnostics', 'OSHA 30 Safety Protocols'],
        certifications: [
            { title: 'Master Electrician License / State Trade Credential', issuer: 'State Licensing Board / Department of Labor', category: 'mandatory' },
            { title: 'OSHA 30-Hour Construction Safety Certification', issuer: 'OSHA Training Institute', category: 'mandatory' },
            { title: 'AWS Certified Welder', issuer: 'American Welding Society', category: 'recommended' },
        ],
        actionVerbs: ['Fabricated', 'Installed', 'Repaired', 'Calibrated', 'Wired', 'Troubleshot', 'Inspected', 'Welded'],
        bullets: [
            'Installed, tested, and maintained industrial electrical distribution equipment, switchgear, and motor control centers.',
            'Diagnosed and repaired electrical and mechanical machine failures, restoring production lines within critical windows.',
            'Read and interpreted complex schematics, architectural blueprints, and circuit diagrams with zero layout errors.',
            'Enforced stringent OSHA 30 standards and Lockout/Tagout (LOTO) protocols across 200,000 safe working hours.'
        ]
    },

    [DOMAINS.SOFTWARE_ENGINEERING]: {
        label: 'Software & Cloud Systems Engineering',
        keywords: ['software engineer', 'software developer', 'frontend developer', 'backend developer', 'frontend engineer', 'backend engineer', 'fullstack', 'frontend', 'backend', 'devops', 'cloud architect', 'programmer', 'systems programmer', 'web developer', 'site reliability engineer', 'sre', 'cybersecurity', 'security analyst', 'infosec', 'penetration tester', 'security engineer'],
        skills: ['JavaScript', 'React.js', 'TypeScript', 'Node.js', 'Python', 'Java', 'SQL & Relational Databases', 'Cloud Architecture (AWS / GCP / Azure)', 'Docker & Containerization', 'Kubernetes Orchestration', 'CI/CD Pipelines'],
        certifications: [
            { title: 'AWS Certified Solutions Architect', issuer: 'Amazon Web Services', category: 'mandatory' },
            { title: 'Certified Information Systems Security Professional (CISSP)', issuer: '(ISC)²', category: 'recommended' },
            { title: 'CompTIA Security+ Certification', issuer: 'CompTIA', category: 'recommended' },
            { title: 'Certified Kubernetes Administrator (CKA)', issuer: 'CNCF / Linux Foundation', category: 'recommended' },
        ],
        actionVerbs: ['Architected', 'Engineered', 'Developed', 'Scaled', 'Automated', 'Deployed', 'Refactored', 'Optimized'],
        bullets: [
            'Architected and scaled distributed backend microservices serving 10M+ daily requests with 99.99% uptime availability.',
            'Reduced p99 database query response latency by 35% through Redis caching layers and relational query plan indexing.',
            'Mentored junior engineers and instituted automated CI/CD code quality gates, increasing release deployment frequency.',
            'Designed robust RESTful APIs and event-driven consumer pipelines handling high-throughput asynchronous payloads.'
        ]
    },

    [DOMAINS.DATA_SCIENCE]: {
        label: 'Data Science & Machine Learning',
        keywords: ['data scientist', 'machine learning', 'ml engineer', 'ai engineer', 'data analyst', 'deep learning', 'pytorch', 'tensorflow', 'nlp', 'computer vision', 'statistical modeling', 'big data'],
        skills: ['Supervised & Unsupervised Learning', 'Deep Learning (PyTorch / TensorFlow)', 'Natural Language Processing (NLP)', 'Computer Vision', 'Python (Pandas, NumPy, Scikit-Learn)', 'SQL & Big Data Processing (Spark)', 'Model Deployment (FastAPI, Docker)', 'MLflow'],
        certifications: [
            { title: 'TensorFlow Developer Certificate', issuer: 'Google', category: 'mandatory' },
            { title: 'AWS Certified Machine Learning - Specialty', issuer: 'Amazon Web Services', category: 'recommended' },
        ],
        actionVerbs: ['Trained', 'Modeled', 'Deployed', 'Engineered', 'Visualized', 'Extracted', 'Analyzed', 'Validated'],
        bullets: [
            'Built and deployed predictive machine learning models in production, delivering 92% classification accuracy.',
            'Engineered automated ETL pipelines processing 2 TB of daily behavioral telemetry data into structured feature stores.',
            'Collaborated with product stakeholders to translate strategic questions into statistically valid experiments.',
            'Monitored production model performance, tracking data drift and retraining cycles to prevent inference degradation.'
        ]
    },

    [DOMAINS.GENERAL_BUSINESS]: {
        label: 'Business Operations & Management',
        keywords: ['business operations manager', 'business operations director', 'business analyst', 'project manager', 'chief of staff', 'general manager', 'executive assistant to ceo', 'chief operating officer', 'coo', 'management consultant'],
        skills: ['Operational Excellence', 'Process Optimization', 'Strategic Planning', 'Cross-Functional Leadership', 'Change Management', 'Project Management (PMP)', 'Stakeholder Communication', 'Budget & Resource Allocation', 'Root Cause Analysis'],
        certifications: [
            { title: 'Project Management Professional (PMP)', issuer: 'Project Management Institute (PMI)', category: 'mandatory' },
            { title: 'Lean Six Sigma Green Belt', issuer: 'American Society for Quality (ASQ)', category: 'recommended' },
        ],
        actionVerbs: ['Orchestrated', 'Delivered', 'Streamlined', 'Managed', 'Improved', 'Executed', 'Standardized', 'Facilitated'],
        bullets: [
            'Directed cross-functional operations across facility locations, managing annual operating budget.',
            'Redesigned standard operating procedures (SOPs) and supply chain handoffs, reducing operational fulfillment delays by 28%.',
            'Led regular stakeholder reviews with business leadership, tracking operational KPIs and maintaining 99% SLA delivery.',
            'Implemented cost optimization programs delivering 15% annualized savings without compromising delivery quality.'
        ]
    },

    [DOMAINS.INTERIOR_DESIGN]: {
        label: 'Interior Design & Spatial Architecture',
        keywords: ['interior designer', 'interior architect', 'spatial designer', 'interior decorator', 'residential interior designer', 'commercial interior designer', 'ff&e designer', 'spatial planning'],
        skills: ['Spatial Planning & Layouts', 'AutoCAD & SketchUp 3D Modeling', 'Material & Finish Specification', 'Lighting Design & FF&E Schedules', 'Custom Joinery & Millwork Detailing', 'Building Codes & ADA Accessibility', 'Contractor & Trade Supervision'],
        certifications: [
            { title: 'NCIDQ Certified Interior Designer', issuer: 'CIDQ', category: 'mandatory' },
            { title: 'LEED AP ID+C (Interior Design + Construction)', issuer: 'U.S. Green Building Council', category: 'recommended' },
            { title: 'Certified Interior Decorator (C.I.D.)', issuer: 'Certified Interior Decorators International', category: 'recommended' },
        ],
        actionVerbs: ['Conceptualized', 'Drafted', 'Rendered', 'Curated', 'Specified', 'Styled', 'Commissioned', 'Supervised'],
        bullets: [
            'Directed end-to-end interior design for luxury residential and commercial hospitality properties valued up to $15M.',
            'Formulated custom FF&E specifications, bespoke millwork packages, and lighting schedules with zero site rework.',
            'Supervised general contractors and trade artisans on site, guaranteeing precision alignment with architectural blueprints.',
            'Presented immersive 3D renderings and material moodboards to executive clients, maintaining a 95% first-round approval rating.'
        ]
    },

    [DOMAINS.PHYSIOTHERAPY]: {
        label: 'Physiotherapy & Physical Rehabilitation',
        keywords: ['physiotherapist', 'physical therapist', 'physiotherapy', 'rehabilitation specialist', 'kinesiologist', 'sports physiotherapist', 'orthopedic physical therapist', 'neuro physiotherapist'],
        skills: ['Musculoskeletal Assessment', 'Gait & Postural Analysis', 'Neurological Rehabilitation Protocols', 'Manual Therapy & Joint Mobilization', 'Therapeutic Exercise Prescription', 'Dry Needling & Myofascial Release', 'Post-Surgical Orthopedic Recovery'],
        certifications: [
            { title: 'Licensed Physical Therapist (State / National PT Board)', issuer: 'State Physical Therapy Licensing Board', category: 'mandatory' },
            { title: 'Board-Certified Orthopaedic Clinical Specialist (OCS)', issuer: 'American Board of Physical Therapy Specialties (ABPTS)', category: 'recommended' },
            { title: 'Certified Manual Physical Therapist (CMPT)', issuer: 'North American Institute of Orthopaedic Manual Therapy', category: 'recommended' },
        ],
        actionVerbs: ['Rehabilitated', 'Treated', 'Assessed', 'Restored', 'Prescribed', 'Mobilized', 'Trained', 'Evaluated'],
        bullets: [
            'Managed active clinical caseload of 35+ weekly patients recovering from orthopedic surgeries, spinal trauma, and sports injuries.',
            'Formulated individualized therapeutic exercise regimens and manual therapy plans, improving patient mobility by 40%.',
            'Performed comprehensive biomechanical and gait assessments utilizing functional movement screening.',
            'Collaborated with orthopedic surgeons and physiatrists to ensure safe post-operative rehabilitation timelines.'
        ]
    },

    [DOMAINS.PSYCHOLOGY]: {
        label: 'Psychology & Behavioral Health',
        keywords: ['psychologist', 'clinical psychologist', 'counseling psychologist', 'psychotherapist', 'behavioral therapist', 'neuropsychologist', 'school psychologist', 'licensed mental health counselor'],
        skills: ['Psychodiagnostic Testing & Evaluation', 'DSM-5 / ICD-11 Diagnostic Formulation', 'Cognitive Behavioral Therapy (CBT)', 'Mindfulness-Based Stress Reduction', 'Acceptance & Commitment Therapy (ACT)', 'Trauma-Informed Psychotherapy', 'Crisis Assessment Protocols'],
        certifications: [
            { title: 'Licensed Psychologist (State Psychology Board)', issuer: 'State Licensing Board of Psychology', category: 'mandatory' },
            { title: 'Board Certified in Clinical Psychology', issuer: 'American Board of Professional Psychology (ABPP)', category: 'recommended' },
            { title: 'Certified CBT Practitioner', issuer: 'Academy of Cognitive and Behavioral Therapies', category: 'recommended' },
        ],
        actionVerbs: ['Assessed', 'Counseled', 'Administered', 'Evaluated', 'Intervened', 'Formulated', 'Facilitated', 'Monitored'],
        bullets: [
            'Conducted diagnostic evaluations, structured clinical interviews, and psychometric assessments for adolescent and adult patients.',
            'Delivered evidence-based Cognitive Behavioral Therapy (CBT) and acceptance-based modalities for anxiety, depressive, and trauma disorders.',
            'Formulated individualized psychological treatment plans with measurable symptom-reduction milestones.',
            'Facilitated weekly psychoeducational support groups and coordinated care with psychiatric prescribers.'
        ]
    },

    [DOMAINS.VETERINARY]: {
        label: 'Veterinary Medicine & Animal Health',
        keywords: ['veterinarian', 'vet', 'veterinary surgeon', 'veterinary doctor', 'dvm', 'bvsc', 'veterinary physician', 'small animal veterinarian', 'large animal veterinarian', 'equine vet'],
        skills: ['Physical Examination & Veterinary Triage', 'Soft Tissue & Orthopedic Animal Surgery', 'Veterinary Anesthesia & Monitoring', 'Radiography & Ultrasound Imaging', 'Preventive Vaccinations', 'Veterinary Pharmacology', 'Zoonotic Disease Surveillance'],
        certifications: [
            { title: 'Licensed Veterinarian (State / National Veterinary Board)', issuer: 'State Veterinary Medical Board', category: 'mandatory' },
            { title: 'Fear Free Certified Veterinary Professional', issuer: 'Fear Free Pets', category: 'recommended' },
            { title: 'Board Certified Veterinary Specialist', issuer: 'American College of Veterinary Internal Medicine (ACVIM)', category: 'recommended' },
        ],
        actionVerbs: ['Diagnosed', 'Treated', 'Operated', 'Inoculated', 'Vaccinated', 'Examined', 'Rehabilitated', 'Prescribed'],
        bullets: [
            'Delivered medical and surgical care for 40+ companion animal patients weekly across outpatient and emergency admissions.',
            'Performed routine and emergency soft-tissue surgeries, dental extractions, and fracture stabilizations with zero intraoperative complications.',
            'Interpreted digital radiographs, ultrasound scans, and in-house hematology profiles to establish rapid, accurate diagnoses.',
            'Counseled pet owners on preventive healthcare, vaccination schedules, nutritional management, and chronic disease protocols.'
        ]
    },

    [DOMAINS.AGRICULTURE]: {
        label: 'Agriculture, Agronomy & Soil Science',
        keywords: ['agronomist', 'agriculture professional', 'agricultural scientist', 'crop manager', 'farm manager', 'soil scientist', 'horticulturist', 'precision agriculture specialist', 'plant pathologist'],
        skills: ['Crop Rotation & Yield Maximization', 'Soil Sampling & Nutrient Management (NPK)', 'Integrated Pest Management (IPM)', 'Precision Agriculture & Drone Telemetry', 'Drip & Center-Pivot Irrigation Systems', 'Agrochemical Safety Standards'],
        certifications: [
            { title: 'Certified Crop Adviser (CCA)', issuer: 'American Society of Agronomy', category: 'mandatory' },
            { title: 'Certified Professional Agronomist (CPAg)', issuer: 'American Society of Agronomy', category: 'recommended' },
            { title: 'Precision Agriculture Specialist Credential', issuer: 'Agricultural Technology Association', category: 'recommended' },
        ],
        actionVerbs: ['Cultivated', 'Harvested', 'Propagated', 'Irrigated', 'Sampled', 'Optimized', 'Formulated', 'Monitored'],
        bullets: [
            'Managed agronomic operations across 4,500 acres of commercial grain and legume production, achieving 18% higher harvest yield.',
            'Formulated precision fertility prescriptions and soil amendment plans based on grid soil sampling and satellite NDVI imagery.',
            'Executed Integrated Pest Management (IPM) protocols, reducing chemical pesticide application by 25% while mitigating pest pressure.',
            'Optimized automated drip irrigation schedules to conserve 15M gallons of groundwater annually.'
        ]
    },

    [DOMAINS.CORPORATE_SECRETARIAL]: {
        label: 'Corporate Governance & Secretarial Practice',
        keywords: ['company secretary', 'corporate secretary', 'cs', 'icsi', 'board secretary', 'compliance officer', 'corporate governance specialist', 'secretarial auditor'],
        skills: ['Board & Committee Meeting Management', 'Drafting Agendas, Minutes & Resolutions', 'Annual General Meeting (AGM) Execution', 'Companies Act & Statutory Filings', 'Secretarial Standards & Audit Compliance', 'Securities & Listing Regulations (SEBI/SEC)'],
        certifications: [
            { title: 'Associate Member (ACS) / Fellow Member (FCS)', issuer: 'Institute of Company Secretaries / Chartered Governance Institute', category: 'mandatory' },
            { title: 'Chartered Governance Professional (ACG / FCG)', issuer: 'Chartered Governance Institute', category: 'recommended' },
            { title: 'Certified Compliance & Ethics Professional (CCEP)', issuer: 'Compliance Certification Board', category: 'recommended' },
        ],
        actionVerbs: ['Convened', 'Drafted', 'Complied', 'Maintained', 'Advised', 'Recorded', 'Governed', 'Facilitated'],
        bullets: [
            'Orchestrated comprehensive board secretariat operations, convening 12 Board and Audit Committee meetings annually with flawless compliance.',
            'Drafted high-precision board resolutions, minutes, and explanatory statements for Annual General Meetings (AGM) attended by 2,000+ shareholders.',
            'Ensured 100% on-time submission of quarterly and annual statutory filings under Companies Act and Securities Regulations.',
            'Maintained statutory registers, supervised share transfer audits, and monitored compliance with insider trading codes.'
        ]
    },

    [DOMAINS.SUPPLY_CHAIN]: {
        label: 'Supply Chain, Logistics & Procurement',
        keywords: ['supply chain manager', 'logistics manager', 'procurement manager', 'supply chain analyst', 'materials manager', 'demand planner', 'freight manager', 'warehouse manager', 'inventory manager'],
        skills: ['Strategic Sourcing & Vendor Negotiation', 'Supplier Relationship Management (SRM)', 'Demand Forecasting & S&OP Integration', 'Inventory Optimization & Safety Stock (EOQ)', 'ERP Systems (SAP SCM, Oracle SCM)', 'Warehouse Management Systems (WMS)', 'Multi-Modal Freight & Customs'],
        certifications: [
            { title: 'Certified Supply Chain Professional (CSCP)', issuer: 'Association for Supply Chain Management (ASCM/APICS)', category: 'mandatory' },
            { title: 'Certified in Production and Inventory Management (CPIM)', issuer: 'APICS / ASCM', category: 'recommended' },
            { title: 'Certified Professional in Supply Management (CPSM)', issuer: 'Institute for Supply Management (ISM)', category: 'recommended' },
        ],
        actionVerbs: ['Procured', 'Optimized', 'Negotiated', 'Streamlined', 'Dispatched', 'Inventoried', 'Forecasted', 'Managed'],
        bullets: [
            'Directed end-to-end supply chain operations encompassing $85M annual procurement spend across 120 global tier-1 suppliers.',
            'Restructured demand planning and safety stock models, cutting inventory holding costs by 22% while boosting order fulfillment to 99.2%.',
            'Renegotiated ocean and multi-modal freight contracts, securing $3.2M annualized freight savings with guaranteed container space.',
            'Instituted vendor scorecard audits and risk mitigation frameworks, maintaining zero stockouts during global logistics disruptions.'
        ]
    },

    [DOMAINS.REAL_ESTATE]: {
        label: 'Real Estate & Property Management',
        keywords: ['real estate professional', 'realtor', 'real estate agent', 'property manager', 'real estate broker', 'leasing manager', 'commercial real estate advisor', 'real estate appraiser'],
        skills: ['Comparative Market Analysis (CMA)', 'Real Estate Contract Drafting & Negotiations', 'Buyer & Seller Client Representation', 'Escrow, Title & Closing Management', 'Lease Administration & Tenant Relations', 'Commercial Lease Structuring (Triple Net / Gross)'],
        certifications: [
            { title: 'Licensed Real Estate Broker / Salesperson', issuer: 'State Real Estate Commission / Licensing Board', category: 'mandatory' },
            { title: 'Certified Property Manager (CPM)', issuer: 'Institute of Real Estate Management (IREM)', category: 'recommended' },
            { title: 'Certified Commercial Investment Member (CCIM)', issuer: 'CCIM Institute', category: 'recommended' },
        ],
        actionVerbs: ['Negotiated', 'Appraised', 'Brokered', 'Marketed', 'Closed', 'Consulted', 'Valued', 'Managed'],
        bullets: [
            'Closed over $45M in commercial property sales and long-term lease transactions across retail, industrial, and office assets.',
            'Conducted rigorous Comparative Market Analyses (CMA) and discounted cash flow valuations for institutional real estate investors.',
            'Negotiated complex lease contracts, tenant improvement allowances, and escalation clauses protecting landlord asset yields.',
            'Managed marketing campaigns across commercial listing platforms, social media, and direct broker networks, maintaining 94% portfolio occupancy.'
        ]
    },

    [DOMAINS.CONSTRUCTION]: {
        label: 'Construction Management & Civil Infrastructure',
        keywords: ['construction manager', 'site manager', 'general contractor', 'construction superintendent', 'site engineer', 'project superintendent', 'building contractor', 'construction project manager'],
        skills: ['Subcontractor Coordination & Site Oversight', 'Critical Path Method (CPM) & Primavera P6', 'RFI & Submittal Log Management', 'Construction Cost Estimating & Takeoffs', 'OSHA Safety Compliance & Toolbox Talks', 'Building Code & Permit Compliance'],
        certifications: [
            { title: 'Certified Construction Manager (CCM)', issuer: 'Construction Management Association of America (CMAA)', category: 'mandatory' },
            { title: 'OSHA 30-Hour Construction Safety Certification', issuer: 'OSHA', category: 'mandatory' },
            { title: 'Project Management Professional (PMP)', issuer: 'Project Management Institute (PMI)', category: 'recommended' },
        ],
        actionVerbs: ['Constructed', 'Supervised', 'Estimated', 'Scheduled', 'Commissioned', 'Inspected', 'Managed', 'Contracted'],
        bullets: [
            'Directed on-site construction of multi-story commercial and residential developments valued up to $35M, delivering on budget.',
            'Enforced strict OSHA jobsite safety standards across 15+ trade subcontractors, achieving 500,000 lost-time injury-free work hours.',
            'Coordinated construction scheduling using Primavera P6, resolving field clashes and keeping project delivery within contractual milestones.',
            'Managed submittal reviews, RFIs, and architectural change orders, maintaining cost variances under 2% of contract sum.'
        ]
    },

    [DOMAINS.WRITING]: {
        label: 'Content Strategy, Copywriting & Technical Writing',
        keywords: ['content writer', 'copywriter', 'technical writer', 'content strategist', 'editorial writer', 'scriptwriter', 'speechwriter', 'medical writer'],
        skills: ['Long-Form Article & Feature Writing', 'Brand Storytelling & Tone of Voice', 'SEO Optimization & Keyword Integration', 'Conversion Copywriting (Landing Pages & Ads)', 'Copyediting & Proofreading (AP, Chicago)', 'Content Management Systems (WordPress)'],
        certifications: [
            { title: 'Certified Professional Technical Communicator (CPTC)', issuer: 'Society for Technical Communication (STC)', category: 'mandatory' },
            { title: 'HubSpot Content Marketing Certification', issuer: 'HubSpot Academy', category: 'recommended' },
        ],
        actionVerbs: ['Authored', 'Researched', 'Edited', 'Published', 'Optimized', 'Produced', 'Curated', 'Drafted'],
        bullets: [
            'Authored and published over 150 high-impact editorial articles, whitepapers, and brand case studies generating 2M+ organic views.',
            'Established comprehensive brand tone-of-voice and editorial style guide implemented across all company marketing materials.',
            'Optimized high-intent web landing pages and conversion copy, boosting on-page conversion rates from 3.1% to 5.4%.',
            'Conducted executive interviews and primary research to produce authoritative industry reports cited by major national publications.'
        ]
    },

    [DOMAINS.VISUAL_ARTS]: {
        label: 'Visual Arts, Painting & Fine Art',
        keywords: ['artist', 'fine artist', 'painter', 'sculptor', 'printmaker', 'ceramicist', 'muralist', 'contemporary artist', 'studio artist'],
        skills: ['Oil, Acrylic & Mixed Media Painting', 'Sculptural Fabrication & Material Crafting', 'Technical Drawing & Compositional Balance', 'Exhibition Curation & Gallery Installation', 'Bespoke Client Art Commissions', 'Public Art Installations & Grant Writing'],
        certifications: [
            { title: 'Resident Artist Fellowship Credential', issuer: 'National Arts Foundation', category: 'mandatory' },
            { title: 'National Arts Council Registered Artist', issuer: 'National Arts Council', category: 'recommended' },
        ],
        actionVerbs: ['Created', 'Exhibited', 'Curated', 'Painted', 'Sculpted', 'Commissioned', 'Rendered', 'Crafted'],
        bullets: [
            'Conceptualized, executed, and exhibited 6 major solo fine art collections featured in recognized contemporary galleries.',
            'Produced bespoke commissioned paintings and public sculptural installations for municipal and corporate collections.',
            'Collaborated with museum curators and gallerists to coordinate lighting, wall text, and spatial layout for high-attendance exhibitions.',
            'Maintained rigorous studio archival systems, provenance catalogs, and certified certificates of authenticity for all sold artworks.'
        ]
    },

    [DOMAINS.ACTING]: {
        label: 'Acting, Dramatic Arts & Performance',
        keywords: ['actor', 'actress', 'theatrical actor', 'screen actor', 'voice actor', 'stage performer', 'dramatic artist', 'improviser', 'thespian'],
        skills: ['Stanislavski / Meisner Acting Technique', 'Character Analysis & Scene Subtext Breakdown', 'Classical & Contemporary Script Interpretation', 'Voice Projection & Dialect Proficiency', 'Stage Combat & Movement Choreography', 'On-Camera Mark Discipline'],
        certifications: [
            { title: "Actors' Equity Association (AEA) / SAG-AFTRA Membership", issuer: 'Professional Actors Union', category: 'mandatory' },
            { title: 'British Equity Registered Artist', issuer: 'Equity UK', category: 'recommended' },
        ],
        actionVerbs: ['Performed', 'Portrayed', 'Rehearsed', 'Auditioned', 'Collaborated', 'Interpreted', 'Voiced', 'Executed'],
        bullets: [
            'Performed lead and supporting roles across 14 professional theatrical stage productions and festival feature films.',
            'Conducted in-depth script analysis and subtext interpretation to build emotionally authentic, complex character arcs.',
            'Collaborated with directors, playwrights, and ensemble casts to execute precise blocking and dynamic stage combat sequences.',
            'Recorded broadcast voiceover spots, commercial voiceovers, and animated character narration with broadcast sound engineering teams.'
        ]
    }
});

function extractTargetRoleFromJd(jdText) {
    if (!jdText || typeof jdText !== 'string') return '';
    const clean = jdText.slice(0, 600);
    const patterns = [
        /(?:seeking|hiring|looking for|needs?|recruiting|appointing)\s+(?:an?|our next)\s+([^,\.\n]{3,60}?)(?=\s+(?:to\b|who\b|responsible\b|reporting\b|with\b|in\b|at\b|[\.\n,;]))/i,
        /(?:position|role|job title|title)\s*[:\-]\s*([^,\.\n]{3,50})/i,
        /^#*\s*([A-Za-z0-9&/\-\s]{3,50}?)(?:\s+position|\s+opening|\s+role)/im
    ];
    for (const pat of patterns) {
        const match = clean.match(pat);
        if (match && match[1]) {
            const candidate = match[1].trim().replace(/\s+/g, ' ');
            if (candidate.length >= 3 && candidate.length <= 50 && !/^(candidate|individual|someone|professional|person|team member)$/i.test(candidate)) {
                return candidate;
            }
        }
    }
    return '';
}

const ANCHOR_TERMS = Object.freeze({
    [DOMAINS.DENTISTRY]: ['dentistry', 'dental', 'teeth', 'caries', 'oral', 'restorative', 'dentition', 'orthodont', 'hygienist', 'endodont'],
    [DOMAINS.MEDICINE]: ['clinical', 'patient', 'hospital', 'inpatient', 'rounds', 'treatment', 'outpatient', 'diagnosis', 'pathology', 'pharmacotherapy'],
    [DOMAINS.PHARMACY]: ['medication', 'drug', 'pharmacy', 'pharmacotherapy', 'dosage', 'prescription', 'dispensing', 'formulary', 'interaction', 'pharmacology'],
    [DOMAINS.NURSING]: ['nursing', 'patient', 'clinical', 'care', 'medication', 'icu', 'triage', 'vital signs', 'hospital', 'ward'],
    [DOMAINS.LAW]: ['legal', 'court', 'litigation', 'counsel', 'contract', 'compliance', 'statutory', 'arbitration', 'clause', 'jurisdiction'],
    [DOMAINS.JUDICIARY]: ['judicial', 'court', 'adjudication', 'ruling', 'jurisprudence', 'chambers', 'hearing', 'statutory', 'bench', 'magistrate'],
    [DOMAINS.EDUCATION]: ['students', 'curriculum', 'classroom', 'learning', 'pedagogy', 'academic', 'teaching', 'assessment', 'coursework', 'school'],
    [DOMAINS.HIGHER_EDUCATION]: ['university', 'research', 'faculty', 'students', 'peer-reviewed', 'pedagogy', 'academic', 'grants', 'dissertation', 'tenure'],
    [DOMAINS.ACCOUNTING]: ['accounting', 'audit', 'tax', 'financial ledger', 'gaap', 'statutory audit', 'reconciliation', 'financial reporting'],
    [DOMAINS.FINANCE]: ['finance', 'investment', 'valuation', 'dcf', 'equity', 'portfolio', 'financial modeling', 'treasury', 'banking', 'capital'],
    [DOMAINS.HUMAN_RESOURCES]: ['talent', 'recruitment', 'hrbp', 'employee', 'onboarding', 'payroll', 'retention', 'performance management', 'people operations', 'labor law'],
    [DOMAINS.SALES]: ['sales', 'quota', 'revenue', 'pipeline', 'clients', 'crm', 'deals', 'accounts', 'prospecting', 'negotiation'],
    [DOMAINS.MARKETING]: ['marketing', 'campaign', 'brand', 'seo', 'growth', 'social media', 'traffic', 'conversion', 'audience', 'content'],
    [DOMAINS.GRAPHIC_DESIGN]: ['graphic design', 'visual identity', 'branding', 'typography', 'prototype', 'ui/ux', 'editorial layout', 'motion graphics'],
    [DOMAINS.ARCHITECTURE]: ['architecture', 'building', 'design', 'revit', 'bim', 'spatial', 'construction', 'structural', 'leed', 'urban'],
    [DOMAINS.CIVIL_ENGINEERING]: ['civil', 'structural', 'construction', 'concrete', 'site', 'infrastructure', 'staad.pro', 'survey', 'boq', 'geotechnical'],
    [DOMAINS.MECHANICAL_ENGINEERING]: ['mechanical', 'cad', 'solidworks', 'fea', 'thermal', 'manufacturing', 'ansys', 'hvac', 'tolerance', 'fabrication'],
    [DOMAINS.ELECTRICAL_ENGINEERING]: ['electrical', 'circuit', 'power', 'voltage', 'scada', 'pcb', 'schematic', 'plc', 'switchgear', 'substation'],
    [DOMAINS.SCIENTIFIC_RESEARCH]: ['scientist', 'experimental', 'laboratory', 'research', 'scientific', 'assay', 'peer-reviewed', 'hypothesis', 'spectroscopy', 'data analysis'],
    [DOMAINS.HOSPITALITY]: ['culinary', 'chef', 'kitchen', 'restaurant', 'food safety', 'f&b', 'menu', 'banquet', 'catering', 'haccp'],
    [DOMAINS.HOTEL_MANAGEMENT]: ['hotel', 'hospitality', 'guest', 'lodging', 'resort', 'front office', 'revpar', 'occupancy', 'housekeeping', 'amenities'],
    [DOMAINS.AVIATION]: ['pilot', 'flight', 'aircraft', 'aviation', 'cockpit', 'navigation', 'atpl', 'instrument', 'faa', 'crew resource management'],
    [DOMAINS.JOURNALISM]: ['journalism', 'news', 'reporting', 'investigative', 'editorial', 'article', 'press', 'interviews', 'fact-checking', 'publication'],
    [DOMAINS.GOVERNMENT]: ['public', 'government', 'policy', 'administration', 'statutory', 'scheme', 'citizen', 'welfare', 'inter-agency', 'budgeting'],
    [DOMAINS.PUBLIC_SAFETY]: ['police', 'investigation', 'patrol', 'law enforcement', 'evidence', 'crime scene', 'arrest', 'safety', 'courtroom testimony', 'de-escalation'],
    [DOMAINS.DEFENSE]: ['military', 'defense', 'command', 'tactical', 'operations', 'mission', 'personnel', 'readiness', 'logistics', 'security clearance'],
    [DOMAINS.NON_PROFIT]: ['ngo', 'non-profit', 'community', 'humanitarian', 'grants', 'donor', 'fundraising', 'advocacy', 'volunteers', 'development'],
    [DOMAINS.PERFORMING_ARTS]: ['music', 'performance', 'orchestra', 'repertoire', 'concert', 'composition', 'audio', 'sound', 'ensemble', 'instrumental'],
    [DOMAINS.SPORTS]: ['athlete', 'training', 'sports', 'fitness', 'conditioning', 'competition', 'strength', 'kinesiology', 'injury prevention', 'championship'],
    [DOMAINS.PHOTOGRAPHY]: ['photography', 'camera', 'lighting', 'lens', 'retouching', 'studio', 'portrait', 'commercial', 'shutter', 'visual'],
    [DOMAINS.SKILLED_TRADES]: ['trades', 'fabrication', 'installation', 'wiring', 'welding', 'machining', 'blueprints', 'troubleshooting', 'repairs', 'code compliance'],
    [DOMAINS.SOFTWARE_ENGINEERING]: ['software', 'code', 'system', 'api', 'architecture', 'cloud', 'database', 'developer', 'microservices', 'git'],
    [DOMAINS.DATA_SCIENCE]: ['data science', 'machine learning', 'statistical', 'models', 'algorithms', 'pytorch', 'tensorflow', 'predictive', 'analytics', 'dataset'],
    [DOMAINS.GENERAL_BUSINESS]: ['business operations', 'project management', 'business process', 'operational excellence', 'stakeholder management', 'business strategy'],
    [DOMAINS.INTERIOR_DESIGN]: ['interior design', 'spatial', 'autocad', 'sketchup', 'materials', 'finishes', 'lighting', 'renovation', 'furnishings'],
    [DOMAINS.PHYSIOTHERAPY]: ['physiotherapy', 'rehabilitation', 'musculoskeletal', 'manual therapy', 'gait', 'posture', 'therapeutic', 'exercise', 'mobility'],
    [DOMAINS.PSYCHOLOGY]: ['psychology', 'behavioral', 'counseling', 'psychotherapy', 'mental health', 'cbt', 'assessment', 'dsm', 'psychological'],
    [DOMAINS.VETERINARY]: ['veterinary', 'animal health', 'surgery', 'vaccination', 'zoonotic', 'triage', 'radiography', 'pharmacology', 'anesthesia'],
    [DOMAINS.AGRICULTURE]: ['agriculture', 'agronomy', 'crop', 'soil', 'irrigation', 'yield', 'harvest', 'pest management', 'precision agriculture'],
    [DOMAINS.CORPORATE_SECRETARIAL]: ['company secretary', 'corporate governance', 'board of directors', 'agm', 'statutory filing', 'secretarial audit', 'minutes', 'resolutions'],
    [DOMAINS.SUPPLY_CHAIN]: ['supply chain', 'logistics', 'procurement', 'inventory', 'warehouse', 'freight', 'vendor', 'demand planning', 'distribution'],
    [DOMAINS.REAL_ESTATE]: ['real estate', 'property', 'leasing', 'tenant', 'broker', 'valuation', 'listing', 'mortgage', 'deed'],
    [DOMAINS.CONSTRUCTION]: ['construction', 'site', 'contractor', 'subcontractor', 'osha', 'safety', 'building', 'superintendent', 'estimation'],
    [DOMAINS.WRITING]: ['writing', 'content', 'copywriting', 'editorial', 'article', 'proofreading', 'copy', 'storytelling', 'narrative'],
    [DOMAINS.VISUAL_ARTS]: ['artist', 'fine art', 'painting', 'sculpture', 'gallery', 'exhibition', 'studio', 'curator', 'canvas'],
    [DOMAINS.ACTING]: ['acting', 'actor', 'theatre', 'stage', 'rehearsal', 'script', 'audition', 'performance', 'screen'],
});

function detectCandidateDomain(resumeData = {}, targetJd = '') {
    const rawTokens = [
        resumeData.occupation,
        resumeData.title,
        resumeData.targetTitle,
        ...(Array.isArray(resumeData.employments) ? resumeData.employments.map(e => `${e?.jobTitle || ''} ${e?.description || ''} ${e?.employer || ''}`) : []),
        ...(Array.isArray(resumeData.educations) ? resumeData.educations.map(e => `${e?.degree || ''} ${e?.school || ''}`) : []),
        ...(Array.isArray(resumeData.skills) ? resumeData.skills.map(s => (typeof s === 'string' ? s : s?.name || s?.skillName || '')) : []),
        ...(Array.isArray(resumeData.certifications) ? resumeData.certifications.map(c => `${c?.title || ''} ${c?.issuer || ''}`) : []),
        resumeData.summary,
    ].filter(Boolean).join(' ');

    const candidateClean = cleanText(rawTokens);
    const jdClean = cleanText(targetJd || '');
    const combinedClean = `${candidateClean} ${jdClean}`.trim();

    if (!combinedClean || combinedClean.length < 2) {
        return DOMAINS.UNSPECIFIED;
    }

    let bestDomain = DOMAINS.UNSPECIFIED;
    let maxScore = 0;

    let targetTitleClean = cleanText(resumeData.occupation || resumeData.title || resumeData.targetTitle || '');
    const isGenericTitle = /^(operations professional|consultant|manager|director|specialist|professional|team lead|coordinator|associate|analyst)$/i.test(targetTitleClean);
    const jdExtractedTitle = extractTargetRoleFromJd(targetJd);
    if ((!targetTitleClean || isGenericTitle) && jdExtractedTitle) {
        targetTitleClean = cleanText(jdExtractedTitle);
    }

    for (const [domainId, config] of Object.entries(DOMAIN_DATA)) {
        if (domainId === DOMAINS.GENERAL_BUSINESS || domainId === DOMAINS.UNSPECIFIED) continue;
        let score = 0;

        for (const kw of config.keywords) {
            const cleanKw = cleanText(kw);
            if (!cleanKw) continue;
            const regex = new RegExp(`\\b${cleanKw}\\b`, 'i');

            if (targetTitleClean && regex.test(targetTitleClean)) {
                score += (cleanKw.length <= 3 ? 24 : 36);
            } else if (candidateClean && regex.test(candidateClean)) {
                score += 6;
            }

            if (jdClean && regex.test(jdClean)) {
                score += (targetTitleClean && !isGenericTitle) ? 10 : 22;
            }
        }

        const anchorList = ANCHOR_TERMS[domainId] || config.anchorTerms;
        if (Array.isArray(anchorList)) {
            for (const anchor of anchorList) {
                const cleanAnchor = cleanText(anchor);
                if (!cleanAnchor) continue;
                const regex = new RegExp(`\\b${cleanAnchor}\\b`, 'gi');
                const candMatches = candidateClean.match(regex);
                if (candMatches) score += Math.min(10, candMatches.length * 2);

                const jdMatches = jdClean.match(regex);
                if (jdMatches) score += Math.min(14, jdMatches.length * ((targetTitleClean && !isGenericTitle) ? 2 : 5));
            }
        }

        const minThreshold = (targetTitleClean && !isGenericTitle) ? 16 : 6;
        if (score > maxScore && score >= minThreshold) {
            maxScore = score;
            bestDomain = domainId;
        }
    }

    return bestDomain;
}

function detectDomainFromText(text = '') {
    const clean = cleanText(text);
    if (!clean) return DOMAINS.UNSPECIFIED;

    let bestDomain = DOMAINS.UNSPECIFIED;
    let maxScore = 0;

    for (const [domainId, config] of Object.entries(DOMAIN_DATA)) {
        if (domainId === DOMAINS.GENERAL_BUSINESS || domainId === DOMAINS.UNSPECIFIED) continue;
        let score = 0;

        for (const kw of config.keywords) {
            const cleanKw = cleanText(kw);
            if (!cleanKw) continue;
            const regex = new RegExp(`\\b${cleanKw}\\b`, 'i');
            if (regex.test(clean)) {
                score += (cleanKw.length <= 3 ? 15 : 20);
            }
        }

        if (score > maxScore && score >= 5) {
            maxScore = score;
            bestDomain = domainId;
        }
    }

    return bestDomain;
}

/**
 * Universal Open-Role Synthesizer (Backend Parity).
 * Dynamically derives domain intelligence, functional archetypes, action verbs,
 * competencies, credential patterns, and starter blueprints for ANY role, discipline,
 * or future profession without hardcoded taxonomy limits.
 */
function synthesizeUniversalRoleData(targetTitle = '', resumeData = {}, targetJd = '') {
    const data = (resumeData && typeof resumeData === 'object') ? resumeData : {};
    const titleClean = String(targetTitle || data.occupation || data.title || data.targetTitle || '').trim();
    const jdClean = String(targetJd || '').trim();
    const region = detectGeographicRegion(data);

    // Filter out generic structural words to isolate the core discipline
    const structuralWords = new Set([
        'senior', 'lead', 'head', 'of', 'director', 'manager', 'coordinator', 'specialist',
        'associate', 'officer', 'executive', 'consultant', 'advisor', 'analyst', 'technician',
        'practitioner', 'principal', 'chief', 'assistant', 'junior', 'expert', 'strategist',
        'planner', 'representative', 'administrator', 'supervisor', 'fellow', 'intern', 'vice', 'president',
        'researcher'
    ]);

    const words = titleClean.split(/[\s/-]+/).filter(Boolean);
    const disciplineWords = words.filter(w => !structuralWords.has(w.toLowerCase()));
    const discipline = disciplineWords.join(' ') || titleClean || 'Specialized Practice';
    const primaryTerm = disciplineWords[0] || discipline;

    // Detect functional archetype from title & JD tokens
    const combinedTokens = `${titleClean} ${jdClean} ${data.summary || ''}`.toLowerCase();

    let archetype = 'GENERAL_SPECIALIST';
    let actionVerbs = ['Delivered', 'Managed', 'Coordinated', 'Spearheaded', 'Standardized', 'Executed', 'Optimized', 'Facilitated'];
    let archetypeSkills = [
        `${discipline} Standards & Methods`,
        'Quality Assurance & Workflow Integrity',
        'Process Optimization & Continuous Improvement',
        'Risk Management & Hazard Assessment',
        'Stakeholder Consultation & Technical Reporting',
        'Operational Documentation & SOPs'
    ];
    let credentialCategory = 'Professional Practice';

    if (/\b(heritage|conservation|museum|preservation|archival|restoration)\b/i.test(combinedTokens)) {
        archetype = 'HERITAGE_CONSERVATION';
        actionVerbs = ['Preserved', 'Conserved', 'Restored', 'Curated', 'Documented', 'Cataloged', 'Assessed', 'Directed', 'Protected', 'Researched'];
        archetypeSkills = [
            `${discipline} & Preservation Protocols`,
            'Material Degradation Assessment & Preventive Care',
            'Archival Cataloging & Historical Documentation',
            'Non-Destructive Diagnostic Imaging & Analysis',
            'Museum & Heritage Asset Stewardship Standards',
            'Collection Management & Climate Control Monitoring',
            'Cultural Resource Management & Regulatory Codes',
            'Interdisciplinary Research & Exhibition Consultation'
        ];
        credentialCategory = 'Heritage Conservation & Cultural Stewardship';
    } else if (/\b(festival|event|cultural|entertainment|hospitality management|conference|curation|exhibition)\b/i.test(combinedTokens)) {
        archetype = 'EVENT_CULTURAL_OPERATIONS';
        actionVerbs = ['Orchestrated', 'Directed', 'Coordinated', 'Programmed', 'Produced', 'Curated', 'Mobilized', 'Supervised', 'Managed', 'Executed'];
        archetypeSkills = [
            `${discipline} & Event Operations`,
            'Large-Scale Production & Venue Logistics',
            'Artist, Performer & Stakeholder Management',
            'Crowd Safety, Permitting & Security Protocols',
            'Vendor Procurement & Contract Negotiation',
            'Cross-Functional Staff & Volunteer Leadership',
            'Budget Management & Fiscal Stewardship',
            'Audience Experience & Community Engagement'
        ];
        credentialCategory = 'Event Production & Arts Administration';
    } else if (/\b(compliance|regulatory|audit|standards|inspection|qa|qc|inspector|governance)\b/i.test(combinedTokens)) {
        archetype = 'COMPLIANCE_QUALITY';
        actionVerbs = ['Audited', 'Inspected', 'Standardized', 'Verified', 'Enforced', 'Calibrated', 'Evaluated', 'Certified', 'Monitored', 'Documented'];
        archetypeSkills = [
            `${discipline} Standards & Regulations`,
            'Standard Operating Procedures (SOPs)',
            'Quality Assurance & Audit Preparedness',
            'Risk Assessment & Hazard Mitigation',
            'Inspection & Verification Protocols',
            'Corrective & Preventive Actions (CAPA)',
            'Compliance Documentation & Reporting',
            'Internal & External Audit Coordination'
        ];
        credentialCategory = 'Regulatory Compliance & Standards';
    } else if (/\b(logistics|supply chain|habitat|cargo|freight|inventory|dispatch|warehouse|transport|procurement|shipping)\b/i.test(combinedTokens)) {
        archetype = 'LOGISTICS_OPERATIONS';
        actionVerbs = ['Coordinated', 'Dispatched', 'Streamlined', 'Routed', 'Inventoried', 'Procured', 'Optimized', 'Mobilized', 'Tracked', 'Standardized'];
        archetypeSkills = [
            `${discipline} Planning & Scheduling`,
            'Critical Resource Allocation & Distribution',
            'Inventory Manifesting & Verification',
            'Emergency Supply & Fulfillment Protocols',
            'Supply Chain Risk Mitigation & Resilience',
            'Standard Operating Procedures (SOPs)',
            'Multi-Modal Routing & Fleet Coordination',
            'Operational Quality & Turnaround Gains'
        ];
        credentialCategory = 'Logistics & Operational Systems';
    } else if (/\b(policy|advisor|advisory|advocacy|strategy|strategist|strategic|resilience|sustainability|diplomacy|relations|public policy)\b/i.test(combinedTokens)) {
        archetype = 'POLICY_STRATEGY';
        actionVerbs = ['Advised', 'Formulated', 'Drafted', 'Synthesized', 'Facilitated', 'Advocated', 'Briefed', 'Consulted', 'Negotiated', 'Authored'];
        archetypeSkills = [
            `${discipline} Policy Formulation`,
            'Regulatory Impact Assessment & Modeling',
            'Stakeholder Consultations & Executive Briefings',
            'Cross-Institutional Negotiations & Partnerships',
            'Strategic Policy Framework Harmonization',
            'Thought Leadership, Whitepapers & Legislative Analysis',
            'Public Sector Advocacy & Consensus Building',
            'Strategic Governance & Policy Roadmaps'
        ];
        credentialCategory = 'Policy & Strategic Governance';
    } else if (/\b(research|researcher|materials|quantum|scientist|laboratory|experimental|physics|chemistry|biology|nanotechnology|synthetic biology)\b/i.test(combinedTokens)) {
        archetype = 'SCIENTIFIC_RESEARCH';
        actionVerbs = ['Investigated', 'Synthesized', 'Characterized', 'Published', 'Formulated', 'Modeled', 'Experimented', 'Hypothesized', 'Discovered', 'Analyzed'];
        archetypeSkills = [
            `${discipline} Experimental Design`,
            'Advanced Characterization & Diagnostics',
            'Data Modeling & Statistical Analysis',
            'Peer-Reviewed Scientific Publishing',
            'Laboratory Safety & Protocol Adherence',
            'Cross-Disciplinary Research Collaboration',
            'Hypothesis Testing & Empirical Validation',
            'Grant Writing & Research Proposals'
        ];
        credentialCategory = 'Scientific Research & Development';
    } else if (/\b(retail|luxury|merchandising|boutique|store|customer experience|clienteling|fashion|guest experience)\b/i.test(combinedTokens)) {
        archetype = 'COMMERCIAL_EXPERIENCE';
        actionVerbs = ['Curated', 'Elevated', 'Merchandised', 'Drove', 'Orchestrated', 'Acquired', 'Retained', 'Expanded', 'Negotiated', 'Standardized'];
        archetypeSkills = [
            `${discipline} Curation & Presentation`,
            'High-Touch VIP Clienteling & Retention',
            'Visual Merchandising & Store Brand Standards',
            'Revenue & Commercial Performance Maximization',
            'Omnichannel Customer Journey Optimization',
            'Inventory Optimization & Presentation Quality',
            'Client Relationship Management & Consultations',
            'Service Excellence & Brand Governance'
        ];
        credentialCategory = 'Commercial Leadership & Brand Experience';
    } else if (/\b(clinical|trial|patient|medical|therapy|healthcare|hospital|rehabilitation|clinical operations|health system)\b/i.test(combinedTokens)) {
        archetype = 'CLINICAL_OPERATIONS';
        actionVerbs = ['Administered', 'Coordinated', 'Triaged', 'Treated', 'Monitored', 'Standardized', 'Evaluated', 'Delivered', 'Documented', 'Audited'];
        archetypeSkills = [
            `${discipline} Protocol Execution`,
            'Good Clinical Practice (GCP) & Ethical Oversight',
            'Patient Safety & Clinical Quality Assurance',
            'Adverse Event Tracking & Documentation',
            'Trial Master File (TMF) Administration',
            'Investigator Site Monitoring & Coordination',
            'Cross-Functional Clinical Care Coordination',
            'Regulatory Submission & Institutional Review'
        ];
        credentialCategory = 'Clinical Practice & Healthcare Operations';
    } else if (/\b(agriculture|agricultural|agronomy|crop|soil|environmental|ecology|deep-sea|ocean|forestry)\b/i.test(combinedTokens)) {
        archetype = 'ENVIRONMENTAL_AGRICULTURAL';
        actionVerbs = ['Surveyed', 'Sampled', 'Cultivated', 'Monitored', 'Assessed', 'Mapped', 'Restored', 'Preserved', 'Analyzed', 'Remediated'];
        archetypeSkills = [
            `${discipline} Assessment & Modeling`,
            'Ecological / Environmental Field Sampling & Diagnostics',
            'Sustainable Practice & Conservation Standards',
            'Resource Stewardship & Impact Evaluation',
            'Regulatory Compliance & Environmental Permitting',
            'Field Data Collection & GIS Mapping',
            'Stakeholder Consultation & Technical Reporting',
            'Continuous Environmental Monitoring & Remediation'
        ];
        credentialCategory = 'Environmental & Natural Systems Practice';
    } else if (/\b(engineer|robotics|mechanical|electrical|civil|systems|automation|hardware|autonomous|manufacturing|fabrication|machining)\b/i.test(combinedTokens)) {
        archetype = 'ENGINEERING_SYSTEMS';
        actionVerbs = ['Engineered', 'Designed', 'Simulated', 'Optimized', 'Fabricated', 'Calibrated', 'Standardized', 'Tested', 'Integrated', 'Commissioned'];
        archetypeSkills = [
            `${discipline} Systems Engineering`,
            'Technical Specifications & Schematic Review',
            'Performance Optimization & Simulation',
            'Testing, Calibration & Empirical Verification',
            'Failure Mode & Root Cause Analysis (RCFA)',
            'Regulatory & Engineering Safety Code Compliance'
        ];
        credentialCategory = 'Engineering Systems & Technical Practice';
    } else if (/\b(design|creative|art|spatial|visual|studio|craft)\b/i.test(combinedTokens)) {
        archetype = 'CREATIVE_DESIGN';
        actionVerbs = ['Conceptualized', 'Designed', 'Curated', 'Drafted', 'Rendered', 'Crafted', 'Styled', 'Commissioned', 'Directed', 'Elevated'];
        archetypeSkills = [
            `${discipline} Concept Development`,
            'Spatial & Visual Composition',
            'Material & Finish Specification',
            'Client Consultation & Concept Presentations',
            'Project Scope, Timeline & Budget Oversight',
            'Quality Craftsmanship & Aesthetics Standards'
        ];
        credentialCategory = 'Creative Design & Professional Practice';
    }

    const starterBlueprints = {
        workHistory: [
            {
                jobTitle: `${titleClean || 'Specialist Lead'}`,
                employer: `${discipline} Operations / Enterprise Practice`,
                city: data.city || 'Regional Center',
                description: `<ul><li>Directed core ${discipline.toLowerCase()} initiatives, maintaining zero defect tolerance and 100% schedule compliance.</li><li>Formulated and standardized standard operating procedures (SOPs) across dedicated project workflows.</li><li>Collaborated with cross-functional stakeholders and regulatory partners to achieve optimal operational benchmarks.</li><li>Monitored quality metrics and instituted continuous improvement programs delivering measurable efficiency gains.</li></ul>`
            }
        ],
        education: [
            {
                degree: `Accredited Degree / Professional Credential in ${discipline} or Related Discipline`,
                school: region === 'IN' ? 'Accredited State University / National Institute' : (region === 'UK' ? 'Accredited University / Institute' : (region === 'US' ? 'Accredited University / College' : 'National University / Institute')),
                city: data.city || 'Metropolitan Center'
            }
        ],
        projects: [
            {
                title: `${discipline} Modernization & Standards Initiative`,
                description: `Spearheaded organization-wide initiative to review and modernize operating practices, delivering 25% efficiency improvements.`
            }
        ],
        certifications: [
            {
                title: `Professional Practice Credential / License in ${discipline}`,
                issuer: `National Council / Institute of ${discipline}`,
                category: 'mandatory'
            }
        ],
        skills: [
            {
                category: `${discipline} Core Competencies`,
                skills: archetypeSkills
            },
            {
                category: 'Quality & Process Standards',
                skills: ['Quality Assurance Standards', 'Standard Operating Procedures (SOPs)', 'Risk Assessment & Mitigation', 'Operational Documentation']
            }
        ],
        achievements: [
            {
                title: 'Excellence in Professional Service Award',
                description: `Recognized by leadership for exemplary technical leadership and process innovation in ${discipline.toLowerCase()} deliverables.`
            }
        ]
    };

    const domainData = {
        schools: [
            region === 'IN' ? 'Accredited State University / National Institute' : (region === 'UK' ? 'Accredited University / Royal College' : (region === 'US' ? 'Accredited University / College' : (region === 'AU' ? 'Accredited University / Institute of Technology' : 'National University / Institute'))),
            'Metropolitan University',
            'College of Professional Studies',
            'State Technical Institute'
        ],
        degrees: [
            `Bachelor's Degree in ${discipline} or Related Field`,
            `Master's Degree in ${discipline}`,
            `Professional Diploma / Postgraduate Certificate in ${discipline}`,
            "Doctorate / Advanced Research Credential"
        ],
        issuers: [
            { title: `State / National Professional Practice License in ${discipline}`, issuer: `National ${discipline} Standards Council` },
            { title: `Certified Specialist in ${discipline}`, issuer: `International Association of ${discipline}` }
        ],
        skills: archetypeSkills
    };

    return {
        discipline,
        primaryTerm,
        archetype,
        actionVerbs,
        starterBlueprints,
        domainData,
        credentialCategory
    };
}

function getCandidateContext(resumeData = {}, targetJd = '') {
    const data = (resumeData && typeof resumeData === 'object') ? resumeData : {};
    const domainId = detectCandidateDomain(data, targetJd);
    const domainConfig = DOMAIN_DATA[domainId] || null;

    let targetTitle = String(data.occupation || data.title || data.targetTitle || '').trim();
    const isGeneric = /^(operations professional|consultant|manager|director|specialist|professional|team lead|coordinator|associate|analyst)$/i.test(targetTitle);
    const jdTargetRole = extractTargetRoleFromJd(targetJd);
    if ((!targetTitle || isGeneric) && jdTargetRole) {
        targetTitle = jdTargetRole;
    }
    const currentTitle = data.employments?.[0]?.jobTitle ? String(data.employments[0].jobTitle).trim() : targetTitle;
    const isUnknownRole = domainId === DOMAINS.UNSPECIFIED && !targetTitle;
    const isNicheRole = domainId === DOMAINS.UNSPECIFIED && Boolean(targetTitle);

    const profession = targetTitle || currentTitle || (domainConfig ? domainConfig.label : 'Specialist');
    const region = detectGeographicRegion(data);

    let specialization = '';
    let actionVerbs = [];
    let domainData = null;

    if (domainConfig) {
        specialization = domainConfig.label.split('&')[0].trim();
        actionVerbs = domainConfig.actionVerbs;
        domainData = domainConfig;
    } else if (isNicheRole) {
        const synthesized = synthesizeUniversalRoleData(targetTitle, data, targetJd);
        specialization = synthesized.discipline;
        actionVerbs = synthesized.actionVerbs;
        domainData = {
            label: synthesized.discipline,
            skills: synthesized.domainData.skills,
            certifications: synthesized.domainData.issuers,
            bullets: synthesized.starterBlueprints.workHistory.map(w => w.description.replace(/<[^>]*>/g, ''))
        };
    } else {
        specialization = 'Professional Practice';
        actionVerbs = ['Delivered', 'Managed', 'Coordinated', 'Spearheaded', 'Streamlined', 'Executed', 'Standardized', 'Optimized'];
        domainData = {
            label: 'General Professional',
            skills: ['Strategic Planning', 'Operational Management', 'Quality Assurance', 'Process Optimization', 'Stakeholder Communication'],
            certifications: [{ title: 'Professional Practice License', issuer: 'National Licensing Board' }],
            bullets: [
                'Directed core specialized operations and project deliverables, improving operational efficiency by 25%.',
                'Managed stakeholder communications, project budgets, and key operational milestones with executive leadership.',
                'Implemented standardized quality assurance procedures, achieving 100% on-time milestone delivery.'
            ]
        };
    }

    return {
        domain: domainId,
        domainLabel: domainConfig ? domainConfig.label : (isNicheRole ? targetTitle : 'General Professional'),
        isDomainInferred: domainId !== DOMAINS.UNSPECIFIED,
        isUnknownRole,
        isNicheRole,
        profession,
        currentTitle,
        targetTitle,
        industry: domainConfig ? domainConfig.label : (isNicheRole ? specialization : 'Cross-Industry'),
        specialization,
        geography: { region, city: data.city || '', country: data.country || '' },
        actionVerbs,
        domainData
    };
}

function getDomainData(domainId, role = '', context = {}) {
    if (domainId && DOMAIN_DATA[domainId]) return DOMAIN_DATA[domainId];
    const candidateRole = role || context?.profession || context?.targetTitle || context?.occupation || '';
    if (candidateRole) {
        const synthesized = synthesizeUniversalRoleData(candidateRole, context, context?.targetJd || '');
        return {
            label: synthesized.discipline,
            skills: synthesized.domainData.skills,
            certifications: synthesized.domainData.issuers,
            bullets: synthesized.starterBlueprints.workHistory.map(w => w.description.replace(/<[^>]*>/g, ''))
        };
    }
    return {
        label: 'Cross-Industry Professional',
        skills: ['Strategic Planning', 'Operational Management', 'Regulatory Compliance', 'Quality Assurance', 'Client & Stakeholder Management', 'Risk Management'],
        certifications: [
            { title: 'Professional Practice Credential / State License', issuer: 'National Licensing Board' },
            { title: 'Project Management & Operational Excellence Certification', issuer: 'Accredited Certification Institute' }
        ],
        bullets: [
            'Directed core specialized operations and project deliverables, improving departmental efficiency by 25%.',
            'Managed stakeholder communications, project budgets, and key operational milestones with executive leadership.',
            'Implemented standardized quality assurance procedures, achieving 100% on-time milestone delivery.'
        ]
    };
}

module.exports = {
    DOMAINS,
    DOMAIN_DATA,
    detectGeographicRegion,
    detectCandidateDomain,
    detectDomainFromText,
    synthesizeUniversalRoleData,
    getCandidateContext,
    getDomainData,
};
