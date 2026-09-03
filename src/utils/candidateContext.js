/**
 * Universal Candidate Context Engine — Frontend Utility
 * ResumePilot AI
 *
 * Open, data-driven candidate context model. Provides continuous domain inference,
 * geographic awareness (US/UK/IN/CA/AU/EU/Global), role-tailored taxonomy mappings,
 * starter blueprints, and universal ATS diagnostics for ANY job, ANY role, ANY industry,
 * ANY country, and ANY career stage.
 *
 * Unknown and niche roles are treated as first-class valid production states.
 * ZERO hardcoded IT defaults. ZERO cross-industry contamination.
 */

export const DOMAINS = Object.freeze({
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

/**
 * Detects regional geographic context from candidate profile.
 */
export function detectGeographicRegion(resumeData = {}) {
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

/**
 * Comprehensive open domain registry for 32+ global industry clusters.
 */
export const DOMAIN_REGISTRY = Object.freeze({
    [DOMAINS.DENTISTRY]: {
        id: DOMAINS.DENTISTRY,
        label: 'Dentistry & Oral Healthcare',
        keywords: ['dentist', 'dental', 'orthodont', 'periodont', 'endodont', 'prosthodont', 'bds', 'mds', 'dds', 'dmd', 'teeth', 'oral surgery', 'caries', 'dentition', 'hygienist', 'implantology'],
        actionVerbs: ['Diagnosed', 'Treated', 'Administered', 'Performed', 'Rehabilitated', 'Prescribed', 'Restored', 'Monitored', 'Extracted', 'Educated'],
        anchorTerms: ['dental', 'teeth', 'patient', 'clinical', 'oral', 'treatment', 'surgery', 'restorative', 'dentistry', 'hygiene'],
        commonDegrees: ['Doctor of Dental Surgery (DDS)', 'Doctor of Medicine in Dentistry (DMD)', 'Bachelor of Dental Surgery (BDS)', 'Master of Dental Surgery (MDS)'],
        commonCertifications: ['State Dental Board Practice License', 'Invisalign Certified Provider', 'Fellowship in Oral Implantology', 'BLS / CPR Certification'],
        skillCategories: [
            { category: 'Clinical Competencies', skills: ['Oral Surgery', 'Endodontics', 'Restorative Dentistry', 'Dental Radiography', 'Periodontics', 'Local Anesthesia'] },
            { category: 'Patient & Operatory', skills: ['Treatment Planning', 'Patient Counseling', 'Infection Control', 'Sterilization Protocols', 'Digital Scanning'] },
            { category: 'Practice & Compliance', skills: ['Dental EMR / Dentrix', 'HIPAA & OSHA Compliance', 'Clinical Auditing', 'Interdisciplinary Referral'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Associate General Dentist',
                    employer: 'Metro Health Dental Clinic / Regional Practice',
                    city: 'Regional Center',
                    description: '<ul><li>Delivered comprehensive preventive, restorative, and surgical dental procedures to 25+ patients daily with a 99% satisfaction rating.</li><li>Performed root canal treatments, aesthetic crown preparations, and extractions adhering strictly to aseptic protocols.</li><li>Integrated digital intraoral scanners and 3D radiographic workflows, reducing treatment turnaround times by 30%.</li><li>Educated pediatric and adult patients on preventive oral hygiene, caries risk management, and periodontal health.</li></ul>'
                }
            ],
            education: [
                { degree: 'Doctor of Dental Surgery (DDS) / BDS', school: 'Accredited School of Dental Medicine', city: 'Metropolitan Campus' }
            ],
            projects: [
                { title: 'Community Rural Oral Health Outreach Program', description: 'Screened and provided preventive dental care to 1,200+ schoolchildren, reducing early childhood caries incidence.' }
            ],
            certifications: [
                { title: 'State Dental Practice License', issuer: 'State Dental Board / National Dental Council', category: 'mandatory' },
                { title: 'Basic Life Support (BLS) for Healthcare Providers', issuer: 'American Heart Association / Red Cross', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Clinical Excellence Award', description: 'Recognized for achieving 100% patient recovery benchmark across 500+ consecutive complex aesthetic restorations.' }
            ]
        }
    },

    [DOMAINS.MEDICINE]: {
        id: DOMAINS.MEDICINE,
        label: 'Medicine & Clinical Healthcare',
        keywords: ['doctor', 'physician', 'surgeon', 'cardiologist', 'oncologist', 'pediatrician', 'internist', 'mbbs', 'md', 'medical residency', 'clinical physician', 'hospitalist', 'general physician', 'internal medicine', 'pathology', 'radiology', 'dnb', 'medical fellowship'],
        actionVerbs: ['Diagnosed', 'Treated', 'Evaluated', 'Prescribed', 'Managed', 'Stabilized', 'Monitored', 'Coordinated', 'Intervened', 'Counseled'],
        anchorTerms: ['patient', 'clinical', 'diagnosis', 'hospital', 'medical', 'treatment', 'inpatient', 'rounds', 'pathology', 'pharmacotherapy'],
        commonDegrees: ['Doctor of Medicine (MD)', 'Bachelor of Medicine, Bachelor of Surgery (MBBS)', 'Master of Surgery (MS)', 'Diplomate of National Board (DNB)'],
        commonCertifications: ['State Medical Board License / Council Registration', 'Advanced Cardiovascular Life Support (ACLS)', 'Board Certification in Specialty', 'BLS Certification'],
        skillCategories: [
            { category: 'Diagnostic & Clinical Care', skills: ['Clinical Diagnosis', 'Patient Triage & Resuscitation', 'Pharmacotherapy', 'Inpatient Management', 'Bedside Procedures'] },
            { category: 'Critical & Emergency', skills: ['Emergency Care', 'ICU Protocol Adherence', 'Ventilator Management', 'Infection Prevention & Control'] },
            { category: 'Operational & Compliance', skills: ['Hospital EHR / EMR Systems', 'Multidisciplinary Rounds', 'Clinical Quality Standards', 'Medical Record Documentation'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Resident Physician / Clinical Consultant',
                    employer: 'Academic Medical Center / Regional Hospital Network',
                    city: 'Metropolitan Hospital',
                    description: '<ul><li>Diagnosed and managed acute and chronic medical conditions for 35+ inpatient and outpatient cases daily across diverse clinical presentations.</li><li>Conducted multidisciplinary daily rounds with intensive care consultants, optimizing pharmacotherapy and care delivery.</li><li>Decreased average hospital length-of-stay by 18% through evidence-based diagnostic pathways and proactive care coordination.</li><li>Maintained 100% statutory compliance and documentation accuracy in electronic health records (EHR).</li></ul>'
                }
            ],
            education: [
                { degree: 'Doctor of Medicine (MD) / MBBS', school: 'University School of Medicine', city: 'Medical Campus' }
            ],
            projects: [
                { title: 'Hospital Infection Control & Sepsis Triage Pathway', description: 'Co-developed standardized sepsis screening protocol adopted across 3 affiliated regional hospitals, cutting diagnostic lag by 45 minutes.' }
            ],
            certifications: [
                { title: 'Permanent Medical Practice License', issuer: 'State Medical Board / Medical Council', category: 'mandatory' },
                { title: 'Advanced Cardiovascular Life Support (ACLS)', issuer: 'American Heart Association', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Distinguished Clinical Service Award', description: 'Conferred by Hospital Administration for exemplary crisis leadership and zero mortality in respiratory wing.' }
            ]
        }
    },

    [DOMAINS.PHARMACY]: {
        id: DOMAINS.PHARMACY,
        label: 'Pharmacy & Pharmacology',
        keywords: ['pharmacist', 'pharmacy', 'pharm.d', 'b.pharm', 'm.pharm', 'pharmacologist', 'dispensary', 'medication therapy', 'drug interaction', 'apothecary', 'formulary'],
        actionVerbs: ['Dispensed', 'Compounded', 'Verified', 'Evaluated', 'Counseled', 'Screened', 'Reconciled', 'Educated', 'Monitored', 'Audited'],
        anchorTerms: ['medication', 'drug', 'pharmacy', 'pharmacotherapy', 'dosage', 'prescription', 'dispensing', 'formulary', 'interaction', 'pharmacology'],
        commonDegrees: ['Doctor of Pharmacy (Pharm.D.)', 'Bachelor of Pharmacy (B.Pharm)', 'Master of Science in Clinical Pharmacology'],
        commonCertifications: ['Registered Pharmacist (R.Ph) License', 'Board Certified Pharmacotherapy Specialist (BCPS)', 'Immunization Delivery Credential'],
        skillCategories: [
            { category: 'Pharmaceutical Care', skills: ['Prescription Verification', 'Drug Utilization Review (DUR)', 'Medication Therapy Management (MTM)', 'Sterile Compounding', 'Patient Medication Counseling'] },
            { category: 'Clinical Pharmacology', skills: ['Drug-Drug Interaction Screening', 'Pharmacokinetics & Dosage Adjustments', 'Hospital Formulary Management', 'Adverse Drug Reaction Reporting'] },
            { category: 'Regulatory & Inventory', skills: ['Controlled Substance Compliance (DEA)', 'Pharmacy Management Systems', 'Cold Chain & Vaccine Storage', 'Inventory Auditing'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Clinical Staff Pharmacist',
                    employer: 'Regional Health System / Community Pharmacy Center',
                    city: 'Metro Health Hub',
                    description: '<ul><li>Dispensed and verified 250+ prescriptions daily, conducting drug-utilization reviews that prevented 45+ harmful drug interactions annually.</li><li>Collaborated with hospital physicians to recommend therapeutic dosage adjustments based on renal clearance biomarkers.</li><li>Administered seasonal influenza and pneumococcal immunizations to 1,500+ patients with zero adverse incidents.</li><li>Maintained 100% compliant storage records for Schedule II controlled substances adhering strictly to statutory guidelines.</li></ul>'
                }
            ],
            education: [
                { degree: 'Doctor of Pharmacy (Pharm.D.) / B.Pharm', school: 'Accredited College of Pharmacy', city: 'University Center' }
            ],
            projects: [
                { title: 'Inpatient Antimicrobial Stewardship Initiative', description: 'Audited broad-spectrum antibiotic orders, achieving 22% reduction in unindicated continuation beyond 72 hours.' }
            ],
            certifications: [
                { title: 'Registered Pharmacist Practice License (R.Ph)', issuer: 'State Board of Pharmacy / National Council', category: 'mandatory' },
                { title: 'Pharmacy-Based Immunization Delivery Credential', issuer: 'American Pharmacists Association (APhA)', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Excellence in Pharmacotherapy Citation', description: 'Awarded by clinical medical committee for identifying and mitigating critical contraindication in complex cardiac polypharmacy regimen.' }
            ]
        }
    },

    [DOMAINS.NURSING]: {
        id: DOMAINS.NURSING,
        label: 'Nursing & Patient Care',
        keywords: ['nurse', 'nursing', 'registered nurse', 'rn', 'bsn', 'msn', 'lpn', 'critical care nurse', 'icu nurse', 'triage nurse', 'staff nurse', 'nurse practitioner', 'charge nurse'],
        actionVerbs: ['Assessed', 'Administered', 'Monitored', 'Triaged', 'Coordinated', 'Educated', 'Stabilized', 'Advocated', 'Delivered', 'Documented'],
        anchorTerms: ['nursing', 'patient', 'clinical', 'care', 'medication', 'icu', 'triage', 'vital signs', 'hospital', 'ward'],
        commonDegrees: ['Bachelor of Science in Nursing (BSN / B.Sc. Nursing)', 'Master of Science in Nursing (MSN)', 'Associate Degree in Nursing (ADN)'],
        commonCertifications: ['Registered Nurse License (RN / NCLEX)', 'Basic Life Support (BLS)', 'Advanced Cardiovascular Life Support (ACLS)', 'Critical Care Registered Nurse (CCRN)'],
        skillCategories: [
            { category: 'Clinical & Patient Care', skills: ['Patient Assessment & Triage', 'Medication Administration', 'Vital Signs Monitoring', 'IV Cannulation & Infusion Therapy', 'Wound Dressing & Care'] },
            { category: 'Critical & Emergency', skills: ['Critical Care Nursing', 'Cardiopulmonary Resuscitation (CPR)', 'Ventilator Patient Management', 'Infection Control & PPE Standards'] },
            { category: 'Documentation & Communication', skills: ['Nursing EMR Documentation', 'Patient & Family Education', 'Interdisciplinary Rounds', 'Statutory Healthcare Protocols'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Registered Staff Nurse (Inpatient & ICU)',
                    employer: 'Regional Memorial Hospital Network',
                    city: 'Metropolitan Health Center',
                    description: '<ul><li>Delivered acute nursing care to 8-12 inpatients per shift, administering medications and monitoring vital signs in strict compliance with protocol.</li><li>Recognized early symptoms of clinical deterioration in critical care units, coordinating rapid response interventions that stabilized emergency patients.</li><li>Maintained 100% accurate nursing notes and digital medication administration logs on hospital EMR systems.</li><li>Educated discharging patients and caregivers on recovery protocols, dietary plans, and post-discharge medication routines.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Nursing (BSN)', school: 'Accredited College of Nursing', city: 'Metropolitan Campus' }
            ],
            projects: [
                { title: 'Hospital Infection Control & Hand Hygiene Compliance Drive', description: 'Spearheaded department-wide clinical audit achieving 98% hand hygiene and PPE compliance across all shifts.' }
            ],
            certifications: [
                { title: 'Registered Nurse (RN) License', issuer: 'State Nursing Board / National Nursing Council', category: 'mandatory' },
                { title: 'Basic Life Support (BLS)', issuer: 'American Heart Association', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Excellence in Nursing Compassion Award', description: 'Awarded by hospital clinical administration for outstanding patient advocacy and zero medication errors across 24 consecutive months.' }
            ]
        }
    },

    [DOMAINS.LAW]: {
        id: DOMAINS.LAW,
        label: 'Law & Legal Practice',
        keywords: ['lawyer', 'attorney', 'counsel', 'litigation', 'paralegal', 'llb', 'llm', 'legal', 'bar council', 'court', 'contract', 'due diligence', 'corporate law', 'arbitration', 'advocate', 'solicitor', 'barrister'],
        actionVerbs: ['Drafted', 'Litigated', 'Negotiated', 'Counseled', 'Advised', 'Represented', 'Settled', 'Researched', 'Structured', 'Arbitrated'],
        anchorTerms: ['legal', 'court', 'litigation', 'counsel', 'contract', 'compliance', 'statutory', 'arbitration', 'clause', 'jurisdiction'],
        commonDegrees: ['Juris Doctor (J.D.)', 'Bachelor of Laws (LL.B.)', 'Master of Laws (LL.M.)', 'B.A. LL.B. (Honours)'],
        commonCertifications: ['State Bar Admission / Bar Council Practice Certificate', 'Certified Information Privacy Professional (CIPP)', 'Accredited Commercial Arbitrator'],
        skillCategories: [
            { category: 'Core Legal Practice', skills: ['Contract Drafting & Review', 'Commercial Litigation', 'Legal Research & Brief Writing', 'Statutory Compliance', 'Due Diligence', 'Arbitration & Mediation'] },
            { category: 'Corporate & Regulatory', skills: ['Mergers & Acquisitions (M&A)', 'Corporate Governance', 'Intellectual Property Protection', 'Regulatory Filings', 'Risk Mitigation'] },
            { category: 'Dispute & Advocacy', skills: ['Courtroom Advocacy', 'Deposition Preparation', 'Client Advisory', 'Settlement Negotiation'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Corporate Legal Counsel',
                    employer: 'Commercial Legal Partners LLP / Corporate Legal Dept',
                    city: 'Metropolitan Financial Center',
                    description: '<ul><li>Drafted, reviewed, and negotiated cross-border commercial contracts, vendor agreements, and technology licensing contracts.</li><li>Conducted legal due diligence for major M&A transactions, mitigating high-risk indemnification and regulatory exposure.</li><li>Advised board of directors on statutory corporate governance, listing compliance, and privacy regulations.</li><li>Structured dispute resolution settlements saving clients millions in protracted trial exposure.</li></ul>'
                }
            ],
            education: [
                { degree: 'Juris Doctor (J.D.) / LL.B. (Honours)', school: 'Accredited Faculty of Law', city: 'Metropolitan Law Campus' }
            ],
            projects: [
                { title: 'Cross-Border Supply Chain Master Services Framework', description: 'Standardized commercial agreement templates across international subsidiaries, cutting review cycle time by 40%.' }
            ],
            certifications: [
                { title: 'Bar Admission to Legal Practice', issuer: 'State Bar Association / Bar Council', category: 'mandatory' },
                { title: 'Certified Commercial Arbitrator', issuer: 'Chartered Institute of Arbitrators', category: 'recommended' }
            ],
            achievements: [
                { title: 'Excellence in Commercial Law Citation', description: 'Recognized for successful multi-party dispute resolution resulting in favorable settlement without litigation.' }
            ]
        }
    },

    [DOMAINS.JUDICIARY]: {
        id: DOMAINS.JUDICIARY,
        label: 'Judiciary & Adjudication',
        keywords: ['judge', 'magistrate', 'justice', 'adjudicator', 'hearing officer', 'bench', 'judicial clerk', 'chambers', 'administrative law judge', 'tribunal'],
        actionVerbs: ['Adjudicated', 'Presided', 'Ruled', 'Delivered', 'Interpreted', 'Determined', 'Evaluated', 'Authored', 'Administered', 'Mediated'],
        anchorTerms: ['judicial', 'court', 'adjudication', 'ruling', 'jurisprudence', 'chambers', 'hearing', 'statutory', 'bench', 'magistrate'],
        commonDegrees: ['Juris Doctor (J.D.)', 'Master of Laws (LL.M.) in Constitutional Law', 'Bachelor of Laws (LL.B.)'],
        commonCertifications: ['Judicial Service Commission Appointment', 'State Judicial College Certification', 'National Judicial Academy Credential'],
        skillCategories: [
            { category: 'Adjudication & Jurisprudence', skills: ['Judicial Reasoning & Opinion Writing', 'Statutory Interpretation', 'Constitutional Jurisprudence', 'Case Management & Docket Control', 'Rules of Evidence'] },
            { category: 'Courtroom Administration', skills: ['Presiding over Bench Hearings', 'Summary Disposition Analysis', 'Alternative Dispute Resolution (ADR)', 'Ethical Standards & Canons'] },
            { category: 'Research & Review', skills: ['Appellate Review Analysis', 'Precedent & Case Law Synthesis', 'Jury Charge Formulation', 'Chambers Administration'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Administrative Law Judge / Judicial Magistrate',
                    employer: 'District Court Chambers / State Administrative Tribunal',
                    city: 'Civic Judiciary Center',
                    description: '<ul><li>Presided over 300+ civil and administrative hearings annually, ensuring rigorous adherence to due process and rules of evidence.</li><li>Authored 120+ published judicial opinions and orders with 98% affirmation rate upon appellate review.</li><li>Streamlined pre-trial motions and preliminary hearing dockets, reducing court backlog by 28%.</li><li>Managed courtroom decorum, witness examinations, and legal briefings with absolute impartiality.</li></ul>'
                }
            ],
            education: [
                { degree: 'Juris Doctor (J.D.) / Master of Laws (LL.M.)', school: 'National Law School / Faculty of Law', city: 'University City' }
            ],
            projects: [
                { title: 'Electronic Docket & Virtual Hearing Modernization', description: 'Instituted digital evidence review system eliminating paper file transit delays in criminal and civil dockets.' }
            ],
            certifications: [
                { title: 'Judicial Officer Commissioning Certificate', issuer: 'State Judicial Commission / High Court', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Exemplary Judicial Service Award', description: 'Conferred by State Bar and Judicial Council for clearing longest-standing case backlog in municipal court history.' }
            ]
        }
    },

    [DOMAINS.EDUCATION]: {
        id: DOMAINS.EDUCATION,
        label: 'Education & Teaching',
        keywords: ['teacher', 'educator', 'instructor', 'pedagogy', 'curriculum', 'classroom', 'school', 'b.ed', 'm.ed', 'high school teacher', 'elementary teacher', 'stem teacher', 'lesson plan'],
        actionVerbs: ['Instructed', 'Taught', 'Developed', 'Facilitated', 'Mentored', 'Evaluated', 'Curated', 'Assessed', 'Guided', 'Adapted'],
        anchorTerms: ['students', 'curriculum', 'classroom', 'learning', 'pedagogy', 'academic', 'teaching', 'assessment', 'coursework', 'school'],
        commonDegrees: ['Bachelor of Education (B.Ed)', 'Master of Education (M.Ed)', 'Master of Science (M.Sc) / Arts (M.A.) in Subject Field', 'Bachelor of Arts (B.A.) / Science (B.S.)'],
        commonCertifications: ['State Teacher Certification / License', 'Google Certified Educator', 'Cambridge International Teaching Diploma', 'National Board Certification'],
        skillCategories: [
            { category: 'Pedagogy & Classroom', skills: ['Curriculum Development', 'Classroom Management', 'Differentiated Instruction', 'Lesson Planning', 'Formative & Summative Assessment'] },
            { category: 'Subject & Academic', skills: ['STEM & Literacy Instruction', 'Educational Technology (EdTech)', 'Student Engagement Strategies', 'Remedial Coaching', 'Academic Advising'] },
            { category: 'Leadership & Collaboration', skills: ['Parent-Teacher Collaboration', 'IEP Implementation & Special Needs', 'Departmental Coordination', 'Standardized Test Preparation'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior High School Mathematics Teacher',
                    employer: 'Regional Public School District / Academy',
                    city: 'Metro Education Center',
                    description: '<ul><li>Delivered comprehensive mathematics instruction to over 160 secondary students, achieving a 98% state examination pass rate.</li><li>Designed interactive problem-solving modules using digital graphing tools, elevating average student test scores by 22%.</li><li>Mentored junior faculty and organized annual inter-school science and mathematics exhibitions with 500+ participants.</li><li>Conducted proactive parent-educator conferences to establish personalized academic support plans for struggling learners.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Education (B.Ed) / Master of Education', school: 'Accredited Institute of Education', city: 'Education Campus' }
            ],
            projects: [
                { title: 'Interactive Flipped Classroom Blended Learning Pilot', description: 'Implemented blended learning model utilizing self-paced video modules that increased classroom engagement by 45%.' }
            ],
            certifications: [
                { title: 'State Teaching Credential / Educator License', issuer: 'State Department of Education / Teaching Council', category: 'mandatory' },
                { title: 'National Board Certification in Mathematics', issuer: 'National Board for Professional Teaching Standards', category: 'recommended' }
            ],
            achievements: [
                { title: 'Educator of the Year Award', description: 'Conferred by District School Board for outstanding academic leadership and student growth percentile gains.' }
            ]
        }
    },

    [DOMAINS.HIGHER_EDUCATION]: {
        id: DOMAINS.HIGHER_EDUCATION,
        label: 'Higher Education & Academia',
        keywords: ['professor', 'university professor', 'lecturer', 'faculty', 'tenure', 'academia', 'adjunct', 'provost', 'dean', 'department chair', 'postdoctoral fellow'],
        actionVerbs: ['Authored', 'Lectured', 'Mentored', 'Investigated', 'Published', 'Secured', 'Chaired', 'Curated', 'Supervised', 'Disseminated'],
        anchorTerms: ['university', 'research', 'faculty', 'students', 'peer-reviewed', 'pedagogy', 'academic', 'grants', 'dissertation', 'tenure'],
        commonDegrees: ['Doctor of Philosophy (Ph.D.)', 'Master of Science (M.S.)', 'Master of Arts (M.A.)'],
        commonCertifications: ['Higher Education Teaching Certificate', 'Certified Higher Education Professional', 'Grant Writing Professional Credential'],
        skillCategories: [
            { category: 'Academic Research & Publishing', skills: ['Peer-Reviewed Scholarly Publishing', 'Grant Proposal Writing & Funding', 'Quantitative & Qualitative Research', 'Literature Synthesis', 'Research Ethics Compliance'] },
            { category: 'Undergraduate & Graduate Teaching', skills: ['Graduate Seminar Instruction', 'Curriculum Design & Syllabi Development', 'Doctoral Dissertation Advising', 'Academic Mentorship'] },
            { category: 'Service & Governance', skills: ['University Committee Governance', 'Peer Journal Reviewing', 'Academic Conference Organizing', 'Accreditation Review Oversight'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Associate Professor & Research Chair',
                    employer: 'State Research University / Faculty of Sciences',
                    city: 'University Town',
                    description: '<ul><li>Instructed 4 graduate and undergraduate courses per semester with consistent 4.8/5.0 student evaluation ratings.</li><li>Principal Investigator securing over $1.4M in competitive national research grant funding for fundamental research initiatives.</li><li>Authored 14 peer-reviewed research papers published in top-tier international journals (Q1 ranking).</li><li>Supervised 6 Ph.D. dissertations and 12 Master\'s theses to successful completion and institutional defense.</li></ul>'
                }
            ],
            education: [
                { degree: 'Doctor of Philosophy (Ph.D.)', school: 'Premier University Graduate School', city: 'Academic Campus' }
            ],
            projects: [
                { title: 'Interdisciplinary Center for Applied Scholarly Studies', description: 'Founded cross-departmental research center connecting 18 faculty investigators with external fellowship grants.' }
            ],
            certifications: [
                { title: 'Higher Education Faculty Teaching Accreditation', issuer: 'National Higher Education Academy', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Distinguished Faculty Research Award', description: 'Awarded annually to top-performing university scholar for groundbreaking research publications.' }
            ]
        }
    },

    [DOMAINS.ACCOUNTING]: {
        id: DOMAINS.ACCOUNTING,
        label: 'Accounting, Audit & Taxation',
        keywords: ['accountant', 'ca', 'cpa', 'auditor', 'taxation', 'tax', 'bookkeeper', 'acca', 'balance sheet', 'audit', 'tax compliance', 'financial compliance', 'gaap', 'icai', 'financial reporting', 'gst', 'internal audit', 'general ledger'],
        actionVerbs: ['Audited', 'Reconciled', 'Forecasted', 'Analyzed', 'Streamlined', 'Reported', 'Computed', 'Budgeted', 'Validated', 'Standardized'],
        anchorTerms: ['accounting', 'audit', 'tax', 'financial ledger', 'gaap', 'statutory audit', 'reconciliation', 'financial reporting'],
        commonDegrees: ['Bachelor of Commerce / Accounting (B.Com / B.S. Accounting)', 'Master of Accounting / Taxation', 'Chartered Accountancy (CA)', 'Certified Public Accountant (CPA)'],
        commonCertifications: ['Certified Public Accountant (CPA) / CA', 'Certified Internal Auditor (CIA)', 'ACCA Credential', 'Chartered Management Accountant (CMA)'],
        skillCategories: [
            { category: 'Financial & Statutory Accounting', skills: ['Financial Statement Preparation', 'Statutory & Tax Audit', 'Direct & Indirect Taxation', 'GAAP & IFRS Standards', 'General Ledger Accounting'] },
            { category: 'Analysis & Controls', skills: ['Bank & Balance Sheet Reconciliation', 'Internal Controls (SOX Compliance)', 'Budgeting & Variance Analysis', 'Cost Accounting & Forecasting'] },
            { category: 'Systems & Software', skills: ['ERP Financials (SAP, NetSuite, Oracle)', 'Advanced Financial Modeling (Excel, Macros)', 'QuickBooks & Xero', 'Audit Working Papers'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Corporate Accountant / Audit Lead',
                    employer: 'Global Professional Services / Corporate Enterprise',
                    city: 'Financial District',
                    description: '<ul><li>Led statutory and internal audits for corporate entities across retail and financial services sectors.</li><li>Identified internal control deficiencies and tax deduction discrepancies, saving clients over $2.5M in penalty exposures.</li><li>Supervised teams of 6 audit associates, ensuring compliance with statutory standards and strict reporting timetables.</li><li>Prepared quarterly GAAP financial statements and managed month-end general ledger reconciliations.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Accounting / B.Com', school: 'Accredited School of Business & Accountancy', city: 'Financial Campus' }
            ],
            projects: [
                { title: 'ERP Financial System Migration & Chart of Accounts Harmonization', description: 'Led successful accounting migration to cloud ERP platform with zero transaction ledger discrepancies.' }
            ],
            certifications: [
                { title: 'Certified Public Accountant (CPA) / CA Membership', issuer: 'National Accounting Board / Institute of Chartered Accountants', category: 'mandatory' },
                { title: 'Certified Internal Auditor (CIA)', issuer: 'Institute of Internal Auditors (IIA)', category: 'recommended' }
            ],
            achievements: [
                { title: 'Audit Excellence Recognition', description: 'Commended by Audit Committee for uncovering significant vendor overpayment leakages during forensic review.' }
            ]
        }
    },

    [DOMAINS.FINANCE]: {
        id: DOMAINS.FINANCE,
        label: 'Finance, Banking & Investment',
        keywords: ['financial analyst', 'investment banker', 'investment banking', 'banking', 'finance', 'portfolio manager', 'wealth management', 'cfa', 'equity research', 'valuation', 'dcf', 'asset management', 'risk analyst', 'treasury', 'banker', 'commercial banker', 'credit analyst'],
        actionVerbs: ['Modeled', 'Valued', 'Analyzed', 'Allocated', 'Forecasted', 'Structured', 'Invested', 'Assessed', 'Executed', 'Optimized'],
        anchorTerms: ['finance', 'investment', 'valuation', 'dcf', 'equity', 'portfolio', 'financial modeling', 'treasury', 'banking', 'capital'],
        commonDegrees: ['Master of Business Administration (MBA) - Finance', 'Master of Science in Financial Economics', 'Bachelor of Science in Finance / Economics', 'CFA Charter'],
        commonCertifications: ['Chartered Financial Analyst (CFA)', 'Financial Risk Manager (FRM)', 'Certified Financial Planner (CFP)', 'Series 7 / 63 Securities Licenses'],
        skillCategories: [
            { category: 'Financial Modeling & Valuation', skills: ['3-Statement Financial Modeling', 'DCF & Comparable Company Valuation', 'LBO Analysis', 'Capital Budgeting', 'M&A Due Diligence'] },
            { category: 'Asset & Risk Management', skills: ['Portfolio Allocation', 'Equity Research', 'Fixed Income Analysis', 'Risk Management & Hedging', 'Corporate Treasury & Liquidity'] },
            { category: 'Tools & Platforms', skills: ['Bloomberg Terminal / FactSet', 'Advanced Excel Financial Modeling', 'Python for Finance', 'Power BI Financial Dashboards'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Investment Banking Associate / Financial Analyst',
                    employer: 'Premier Advisory / Capital Markets Group',
                    city: 'Financial Center',
                    description: '<ul><li>Constructed detailed 3-statement financial models and discounted cash flow (DCF) valuations for $350M+ investment mandates.</li><li>Conducted thematic equity research and sensitivity analyses across 18 coverage companies, informing asset allocation decisions.</li><li>Optimized corporate treasury yield by 110 bps through disciplined short-term liquidity deployments and hedging strategies.</li><li>Delivered quarterly portfolio performance reviews and macroeconomic stress-testing scenarios to investment committees.</li></ul>'
                }
            ],
            education: [
                { degree: 'MBA in Finance / B.S. in Financial Economics', school: 'Accredited Graduate School of Business', city: 'Business Center' }
            ],
            projects: [
                { title: 'Cross-Border Strategic Acquisition Valuation Model', description: 'Built comprehensive accretion/dilution model supporting $280M strategic corporate acquisition.' }
            ],
            certifications: [
                { title: 'Chartered Financial Analyst (CFA)', issuer: 'CFA Institute', category: 'mandatory' },
                { title: 'Financial Risk Manager (FRM)', issuer: 'Global Association of Risk Professionals (GARP)', category: 'recommended' }
            ],
            achievements: [
                { title: 'Top Equity Research Report Citation', description: 'Authored flagship sector outlook selected for institutional distribution across 50+ global fund managers.' }
            ]
        }
    },

    [DOMAINS.HUMAN_RESOURCES]: {
        id: DOMAINS.HUMAN_RESOURCES,
        label: 'Human Resources & People Operations',
        keywords: ['human resources', 'talent acquisition', 'recruiter', 'hrbp', 'hr manager', 'people operations', 'employee engagement', 'payroll', 'onboarding', 'talent development', 'chief people officer'],
        actionVerbs: ['Recruited', 'Onboarded', 'Facilitated', 'Implemented', 'Partnered', 'Resolved', 'Retained', 'Evaluated', 'Orchestrated', 'Spearheaded'],
        anchorTerms: ['talent', 'recruitment', 'hrbp', 'employee', 'onboarding', 'payroll', 'retention', 'performance management', 'people operations', 'labor law'],
        commonDegrees: ['Master of Human Resource Management', 'Master of Arts in Organizational Psychology', 'Bachelor of Business Administration (BBA)'],
        commonCertifications: ['SHRM Certified Professional (SHRM-CP / SHRM-SCP)', 'Professional in Human Resources (PHR / SPHR)', 'Certified Talent Management Practitioner'],
        skillCategories: [
            { category: 'Talent Acquisition & Sourcing', skills: ['Full-Lifecycle Recruitment', 'Executive Sourcing', 'Candidate Pipeline Management', 'Competency-Based Interviewing', 'Campus Hiring Drives'] },
            { category: 'People Operations & HRBP', skills: ['HR Business Partnering (HRBP)', 'Performance Management & OKRs', 'Employee Relations & Engagement', 'Compensation & Benefits (C&B)', 'Statutory Labor Compliance'] },
            { category: 'Systems & Analytics', skills: ['HRIS (Workday, BambooHR, SuccessFactors)', 'HR Analytics & Attrition Modeling', 'Workplace Policy Administration', 'Organizational Development'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Human Resources Director / HR Business Partner',
                    employer: 'Global Enterprise Services / Corporate Network',
                    city: 'Corporate Hub',
                    description: '<ul><li>Spearheaded full-lifecycle talent acquisition across technical and corporate verticals, hiring 120+ professionals within SLA.</li><li>Revamped annual performance appraisal framework and OKR tracking, lifting employee retention rates by 18%.</li><li>Managed employee relations, grievance redressal, and workplace compliance in full adherence to statutory employment standards.</li><li>Leveraged HR analytics to monitor attrition drivers and turnover indicators, reducing annualized voluntary churn by 14%.</li></ul>'
                }
            ],
            education: [
                { degree: 'Master of Human Resource Management / BBA', school: 'School of Management & Labor Relations', city: 'Business Center' }
            ],
            projects: [
                { title: 'Global Workplace Remote Policy & Guidelines Rollout', description: 'Architected organizational remote-work policies and productivity guidelines adopted across 1,500 employees.' }
            ],
            certifications: [
                { title: 'SHRM Certified Professional (SHRM-CP)', issuer: 'Society for Human Resource Management (SHRM)', category: 'mandatory' },
                { title: 'Professional in Human Resources (PHR)', issuer: 'HR Certification Institute (HRCI)', category: 'recommended' }
            ],
            achievements: [
                { title: 'Employer of Choice Project Lead', description: 'Led HR organizational audit resulting in company achieving Top 25 Great Places to Work certification.' }
            ]
        }
    },

    [DOMAINS.SALES]: {
        id: DOMAINS.SALES,
        label: 'Sales & Business Development',
        keywords: ['sales', 'account executive', 'business development', 'bdr', 'sdr', 'quota', 'revenue', 'client acquisition', 'sales manager', 'pipeline', 'salesforce', 'sales executive', 'territory manager'],
        actionVerbs: ['Closed', 'Generated', 'Accelerated', 'Negotiated', 'Expanded', 'Captured', 'Acquired', 'Spearheaded', 'Built', 'Outperformed'],
        anchorTerms: ['sales', 'quota', 'revenue', 'pipeline', 'clients', 'crm', 'deals', 'accounts', 'prospecting', 'negotiation'],
        commonDegrees: ['Bachelor of Business Administration (BBA)', 'Master of Business Administration (MBA) - Sales & Marketing', 'Bachelor of Commerce'],
        commonCertifications: ['Certified Professional Sales Person (CPSP)', 'HubSpot Inbound Sales Certification', 'Salesforce Certified Administrator'],
        skillCategories: [
            { category: 'Sales Execution', skills: ['B2B Enterprise Sales', 'Pipeline Management', 'Contract Negotiation', 'Lead Prospecting & Cold Outreach', 'Consultative Selling'] },
            { category: 'Account Growth', skills: ['Key Account Management', 'Customer Retention & Upselling', 'Client Relationship Building', 'Territory Planning'] },
            { category: 'Tools & Forecasting', skills: ['Salesforce CRM / HubSpot', 'Revenue Forecasting', 'Sales Deck Presentation', 'Sales Analytics'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Enterprise Account Executive / Sales Director',
                    employer: 'Enterprise Commercial Group / Commercial Solutions',
                    city: 'Commercial District',
                    description: '<ul><li>Consistently exceeded annual sales quota by 135%, generating over $4.2M in annual recurring revenue across enterprise accounts.</li><li>Negotiated multi-year commercial contracts with procurement executives, shortening sales cycles from 9 months to 4 months.</li><li>Built prospective lead pipeline of $12M using targeted outbound outreach and executive industry networking.</li><li>Led customer discovery calls, identifying organizational pain points and presenting tailored value solutions.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Business Administration (BBA)', school: 'Accredited School of Business', city: 'Commercial City' }
            ],
            projects: [
                { title: 'Enterprise Channel Partner Expansion Strategy', description: 'Established strategic distribution partnerships across 5 regional markets, unlocking $1.8M in incremental indirect revenue.' }
            ],
            certifications: [
                { title: 'Certified Professional Sales Person (CPSP)', issuer: 'National Association of Sales Professionals', category: 'mandatory' },
                { title: 'HubSpot Inbound Sales Certified', issuer: 'HubSpot Academy', category: 'recommended' }
            ],
            achievements: [
                { title: 'President\'s Club Winner - Top Sales Performer', description: 'Ranked #1 Revenue Producer nationwide out of 120 regional sales executives.' }
            ]
        }
    },

    [DOMAINS.MARKETING]: {
        id: DOMAINS.MARKETING,
        label: 'Marketing, Brand Strategy & Growth',
        keywords: ['marketing', 'digital marketer', 'seo', 'sem', 'content strategist', 'growth marketing', 'social media manager', 'brand manager', 'campaign manager', 'performance marketing', 'copywriter'],
        actionVerbs: ['Orchestrated', 'Optimized', 'Scaled', 'Analyzed', 'Expanded', 'Curated', 'Produced', 'Engineered', 'Launched', 'Supervised'],
        anchorTerms: ['marketing', 'campaign', 'brand', 'seo', 'growth', 'social media', 'traffic', 'conversion', 'audience', 'content'],
        commonDegrees: ['Bachelor of Science / Arts in Marketing', 'MBA in Marketing & Communications', 'Master of Science in Digital Marketing'],
        commonCertifications: ['Google Ads & Analytics Certified', 'HubSpot Inbound Marketing Certified', 'Meta Certified Digital Marketing Associate'],
        skillCategories: [
            { category: 'Performance & Growth Marketing', skills: ['Search Engine Optimization (SEO)', 'Pay-Per-Click (PPC) Advertising', 'Conversion Rate Optimization (CRO)', 'Marketing Analytics & Attribution', 'A/B Testing'] },
            { category: 'Brand & Content Strategy', skills: ['Brand Positioning & Narrative', 'Content Marketing Strategy', 'Social Media Management', 'Email Marketing & Drip Campaigns', 'Public Relations'] },
            { category: 'Marketing Operations & Tools', skills: ['Google Analytics 4 / Search Console', 'SEMrush / Ahrefs', 'HubSpot / Marketo', 'Campaign Budget Management'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Digital Marketing Strategist / Brand Manager',
                    employer: 'Global Marketing Network / Growth Agency',
                    city: 'Creative Media District',
                    description: '<ul><li>Orchestrated multi-channel digital marketing campaigns that drove a 45% increase in qualified inbound sales leads.</li><li>Scaled organic website traffic by 120% through targeted technical SEO, high-intent keyword clustering, and content marketing.</li><li>Managed $650K annual paid acquisition budget across search and social channels, improving ROAS from 2.8x to 4.2x.</li><li>Developed comprehensive brand narrative and brand style guidelines adopted across all customer communication touchpoints.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Marketing & Communications', school: 'Accredited University Media School', city: 'Media Campus' }
            ],
            projects: [
                { title: 'National Product Launch Omnichannel Campaign', description: 'Executed 360-degree digital launch campaign generating 2.5M impressions and record-breaking pre-order conversions.' }
            ],
            certifications: [
                { title: 'Google Analytics 4 Certified Professional', issuer: 'Google', category: 'mandatory' },
                { title: 'HubSpot Inbound Marketing Certified', issuer: 'HubSpot Academy', category: 'recommended' }
            ],
            achievements: [
                { title: 'Campaign of the Year Gold Winner', description: 'Recognized by Digital Marketing Association for highest ROI organic social campaign in consumer category.' }
            ]
        }
    },

    [DOMAINS.GRAPHIC_DESIGN]: {
        id: DOMAINS.GRAPHIC_DESIGN,
        label: 'Graphic Design & Creative Arts',
        keywords: ['graphic designer', 'ui/ux designer', 'ux designer', 'ui designer', 'visual designer', 'art director', 'illustrator', 'animator', 'creative director', 'branding', 'typography', 'motion design', 'digital designer', 'user experience designer'],
        actionVerbs: ['Conceptualized', 'Designed', 'Illustrated', 'Visualized', 'Branded', 'Prototyped', 'Crafted', 'Produced', 'Curated', 'Revamped'],
        anchorTerms: ['graphic design', 'visual identity', 'branding', 'typography', 'prototype', 'ui/ux', 'editorial layout', 'motion graphics'],
        commonDegrees: ['Bachelor of Fine Arts (BFA) - Graphic Design', 'Bachelor of Design (B.Des)', 'Master of Fine Arts (MFA)'],
        commonCertifications: ['Adobe Certified Professional in Visual Design', 'Nielsen Norman Group UX Master Certified', 'Google UX Design Professional Certificate'],
        skillCategories: [
            { category: 'Visual & Brand Design', skills: ['Brand Identity & Logo Design', 'Typography & Editorial Layout', 'Packaging Design', 'Vector Illustration', 'Marketing Collateral'] },
            { category: 'Digital & UI/UX', skills: ['UI/UX Design', 'Wireframing & Prototyping', 'Figma & Design Systems', 'User Research & Journey Mapping', 'Interaction Design'] },
            { category: 'Tools & Production', skills: ['Adobe Creative Cloud (Photoshop, Illustrator, InDesign)', 'After Effects & Motion Graphics', 'Print Production & Pre-press'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Brand & Visual Identity Designer',
                    employer: 'Creative Design Studio / Branding Agency',
                    city: 'Design District',
                    description: '<ul><li>Conceptualized and executed comprehensive visual identity packages, packaging systems, and digital campaigns for 15+ consumer brands.</li><li>Collaborated with copywriters and marketing directors to translate brand strategy into cohesive multi-channel visual assets.</li><li>Boosted client social engagement by 60% through unified typography, custom illustration libraries, and motion graphic teasers.</li><li>Maintained comprehensive digital design systems ensuring brand consistency across web, mobile, and print mediums.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Fine Arts (BFA) in Graphic Design', school: 'Accredited College of Art and Design', city: 'Design Campus' }
            ],
            projects: [
                { title: 'Global Rebranding & Visual Identity Refresh', description: 'Re-architected brand visual guidelines, iconography, and typography for retail network with 120+ locations.' }
            ],
            certifications: [
                { title: 'Adobe Certified Professional in Visual Design', issuer: 'Adobe', category: 'mandatory' },
                { title: 'Nielsen Norman Group UX Master Certified', issuer: 'NN/g', category: 'recommended' }
            ],
            achievements: [
                { title: 'Design Awards Finalist', description: 'Shortlisted for Best Brand Identity in Consumer Packaging among 400+ international design studio entries.' }
            ]
        }
    },

    [DOMAINS.ARCHITECTURE]: {
        id: DOMAINS.ARCHITECTURE,
        label: 'Architecture & Spatial Design',
        keywords: ['architect', 'architectural designer', 'urban planner', 'bim', 'revit', 'autocad', 'building design', 'interior architect', 'landscape architect', 'leed', 'architectural'],
        actionVerbs: ['Designed', 'Drafted', 'Planned', 'Modeled', 'Supervised', 'Coordinated', 'Spearheaded', 'Inspected', 'Constructed', 'Conceptualized'],
        anchorTerms: ['architecture', 'building', 'design', 'revit', 'bim', 'spatial', 'construction', 'structural', 'leed', 'urban'],
        commonDegrees: ['Bachelor of Architecture (B.Arch)', 'Master of Architecture (M.Arch)', 'Master of Urban Planning'],
        commonCertifications: ['Registered Licensed Architect (AIA / NCARB / COA / RIBA)', 'LEED AP Building Design + Construction', 'Autodesk Certified Professional (Revit)'],
        skillCategories: [
            { category: 'Architectural Design', skills: ['Architectural Space Planning', 'BIM & Revit 3D Modeling', 'AutoCAD Drafting', 'Concept Design', 'Sustainable Building (LEED Standards)'] },
            { category: 'Technical & Site', skills: ['Working & Municipal Approval Drawings', 'Building Codes & Bye-Laws', 'Site Supervision', 'Vendor & Consultant Coordination'] },
            { category: 'Visualization & Analysis', skills: ['Lumion / Enscape 3D Rendering', 'Structural Integration', 'Cost Estimation & BOQ Preparation'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Project Architect',
                    employer: 'Architectural Design Practice / Design Studio',
                    city: 'Metropolitan Design Center',
                    description: '<ul><li>Led architectural design development, sanction drawings, and technical coordination for mixed-use commercial and residential developments.</li><li>Orchestrated multidisciplinary engineering consultants (MEP, structural, facade) using integrated Autodesk Revit BIM workflows.</li><li>Conducted weekly site inspections, resolving contractor technical queries and achieving zero deviation from approved blueprints.</li><li>Integrated passive solar building orientation and energy-efficient building materials conforming to green building standards.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Architecture (B.Arch)', school: 'School of Architecture & Planning', city: 'Architectural Campus' }
            ],
            projects: [
                { title: 'LEED Certified Mixed-Use Urban Complex', description: 'Architected facade solar shading and energy-efficient building layout reducing projected operational energy consumption by 32%.' }
            ],
            certifications: [
                { title: 'Licensed Architect Practice Credential', issuer: 'National Architectural Registration Board / Council of Architecture', category: 'mandatory' },
                { title: 'LEED Accredited Professional (LEED AP BD+C)', issuer: 'U.S. Green Building Council', category: 'recommended' }
            ],
            achievements: [
                { title: 'Architecture Design Competition Award', description: 'Awarded 1st place for sustainable urban revitalization project presented to municipal planning commission.' }
            ]
        }
    },

    [DOMAINS.CIVIL_ENGINEERING]: {
        id: DOMAINS.CIVIL_ENGINEERING,
        label: 'Civil & Structural Engineering',
        keywords: ['civil engineer', 'civil', 'structural engineer', 'structural', 'site engineer', 'construction engineer', 'surveyor', 'concrete', 'staad.pro', 'geotechnical', 'civil infrastructure', 'quantity surveyor', 'autocad civil', 'highway engineer'],
        actionVerbs: ['Supervised', 'Engineered', 'Calculated', 'Inspected', 'Conducted', 'Designed', 'Monitored', 'Surveyed', 'Coordinated', 'Constructed'],
        anchorTerms: ['civil', 'structural', 'construction', 'concrete', 'site', 'infrastructure', 'staad.pro', 'survey', 'boq', 'geotechnical'],
        commonDegrees: ['Bachelor of Science in Civil Engineering', 'Bachelor of Engineering (B.E.) in Civil Engineering', 'Master of Science in Structural Engineering'],
        commonCertifications: ['Professional Engineer (PE) / Chartered Engineer (CEng)', 'Certified Construction Project Manager', 'STAAD.Pro Certified Professional'],
        skillCategories: [
            { category: 'Structural Design & Analysis', skills: ['STAAD.Pro & ETABS Structural Analysis', 'Reinforced Concrete (RCC) Design', 'Structural Steel Design', 'Seismic Analysis Standards', 'Foundation Engineering'] },
            { category: 'Site & Project Management', skills: ['Site Supervision & Execution', 'Quality Control & Materials Testing', 'Safety Compliance (OSHA Standards)', 'Contractor & Subcontractor Management'] },
            { category: 'Estimation & Surveying', skills: ['Bill of Quantities (BOQ) Preparation', 'Total Station Surveying', 'AutoCAD Civil 3D', 'Cost Estimation & Rate Analysis'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Structural Civil Engineer / Site Lead',
                    employer: 'Global Infrastructure & Construction Group',
                    city: 'Infrastructure Project Hub',
                    description: '<ul><li>Supervised on-site construction execution and structural concrete pouring for major elevated highway and infrastructure project.</li><li>Performed comprehensive structural analysis and seismic design checks using ETABS and STAAD.Pro conforming to national building codes.</li><li>Prepared accurate Bill of Quantities (BOQ) and verified contractor measurement sheets, ensuring zero budgetary cost overruns.</li><li>Enforced stringent site health and safety standards, achieving 500,000 safe man-hours with zero reportable lost-time injuries.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science / Engineering in Civil Engineering', school: 'Accredited College of Engineering', city: 'Engineering Campus' }
            ],
            projects: [
                { title: 'Elevated Transit Viaduct Construction', description: 'Managed precast segmental girder erection and post-tensioning quality assurance over a 4.2 km corridor.' }
            ],
            certifications: [
                { title: 'Professional Engineer (PE) / Licensed Civil Engineer', issuer: 'State Licensing Board / Institution of Engineers', category: 'mandatory' },
                { title: 'Certified Construction Project Manager', issuer: 'Project Management Institute (PMI)', category: 'recommended' }
            ],
            achievements: [
                { title: 'National Safety Council Excellence Trophy', description: 'Awarded to site management team for achieving 2 consecutive years of zero lost-time accident frequency.' }
            ]
        }
    },

    [DOMAINS.MECHANICAL_ENGINEERING]: {
        id: DOMAINS.MECHANICAL_ENGINEERING,
        label: 'Mechanical & Thermal Systems Engineering',
        keywords: ['mechanical engineer', 'mechanical design', 'mechanical design engineer', 'mechanical systems', 'mechanical systems engineer', 'thermal systems engineer', 'solidworks', 'cad designer', 'hvac', 'thermal engineer', 'manufacturing engineer', 'mechatronics', 'robotics systems engineer', 'fea', 'ansys', 'automotive engineer', 'tooling'],
        actionVerbs: ['Designed', 'Simulated', 'Engineered', 'Optimized', 'Fabricated', 'Analyzed', 'Standardized', 'Tested', 'Manufactured', 'Streamlined'],
        anchorTerms: ['mechanical', 'cad', 'solidworks', 'fea', 'thermal', 'manufacturing', 'ansys', 'hvac', 'tolerance', 'fabrication'],
        commonDegrees: ['Bachelor of Science in Mechanical Engineering', 'Bachelor of Engineering (B.E.) in Mechanical Engineering', 'Master of Science in Thermal & Mechanical Systems'],
        commonCertifications: ['Professional Engineer (PE) / Chartered Engineer (CEng) - Mechanical', 'Certified SolidWorks Professional (CSWP)', 'Six Sigma Green Belt for Manufacturing'],
        skillCategories: [
            { category: 'Mechanical Design & Modeling', skills: ['SolidWorks / Creo Parametric', 'Computer-Aided Design (CAD)', 'Geometric Dimensioning & Tolerancing (GD&T)', 'Design for Manufacturing (DFM/DFA)'] },
            { category: 'Simulation & Analysis', skills: ['Finite Element Analysis (FEA)', 'ANSYS / Abaqus Simulation', 'Computational Fluid Dynamics (CFD)', 'Thermal Systems Design', 'Kinematic Analysis'] },
            { category: 'Manufacturing & Quality', skills: ['CNC Tooling & Machining', 'Root Cause Failure Analysis (RCFA)', 'FMEA Risk Assessment', 'Lean Manufacturing Standards'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Mechanical Design Engineer',
                    employer: 'Aerospace & Industrial Engineering Enterprise',
                    city: 'Industrial Engineering Center',
                    description: '<ul><li>Designed and analyzed high-precision mechanical assemblies and chassis components using SolidWorks and ANSYS FEA simulations.</li><li>Reduced component manufacturing costs by 22% by applying Design for Manufacturing (DFM) and GD&T tolerance optimizations.</li><li>Supervised prototype fabrication, physical endurance stress-testing, and failure mode effects analysis (FMEA).</li><li>Standardized quality inspection workflows on the assembly line, decreasing defect rates from 3.2% to 0.4%.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science / Engineering in Mechanical Engineering', school: 'Accredited Institute of Technology', city: 'Technical Campus' }
            ],
            projects: [
                { title: 'Thermal Management & Heat Exchanger Loop Optimization', description: 'Engineered compact liquid cooling heat exchanger assembly for heavy powertrains, boosting heat dissipation by 28%.' }
            ],
            certifications: [
                { title: 'Chartered / Professional Engineer License (Mechanical)', issuer: 'Institution of Mechanical Engineers / State Board', category: 'mandatory' },
                { title: 'Certified SolidWorks Professional (CSWP)', issuer: 'Dassault Systèmes', category: 'recommended' }
            ],
            achievements: [
                { title: 'Outstanding Engineering Innovation Award', description: 'Awarded for patented structural weight-reduction design saving 18kg per vehicle chassis.' }
            ]
        }
    },

    [DOMAINS.ELECTRICAL_ENGINEERING]: {
        id: DOMAINS.ELECTRICAL_ENGINEERING,
        label: 'Electrical & Power Systems Engineering',
        keywords: ['electrical engineer', 'electrical', 'power systems', 'substation', 'pcb designer', 'circuit design', 'scada', 'plc', 'high voltage', 'switchgear', 'electronics engineer', 'fpga', 'microcontroller'],
        actionVerbs: ['Engineered', 'Calibrated', 'Simulated', 'Wired', 'Programmed', 'Tested', 'Commissioned', 'Designed', 'Monitored', 'Troubleshot'],
        anchorTerms: ['electrical', 'circuit', 'power', 'voltage', 'scada', 'pcb', 'schematic', 'plc', 'switchgear', 'substation'],
        commonDegrees: ['Bachelor of Science in Electrical Engineering', 'Bachelor of Engineering (B.E.) in Electrical Engineering', 'Master of Science in Power Electronics'],
        commonCertifications: ['Professional Engineer (PE) - Electrical & Power', 'Certified Energy Manager (CEM)', 'Six Sigma Green Belt'],
        skillCategories: [
            { category: 'Power & High Voltage Systems', skills: ['Substation Design & Protection', 'Power Distribution & Load Flow Analysis', 'High Voltage Switchgear & Transformers', 'SCADA & Relay Coordination'] },
            { category: 'Electronics & Circuit Design', skills: ['Schematic Capture & PCB Layout (Altium, Eagle)', 'Analog & Digital Circuit Design', 'Microcontroller Programming', 'Signal Integrity & EMI/EMC Testing'] },
            { category: 'Industrial Automation', skills: ['PLC Programming (Siemens, Allen-Bradley)', 'Industrial HMI Design', 'Commissioning & Preventive Maintenance'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Electrical Power Engineer',
                    employer: 'Power Grid Infrastructure / Industrial Systems Corp',
                    city: 'Industrial Center',
                    description: '<ul><li>Engineered electrical distribution schematics and single-line diagrams for 33kV/11kV substations and industrial facilities.</li><li>Conducted short-circuit, protective relay coordination, and arc flash hazard studies using ETAP simulation software.</li><li>Commissioned PLC automation systems and SCADA telemetry networks with 100% operational uptime.</li><li>Resolved high-voltage transformer insulation and switchgear faults, minimizing unbudgeted plant downtime.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science / Engineering in Electrical Engineering', school: 'Accredited University College of Engineering', city: 'Engineering Campus' }
            ],
            projects: [
                { title: 'Substation SCADA Modernization & Telemetry Upgrade', description: 'Upgraded legacy protective relaying to digital IEC 61850 protocol across 6 regional sub-stations.' }
            ],
            certifications: [
                { title: 'Professional Engineer (PE) - Electrical', issuer: 'State Board of Professional Engineers / Institution of Engineers', category: 'mandatory' },
                { title: 'Certified Energy Manager (CEM)', issuer: 'Association of Energy Engineers (AEE)', category: 'recommended' }
            ],
            achievements: [
                { title: 'Grid Reliability Excellence Commendation', description: 'Recognized by state utilities commission for zero trip outages during peak summer load distribution cycle.' }
            ]
        }
    },

    [DOMAINS.SCIENTIFIC_RESEARCH]: {
        id: DOMAINS.SCIENTIFIC_RESEARCH,
        label: 'Scientific Research & Laboratory Sciences',
        keywords: ['research scientist', 'scientist', 'laboratory', 'chemist', 'biologist', 'clinical research', 'peer-reviewed', 'phd', 'postdoc', 'research fellow', 'spectroscopy', 'pharmacology', 'biochemist', 'physicist'],
        actionVerbs: ['Investigated', 'Synthesized', 'Designed', 'Authored', 'Assayed', 'Calibrated', 'Published', 'Discovered', 'Quantified', 'Validated'],
        anchorTerms: ['scientist', 'experimental', 'laboratory', 'research', 'scientific', 'assay', 'peer-reviewed', 'hypothesis', 'spectroscopy', 'data analysis'],
        commonDegrees: ['Doctor of Philosophy (Ph.D.) in Sciences', 'Master of Science (M.Sc. / M.S.)', 'Bachelor of Science (B.Sc. / B.S.) - Honors'],
        commonCertifications: ['Good Laboratory Practice (GLP) Certified', 'Certified Clinical Research Professional (CCRP)', 'Biosafety Officer Certification'],
        skillCategories: [
            { category: 'Experimental & Analytical Methods', skills: ['Experimental Design & Hypothesis Testing', 'Spectroscopy (NMR, FTIR, UV-Vis)', 'Chromatography (HPLC, GC-MS)', 'Molecular Biology Assays', 'Quality Control & GLP Standards'] },
            { category: 'Scientific Analysis & Computation', skills: ['Statistical Data Analysis (R / Python / GraphPad)', 'Bioinformatics Tools', 'Literature Synthesis & Review', 'Clinical Protocol Formulation'] },
            { category: 'Communication & Grants', skills: ['Peer-Reviewed Scholarly Publishing', 'Grant Proposal Drafting', 'Poster & Oral Conference Presentations', 'Bioethics & Biosafety Compliance'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Postdoctoral Research Scientist',
                    employer: 'National Research Institute / Scientific Laboratories',
                    city: 'Research Triangle',
                    description: '<ul><li>Designed and executed controlled laboratory experiments and characterization assays with high analytical precision.</li><li>Authored 4 original research papers published in high-impact peer-reviewed scientific journals (Q1 ranking).</li><li>Secured competitive institutional research grants through comprehensive scientific proposal drafting.</li><li>Maintained rigorous chemical inventory, laboratory equipment calibrations, and biohazard containment standard operating procedures.</li></ul>'
                }
            ],
            education: [
                { degree: 'Doctor of Philosophy (Ph.D.) in Sciences', school: 'Premier Institute of Science', city: 'Science Campus' }
            ],
            projects: [
                { title: 'Novel Small-Molecule Targeted Assay Development', description: 'Screened 300+ bio-conjugate compounds, identifying 3 lead candidates with sub-nanomolar binding affinity.' }
            ],
            certifications: [
                { title: 'Good Laboratory Practice (GLP) Certification', issuer: 'Quality Council / Laboratory Accreditation Board', category: 'mandatory' },
                { title: 'Certified Clinical Research Professional (CCRP)', issuer: 'Society of Clinical Research Associates (SoCRA)', category: 'recommended' }
            ],
            achievements: [
                { title: 'Young Scientist National Fellowship', description: 'Awarded to top 1% of doctoral researchers nationally for breakthrough work in biomolecular characterization.' }
            ]
        }
    },

    [DOMAINS.HOSPITALITY]: {
        id: DOMAINS.HOSPITALITY,
        label: 'Hospitality, Culinary & Food Service',
        keywords: ['chef', 'executive chef', 'sous chef', 'culinary', 'pastry chef', 'food and beverage', 'f&b', 'food safety', 'catering', 'sommelier', 'kitchen', 'cook', 'baking', 'recipe'],
        actionVerbs: ['Prepared', 'Curated', 'Managed', 'Standardized', 'Executed', 'Orchestrated', 'Supervised', 'Innovated', 'Elevated', 'Directed'],
        anchorTerms: ['culinary', 'chef', 'kitchen', 'restaurant', 'food safety', 'f&b', 'menu', 'banquet', 'catering', 'haccp'],
        commonDegrees: ['Bachelor of Culinary Arts', 'Diploma in Food Production & Culinary Arts', 'Associate Degree in Culinary Arts'],
        commonCertifications: ['ServSafe Food Protection Manager Certification', 'HACCP Level 3 Food Safety Certification', 'Certified Executive Chef (CEC) - ACF'],
        skillCategories: [
            { category: 'Culinary & Production', skills: ['Culinary Arts & Menu Engineering', 'Food Safety & HACCP Standards', 'Banquet & Volume Catering', 'Kitchen Brigade Leadership', 'Recipe Costing & Portion Control'] },
            { category: 'Operations & Service', skills: ['Food & Beverage (F&B) Management', 'Kitchen Operations Oversight', 'Inventory & Food Cost Optimization', 'Point of Sale & Kitchen Management Systems'] },
            { category: 'Quality & Sanitation', skills: ['Health Inspection Compliance', 'Vendor Sourcing & Ingredient Quality', 'Fine Dining Presentation', 'Kitchen Staff Mentorship'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Executive Head Chef',
                    employer: 'Fine Dining Restaurant / Premier Hospitality Group',
                    city: 'Culinary Center',
                    description: '<ul><li>Managed culinary and back-of-house operations for premier restaurant serving 400+ covers daily.</li><li>Engineered seasonal tasting menus and revamped procurement channels, lowering food cost percentage from 34% to 28%.</li><li>Enforced stringent HACCP food hygiene protocols, passing municipal health audits with 100% compliance.</li><li>Led and mentored an international kitchen brigade of 22 chefs and apprentices, fostering high culinary standards.</li></ul>'
                }
            ],
            education: [
                { degree: 'Degree / Diploma in Culinary Arts & Food Production', school: 'Accredited Culinary Institute', city: 'Culinary Campus' }
            ],
            projects: [
                { title: 'Farm-to-Table Sustainable Sourcing Initiative', description: 'Transitioned 70% of produce procurement to certified local organic suppliers, cutting shipping carbon footprint by 40%.' }
            ],
            certifications: [
                { title: 'ServSafe Food Protection Manager', issuer: 'National Restaurant Association', category: 'mandatory' },
                { title: 'HACCP Level 3 Food Safety Certification', issuer: 'Chartered Institute of Environmental Health (CIEH)', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Master Chef Gold Award', description: 'Awarded 1st place in National Hospitality Culinary Challenge for innovative modern gastronomy.' }
            ]
        }
    },

    [DOMAINS.HOTEL_MANAGEMENT]: {
        id: DOMAINS.HOTEL_MANAGEMENT,
        label: 'Hotel Management & Lodging Operations',
        keywords: ['hotel general manager', 'hotel manager', 'general manager hotel', 'hotel director', 'resort manager', 'front office manager', 'hospitality manager', 'housekeeping director', 'concierge', 'guest services', 'lodging', 'banquet manager', 'hotelier', 'hotel'],
        actionVerbs: ['Directed', 'Managed', 'Elevated', 'Orchestrated', 'Optimized', 'Resolved', 'Coordinated', 'Audited', 'Supervised', 'Maximized'],
        anchorTerms: ['hotel', 'hospitality', 'guest', 'lodging', 'resort', 'front office', 'revpar', 'occupancy', 'housekeeping', 'amenities'],
        commonDegrees: ['Bachelor of Hotel Management (BHM)', 'Master of Science in Hospitality Administration', 'Diploma in Hospitality Operations'],
        commonCertifications: ['Certified Hotel Administrator (CHA)', 'Certified Hospitality Supervisor (CHS)', 'CHIA (Hotel Industry Analytics)'],
        skillCategories: [
            { category: 'Hotel Operations & Guest Service', skills: ['Front Office & Guest Relations Management', 'Housekeeping & Facilities Standards', 'VIP Guest Concierge Services', 'Guest Satisfaction Index (GSI) Optimization'] },
            { category: 'Revenue & Inventory Management', skills: ['RevPAR & Average Daily Rate (ADR) Optimization', 'Yield Management & Dynamic Room Pricing', 'Hotel Property Management Systems (Opera PMS)', 'Channel Management'] },
            { category: 'Banquet & Event Operations', skills: ['Banquet & Convention Coordination', 'Corporate Group Sales Logistics', 'Vendor & Supplier Negotiations', 'Hospitality Health & Safety Compliance'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'General Manager / Resident Hotel Manager',
                    employer: 'Luxury Resort & Hotel Properties Group',
                    city: 'Hospitality Destination',
                    description: '<ul><li>Directed daily operations across 250 guest rooms, 3 restaurants, and conference facilities managing an annual budget of $18M.</li><li>Increased RevPAR by 16% year-over-year through dynamic room pricing and strategic corporate group sales partnerships.</li><li>Elevated guest satisfaction ratings from 84% to 96% on major travel platforms through staff hospitality training.</li><li>Supervised department heads across front office, housekeeping, food and beverage, and facilities engineering.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Hotel Management (BHM)', school: 'Accredited Institute of Hotel Management', city: 'Hospitality Campus' }
            ],
            projects: [
                { title: 'Property Management System Cloud Transition', description: 'Migrated hotel front office and reservations to modern cloud PMS with zero disruption to guest check-ins.' }
            ],
            certifications: [
                { title: 'Certified Hotel Administrator (CHA)', issuer: 'American Hotel & Lodging Educational Institute (AHLEI)', category: 'mandatory' },
                { title: 'Certification in Hotel Industry Analytics (CHIA)', issuer: 'STR & AHLEI', category: 'recommended' }
            ],
            achievements: [
                { title: 'Hotelier of the Year Award', description: 'Conferred by Regional Hospitality Association for achieving highest guest retention and profitability index.' }
            ]
        }
    },

    [DOMAINS.AVIATION]: {
        id: DOMAINS.AVIATION,
        label: 'Aviation & Flight Operations',
        keywords: ['pilot', 'airline pilot', 'commercial pilot', 'first officer', 'captain', 'flight instructor', 'aviator', 'atpl', 'cpl', 'flight operations', 'aircraft', 'cockpit', 'aerospace flight', 'avionics', 'flight dispatcher'],
        actionVerbs: ['Piloted', 'Navigated', 'Commanded', 'Inspected', 'Calculated', 'Coordinated', 'Briefed', 'Executed', 'Monitored', 'Landed'],
        anchorTerms: ['pilot', 'flight', 'aircraft', 'aviation', 'cockpit', 'navigation', 'atpl', 'instrument', 'faa', 'crew resource management'],
        commonDegrees: ['Bachelor of Science in Aviation / Aeronautical Science', 'Bachelor of Aerospace Flight Operations', 'Diploma in Aviation Flight Training'],
        commonCertifications: ['Airline Transport Pilot License (ATPL)', 'Commercial Pilot License (CPL) - Multi-Engine', 'Instrument Flight Rating (IFR)', 'FAA First Class Medical Certificate'],
        skillCategories: [
            { category: 'Flight Deck & Piloting Competencies', skills: ['Multi-Engine Aircraft Command', 'Instrument Flight Rules (IFR) Navigation', 'Pre-Flight Briefing & Walkaround Inspection', 'Crosswind & Adverse Weather Operations', 'Autopilot & Flight Management Systems (FMS)'] },
            { category: 'Crew Resource & Safety', skills: ['Crew Resource Management (CRM)', 'Emergency Flight Procedures & Checklist Adherence', 'Aviation Safety Action Program (ASAP)', 'Flight Deck Threat & Error Management (TEM)'] },
            { category: 'Aviation Regulations & Planning', skills: ['Flight Dispatch & Fuel Weight Balance Calculation', 'ICAO & FAA / EASA / DGCA Aviation Regulations', 'NOTAM & Weather Radar Interpretation', 'Air Traffic Control (ATC) Communications'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Commercial Airline Pilot / First Officer',
                    employer: 'National Flag Carrier / Commercial Passenger Airline',
                    city: 'International Airport Hub',
                    description: '<ul><li>Commanded commercial passenger aircraft across domestic and international routes, logging over 4,500 flight hours with zero incident citations.</li><li>Conducted thorough pre-flight inspections, flight planning, weather evaluations, and weight-and-balance calculations.</li><li>Collaborated seamlessly with air traffic control (ATC), dispatchers, and flight attendants adhering to Crew Resource Management (CRM).</li><li>Executed precision instrument approaches (ILS CAT III) in zero-visibility conditions safely and strictly according to standard operating procedures.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Aviation / Aeronautical Science', school: 'Accredited University Aviation Academy', city: 'Flight Training Hub' }
            ],
            projects: [
                { title: 'Airline Fuel Conservation & Optimized Descent Flight Protocol', description: 'Co-developed continuous descent approach guidelines reducing fleet fuel burn by 3.4% across high-density terminal routes.' }
            ],
            certifications: [
                { title: 'Airline Transport Pilot License (ATPL - Multi-Engine Land)', issuer: 'Civil Aviation Authority (FAA / EASA / DGCA / CASA)', category: 'mandatory' },
                { title: 'First Class Aviation Medical Certificate', issuer: 'Aviation Medical Authority', category: 'mandatory' },
                { title: 'Type Rating on Commercial Passenger Aircraft', issuer: 'Accredited Airline Training Center', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Flight Safety Excellence Commendation', description: 'Awarded by airline safety directorate for exemplary emergency diversion management during severe mid-flight engine anomaly.' }
            ]
        }
    },

    [DOMAINS.JOURNALISM]: {
        id: DOMAINS.JOURNALISM,
        label: 'Journalism, Media & Communications',
        keywords: ['journalist', 'reporter', 'editor', 'news writer', 'correspondent', 'investigative journalist', 'columnist', 'copy editor', 'broadcast journalist', 'media relations', 'photojournalist'],
        actionVerbs: ['Investigated', 'Reported', 'Authored', 'Interviewed', 'Edited', 'Fact-Checked', 'Published', 'Uncovered', 'Broadcasted', 'Curated'],
        anchorTerms: ['journalism', 'news', 'reporting', 'investigative', 'editorial', 'article', 'press', 'interviews', 'fact-checking', 'publication'],
        commonDegrees: ['Bachelor of Arts in Journalism / Mass Communication', 'Master of Science in Investigative Journalism', 'Bachelor of Arts in English / Media Studies'],
        commonCertifications: ['Professional Journalism Society Member', 'Digital Media & Fact-Checking Credential', 'Investigative Reporters and Editors (IRE) Certification'],
        skillCategories: [
            { category: 'News Gathering & Investigation', skills: ['Investigative Reporting & Deep Sourcing', 'Freedom of Information Act (FOIA) Requests', 'Field Interviewing Techniques', 'Documentary & Archival Verification', 'Breaking News Coverage'] },
            { category: 'Writing & Editorial', skills: ['Long-Form Feature Writing', 'Copy Editing & AP Stylebook Compliance', 'Headline Formulation & SEO Journalism', 'Fact-Checking & Legal Defamation Screening'] },
            { category: 'Multimedia & Digital Production', skills: ['Audio Podcasting & Radio Reporting', 'Mobile Video Journalism & Field Recording', 'Content Management Systems (WordPress)', 'Digital Audience Engagement'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Investigative Journalist / Staff Reporter',
                    employer: 'National News Organization / Daily Broadcaster',
                    city: 'Media Capital',
                    description: '<ul><li>Researched, reported, and authored 120+ front-page investigative features on public policy, governance, and corporate accountability.</li><li>Conducted in-depth interviews with government officials, industry executives, and civic whistleblowers.</li><li>Verified public records, financial disclosures, and legal filings, ensuring 100% factual accuracy under stringent editorial deadlines.</li><li>Produced companion digital multimedia packages and podcasts that increased reader engagement time by 45%.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Arts in Journalism & Mass Communication', school: 'Accredited University School of Journalism', city: 'Media Campus' }
            ],
            projects: [
                { title: 'Public Procurement Transparency Investigative Series', description: 'Authored multi-part investigative series uncovering civic contract irregularities, prompting official municipal inquiry.' }
            ],
            certifications: [
                { title: 'Professional Member Credential', issuer: 'Society of Professional Journalists / Press Council', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Press Association Excellence in Journalism Citation', description: 'Awarded for outstanding investigative reporting in public affairs category.' }
            ]
        }
    },

    [DOMAINS.GOVERNMENT]: {
        id: DOMAINS.GOVERNMENT,
        label: 'Government Administration & Public Policy',
        keywords: ['government officer', 'civil servant', 'public administrator', 'policy analyst', 'ias', 'ips', 'municipal officer', 'revenue officer', 'public affairs', 'public sector', 'panchayat', 'deputy collector', 'administrative officer'],
        actionVerbs: ['Administered', 'Enacted', 'Coordinated', 'Drafted', 'Managed', 'Supervised', 'Facilitated', 'Directed', 'Mobilized', 'Streamlined'],
        anchorTerms: ['public', 'government', 'policy', 'administration', 'statutory', 'scheme', 'citizen', 'welfare', 'inter-agency', 'budgeting'],
        commonDegrees: ['Master of Public Policy (MPP)', 'Master of Public Administration (MPA)', 'Bachelor of Arts in Political Science / Governance'],
        commonCertifications: ['Civil Services Commissioning / Administrative Credential', 'Certificate in Public Policy Analysis', 'e-Governance Project Management Credential'],
        skillCategories: [
            { category: 'Policy & Administration', skills: ['Public Policy Formulation', 'Government Welfare Program Administration', 'Inter-Agency Coordination', 'Statutory Regulatory Compliance'] },
            { category: 'Public Finance & Operations', skills: ['Public Budgeting & Expenditure Oversight', 'Public Procurement Guidelines', 'Citizen Grievance Redressal', 'Transparency & Public Records Compliance'] },
            { category: 'Digital Governance', skills: ['Digital Citizen Portals Administration', 'Crisis & Disaster Management Operations', 'Civic Stakeholder Consultations', 'Executive Administrative Reporting'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Public Sector Program Director / Administrative Officer',
                    employer: 'Department of Public Administration / Municipal Commission',
                    city: 'Administrative Capital',
                    description: '<ul><li>Supervised execution of welfare and civic infrastructure programs reaching over 250,000 citizens.</li><li>Managed public treasury allocations of $45M, enforcing strict transparency guidelines and public audit accountability.</li><li>Streamlined citizen service delivery through digital portals, cutting grievance turnaround from 30 days to 7 days.</li><li>Coordinated multi-departmental administrative operations during municipal emergency relief and recovery efforts.</li></ul>'
                }
            ],
            education: [
                { degree: 'Master of Public Policy (MPP) / Public Administration', school: 'National School of Public Policy & Governance', city: 'Capital Campus' }
            ],
            projects: [
                { title: 'Digital Citizen Service Portal Modernization', description: 'Digitized 42 civic certificate issuance workflows, serving 150,000+ online applicant requests annually.' }
            ],
            certifications: [
                { title: 'Certificate in Public Policy Analysis', issuer: 'National Institute of Public Policy', category: 'mandatory' },
                { title: 'Executive Certificate in e-Governance Administration', issuer: 'National e-Governance Division', category: 'recommended' }
            ],
            achievements: [
                { title: 'Governor\'s Citation for Administrative Excellence', description: 'Commended for leading 100% timely execution of district-wide public healthcare welfare distribution.' }
            ]
        }
    },

    [DOMAINS.PUBLIC_SAFETY]: {
        id: DOMAINS.PUBLIC_SAFETY,
        label: 'Law Enforcement & Public Safety',
        keywords: ['police officer', 'police', 'detective', 'law enforcement', 'investigator', 'sergeant', 'deputy sheriff', 'constable', 'patrol officer', 'inspector', 'lieutenant', 'state trooper'],
        actionVerbs: ['Investigated', 'Patrolled', 'Apprehended', 'Secured', 'Testified', 'Enforced', 'De-escalated', 'Responded', 'Coordinated', 'Drafted'],
        anchorTerms: ['police', 'investigation', 'patrol', 'law enforcement', 'evidence', 'crime scene', 'arrest', 'safety', 'courtroom testimony', 'de-escalation'],
        commonDegrees: ['Bachelor of Science in Criminal Justice / Criminology', 'Associate Degree in Law Enforcement', 'Bachelor of Arts in Police Studies'],
        commonCertifications: ['Peace Officer Standards and Training (POST) Certification', 'First Aid / CPR / AED Responder', 'Crisis Intervention Team (CIT) Certified', 'Advanced Firearms Qualification'],
        skillCategories: [
            { category: 'Investigation & Law Enforcement', skills: ['Criminal Investigation & Case Management', 'Crime Scene Preservation & Evidence Collection', 'Suspect & Witness Interrogation', 'Search Warrant Execution', 'Statutory Penal Code Enforcement'] },
            { category: 'Patrol & Emergency Operations', skills: ['Community Policing & Patrol Tactics', 'Crisis De-escalation & Conflict Resolution', 'Emergency Vehicle Operations (EVOC)', 'Crowd Management & Active Threat Response'] },
            { category: 'Legal Procedure & Courtroom', skills: ['Courtroom Testimony & Evidence Presentation', 'Arrest & Booking Documentation', 'Incident Report Writing', 'Inter-Agency Task Force Coordination'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Police Detective / Patrol Sergeant',
                    employer: 'Municipal Police Department / Law Enforcement Bureau',
                    city: 'Civic Safety Precinct',
                    description: '<ul><li>Conducted criminal investigations into felony property crimes and offenses, maintaining an 85% case clearance rate.</li><li>Processed crime scenes, gathered physical evidence, and prepared detailed forensic documentation for prosecutors.</li><li>Delivered expert testimony in municipal and district courts resulting in successful grand jury indictments.</li><li>Utilized certified crisis de-escalation techniques in high-stress emergency response calls with zero civilian injuries.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Criminal Justice & Police Studies', school: 'Accredited State Police Academy / University', city: 'Academy Campus' }
            ],
            projects: [
                { title: 'Community Policing & Youth Outreach Program', description: 'Established quarterly community listening sessions across 4 precincts, improving neighborhood trust scores by 35%.' }
            ],
            certifications: [
                { title: 'State Law Enforcement Officer / POST Certification', issuer: 'State Commission on Law Enforcement Standards', category: 'mandatory' },
                { title: 'Crisis Intervention Team (CIT) Certification', issuer: 'National CIT Association', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Distinguished Service Medal for Valor', description: 'Conferred by Police Commissioner for courageous crisis resolution and life-saving action during armed civic emergency.' }
            ]
        }
    },

    [DOMAINS.DEFENSE]: {
        id: DOMAINS.DEFENSE,
        label: 'Armed Forces & Defense',
        keywords: ['military officer', 'army', 'navy', 'air force', 'armed forces', 'battalion', 'platoon', 'commanding officer', 'veteran', 'infantry', 'tactical officer'],
        actionVerbs: ['Commanded', 'Mobilized', 'Coordinated', 'Executed', 'Led', 'Maintained', 'Trained', 'Planned', 'Secured', 'Navigated'],
        anchorTerms: ['military', 'defense', 'command', 'tactical', 'operations', 'mission', 'personnel', 'readiness', 'logistics', 'security clearance'],
        commonDegrees: ['Bachelor of Science / Arts from Military Academy', 'Master of Science in Strategic Defense Studies', 'Bachelor of Defense Operations'],
        commonCertifications: ['Commissioned Officer Credential', 'Defense Security Clearance (Secret / Top Secret)', 'Joint Operations Staff Planning Credential'],
        skillCategories: [
            { category: 'Tactical & Operational Leadership', skills: ['Command & Troop Leadership', 'Tactical Mission Planning & Execution', 'Risk Mitigation in High-Stress Environments', 'Strategic Resource Allocation'] },
            { category: 'Logistics & Supply Readiness', skills: ['Supply Chain & Materiel Readiness Oversight', 'Equipment Maintenance Programs', 'Personnel Training & Drill Instruction', 'Standard Operating Procedures Enforcement'] },
            { category: 'Security & Intelligence', skills: ['Operational Security (OPSEC) Protocols', 'Intelligence Briefings & Threat Assessment', 'Joint Services Coordination', 'Physical Security & Asset Protection'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Commissioned Officer / Operations Commander',
                    employer: 'Armed Forces Command / Defense Headquarters',
                    city: 'Base Headquarters',
                    description: '<ul><li>Commanded 120-personnel tactical unit, ensuring 100% operational readiness, discipline, and equipment accountability.</li><li>Orchestrated logistics and field supply operations supporting multi-domain training maneuvers under austere conditions.</li><li>Conducted daily threat intelligence briefings and coordinated inter-agency security protocols.</li><li>Mentored junior non-commissioned officers, achieving highest retention and advancement rate in the brigade.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Strategic Leadership', school: 'National Defense Academy / Military College', city: 'Command Campus' }
            ],
            projects: [
                { title: 'Base Readiness & Equipment Lifecycle Overhaul', description: 'Restructured motorized unit maintenance schedules, improving combat vehicle readiness from 82% to 96%.' }
            ],
            certifications: [
                { title: 'Commissioned Officer Certificate of Service', issuer: 'Ministry / Department of Defense', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Meritorious Service Commendation', description: 'Awarded by Commanding General for exceptional operational planning and zero equipment loss during multi-unit field exercises.' }
            ]
        }
    },

    [DOMAINS.NON_PROFIT]: {
        id: DOMAINS.NON_PROFIT,
        label: 'Non-Profit & Humanitarian Development',
        keywords: ['ngo', 'non-profit', 'humanitarian', 'grant writer', 'program coordinator', 'fundraising director', 'social worker', 'donor relations', 'community development', 'philanthropy'],
        actionVerbs: ['Mobilized', 'Spearheaded', 'Secured', 'Administered', 'Coordinated', 'Advocated', 'Partnered', 'Facilitated', 'Delivered', 'Monitored'],
        anchorTerms: ['ngo', 'non-profit', 'community', 'humanitarian', 'grants', 'donor', 'fundraising', 'advocacy', 'volunteers', 'development'],
        commonDegrees: ['Master of Social Work (MSW)', 'Master of International Development', 'Bachelor of Arts in Sociology / Public Affairs'],
        commonCertifications: ['Certified Fund Raising Executive (CFRE)', 'Project Management for Development Professionals (PMD Pro)', 'Grant Writing Professional'],
        skillCategories: [
            { category: 'Program Management & Impact', skills: ['Humanitarian Program Design & Execution', 'Monitoring & Evaluation (M&E) Frameworks', 'Community Needs Assessment', 'Grassroots Stakeholder Mobilization'] },
            { category: 'Fundraising & Donor Relations', skills: ['Grant Proposal Writing & Submission', 'High-Net-Worth Donor Cultivation', 'Annual Fundraising Campaign Strategy', 'Philanthropic Foundation Partnerships'] },
            { category: 'Advocacy & Volunteer Leadership', skills: ['Volunteer Recruitment & Retention', 'Public Awareness & Grassroots Advocacy', 'Non-Profit Governance Compliance', 'Budget Accountability & Reporting'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Humanitarian Program Director / NGO Lead',
                    employer: 'International Development Agency / Global Relief Alliance',
                    city: 'Regional Center',
                    description: '<ul><li>Directed community health and education programs across 12 field locations, improving outcomes for 40,000+ beneficiaries.</li><li>Secured $3.2M in institutional grants from bilateral donor agencies and philanthropic foundations.</li><li>Designed comprehensive monitoring and evaluation (M&E) frameworks ensuring 100% compliance with grant covenants.</li><li>Supervised team of 25 field coordinators, specialists, and community outreach volunteers.</li></ul>'
                }
            ],
            education: [
                { degree: 'Master of International Development / Social Work', school: 'Accredited University School of Social Work', city: 'Civic Campus' }
            ],
            projects: [
                { title: 'Clean Water & Community Sanitation Infrastructure', description: 'Installed 18 solar-powered water filtration stations across rural settlements, reducing waterborne illness by 55%.' }
            ],
            certifications: [
                { title: 'Project Management for Development Professionals (PMD Pro)', issuer: 'PM4NGOs', category: 'mandatory' },
                { title: 'Certified Fund Raising Executive (CFRE)', issuer: 'CFRE International', category: 'recommended' }
            ],
            achievements: [
                { title: 'Humanitarian Leadership Impact Award', description: 'Recognized by international humanitarian council for innovative rapid response program during climate displacement crisis.' }
            ]
        }
    },

    [DOMAINS.PERFORMING_ARTS]: {
        id: DOMAINS.PERFORMING_ARTS,
        label: 'Music & Performing Arts',
        keywords: ['musician', 'pianist', 'violinist', 'singer', 'composer', 'conductor', 'music producer', 'cellist', 'orchestra', 'performing artist', 'audio engineer', 'sound designer'],
        actionVerbs: ['Performed', 'Composed', 'Arranged', 'Rehearsed', 'Conducted', 'Recorded', 'Produced', 'Curated', 'Collaborated', 'Mastered'],
        anchorTerms: ['music', 'performance', 'orchestra', 'repertoire', 'concert', 'composition', 'audio', 'sound', 'ensemble', 'instrumental'],
        commonDegrees: ['Bachelor of Music (B.Mus) in Performance / Composition', 'Master of Music (M.Mus)', 'Doctor of Musical Arts (DMA)', 'Diploma in Sound Engineering'],
        commonCertifications: ['ABRSM Advanced Music Diploma', 'Pro Tools Certified Operator', 'Professional Musicians Union Membership'],
        skillCategories: [
            { category: 'Musical Performance & Technique', skills: ['Solo & Chamber Instrumental Performance', 'Sight-Reading & Score Study', 'Intonation & Dynamic Expression', 'Ensemble & Orchestral Rehearsal Discipline', 'Stage Presence & Recital Presentation'] },
            { category: 'Composition & Arranging', skills: ['Music Theory & Harmonic Analysis', 'Orchestration & Sectional Arranging', 'DAW Software (Logic Pro, Sibelius, Pro Tools)', 'Jingle & Film Scoring Composition'] },
            { category: 'Audio Production & Studio', skills: ['Studio Microphone Placement & Recording', 'Acoustic Balancing & Audio Mixing', 'Live Sound Reinforcement', 'Digital Audio Mastering'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Principal Concert Musician / Instrumental Soloist',
                    employer: 'Symphony Orchestra / Performing Arts Ensemble',
                    city: 'Cultural Arts Center',
                    description: '<ul><li>Performed as principal instrumental soloist across 60+ seasonal subscription concerts and international concert tours.</li><li>Collaborated with guest conductors and guest vocalists on classical, romantic, and contemporary orchestral repertoire.</li><li>Led sectional masterclasses and mentored conservatory apprentice musicians on tone production and phrasing.</li><li>Recorded studio albums and broadcast live performances for national public radio networks.</li></ul>'
                }
            ],
            education: [
                { degree: 'Master of Music (M.Mus) in Instrumental Performance', school: 'Accredited Conservatory of Music', city: 'Arts Campus' }
            ],
            projects: [
                { title: 'Classical Chamber Music Community Outreach Series', description: 'Curated 12 accessible chamber concerts in public libraries and schools, introducing orchestral instruments to 2,500 youth.' }
            ],
            certifications: [
                { title: 'Fellowship / Licentiate in Performance Diploma', issuer: 'Associated Board of the Royal Schools of Music (ABRSM)', category: 'mandatory' },
                { title: 'Pro Tools Certified Specialist', issuer: 'Avid Technology', category: 'recommended' }
            ],
            achievements: [
                { title: 'International Soloist Competition 1st Prize Winner', description: 'Awarded 1st Place Gold Medal among 85 international conservatory competitors in annual concerto competition.' }
            ]
        }
    },

    [DOMAINS.SPORTS]: {
        id: DOMAINS.SPORTS,
        label: 'Athletics, Sports & Physical Performance',
        keywords: ['athlete', 'sports coach', 'athletic coach', 'performance coach', 'athletic trainer', 'fitness director', 'strength coach', 'personal trainer', 'swimmer', 'track and field', 'sports performance', 'kinesiologist', 'athletic', 'strength and conditioning', 'coach', 'athletics'],
        actionVerbs: ['Trained', 'Conditioned', 'Competed', 'Coached', 'Demonstrated', 'Maximized', 'Analyzed', 'Mentored', 'Rehabilitated', 'Achieved'],
        anchorTerms: ['athlete', 'training', 'sports', 'fitness', 'conditioning', 'competition', 'strength', 'kinesiology', 'injury prevention', 'championship'],
        commonDegrees: ['Bachelor of Science in Kinesiology / Sports Science', 'Master of Science in Athletic Training', 'Bachelor of Physical Education (B.P.Ed)'],
        commonCertifications: ['Certified Strength and Conditioning Specialist (CSCS)', 'Certified Athletic Trainer (ATC)', 'NASM / ACE Certified Personal Trainer', 'CPR / AED Responder'],
        skillCategories: [
            { category: 'Physical Training & Conditioning', skills: ['Periodized Strength & Conditioning Programs', 'Biomechanics & Movement Analysis', 'Speed, Agility, and Quickness (SAQ) Drills', 'Aerobic & Anaerobic Energy System Conditioning'] },
            { category: 'Injury Prevention & Recovery', skills: ['Sports Injury Prevention & Screening', 'Rehabilitative Exercise Protocols', 'Athletic Taping & Soft Tissue Recovery', 'Sports Nutrition & Hydration Strategy'] },
            { category: 'Coaching & Performance Psychology', skills: ['Game Strategy & Tactical Video Analysis', 'Mental Toughness & Peak Performance Mindset', 'Individual & Team Performance Metric Tracking', 'Youth & Elite Athlete Mentorship'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Head Athletic Performance Coach / Competitive Athlete',
                    employer: 'Elite Sports Academy / Collegiate Athletics Dept',
                    city: 'Sports Training Complex',
                    description: '<ul><li>Designed and implemented periodized strength and conditioning regimens for 65 competitive collegiate athletes.</li><li>Reduced non-contact musculoskeletal sports injuries by 35% through movement screening and functional mobility drills.</li><li>Conducted GPS biometric workload tracking and heart-rate variability assessments to prevent overtraining.</li><li>Coached athletes to achieve 14 national championship qualification marks and personal record performances.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Kinesiology & Exercise Physiology', school: 'Accredited University Sports Science Institute', city: 'Athletics Campus' }
            ],
            projects: [
                { title: 'High-Performance Return-to-Play Rehabilitation Protocol', description: 'Developed collaborative sports physical therapy transition protocol cutting post-ACL reconstruction recovery lag by 6 weeks.' }
            ],
            certifications: [
                { title: 'Certified Strength and Conditioning Specialist (CSCS)', issuer: 'National Strength and Conditioning Association (NSCA)', category: 'mandatory' },
                { title: 'Certified Athletic Trainer (ATC)', issuer: 'Board of Certification for the Athletic Trainer', category: 'recommended' }
            ],
            achievements: [
                { title: 'Coach of the Year Honors', description: 'Awarded by Regional Athletic Conference after leading varsity squad to undefeated state championship title.' }
            ]
        }
    },

    [DOMAINS.PHOTOGRAPHY]: {
        id: DOMAINS.PHOTOGRAPHY,
        label: 'Photography & Visual Media',
        keywords: ['photographer', 'cinematographer', 'photojournalist', 'commercial photographer', 'studio photographer', 'portrait photographer', 'lighting director', 'videographer', 'drone pilot aerial'],
        actionVerbs: ['Captured', 'Framed', 'Illuminated', 'Retouched', 'Edited', 'Curated', 'Composed', 'Produced', 'Directed', 'Calibrated'],
        anchorTerms: ['photography', 'camera', 'lighting', 'lens', 'retouching', 'studio', 'portrait', 'commercial', 'shutter', 'visual'],
        commonDegrees: ['Bachelor of Fine Arts (BFA) in Photography', 'Associate Degree in Commercial Photography', 'Diploma in Digital Imaging & Cinematography'],
        commonCertifications: ['Certified Professional Photographer (CPP)', 'FAA Part 107 Remote Pilot (Drone) License', 'Adobe Photoshop / Lightroom Certified'],
        skillCategories: [
            { category: 'Studio & Location Lighting', skills: ['Studio Strobe & Continuous Lighting Setup', 'Three-Point Lighting & Light Modifiers', 'Ambient Light Balancing on Location', 'Color Temperature Calibration (Kelvin)'] },
            { category: 'Camera Operation & Composition', skills: ['Medium Format & Full-Frame DSLR/Mirrorless Cameras', 'Prime & Zoom Lens Focal Length Selection', 'Creative Visual Composition & Framing', 'High-Speed Action & Event Photography'] },
            { category: 'Post-Production & Digital Darkroom', skills: ['High-End Skin Retouching & Color Grading', 'RAW Asset Workflow (Capture One, Lightroom)', 'Commercial Product Compositing (Photoshop)', 'Asset Archiving & Client Proof Galleries'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Commercial Studio Photographer & Director',
                    employer: 'Visual Media Productions / Commercial Studio',
                    city: 'Creative Studio Hub',
                    description: '<ul><li>Directed and shot 80+ commercial advertising, editorial, and product catalog campaigns for national lifestyle brands.</li><li>Engineered sophisticated multi-light studio setups, delivering flawless color accuracy and highlight rendition.</li><li>Managed digital post-production workflow, executing high-end color grading and retouching across 10,000+ delivered assets.</li><li>Supervised assistant photographers, stylists, and digital techs on multi-day commercial location shoots.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Fine Arts (BFA) in Photography', school: 'Accredited College of Art & Design', city: 'Visual Arts Campus' }
            ],
            projects: [
                { title: 'Editorial Heritage Visual Portrait Series', description: 'Curated and published limited-edition visual monographs featuring authentic portraits of regional artisans.' }
            ],
            certifications: [
                { title: 'Certified Professional Photographer (CPP)', issuer: 'Professional Photographers of America (PPA)', category: 'mandatory' },
                { title: 'FAA Part 107 Certified Commercial Drone Pilot', issuer: 'Federal Aviation Administration (FAA)', category: 'recommended' }
            ],
            achievements: [
                { title: 'International Photography Awards Gold Medal', description: 'Awarded 1st Place in Commercial Advertising Category among 2,500 international submissions.' }
            ]
        }
    },

    [DOMAINS.SKILLED_TRADES]: {
        id: DOMAINS.SKILLED_TRADES,
        label: 'Skilled Trades & Industrial Craftsmanship',
        keywords: ['electrician', 'plumber', 'carpenter', 'machinist', 'welder', 'hvac technician', 'millwright', 'pipefitter', 'journeyman', 'master electrician', 'fabricator', 'cnc machinist', 'boilermaker'],
        actionVerbs: ['Fabricated', 'Installed', 'Repaired', 'Calibrated', 'Wired', 'Troubleshot', 'Inspected', 'Welded', 'Assembled', 'Maintained'],
        anchorTerms: ['trades', 'fabrication', 'installation', 'wiring', 'welding', 'machining', 'blueprints', 'troubleshooting', 'repairs', 'code compliance'],
        commonDegrees: ['Journeyman Trade License', 'Associate of Applied Science in Industrial Technology', 'Vocational Apprenticeship Diploma in Electrical / Machining / HVAC'],
        commonCertifications: ['Master Electrician / Master Plumber License', 'AWS Certified Welder (D1.1 / D1.2)', 'EPA Universal HVAC Section 608 Certification', 'OSHA 30 Construction Safety'],
        skillCategories: [
            { category: 'Trade Execution & Installation', skills: ['Electrical Conduit Bending & High-Voltage Wiring', 'Precision TIG / MIG / Arc Welding', 'Plumbing Rough-In & High-Pressure Pipe Fitting', 'CNC Milling, Turning & G-Code Programming', 'Blueprint & Schematic Reading'] },
            { category: 'Troubleshooting & Maintenance', skills: ['Industrial Motor Controls & Relay Diagnostics', 'Hydraulic & Pneumatic Troubleshooting', 'HVAC Refrigerant Recovery & System Charging', 'Preventive Maintenance Scheduling'] },
            { category: 'Safety & Code Compliance', skills: ['National Electrical Code (NEC) Compliance', 'Plumbing & Gas Code Standards', 'OSHA 30 Construction Safety Protocols', 'Lockout / Tagout (LOTO) Procedures'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Master Electrician / Industrial Trades Specialist',
                    employer: 'Industrial Facility Maintenance / Electrical Services',
                    city: 'Industrial Center',
                    description: '<ul><li>Installed, tested, and maintained industrial electrical distribution equipment, switchgear, and motor control centers.</li><li>Diagnosed and repaired electrical and mechanical machine failures, restoring production lines within critical downtime windows.</li><li>Read and interpreted complex schematics, architectural blueprints, and circuit diagrams with zero layout errors.</li><li>Enforced stringent OSHA 30 standards and Lockout/Tagout (LOTO) protocols across 200,000 safe working hours.</li></ul>'
                }
            ],
            education: [
                { degree: 'Journeyman / Master Apprenticeship Certification', school: 'Vocational Technical Trade Academy', city: 'Technical Center' }
            ],
            projects: [
                { title: 'Manufacturing Plant Power Distribution Upgrade', description: 'Replaced outdated motor control panels with energy-efficient variable frequency drives (VFDs), cutting facility power consumption by 18%.' }
            ],
            certifications: [
                { title: 'Master Electrician License / State Trade Credential', issuer: 'State Licensing Board / Department of Labor', category: 'mandatory' },
                { title: 'OSHA 30-Hour Construction Safety Certification', issuer: 'OSHA Training Institute', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Industrial Trades Craftsmanship Excellence Citation', description: 'Recognized for achieving 100% first-time inspection approval across 45 major commercial facility fit-outs.' }
            ]
        }
    },

    [DOMAINS.SOFTWARE_ENGINEERING]: {
        id: DOMAINS.SOFTWARE_ENGINEERING,
        label: 'Software & Cloud Systems Engineering',
        keywords: ['software engineer', 'software developer', 'frontend developer', 'backend developer', 'frontend engineer', 'backend engineer', 'fullstack', 'frontend', 'backend', 'devops', 'cloud architect', 'programmer', 'systems programmer', 'web developer', 'site reliability engineer', 'sre', 'cybersecurity', 'security analyst', 'infosec', 'penetration tester', 'security engineer'],
        actionVerbs: ['Architected', 'Engineered', 'Developed', 'Scaled', 'Automated', 'Deployed', 'Refactored', 'Optimized', 'Integrated', 'Built'],
        anchorTerms: ['software', 'code', 'system', 'api', 'architecture', 'cloud', 'database', 'developer', 'microservices', 'git'],
        commonDegrees: ['Bachelor of Science / Technology in Computer Science', 'Master of Science in Software Systems', 'Bachelor of Computer Applications (BCA)'],
        commonCertifications: ['AWS Certified Solutions Architect', 'Certified Information Systems Security Professional (CISSP)', 'CompTIA Security+ Certification', 'Certified Kubernetes Administrator (CKA)'],
        skillCategories: [
            { category: 'Core Development', skills: ['JavaScript', 'React.js', 'TypeScript', 'Node.js', 'Python', 'Java', 'SQL & Relational Databases'] },
            { category: 'Cloud & Infrastructure', skills: ['Cloud Architecture (AWS / GCP / Azure)', 'Docker & Containerization', 'Kubernetes Orchestration', 'CI/CD Pipelines', 'Linux Systems Administration', 'Microservices Design'] },
            { category: 'Engineering Practices', skills: ['Distributed Systems Design', 'REST & GraphQL APIs', 'Git Version Control', 'Agile / Scrum Methodologies', 'Test-Driven Development (TDD)'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Software Engineer',
                    employer: 'Technology Enterprise / Cloud Software Solutions',
                    city: 'Technology Corridor',
                    description: '<ul><li>Architected and scaled distributed backend microservices serving 10M+ daily requests with 99.99% uptime availability.</li><li>Reduced p99 database query response latency by 35% through Redis caching layers and relational query plan indexing.</li><li>Mentored junior engineers and instituted automated CI/CD code quality gates, increasing release deployment frequency.</li><li>Designed robust RESTful APIs and event-driven consumer pipelines handling high-throughput asynchronous payloads.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science / Technology in Computer Science', school: 'Accredited Institute of Technology', city: 'Tech Campus' }
            ],
            projects: [
                { title: 'High-Concurrency Event Processing Engine', description: 'Engineered fault-tolerant event streaming platform handling 50K events/second with sub-second delivery guarantees.' }
            ],
            certifications: [
                { title: 'AWS Certified Solutions Architect - Associate', issuer: 'Amazon Web Services', category: 'mandatory' },
                { title: 'Certified Kubernetes Administrator (CKA)', issuer: 'CNCF / Linux Foundation', category: 'recommended' }
            ],
            achievements: [
                { title: 'Engineering Excellence Award', description: 'Recognized for leading critical production database migration with zero downtime and zero data loss.' }
            ]
        }
    },

    [DOMAINS.DATA_SCIENCE]: {
        id: DOMAINS.DATA_SCIENCE,
        label: 'Data Science & Machine Learning',
        keywords: ['data scientist', 'machine learning', 'ml engineer', 'ai engineer', 'data analyst', 'deep learning', 'pytorch', 'tensorflow', 'nlp', 'computer vision', 'statistical modeling', 'big data'],
        actionVerbs: ['Trained', 'Modeled', 'Deployed', 'Engineered', 'Visualized', 'Extracted', 'Analyzed', 'Validated', 'Optimized', 'Formulated'],
        anchorTerms: ['data science', 'machine learning', 'statistical', 'models', 'algorithms', 'pytorch', 'tensorflow', 'predictive', 'analytics', 'dataset'],
        commonDegrees: ['Master of Science in Data Science / Statistics', 'B.S. in Artificial Intelligence & Data Science', 'Ph.D. in Computational Sciences'],
        commonCertifications: ['TensorFlow Developer Certificate', 'AWS Certified Machine Learning - Specialty', 'Databricks Certified Machine Learning Associate'],
        skillCategories: [
            { category: 'Machine Learning & AI', skills: ['Supervised & Unsupervised Learning', 'Deep Learning (PyTorch / TensorFlow)', 'Natural Language Processing (NLP)', 'Computer Vision', 'LLM Fine-Tuning & Prompt Engineering'] },
            { category: 'Data Engineering & Analytics', skills: ['Python (Pandas, NumPy, Scikit-Learn)', 'SQL & Big Data Processing (Spark)', 'Statistical Hypothesis Testing', 'Feature Engineering & Data Wrangling'] },
            { category: 'MLOps & Visualization', skills: ['Model Deployment (FastAPI, Docker)', 'MLflow / Experiment Tracking', 'Tableau & Power BI Dashboards', 'A/B Testing Frameworks'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Machine Learning Scientist',
                    employer: 'Analytics Platform / AI Research Laboratory',
                    city: 'Analytics Center',
                    description: '<ul><li>Built and deployed predictive machine learning models in production, delivering 92% classification accuracy on business churn.</li><li>Engineered automated ETL pipelines processing 2 TB of daily behavioral telemetry data into structured feature stores.</li><li>Collaborated with product stakeholders to translate strategic questions into statistically valid experiments.</li><li>Monitored production model performance, tracking data drift and retraining cycles to prevent inference degradation.</li></ul>'
                }
            ],
            education: [
                { degree: 'Master of Science in Data Science / Statistics', school: 'Accredited Statistical Institute', city: 'Data Campus' }
            ],
            projects: [
                { title: 'Real-Time Fraud Detection Machine Learning Pipeline', description: 'Developed anomaly detection models screening 5M transactions daily with 99.4% precision.' }
            ],
            certifications: [
                { title: 'TensorFlow Developer Certificate', issuer: 'Google', category: 'mandatory' },
                { title: 'AWS Certified Machine Learning - Specialty', issuer: 'Amazon Web Services', category: 'recommended' }
            ],
            achievements: [
                { title: 'Kaggle Competition Master', description: 'Ranked in top 0.5% globally among 150,000 data scientists in predictive modeling benchmark.' }
            ]
        }
    },

    [DOMAINS.GENERAL_BUSINESS]: {
        id: DOMAINS.GENERAL_BUSINESS,
        label: 'Business Operations & Management',
        keywords: ['business operations manager', 'business operations director', 'business analyst', 'project manager', 'chief of staff', 'general manager', 'executive assistant to ceo', 'chief operating officer', 'coo', 'management consultant'],
        actionVerbs: ['Orchestrated', 'Delivered', 'Streamlined', 'Managed', 'Improved', 'Executed', 'Standardized', 'Facilitated', 'Spearheaded', 'Optimized'],
        anchorTerms: ['business operations', 'project management', 'business process', 'operational excellence', 'stakeholder management', 'business strategy'],
        commonDegrees: ['Bachelor of Business Administration (BBA)', 'Master of Business Administration (MBA)', 'Bachelor of Arts / Commerce'],
        commonCertifications: ['Project Management Professional (PMP)', 'Lean Six Sigma Green Belt', 'Certified ScrumMaster (CSM)'],
        skillCategories: [
            { category: 'Operations & Strategy', skills: ['Operational Excellence', 'Process Optimization', 'Strategic Planning', 'Cross-Functional Leadership', 'Change Management'] },
            { category: 'Project & Execution', skills: ['Project Management (PMP)', 'Stakeholder Communication', 'Budget & Resource Allocation', 'Risk Mitigation'] },
            { category: 'Analysis & Quality', skills: ['Root Cause Analysis', 'KPI & Performance Dashboards', 'Vendor Management', 'Continuous Improvement'] },
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Operations Manager / Business Director',
                    employer: 'Commercial Enterprise / Logistics Solutions',
                    city: 'Commercial Hub',
                    description: '<ul><li>Directed cross-functional operations across 4 facility locations, managing annual operating budget.</li><li>Redesigned standard operating procedures (SOPs) and supply chain handoffs, reducing operational fulfillment delays by 28%.</li><li>Led regular stakeholder reviews with business leadership, tracking operational KPIs and maintaining 99% SLA delivery.</li><li>Implemented cost optimization programs delivering 15% annualized savings without compromising delivery quality.</li></ul>'
                }
            ],
            education: [
                { degree: 'Master of Business Administration (MBA) / BBA', school: 'Accredited School of Business & Management', city: 'Business Campus' }
            ],
            projects: [
                { title: 'Enterprise Workflow Automation & Process Standardization', description: 'Eliminated manual documentation redundancies across 8 departments, saving 350 operational man-hours monthly.' }
            ],
            certifications: [
                { title: 'Project Management Professional (PMP)', issuer: 'Project Management Institute (PMI)', category: 'mandatory' },
                { title: 'Lean Six Sigma Green Belt', issuer: 'American Society for Quality (ASQ)', category: 'recommended' }
            ],
            achievements: [
                { title: 'Operational Excellence Milestone Award', description: 'Awarded for delivering flagship operational transformation program 2 months ahead of schedule.' }
            ]
        }
    },

    [DOMAINS.INTERIOR_DESIGN]: {
        id: DOMAINS.INTERIOR_DESIGN,
        label: 'Interior Design & Spatial Architecture',
        keywords: ['interior designer', 'interior architect', 'spatial designer', 'interior decorator', 'residential interior designer', 'commercial interior designer', 'ff&e designer', 'spatial planning'],
        actionVerbs: ['Conceptualized', 'Drafted', 'Rendered', 'Curated', 'Specified', 'Styled', 'Commissioned', 'Supervised', 'Coordinated', 'Delivered'],
        anchorTerms: ['interior design', 'spatial', 'autocad', 'sketchup', 'materials', 'finishes', 'lighting', 'renovation', 'furnishings'],
        commonDegrees: ['Bachelor of Fine Arts (BFA) in Interior Design', 'Bachelor of Interior Architecture', 'Master of Interior Design'],
        commonCertifications: ['NCIDQ Certified Interior Designer', 'LEED AP ID+C', 'Certified Interior Decorator (C.I.D.)'],
        skillCategories: [
            { category: 'Spatial & Architectural Design', skills: ['Spatial Planning & Layouts', 'AutoCAD & SketchUp 3D Modeling', 'Material & Finish Specification', 'Lighting Design & FF&E Schedules', 'Custom Joinery & Millwork Detailing'] },
            { category: 'Project Management & Construction', skills: ['Building Codes & ADA Accessibility', 'Contractor & Trade Supervision', 'Procurement & Vendor Budgeting', 'Site Inspections & Quality Control'] },
            { category: 'Client Presentation & Styling', skills: ['Client Concept Pitches & Moodboards', 'Color Theory & Material Boards', 'Residential & Commercial Staging', '3D Architectural Rendering (V-Ray / Enscape)'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Interior Designer / Project Lead',
                    employer: 'Premier Architectural Design Studio / Interiors Practice',
                    city: 'Design District',
                    description: '<ul><li>Directed end-to-end interior design for luxury residential and commercial hospitality properties valued up to $15M.</li><li>Formulated custom FF&E specifications, bespoke millwork packages, and lighting schedules with zero site rework.</li><li>Supervised general contractors and trade artisans on site, guaranteeing precision alignment with architectural blueprints.</li><li>Presented immersive 3D renderings and material moodboards to executive clients, maintaining a 95% first-round approval rating.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Fine Arts in Interior Design', school: 'Accredited College of Art & Design', city: 'Design Campus' }
            ],
            projects: [
                { title: 'Boutique Hotel Adaptive Reuse & Spatial Restoration', description: 'Spearheaded full interior renovation of historic 60-key boutique hotel, winning regional hospitality design distinction.' }
            ],
            certifications: [
                { title: 'NCIDQ Certificate (National Council for Interior Design Qualification)', issuer: 'CIDQ', category: 'mandatory' },
                { title: 'LEED AP ID+C (Interior Design + Construction)', issuer: 'U.S. Green Building Council', category: 'recommended' }
            ],
            achievements: [
                { title: 'Excellence in Hospitality Interior Design Award', description: 'Honored by National Interior Design Institute for exemplary spatial planning and sustainable material use.' }
            ]
        }
    },

    [DOMAINS.PHYSIOTHERAPY]: {
        id: DOMAINS.PHYSIOTHERAPY,
        label: 'Physiotherapy & Physical Rehabilitation',
        keywords: ['physiotherapist', 'physical therapist', 'physiotherapy', 'rehabilitation specialist', 'kinesiologist', 'sports physiotherapist', 'orthopedic physical therapist', 'neuro physiotherapist'],
        actionVerbs: ['Rehabilitated', 'Treated', 'Assessed', 'Restored', 'Prescribed', 'Mobilized', 'Trained', 'Evaluated', 'Monitored', 'Diagnosed'],
        anchorTerms: ['physiotherapy', 'rehabilitation', 'musculoskeletal', 'manual therapy', 'gait', 'posture', 'therapeutic', 'exercise', 'mobility'],
        commonDegrees: ['Bachelor of Physiotherapy (BPT)', 'Doctor of Physical Therapy (DPT)', 'Master of Physiotherapy (MPT) in Orthopedics / Neurology'],
        commonCertifications: ['Licensed Physical Therapist (State / National PT Board)', 'Board-Certified Orthopaedic Clinical Specialist (OCS)', 'Certified Manual Physical Therapist (CMPT)'],
        skillCategories: [
            { category: 'Clinical Assessment & Diagnostics', skills: ['Musculoskeletal & Biomechanical Assessment', 'Gait & Postural Analysis', 'Neurological Rehabilitation Protocols', 'Pain Assessment & Functional Indexing'] },
            { category: 'Therapeutic Modalities & Interventions', skills: ['Manual Therapy & Joint Mobilization', 'Therapeutic Exercise Prescription', 'Dry Needling & Myofascial Release', 'Post-Surgical Orthopedic Recovery', 'Electrotherapy & Hydrotherapy'] },
            { category: 'Patient Education & Ergonomics', skills: ['Patient Home Exercise Regimens', 'Ergonomic & Workplace Assessment', 'Injury Prevention & Biomechanics', 'Interdisciplinary Clinical Documentation'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Clinical Physiotherapist',
                    employer: 'Metropolitan Rehabilitation Center / Sports Medicine Clinic',
                    city: 'Healthcare District',
                    description: '<ul><li>Managed active clinical caseload of 35+ weekly patients recovering from orthopedic surgeries, spinal trauma, and sports injuries.</li><li>Formulated individualized therapeutic exercise regimens and manual therapy plans, improving patient mobility by 40%.</li><li>Performed comprehensive biomechanical and gait assessments utilizing functional movement screening.</li><li>Collaborated with orthopedic surgeons and physiatrists to ensure safe post-operative rehabilitation timelines.</li></ul>'
                }
            ],
            education: [
                { degree: 'Doctor of Physical Therapy (DPT) / Bachelor of Physiotherapy', school: 'Accredited Medical University / Institute of Health Sciences', city: 'Medical Campus' }
            ],
            projects: [
                { title: 'Post-Surgical Accelerated Mobility Protocol Initiative', description: 'Designed multidisciplinary rehabilitation protocol that shortened average inpatient stay by 1.8 days.' }
            ],
            certifications: [
                { title: 'Licensed Physical Therapist (PT / RPT)', issuer: 'State Physical Therapy Licensing Board', category: 'mandatory' },
                { title: 'Orthopaedic Clinical Specialist (OCS)', issuer: 'American Board of Physical Therapy Specialties (ABPTS)', category: 'recommended' }
            ],
            achievements: [
                { title: 'Clinical Excellence in Patient Care Award', description: 'Awarded annually for maintaining top patient satisfaction score (98%) and superior clinical recovery metrics.' }
            ]
        }
    },

    [DOMAINS.PSYCHOLOGY]: {
        id: DOMAINS.PSYCHOLOGY,
        label: 'Psychology & Behavioral Health',
        keywords: ['psychologist', 'clinical psychologist', 'counseling psychologist', 'psychotherapist', 'behavioral therapist', 'neuropsychologist', 'school psychologist', 'licensed mental health counselor'],
        actionVerbs: ['Assessed', 'Counseled', 'Administered', 'Evaluated', 'Intervened', 'Formulated', 'Facilitated', 'Monitored', 'Diagnosed', 'Treated'],
        anchorTerms: ['psychology', 'behavioral', 'counseling', 'psychotherapy', 'mental health', 'cbt', 'assessment', 'dsm', 'psychological'],
        commonDegrees: ['Master of Science in Clinical Psychology', 'Doctor of Psychology (Psy.D.)', 'Ph.D. in Clinical or Counseling Psychology'],
        commonCertifications: ['Licensed Clinical Psychologist (LCP)', 'Board Certification in Clinical Psychology (ABPP)', 'Certified CBT Practitioner'],
        skillCategories: [
            { category: 'Psychological Assessment & Diagnostics', skills: ['Psychodiagnostic Testing & Evaluation', 'DSM-5 / ICD-11 Diagnostic Formulation', 'Cognitive & Neuropsychological Battery Administration', 'Risk & Crisis Assessment Protocols'] },
            { category: 'Clinical Interventions & Modalities', skills: ['Cognitive Behavioral Therapy (CBT)', 'Mindfulness-Based Stress Reduction', 'Acceptance & Commitment Therapy (ACT)', 'Trauma-Informed Psychotherapy', 'Group Therapy Facilitation'] },
            { category: 'Ethics & Clinical Documentation', skills: ['Confidentiality & Ethical Compliance', 'Treatment Plan Formulation & Progress Notes', 'Interdisciplinary Case Conferences', 'Patient Advocacy & Psychoeducation'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Licensed Clinical Psychologist',
                    employer: 'Behavioral Health Center / Psychological Practice Group',
                    city: 'Medical Center',
                    description: '<ul><li>Conducted diagnostic evaluations, structured clinical interviews, and psychometric assessments for adolescent and adult patients.</li><li>Delivered evidence-based Cognitive Behavioral Therapy (CBT) and acceptance-based modalities for anxiety, depressive, and trauma disorders.</li><li>Formulated individualized psychological treatment plans with measurable symptom-reduction milestones.</li><li>Facilitated weekly psychoeducational support groups and coordinated care with psychiatric prescribers.</li></ul>'
                }
            ],
            education: [
                { degree: 'Doctor of Psychology (Psy.D.) in Clinical Psychology', school: 'Accredited University Graduate School of Psychology', city: 'Academic Campus' }
            ],
            projects: [
                { title: 'Community Youth Mental Health Outreach & Screening Program', description: 'Established preventive behavioral screening initiative across 8 public schools, identifying early-stage intervention needs.' }
            ],
            certifications: [
                { title: 'Licensed Psychologist (State Psychology Board)', issuer: 'State Licensing Board of Psychology', category: 'mandatory' },
                { title: 'Board Certified in Clinical Psychology', issuer: 'American Board of Professional Psychology (ABPP)', category: 'recommended' }
            ],
            achievements: [
                { title: 'Outstanding Contribution to Community Mental Health', description: 'Recognized by Regional Psychological Association for leadership in trauma-informed intervention models.' }
            ]
        }
    },

    [DOMAINS.VETERINARY]: {
        id: DOMAINS.VETERINARY,
        label: 'Veterinary Medicine & Animal Health',
        keywords: ['veterinarian', 'vet', 'veterinary surgeon', 'veterinary doctor', 'dvm', 'bvsc', 'veterinary physician', 'small animal veterinarian', 'large animal veterinarian', 'equine vet'],
        actionVerbs: ['Diagnosed', 'Treated', 'Operated', 'Inoculated', 'Vaccinated', 'Examined', 'Rehabilitated', 'Prescribed', 'Monitored', 'Administered'],
        anchorTerms: ['veterinary', 'animal health', 'surgery', 'vaccination', 'zoonotic', 'triage', 'radiography', 'pharmacology', 'anesthesia'],
        commonDegrees: ['Doctor of Veterinary Medicine (DVM)', 'Bachelor of Veterinary Science (BVSc & AH)', 'Master of Veterinary Science (MVSc)'],
        commonCertifications: ['Licensed Veterinarian (State / National Veterinary Board)', 'Board Certified Veterinary Specialist (ACVIM / ACVS)', 'Fear Free Certified Professional'],
        skillCategories: [
            { category: 'Clinical Diagnostics & Surgery', skills: ['Physical Examination & Veterinary Triage', 'Soft Tissue & Orthopedic Animal Surgery', 'Veterinary Anesthesia & Patient Monitoring', 'Radiography, Ultrasound & Clinical Pathology'] },
            { category: 'Preventive Medicine & Pharmacology', skills: ['Core & Non-Core Vaccinations', 'Veterinary Pharmacology & Pain Management', 'Parasite Prevention & Control', 'Zoonotic Disease Surveillance & Biosecurity'] },
            { category: 'Client Communication & Animal Welfare', skills: ['Pet Owner Consultation & Preventive Guidance', 'Compassionate End-of-Life Care', 'Animal Husbandry & Nutrition Counseling', 'Veterinary Electronic Medical Records (EMR)'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Associate Veterinarian / Veterinary Surgeon',
                    employer: 'Animal Hospital & Veterinary Emergency Practice',
                    city: 'Regional Center',
                    description: '<ul><li>Delivered medical and surgical care for 40+ companion animal patients weekly across outpatient and emergency admissions.</li><li>Performed routine and emergency soft-tissue surgeries, dental extractions, and fracture stabilizations with zero intraoperative complications.</li><li>Interpreted digital radiographs, ultrasound scans, and in-house hematology profiles to establish rapid, accurate diagnoses.</li><li>Counseled pet owners on preventive healthcare, vaccination schedules, nutritional management, and chronic disease protocols.</li></ul>'
                }
            ],
            education: [
                { degree: 'Doctor of Veterinary Medicine (DVM) / BVSc', school: 'Accredited College of Veterinary Medicine', city: 'Veterinary Campus' }
            ],
            projects: [
                { title: 'Community Spay & Neuter Outreach Program', description: 'Coordinated mobile veterinary surgical unit providing free sterilizations and rabies vaccinations for 600+ rescue animals.' }
            ],
            certifications: [
                { title: 'Licensed Veterinarian (State Veterinary Medical Board)', issuer: 'National / State Veterinary Board', category: 'mandatory' },
                { title: 'Fear Free Certified Veterinary Practitioner', issuer: 'Fear Free Pets', category: 'recommended' }
            ],
            achievements: [
                { title: 'Veterinarian of the Year Award', description: 'Honored by Regional Veterinary Medical Association for outstanding surgical skill and compassionate emergency care.' }
            ]
        }
    },

    [DOMAINS.AGRICULTURE]: {
        id: DOMAINS.AGRICULTURE,
        label: 'Agriculture, Agronomy & Soil Science',
        keywords: ['agronomist', 'agriculture professional', 'agricultural scientist', 'crop manager', 'farm manager', 'soil scientist', 'horticulturist', 'precision agriculture specialist', 'plant pathologist'],
        actionVerbs: ['Cultivated', 'Harvested', 'Propagated', 'Irrigated', 'Sampled', 'Optimized', 'Formulated', 'Monitored', 'Inspected', 'Standardized'],
        anchorTerms: ['agriculture', 'agronomy', 'crop', 'soil', 'irrigation', 'yield', 'harvest', 'pest management', 'precision agriculture'],
        commonDegrees: ['Bachelor of Science in Agriculture (B.Sc. Agriculture)', 'Master of Science in Agronomy / Soil Science', 'Bachelor of Agricultural Engineering'],
        commonCertifications: ['Certified Crop Adviser (CCA)', 'Certified Professional Agronomist (CPAg)', 'Licensed Agricultural Consultant'],
        skillCategories: [
            { category: 'Crop & Soil Science', skills: ['Crop Rotation & Yield Maximization', 'Soil Sampling & Nutrient Management (NPK)', 'Integrated Pest Management (IPM)', 'Plant Pathology & Disease Diagnosis', 'Seed Quality & Germination Testing'] },
            { category: 'Agricultural Technology & Irrigation', skills: ['Precision Agriculture & Drone Telemetry', 'Drip & Center-Pivot Irrigation Systems', 'Variable Rate Application (VRA)', 'Agrochemical Safety & Environmental Compliance'] },
            { category: 'Farm Operations & Agribusiness', skills: ['Farm Budgeting & Production Costing', 'Post-Harvest Handling & Grain Storage', 'Supply Chain & Commodity Marketing', 'Sustainable & Organic Farming Standards'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Agronomist / Farm Operations Lead',
                    employer: 'Agricultural Enterprise / Commercial Farming Group',
                    city: 'Agricultural Basin',
                    description: '<ul><li>Managed agronomic operations across 4,500 acres of commercial grain and legume production, achieving 18% higher harvest yield.</li><li>Formulated precision fertility prescriptions and soil amendment plans based on grid soil sampling and satellite NDVI imagery.</li><li>Executed Integrated Pest Management (IPM) protocols, reducing chemical pesticide application by 25% while mitigating pest pressure.</li><li>Optimized automated drip irrigation schedules to conserve 15M gallons of groundwater annually.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Agriculture / Agronomy', school: 'Accredited State Agricultural University', city: 'Agricultural Campus' }
            ],
            projects: [
                { title: 'Regenerative Agriculture & Soil Organic Matter Restoration Initiative', description: 'Pioneered multi-species cover cropping and no-till practices, increasing soil organic matter by 1.2% over 3 growing seasons.' }
            ],
            certifications: [
                { title: 'Certified Crop Adviser (CCA)', issuer: 'American Society of Agronomy', category: 'mandatory' },
                { title: 'Precision Agriculture Specialist Credential', issuer: 'Agricultural Technology Association', category: 'recommended' }
            ],
            achievements: [
                { title: 'Excellence in Sustainable Agronomy Trophy', description: 'Awarded by State Department of Agriculture for innovative conservation tillage and water stewardship.' }
            ]
        }
    },

    [DOMAINS.CORPORATE_SECRETARIAL]: {
        id: DOMAINS.CORPORATE_SECRETARIAL,
        label: 'Corporate Governance & Secretarial Practice',
        keywords: ['company secretary', 'corporate secretary', 'cs', 'icsi', 'board secretary', 'compliance officer', 'corporate governance specialist', 'secretarial auditor'],
        actionVerbs: ['Convened', 'Drafted', 'Complied', 'Maintained', 'Advised', 'Recorded', 'Governed', 'Filing', 'Facilitated', 'Coordinated'],
        anchorTerms: ['company secretary', 'corporate governance', 'board of directors', 'agm', 'statutory filing', 'secretarial audit', 'minutes', 'resolutions'],
        commonDegrees: ['Associate Company Secretary (ACS / FCS)', 'Bachelor of Laws (LL.B.)', 'Master of Corporate Governance'],
        commonCertifications: ['Institute of Company Secretaries (ICSI / CGI Member)', 'Chartered Governance Professional (ACG / FCG)', 'Certified Corporate Compliance Officer'],
        skillCategories: [
            { category: 'Board & Committee Governance', skills: ['Board & Committee Meeting Management', 'Drafting Agendas, Minutes & Resolutions', 'Annual General Meeting (AGM) Execution', 'Director Induction & Governance Charters'] },
            { category: 'Statutory Filings & Regulatory Compliance', skills: ['Companies Act & Statutory Filings', 'Secretarial Standards & Audit Compliance', 'Securities & Listing Regulations (SEBI/SEC)', 'Share Capital Structuring & Allotment'] },
            { category: 'Ethics & Corporate Administration', skills: ['Insider Trading Prevention & Code of Conduct', 'Related Party Transaction Review', 'Statutory Register Maintenance', 'Stakeholder & Shareholder Communications'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Company Secretary & Compliance Officer',
                    employer: 'Publicly Listed Enterprise / Corporate Group',
                    city: 'Metropolitan Commercial Center',
                    description: '<ul><li>Orchestrated comprehensive board secretariat operations, convening 12 Board and Audit Committee meetings annually with flawless compliance.</li><li>Drafted high-precision board resolutions, minutes, and explanatory statements for Annual General Meetings (AGM) attended by 2,000+ shareholders.</li><li>Ensured 100% on-time submission of quarterly and annual statutory filings under Companies Act and Securities Regulations.</li><li>Maintained statutory registers, supervised share transfer audits, and monitored compliance with insider trading codes.</li></ul>'
                }
            ],
            education: [
                { degree: 'Associate Company Secretary (ACS) / Bachelor of Laws (LL.B.)', school: 'Institute of Company Secretaries / Faculty of Law', city: 'Metropolitan Campus' }
            ],
            projects: [
                { title: 'Digital Board Portal Implementation & Governance Workflow Automation', description: 'Transitioned board document circulation to an encrypted digital portal, reducing paper distribution costs by $60K annually.' }
            ],
            certifications: [
                { title: 'Associate Member (ACS) / Fellow Member (FCS)', issuer: 'Institute of Company Secretaries / Chartered Governance Institute', category: 'mandatory' },
                { title: 'Certified Compliance & Ethics Professional (CCEP)', issuer: 'Compliance Certification Board', category: 'recommended' }
            ],
            achievements: [
                { title: 'Golden Peacock Award for Excellence in Corporate Governance', description: 'Secretariat team recognized nationally for exemplary disclosure standards and transparent shareholder relations.' }
            ]
        }
    },

    [DOMAINS.SUPPLY_CHAIN]: {
        id: DOMAINS.SUPPLY_CHAIN,
        label: 'Supply Chain, Logistics & Procurement',
        keywords: ['supply chain manager', 'logistics manager', 'procurement manager', 'supply chain analyst', 'materials manager', 'demand planner', 'freight manager', 'warehouse manager', 'inventory manager'],
        actionVerbs: ['Procured', 'Optimized', 'Negotiated', 'Streamlined', 'Dispatched', 'Inventoried', 'Forecasted', 'Managed', 'Standardized', 'Delivered'],
        anchorTerms: ['supply chain', 'logistics', 'procurement', 'inventory', 'warehouse', 'freight', 'vendor', 'demand planning', 'distribution'],
        commonDegrees: ['Bachelor of Science in Supply Chain Management', 'Master of Science in Global Supply Chain / Logistics', 'MBA in Supply Chain Operations'],
        commonCertifications: ['Certified Supply Chain Professional (CSCP - APICS/ASCM)', 'Certified in Production and Inventory Management (CPIM)', 'Certified Professional in Supply Management (CPSM)'],
        skillCategories: [
            { category: 'Procurement & Sourcing', skills: ['Strategic Sourcing & Vendor Negotiation', 'Supplier Relationship Management (SRM)', 'Contract Lifecycle & SLA Enforcement', 'Total Cost of Ownership (TCO) Reduction'] },
            { category: 'Inventory & Demand Planning', skills: ['Demand Forecasting & S&OP Integration', 'Inventory Optimization & Safety Stock (EOQ)', 'ERP Systems (SAP SCM, Oracle SCM)', 'Warehouse Management Systems (WMS)'] },
            { category: 'Logistics & Freight Distribution', skills: ['Multi-Modal Freight & Customs Clearance', 'Cold Chain & Hazmat Logistics Protocols', 'Fleet Routing & Last-Mile Delivery Efficiency', 'Supply Chain Risk Mitigation & Resilience'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Supply Chain & Logistics Manager',
                    employer: 'Global Manufacturing Network / Logistics Solutions',
                    city: 'Distribution Center',
                    description: '<ul><li>Directed end-to-end supply chain operations encompassing $85M annual procurement spend across 120 global tier-1 suppliers.</li><li>Restructured demand planning and safety stock models, cutting inventory holding costs by 22% while boosting order fulfillment to 99.2%.</li><li>Renegotiated ocean and multi-modal freight contracts, securing $3.2M annualized freight savings with guaranteed container space.</li><li>Instituted vendor scorecard audits and risk mitigation frameworks, maintaining zero stockouts during global logistics disruptions.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science / MBA in Supply Chain Management', school: 'Accredited University School of Business & Logistics', city: 'Business Campus' }
            ],
            projects: [
                { title: 'Global Distribution Center Automation & WMS Overhaul', description: 'Led implementation of modern warehouse management system and automated sorting conveyors, reducing picking errors by 85%.' }
            ],
            certifications: [
                { title: 'Certified Supply Chain Professional (CSCP)', issuer: 'Association for Supply Chain Management (ASCM/APICS)', category: 'mandatory' },
                { title: 'Certified Professional in Supply Management (CPSM)', issuer: 'Institute for Supply Management (ISM)', category: 'recommended' }
            ],
            achievements: [
                { title: 'Supply Chain Innovation Award', description: 'Recognized by National Logistics Forum for implementing proactive vendor risk monitoring and resilient fulfillment networks.' }
            ]
        }
    },

    [DOMAINS.REAL_ESTATE]: {
        id: DOMAINS.REAL_ESTATE,
        label: 'Real Estate & Property Management',
        keywords: ['real estate professional', 'realtor', 'real estate agent', 'property manager', 'real estate broker', 'leasing manager', 'commercial real estate advisor', 'real estate appraiser'],
        actionVerbs: ['Negotiated', 'Appraised', 'Brokered', 'Marketed', 'Closed', 'Consulted', 'Valued', 'Inspected', 'Managed', 'Advised'],
        anchorTerms: ['real estate', 'property', 'leasing', 'tenant', 'broker', 'valuation', 'listing', 'mortgage', 'deed'],
        commonDegrees: ['Bachelor of Science in Real Estate / Property Studies', 'Bachelor of Business in Real Estate Development', 'Master of Real Estate Development (MRED)'],
        commonCertifications: ['Licensed Real Estate Broker / Salesperson', 'Certified Property Manager (CPM)', 'Certified Commercial Investment Member (CCIM)'],
        skillCategories: [
            { category: 'Property Transactions & Brokerage', skills: ['Comparative Market Analysis (CMA)', 'Real Estate Contract Drafting & Negotiations', 'Buyer & Seller Client Representation', 'Escrow, Title & Closing Management'] },
            { category: 'Property & Asset Management', skills: ['Lease Administration & Tenant Relations', 'Property Inspection & Facility Maintenance', 'Rent Roll Management & Operating Budgets', 'Commercial Lease Structuring (Triple Net / Gross)'] },
            { category: 'Real Estate Marketing & Advisory', skills: ['MLS Listing Management & Digital Showings', 'Real Estate Investment Feasibility (Cap Rate, NOI)', 'Zoning, Land Use & Building Compliance', 'Staging & Open House Coordination'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Commercial Real Estate Broker / Asset Manager',
                    employer: 'Commercial Real Estate Brokerage / Realty Advisory',
                    city: 'Metropolitan Commercial Core',
                    description: '<ul><li>Closed over $45M in commercial property sales and long-term lease transactions across retail, industrial, and office assets.</li><li>Conducted rigorous Comparative Market Analyses (CMA) and discounted cash flow valuations for institutional real estate investors.</li><li>Negotiated complex lease contracts, tenant improvement allowances, and escalation clauses protecting landlord asset yields.</li><li>Managed marketing campaigns across commercial listing platforms, social media, and direct broker networks, maintaining 94% portfolio occupancy.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Real Estate & Finance', school: 'Accredited University School of Business', city: 'Metropolitan Campus' }
            ],
            projects: [
                { title: 'Mixed-Use Urban Retail Center Redevelopment & Leasing', description: 'Directed exclusive leasing campaign for 120,000 sq. ft. urban lifestyle center, achieving 100% pre-leasing before grand opening.' }
            ],
            certifications: [
                { title: 'Licensed Real Estate Broker (State Real Estate Commission)', issuer: 'State Real Estate Commission / Licensing Board', category: 'mandatory' },
                { title: 'Certified Commercial Investment Member (CCIM)', issuer: 'CCIM Institute', category: 'recommended' }
            ],
            achievements: [
                { title: 'Presidential Club Top Producer Award', description: 'Awarded for surpassing $40M in transaction gross volume and maintaining top client satisfaction ranking.' }
            ]
        }
    },

    [DOMAINS.CONSTRUCTION]: {
        id: DOMAINS.CONSTRUCTION,
        label: 'Construction Management & Civil Infrastructure',
        keywords: ['construction manager', 'site manager', 'general contractor', 'construction superintendent', 'site engineer', 'project superintendent', 'building contractor', 'construction project manager'],
        actionVerbs: ['Constructed', 'Supervised', 'Estimated', 'Scheduled', 'Commissioned', 'Inspected', 'Managed', 'Contracted', 'Standardized', 'Delivered'],
        anchorTerms: ['construction', 'site', 'contractor', 'subcontractor', 'osha', 'safety', 'building', 'superintendent', 'estimation'],
        commonDegrees: ['Bachelor of Science in Construction Management', 'Bachelor of Civil Construction Technology', 'Master of Construction Science'],
        commonCertifications: ['Certified Construction Manager (CCM)', 'OSHA 30-Hour Construction Safety Certification', 'Project Management Professional (PMP)'],
        skillCategories: [
            { category: 'Site Supervision & Project Scheduling', skills: ['Subcontractor Coordination & Site Oversight', 'Critical Path Method (CPM) & Primavera P6 / MS Project', 'RFI & Submittal Log Management', 'Daily Site Logs & Progress Reporting'] },
            { category: 'Cost Control & Safety Standards', skills: ['Construction Cost Estimating & Takeoffs', 'OSHA Safety Compliance & Toolbox Talks', 'Change Order Negotiation & Budget Tracking', 'Jobsite Hazard Analysis & Zero-Loss Focus'] },
            { category: 'Quality & Building Code Enforcement', skills: ['Blueprint & Architectural Drawing Interpretation', 'Building Code & Municipal Permit Compliance', 'Quality Control & Punch List Resolution', 'Material Inspection & Structural Testing'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Construction Project Manager',
                    employer: 'General Contracting & Civil Infrastructure Group',
                    city: 'Metropolitan Development Zone',
                    description: '<ul><li>Directed on-site construction of multi-story commercial and residential developments valued up to $35M, delivering on budget.</li><li>Enforced strict OSHA jobsite safety standards across 15+ trade subcontractors, achieving 500,000 lost-time injury-free work hours.</li><li>Coordinated construction scheduling using Primavera P6, resolving field clashes and keeping project delivery within contractual milestones.</li><li>Managed submittal reviews, RFIs, and architectural change orders, maintaining cost variances under 2% of contract sum.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Science in Construction Management', school: 'Accredited College of Engineering & Construction Science', city: 'University Campus' }
            ],
            projects: [
                { title: 'LEED Gold Certified Commercial Office Tower Construction', description: 'Supervised complete structural concrete, glass facade, and MEP fit-out for 18-story office tower, delivered 3 weeks ahead of schedule.' }
            ],
            certifications: [
                { title: 'Certified Construction Manager (CCM)', issuer: 'Construction Management Association of America (CMAA)', category: 'mandatory' },
                { title: 'OSHA 30-Hour Construction Safety Certification', issuer: 'Occupational Safety and Health Administration (OSHA)', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Excellence in Construction Safety Award', description: 'Awarded by Associated General Contractors for impeccable safety leadership on complex high-rise project.' }
            ]
        }
    },

    [DOMAINS.WRITING]: {
        id: DOMAINS.WRITING,
        label: 'Content Strategy, Copywriting & Technical Writing',
        keywords: ['content writer', 'copywriter', 'technical writer', 'content strategist', 'editorial writer', 'scriptwriter', 'speechwriter', 'medical writer'],
        actionVerbs: ['Authored', 'Researched', 'Edited', 'Published', 'Optimized', 'Produced', 'Curated', 'Drafted', 'Structured', 'Interviewed'],
        anchorTerms: ['writing', 'content', 'copywriting', 'editorial', 'article', 'proofreading', 'copy', 'storytelling', 'narrative'],
        commonDegrees: ['Bachelor of Arts in English / Creative Writing', 'Bachelor of Arts in Journalism & Communications', 'Master of Fine Arts (MFA) in Writing'],
        commonCertifications: ['Certified Professional Technical Communicator (CPTC)', 'HubSpot Content Marketing Certified', 'AMA Certified Copywriter'],
        skillCategories: [
            { category: 'Editorial Writing & Storytelling', skills: ['Long-Form Article & Feature Writing', 'Brand Storytelling & Tone of Voice Guidelines', 'Narrative Structuring & Creative Conception', 'Interviewing & Qualitative Research'] },
            { category: 'Digital Content & SEO Copywriting', skills: ['SEO Optimization & High-Intent Keyword Integration', 'Conversion Copywriting (Landing Pages & Ads)', 'Content Management Systems (WordPress, Contentful)', 'Social Media & Newsletter Content Strategy'] },
            { category: 'Editing, Review & Compliance', skills: ['Copyediting & Proofreading (AP, Chicago, MLA Style)', 'Fact-Checking & Source Verification', 'Content Performance Metrics & Audience Retention', 'Multi-Platform Publishing Workflows'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Senior Content Strategist & Lead Copywriter',
                    employer: 'Digital Media Agency / Corporate Publishing Network',
                    city: 'Creative Media Center',
                    description: '<ul><li>Authored and published over 150 high-impact editorial articles, whitepapers, and brand case studies generating 2M+ organic views.</li><li>Established comprehensive brand tone-of-voice and editorial style guide implemented across all company marketing materials.</li><li>Optimized high-intent web landing pages and conversion copy, boosting on-page conversion rates from 3.1% to 5.4%.</li><li>Conducted executive interviews and primary research to produce authoritative industry reports cited by major national publications.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Arts in English / Communications', school: 'Accredited University School of Liberal Arts', city: 'University Campus' }
            ],
            projects: [
                { title: 'Global Industry Benchmark Whitepaper Series', description: 'Researched, authored, and edited 50-page annual industry research report downloaded by over 15,000 industry professionals.' }
            ],
            certifications: [
                { title: 'Certified Professional Technical Communicator (CPTC)', issuer: 'Society for Technical Communication (STC)', category: 'mandatory' },
                { title: 'HubSpot Content Marketing Certification', issuer: 'HubSpot Academy', category: 'recommended' }
            ],
            achievements: [
                { title: 'Best Corporate Feature Article Gold Trophy', description: 'Awarded by Digital Publishing Association for excellence in long-form business journalism.' }
            ]
        }
    },

    [DOMAINS.VISUAL_ARTS]: {
        id: DOMAINS.VISUAL_ARTS,
        label: 'Visual Arts, Painting & Fine Art',
        keywords: ['artist', 'fine artist', 'painter', 'sculptor', 'printmaker', 'ceramicist', 'muralist', 'contemporary artist', 'studio artist'],
        actionVerbs: ['Created', 'Exhibited', 'Curated', 'Painted', 'Sculpted', 'Commissioned', 'Rendered', 'Crafted', 'Conceptualized', 'Showcased'],
        anchorTerms: ['artist', 'fine art', 'painting', 'sculpture', 'gallery', 'exhibition', 'studio', 'curator', 'canvas'],
        commonDegrees: ['Bachelor of Fine Arts (BFA) in Painting / Sculpture', 'Master of Fine Arts (MFA) in Visual Arts', 'Diploma in Fine Art'],
        commonCertifications: ['Resident Artist Fellowship Credential', 'National Arts Council Registered Artist', 'Accredited Art Appraiser Member'],
        skillCategories: [
            { category: 'Studio Practice & Fine Art Production', skills: ['Oil, Acrylic & Mixed Media Painting', 'Sculptural Fabrication & Material Crafting', 'Technical Drawing & Compositional Balance', 'Color Harmony & Textural Experimentation'] },
            { category: 'Exhibition & Curatorial Practice', skills: ['Solo & Group Gallery Exhibitions', 'Exhibition Curation & Gallery Installation', 'Artist Statements & Project Proposals', 'Art Fair Participation & Collector Relations'] },
            { category: 'Commissions & Arts Administration', skills: ['Bespoke Client Art Commissions', 'Public Art Installations & Municipal Grants', 'Art Preservation, Archiving & Framing', 'Studio Budgeting & Artwork Provenance Documentation'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Professional Fine Artist / Studio Practitioner',
                    employer: 'Independent Fine Art Studio / Gallery Representation',
                    city: 'Cultural Arts District',
                    description: '<ul><li>Conceptualized, executed, and exhibited 6 major solo fine art collections featured in recognized contemporary galleries.</li><li>Produced bespoke commissioned paintings and public sculptural installations for municipal and corporate collections.</li><li>Collaborated with museum curators and gallerists to coordinate lighting, wall text, and spatial layout for high-attendance exhibitions.</li><li>Maintained rigorous studio archival systems, provenance catalogs, and certified certificates of authenticity for all sold artworks.</li></ul>'
                }
            ],
            education: [
                { degree: 'Master of Fine Arts (MFA) in Visual Arts', school: 'Accredited Fine Arts Academy / University', city: 'Arts Campus' }
            ],
            projects: [
                { title: 'Municipal Public Art & Community Mural Commission', description: 'Designed and fabricated 120-foot outdoor public mural celebrating local cultural heritage, funded by National Arts Grant.' }
            ],
            certifications: [
                { title: 'Artist-in-Residence Fellowship Credential', issuer: 'National Arts Foundation', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Biennial Contemporary Art Grand Juror Prize', description: 'Awarded first prize in national biennial fine art exhibition by international jury panel.' }
            ]
        }
    },

    [DOMAINS.ACTING]: {
        id: DOMAINS.ACTING,
        label: 'Acting, Dramatic Arts & Performance',
        keywords: ['actor', 'actress', 'theatrical actor', 'screen actor', 'voice actor', 'stage performer', 'dramatic artist', 'improviser', 'thespian'],
        actionVerbs: ['Performed', 'Portrayed', 'Rehearsed', 'Auditioned', 'Collaborated', 'Interpreted', 'Voiced', 'Executed', 'Delivered', 'Mastered'],
        anchorTerms: ['acting', 'actor', 'theatre', 'stage', 'rehearsal', 'script', 'audition', 'performance', 'screen'],
        commonDegrees: ['Bachelor of Fine Arts (BFA) in Acting / Drama', 'Master of Fine Arts (MFA) in Theatre Performance', 'Diploma in Dramatic Arts'],
        commonCertifications: ['SAG-AFTRA Member', "Actors' Equity Association (AEA) Member", 'British Equity Registered Artist'],
        skillCategories: [
            { category: 'Dramatic Performance & Technique', skills: ['Stanislavski / Meisner / Method Acting Technique', 'Character Analysis & Scene Subtext Breakdown', 'Classical & Contemporary Script Interpretation', 'Audition Preparation & Self-Tape Execution'] },
            { category: 'Voice, Speech & Dialects', skills: ['Voice Projection & Breath Control', 'Standard Accents & Regional Dialect Proficiency', 'Voiceover (VO) & Commercial Narration', 'ADR & Audio Drama Performance'] },
            { category: 'Physicality & Stage Movement', skills: ['Stage Combat & Safety Choreography', 'Physical Theatre & Laban Movement', 'Blocking & On-Camera Mark Discipline', 'Live Theatrical Stage Discipline'] }
        ],
        blueprints: {
            workHistory: [
                {
                    jobTitle: 'Professional Actor / Theatrical Performer',
                    employer: 'Regional Repertory Theatre / Film & Television Production',
                    city: 'Cultural Entertainment Center',
                    description: '<ul><li>Performed lead and supporting roles across 14 professional theatrical stage productions and festival feature films.</li><li>Conducted in-depth script analysis and subtext interpretation to build emotionally authentic, complex character arcs.</li><li>Collaborated with directors, playwrights, and ensemble casts to execute precise blocking and dynamic stage combat sequences.</li><li>Recorded broadcast voiceover spots, commercial voiceovers, and animated character narration with broadcast sound engineering teams.</li></ul>'
                }
            ],
            education: [
                { degree: 'Bachelor of Fine Arts (BFA) in Dramatic Arts', school: 'Accredited Conservatory of Dramatic Arts / University Drama School', city: 'Conservatory Campus' }
            ],
            projects: [
                { title: 'National Touring Classical Repertory Production', description: 'Performed in 45-city national tour of classical dramatic work, receiving unanimous critical acclaim across regional media.' }
            ],
            certifications: [
                { title: "Actors' Equity Association (AEA) / SAG-AFTRA Membership", issuer: 'Professional Actors Union', category: 'mandatory' }
            ],
            achievements: [
                { title: 'Best Actor in a Leading Role Award', description: 'Honored by Regional Critics Circle for exceptional dramatic performance in headline theatrical season.' }
            ]
        }
    }
});

/**
 * Universal neutral blueprints used when the candidate's profession is completely unknown, unstated, or niche.
 * Zero IT bias. Zero forced country assumptions. 100% structural and transferable.
 */
export const BALANCED_UNIVERSAL_BLUEPRINTS = Object.freeze({
    workHistory: [
        {
            domain: 'Professional Practice & Operations',
            jobTitle: 'Senior Specialist / Department Lead',
            employer: 'Professional Organization / Enterprise Group',
            city: 'Regional Center',
            description: '<ul><li>Directed core specialized operations and project deliverables, improving departmental efficiency by 25%.</li><li>Managed stakeholder communications, project budgets, and key operational milestones with executive leadership.</li><li>Implemented standardized quality assurance procedures, achieving 100% on-time milestone delivery.</li><li>Mentored team members on standard operating procedures, quality standards, and industry best practices.</li></ul>'
        },
        {
            domain: 'Specialized Discipline',
            jobTitle: 'Practice Lead / Subject Matter Specialist',
            employer: 'Specialized Enterprise / Dedicated Practice',
            city: 'Metropolitan Center',
            description: '<ul><li>Formulated and executed core domain workflows with high precision, maintaining zero protocol deviations.</li><li>Conducted specialized assessments, risk analyses, and progress reporting for executive stakeholders.</li><li>Collaborated with cross-functional partners to optimize service quality and operational turnaround.</li></ul>'
        }
    ],
    education: [
        { degree: "Bachelor's Degree (Accredited Undergraduate Program)", school: 'Accredited University / College', city: 'Regional Center' },
        { degree: "Master's Degree / Advanced Postgraduate Credential", school: 'National Institute / University', city: 'Metropolitan Campus' },
        { degree: 'Professional Practice Certification / State License', school: 'National Licensing Board / Professional Council', city: 'State Authority' }
    ],
    projects: [
        { title: 'Strategic Operational Transformation & Workflow Modernization', description: 'Spearheaded organization-wide process overhaul, improving operational execution speed by 30% and eliminating recurring bottlenecks.' },
        { title: 'Community Outreach & Stakeholder Engagement Program', description: 'Coordinated cross-sector initiatives reaching 1,500+ participants, delivering measurable outcome benchmarks.' },
        { title: 'Quality Assurance & Regulatory Audit Preparedness Overhaul', description: 'Conducted rigorous internal audit and policy documentation overhaul, achieving 100% first-time inspection approval.' }
    ],
    certifications: [
        { title: 'Professional Practice Credential / State License', issuer: 'National Professional Council', category: 'mandatory' },
        { title: 'Project Management & Operational Excellence Certification', issuer: 'Accredited Certification Institute', category: 'mandatory' },
        { title: 'Quality Assurance & Standards Compliance Credential', issuer: 'Quality Accreditation Council', category: 'recommended' }
    ],
    skills: [
        { category: 'Core Domain Competencies', skills: ['Strategic Planning', 'Operational Execution', 'Regulatory Compliance', 'Quality Assurance', 'Client & Stakeholder Management'] },
        { category: 'Execution & Leadership', skills: ['Team Leadership', 'Cross-Functional Coordination', 'Project Delivery', 'Critical Problem Solving', 'Decision Making'] },
        { category: 'Communication & Optimization', skills: ['Stakeholder Communication', 'Data-Driven Analysis', 'Process Optimization', 'Risk Management', 'Negotiation'] }
    ],
    achievements: [
        { title: 'Excellence in Professional Service Award', description: 'Recognized by executive leadership for outstanding dedication, process innovation, and team leadership.' },
        { title: 'National Industry Recognition Citation', description: 'Selected among top performers in annual sector evaluation for significant client and community impact.' }
    ]
});

function estimateExperienceYears(employments = []) {
    if (!Array.isArray(employments) || employments.length === 0) return 0;
    let totalMonths = 0;

    for (const emp of employments) {
        if (!emp) continue;
        const begin = emp.begin ? new Date(emp.begin) : (emp.startDate ? new Date(emp.startDate) : null);
        const end = emp.current ? new Date() : (emp.end ? new Date(emp.end) : (emp.endDate ? new Date(emp.endDate) : null));

        if (begin && !isNaN(begin.getTime()) && end && !isNaN(end.getTime())) {
            const months = (end.getFullYear() - begin.getFullYear()) * 12 + (end.getMonth() - begin.getMonth());
            if (months > 0) totalMonths += months;
        } else {
            totalMonths += 24;
        }
    }

    return Math.min(40, Math.round((totalMonths / 12) * 10) / 10);
}

export function extractTargetRoleFromJd(jdText) {
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

/**
 * Universal candidate domain classifier.
 * Scans candidate occupation, work history, skills, and target job description
 * to determine the active professional domain.
 */
export function detectCandidateDomain(resumeData = {}, targetJd = '') {
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

    for (const [domainId, config] of Object.entries(DOMAIN_REGISTRY)) {
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

        if (Array.isArray(config.anchorTerms)) {
            for (const anchor of config.anchorTerms) {
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

/**
 * Universal Open-Role Synthesizer.
 * Dynamically derives domain intelligence, functional archetypes, action verbs,
 * competencies, credential patterns, and starter blueprints for ANY role, discipline,
 * or future profession without hardcoded taxonomy limits.
 */
export function synthesizeUniversalRoleData(targetTitle = '', resumeData = {}, targetJd = '') {
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

/**
 * Universal Candidate Context Factory.
 * Synthesizes normalized candidate context for ANY job, role, country, or career stage.
 */
export function getCandidateContext(resumeData = {}, targetJd = '') {
    const data = (resumeData && typeof resumeData === 'object') ? resumeData : {};
    const domainId = detectCandidateDomain(data, targetJd);
    const domainConfig = DOMAIN_REGISTRY[domainId] || null;

    const experienceYears = estimateExperienceYears(data.employments);
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

    // Dynamic Seniority & Career Stage Inference
    let seniority = 'mid';
    let careerStage = 'mid_career';
    const titleLower = `${targetTitle} ${currentTitle}`.toLowerCase();

    if (/intern|trainee|fresher|graduate|student|entry|assistant|apprentice/i.test(titleLower) || experienceYears < 1.5) {
        seniority = 'entry';
        careerStage = /student|fresher|intern/i.test(titleLower) ? 'student_or_entry' : 'early_career';
    } else if (/director|vice president|vp\b|head of|chief|c-level|executive|partner|provost|dean/i.test(titleLower) || experienceYears >= 10) {
        seniority = 'executive';
        careerStage = 'executive_leadership';
    } else if (/senior|lead|principal|staff|consultant|specialist|manager|detective|sergeant|captain/i.test(titleLower) || experienceYears >= 5) {
        seniority = 'senior';
        careerStage = 'senior_professional';
    }

    // Role Synthesizer Evaluation
    let specialization = '';
    let actionVerbs = [];
    let starterBlueprints = null;
    let skillCategories = [];
    let domainData = null;
    let resolvedDomainLabel = '';

    if (domainConfig) {
        specialization = domainConfig.label.split('&')[0].trim();
        actionVerbs = domainConfig.actionVerbs;
        starterBlueprints = domainConfig.blueprints;
        skillCategories = domainConfig.skillCategories;
        resolvedDomainLabel = domainConfig.label;
        domainData = {
            schools: [
                region === 'IN' ? 'Accredited State University / National Institute' : (region === 'UK' ? 'Accredited University / Royal College' : (region === 'US' ? 'Accredited University / College' : (region === 'AU' ? 'Accredited University / Institute of Technology' : 'National University / Institute'))),
                'Metropolitan University',
                'College of Professional Studies',
                'State Technical Institute'
            ],
            degrees: domainConfig.commonDegrees || ["Accredited Bachelor's Degree", "Master's Degree", "Professional Diploma", "Doctorate"],
            issuers: domainConfig.commonCertifications || [{ title: 'State Professional Practice License', issuer: 'National Licensing Board' }],
            skills: domainConfig.skillCategories?.flatMap(c => c.skills) || []
        };
    } else if (isNicheRole) {
        const synthesized = synthesizeUniversalRoleData(targetTitle, data, targetJd);
        specialization = synthesized.discipline;
        actionVerbs = synthesized.actionVerbs;
        starterBlueprints = synthesized.starterBlueprints;
        skillCategories = synthesized.starterBlueprints.skills;
        resolvedDomainLabel = synthesized.discipline;
        domainData = synthesized.domainData;
    } else {
        specialization = 'Professional Practice';
        actionVerbs = ['Delivered', 'Managed', 'Coordinated', 'Spearheaded', 'Streamlined', 'Executed', 'Standardized', 'Optimized'];
        starterBlueprints = BALANCED_UNIVERSAL_BLUEPRINTS;
        skillCategories = BALANCED_UNIVERSAL_BLUEPRINTS.skills;
        resolvedDomainLabel = 'General Professional';
        domainData = {
            schools: [
                region === 'IN' ? 'Accredited State University / National Institute' : (region === 'UK' ? 'Accredited University / Royal College' : (region === 'US' ? 'Accredited University / College' : (region === 'AU' ? 'Accredited University / Institute of Technology' : 'National University / Institute'))),
                'Metropolitan University',
                'College of Professional Studies',
                'State Technical Institute'
            ],
            degrees: ["Accredited Bachelor's Degree", "Master's Degree", "Professional Diploma", "Doctorate"],
            issuers: [
                { title: 'State Professional Practice License', issuer: 'National Licensing Board' },
                { title: 'Accredited Board Certification', issuer: 'Professional Standards Council' }
            ],
            skills: BALANCED_UNIVERSAL_BLUEPRINTS.skills.flatMap(c => c.skills)
        };
    }

    // Universal, Role-Agnostic ATS Advice
    const atsAdvice = {
        domainLabel: resolvedDomainLabel,
        actionVerbsAdvice: `Begin your accomplishment bullets with strong, decisive verbs such as ${actionVerbs.slice(0, 3).join(', ')}, or ${actionVerbs[3]}.`,
        degreeAdvice: domainConfig
            ? `Specify your accredited degree (e.g. ${domainConfig.commonDegrees[0]}) and university name.`
            : `Specify your accredited degree or professional qualification in ${specialization}, major, and recognized institution name.`,
        whyDegreeMatters: 'Applicant tracking systems check educational equivalence and accreditation to verify baseline role qualifications.',
        certAdvice: domainConfig
            ? `Include recognized credentials (e.g. ${domainConfig.commonCertifications.slice(0, 2).map(c => typeof c === 'string' ? c : c.title).join(', ')}) to validate professional standing.`
            : `Include accredited professional licenses or certifications in ${specialization} to validate domain qualifications.`,
        whyCertMatters: 'Licensed and accredited candidates receive priority ranking in specialized hiring requisitions.',
        projectsAdvice: domainConfig
            ? `Document 1–3 practical case studies, initiatives, or major deliverables demonstrating tangible outcomes.`
            : 'Document 1–3 key initiatives, case studies, or projects demonstrating tangible outcomes and impact.',
        metricsAdvice: 'Quantify your achievements with concrete metrics (e.g. percentages, volume, caseload, budget, or turnaround gains) to validate real impact.',
    };

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
        seniority,
        careerStage,
        experienceYears,
        geography: {
            region,
            city: data.city || '',
            country: data.country || '',
            display: [data.city, data.country].filter(Boolean).join(', ') || 'Global'
        },
        actionVerbs,
        starterBlueprints,
        skillCategories,
        domainData,
        atsAdvice,
        rawCandidateContext: {
            name: `${data.firstname || ''} ${data.lastname || ''}`.trim(),
            location: [data.city, data.country].filter(Boolean).join(', '),
            hasSummary: Boolean(data.summary && String(data.summary).trim().length > 30),
            roleCount: Array.isArray(data.employments) ? data.employments.length : 0,
            skillCount: Array.isArray(data.skills) ? data.skills.length : 0,
            hasTargetJd: Boolean(targetJd && targetJd.trim().length > 20),
            targetJd: String(targetJd || '').trim()
        }
    };
}
