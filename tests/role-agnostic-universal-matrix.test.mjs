import test from 'node:test';
import assert from 'node:assert/strict';
import { getCandidateContext, extractCandidateActionVerbs, detectGeographicRegion } from '../src/utils/candidateContext.js';
import { getDynamicPlaceholder } from '../src/utils/dynamicPlaceholders.js';
import { calculateAtsScore } from '../src/utils/atsScore.js';

const TECH_CONTAMINANTS = [
    'react', 'angular', 'vue', 'docker', 'kubernetes', 'aws', 'azure cloud', 'microservices',
    'sql server', 'ci/cd', 'devops', 'tcs', 'infosys', 'wipro', 'b.tech', 'github actions'
];

export const UNIVERSAL_30_PERSONAS = [
    { id: 'dentist', title: 'General Dentist', sampleInput: { occupation: 'General Dentist', employments: [{ jobTitle: 'Associate Dentist', employer: 'Smile Care Dental Clinic', description: 'Restored caries and conducted dental exams.' }] } },
    { id: 'cardiologist', title: 'Consultant Cardiologist', sampleInput: { occupation: 'Consultant Cardiologist', employments: [{ jobTitle: 'Cardiology Fellow', employer: 'St. Jude Heart Institute', description: 'Diagnosed heart conditions and managed patient care.' }] } },
    { id: 'pharmacist', title: 'Clinical Pharmacist', sampleInput: { occupation: 'Clinical Pharmacist', employments: [{ jobTitle: 'Staff Pharmacist', employer: 'Metro Health Dispensary', description: 'Dispensed pharmaceuticals and counseled patients.' }] } },
    { id: 'nurse', title: 'Registered Nurse', sampleInput: { occupation: 'Registered Nurse (RN)', employments: [{ jobTitle: 'ICU Staff Nurse', employer: 'City General Hospital', description: 'Monitored vitals and administered clinical medication.' }] } },
    { id: 'lawyer', title: 'Corporate Lawyer', sampleInput: { occupation: 'Corporate Legal Counsel', employments: [{ jobTitle: 'Associate Attorney', employer: 'Sterling & Partners LLP', description: 'Drafted commercial contracts and advised corporate clients.' }] } },
    { id: 'judge', title: 'Administrative Law Judge', sampleInput: { occupation: 'Administrative Law Judge', employments: [{ jobTitle: 'Judicial Hearing Officer', employer: 'District Court Chambers', description: 'Presided over administrative hearings and authored rulings.' }] } },
    { id: 'teacher', title: 'High School Educator', sampleInput: { occupation: 'High School Mathematics Teacher', employments: [{ jobTitle: 'Secondary School Educator', employer: 'Oakridge High School', description: 'Instructed algebra curricula and assessed student learning.' }] } },
    { id: 'professor', title: 'University Professor', sampleInput: { occupation: 'Associate Professor & Research Chair', employments: [{ jobTitle: 'University Faculty Lecturer', employer: 'State University Faculty of Arts', description: 'Published research papers and lectured undergraduate cohorts.' }] } },
    { id: 'chartered_accountant', title: 'Chartered Accountant / CPA', sampleInput: { occupation: 'Chartered Accountant (CA)', employments: [{ jobTitle: 'Senior Statutory Auditor', employer: 'Deloitte & Touche LLP', description: 'Audited financial statements and reconciled balance sheets.' }] } },
    { id: 'banker', title: 'Investment Banker', sampleInput: { occupation: 'Investment Banking Associate', employments: [{ jobTitle: 'Financial Analyst', employer: 'Goldman Sachs Asset Management', description: 'Built financial models and prepared investment decks.' }] } },
    { id: 'hr_manager', title: 'Human Resources Director', sampleInput: { occupation: 'Human Resources Director', employments: [{ jobTitle: 'Senior Talent Acquisition Specialist', employer: 'Global Services Corp', description: 'Recruited talent and implemented retention initiatives.' }] } },
    { id: 'sales_executive', title: 'Enterprise Account Executive', sampleInput: { occupation: 'Enterprise Account Executive', employments: [{ jobTitle: 'B2B Sales Manager', employer: 'Industrial Supplies Ltd', description: 'Closed commercial contracts and managed pipeline revenue.' }] } },
    { id: 'marketing_manager', title: 'Brand Marketing Director', sampleInput: { occupation: 'Brand Marketing Director', employments: [{ jobTitle: 'Senior Campaign Manager', employer: 'Consumer Products Inc', description: 'Orchestrated multichannel marketing campaigns and tracked ROAS.' }] } },
    { id: 'architect', title: 'Principal Architect', sampleInput: { occupation: 'Licensed Architect', employments: [{ jobTitle: 'Project Architect', employer: 'Studio Urban Design', description: 'Drafted schematic designs and coordinated structural engineering.' }] } },
    { id: 'civil_engineer', title: 'Civil Infrastructure Engineer', sampleInput: { occupation: 'Civil Structural Engineer', employments: [{ jobTitle: 'Bridge Design Engineer', employer: 'National Infrastructure Agency', description: 'Calculated structural load ratings and inspected concrete bridges.' }] } },
    { id: 'mechanical_engineer', title: 'Senior Mechanical Systems Engineer', sampleInput: { occupation: 'Mechanical HVAC Engineer', employments: [{ jobTitle: 'Thermal Systems Designer', employer: 'Industrial Equipment Corp', description: 'Modeled CFD airflow and engineered chilled water systems.' }] } },
    { id: 'electrical_engineer', title: 'Senior Electrical Power Systems Engineer', sampleInput: { occupation: 'Electrical Power Engineer', employments: [{ jobTitle: 'Substation Engineer', employer: 'Regional Power Grid', description: 'Calculated short-circuit protection and designed switchgear.' }] } },
    { id: 'research_scientist', title: 'Research Scientist (Molecular Biology)', sampleInput: { occupation: 'Molecular Biologist', employments: [{ jobTitle: 'Postdoctoral Research Fellow', employer: 'Genomics Research Institute', description: 'Conducted CRISPR-Cas9 assays and published scientific findings.' }] } },
    { id: 'epidemiologist', title: 'Senior Research Epidemiologist', sampleInput: { occupation: 'Senior Epidemiologist', employments: [{ jobTitle: 'Public Health Analyst', employer: 'Center for Disease Control', description: 'Modeled disease transmission vectors and analyzed cohort studies.' }] } },
    { id: 'chef', title: 'Executive Head Chef', sampleInput: { occupation: 'Executive Chef', employments: [{ jobTitle: 'Head Chef de Cuisine', employer: 'Grand Hotel Restaurant', description: 'Engineered seasonal tasting menus and supervised culinary brigade.' }] } },
    { id: 'pilot', title: 'Commercial Airline Captain', sampleInput: { occupation: 'Commercial Airline Captain', employments: [{ jobTitle: 'First Officer B737', employer: 'International Airways', description: 'Piloted scheduled flight routes and executed navigation protocols.' }] } },
    { id: 'public_policy', title: 'Government Public Policy Director', sampleInput: { occupation: 'Public Policy Advisor', employments: [{ jobTitle: 'Senior Policy Analyst', employer: 'Ministry of Transportation', description: 'Drafted legislative briefings and facilitated stakeholder hearings.' }] } },
    { id: 'electrician', title: 'Master Electrician', sampleInput: { occupation: 'Master Electrician', employments: [{ jobTitle: 'Industrial Electrician', employer: 'High-Voltage Power Contractors', description: 'Wired 480V distribution panels and installed conduit runs.' }] } },
    { id: 'plumber', title: 'Master Plumber', sampleInput: { occupation: 'Master Plumber', employments: [{ jobTitle: 'Commercial Plumber', employer: 'Mechanical Contractors Inc', description: 'Installed DWV piping systems and soldered copper water lines.' }] } },
    { id: 'construction_manager', title: 'Construction Project Manager', sampleInput: { occupation: 'Construction Project Manager', employments: [{ jobTitle: 'Site Superintendent', employer: 'General Contractors', description: 'Supervised subcontractor safety and managed project timelines.' }] } },
    { id: 'content_writer', title: 'Senior Content Strategist', sampleInput: { occupation: 'Senior Content Writer', employments: [{ jobTitle: 'Lead Copywriter', employer: 'Digital Media Agency', description: 'Authored long-form editorial content and brand style guides.' }] } },
    { id: 'interior_designer', title: 'Senior Interior Designer', sampleInput: { occupation: 'Senior Interior Designer', employments: [{ jobTitle: 'Spatial Designer', employer: 'Interiors Studio', description: 'Specified finishes, furniture, and lighting layouts for clients.' }] } },
    { id: 'agronomist', title: 'Senior Agronomist & Crop Consultant', sampleInput: { occupation: 'Senior Agronomist', employments: [{ jobTitle: 'Crop Manager', employer: 'Commercial Farming Group', description: 'Conducted soil nutrient assays and optimized crop harvest yields.' }] } },
    { id: 'artist', title: 'Professional Fine Artist', sampleInput: { occupation: 'Fine Artist', employments: [{ jobTitle: 'Studio Painter', employer: 'Independent Studio', description: 'Fabricated mixed-media paintings and mounted solo exhibitions.' }] } },
    { id: 'artisan_watchmaker', title: 'Artisan Watchmaker (Novel Role)', sampleInput: { occupation: 'Artisan Watchmaker', employments: [{ jobTitle: 'Master Horologist', employer: 'Atelier de Haute Horlogerie', description: 'Restored mechanical escapements and hand-finished tourbillon bridges.' }] } },
];

test('Matrix 1: Universal 30 Personas — Non-Empty Vocabulary & Zero Crash', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const ctx = getCandidateContext(persona.sampleInput);
        assert.ok(ctx, `Context generated for ${persona.title}`);
        assert.ok(Array.isArray(ctx.vocabulary), `Vocabulary array for ${persona.title}`);
        assert.ok(ctx.vocabulary.length > 0, `Non-empty vocabulary for ${persona.title}`);
        assert.ok(ctx.domainLabel, `Domain label present for ${persona.title}`);
    }
});

test('Matrix 2: Universal 30 Personas — Zero Tech Leakage in Non-Technical Candidates', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const ctx = getCandidateContext(persona.sampleInput);
        const vocabJoined = ctx.vocabulary.join(' ').toLowerCase();

        for (const contaminant of TECH_CONTAMINANTS) {
            assert.equal(
                vocabJoined.includes(contaminant),
                false,
                `IT contaminant '${contaminant}' leaked into non-tech persona '${persona.title}'`
            );
        }
    }
});

test('Matrix 3: Universal 30 Personas — Dynamic Contextual Placeholders', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const ctx = getCandidateContext(persona.sampleInput);
        const jobTitlePlaceholder = getDynamicPlaceholder('work-history', 'jobTitle', ctx);
        const employerPlaceholder = getDynamicPlaceholder('work-history', 'employer', ctx);
        const degreePlaceholder = getDynamicPlaceholder('education', 'degree', ctx);

        assert.ok(jobTitlePlaceholder && jobTitlePlaceholder.length > 3, `Job title placeholder for ${persona.title}`);
        assert.ok(employerPlaceholder && employerPlaceholder.length > 3, `Employer placeholder for ${persona.title}`);
        assert.ok(degreePlaceholder && degreePlaceholder.length > 3, `Degree placeholder for ${persona.title}`);

        const joinedPlaceholders = `${jobTitlePlaceholder} ${employerPlaceholder} ${degreePlaceholder}`.toLowerCase();
        for (const contaminant of TECH_CONTAMINANTS) {
            assert.equal(
                joinedPlaceholders.includes(contaminant),
                false,
                `IT contaminant '${contaminant}' found in placeholders for ${persona.title}`
            );
        }
    }
});

test('Matrix 4: Universal 30 Personas — Deterministic ATS Scoring Neutrality', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const fullResume = {
            firstname: 'Alex',
            lastname: 'Morgan',
            email: 'alex.morgan@example.org',
            phone: '+1 555-0188',
            city: 'New York',
            country: 'USA',
            occupation: persona.sampleInput.occupation,
            summary: `Dedicated ${persona.title} with demonstrated track record of excellence.`,
            employments: [
                {
                    id: 1,
                    jobTitle: persona.sampleInput.employments[0].jobTitle,
                    employer: persona.sampleInput.employments[0].employer,
                    city: 'New York',
                    begin: '2020-01',
                    end: '2024-01',
                    description: `• ${persona.sampleInput.employments[0].description}\n• Increased operational efficiency by 15% through protocol standardization.`
                }
            ],
            educations: [
                {
                    id: 1,
                    school: 'State University',
                    degree: 'Bachelor of Science',
                    started: '2015',
                    finished: '2019'
                }
            ],
            skills: [
                { id: '1', skillName: 'Operations' },
                { id: '2', skillName: 'Protocol Management' },
                { id: '3', skillName: 'Quality Control' }
            ]
        };

        const result = calculateAtsScore(fullResume);
        assert.ok(result.qualityScore >= 50, `Quality score should be >= 50 for ${persona.title}, got ${result.qualityScore}`);
        assert.ok(result.qualityScore <= 100, `Quality score cannot exceed 100 for ${persona.title}`);
        assert.equal(result.sections.length, 7, `All 7 sections must be scored for ${persona.title}`);
    }
});

test('Matrix 5: Universal 30 Personas — Dynamic Action Verbs Extraction', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const verbs = extractCandidateActionVerbs(persona.sampleInput);
        assert.ok(Array.isArray(verbs), `Action verbs must be an array for ${persona.title}`);
        assert.ok(verbs.length >= 3, `Expected at least 3 action verbs for ${persona.title}, got ${verbs.length}`);
    }
});

test('Matrix 6: Cross-Candidate Contamination & Memory Leakage Isolation', () => {
    const candidates = [
        { name: 'Dr. John Watson', occupation: 'General Physician', sampleText: 'stethoscopes, medical diagnoses, and clinical patient care' },
        { name: 'Att. Harvey Specter', occupation: 'Litigation Lawyer', sampleText: 'corporate litigation, court hearings, and contract arbitration' },
        { name: 'Chef Gordon Ramsay', occupation: 'Executive Chef', sampleText: 'culinary menus, kitchen brigade supervision, and sauce reduction' },
        { name: 'Capt. Chesley Sullenberger', occupation: 'Commercial Airline Pilot', sampleText: 'cockpit operations, flight route navigation, and dual-engine procedures' },
        { name: 'Dr. Alistair Vance', occupation: 'Interplanetary Habitat Logistics Coordinator', sampleText: 'closed-loop oxygen reclamation, payload bay mass distribution, and orbital transit' }
    ];

    let previousTokens = new Set();
    let previousOccupation = '';

    for (const c of candidates) {
        const ctx = getCandidateContext({
            firstname: c.name.split(' ')[0],
            lastname: c.name.split(' ')[1],
            occupation: c.occupation,
            summary: c.sampleText
        });
        assert.ok(ctx, `Context generated for ${c.name}`);
        const currentTokens = new Set(ctx.vocabulary || []);

        if (previousTokens.size > 0) {
            // Ensure no distinctive tokens from previous candidate leak into current
            if (c.occupation === 'Litigation Lawyer') {
                assert.equal(currentTokens.has('stethoscope'), false, 'Doctor terms must not leak into Lawyer');
                assert.equal(currentTokens.has('clinical'), false, 'Doctor terms must not leak into Lawyer');
            } else if (c.occupation === 'Executive Chef') {
                assert.equal(currentTokens.has('litigation'), false, 'Lawyer terms must not leak into Chef');
                assert.equal(currentTokens.has('arbitration'), false, 'Lawyer terms must not leak into Chef');
            } else if (c.occupation === 'Commercial Airline Pilot') {
                assert.equal(currentTokens.has('culinary'), false, 'Chef terms must not leak into Pilot');
                assert.equal(currentTokens.has('sauce'), false, 'Chef terms must not leak into Pilot');
            } else if (c.occupation.includes('Interplanetary')) {
                assert.equal(currentTokens.has('cockpit'), false, 'Pilot terms must not leak into Space Coordinator');
            }
        }

        previousTokens = currentTokens;
        previousOccupation = c.occupation;
    }
});

test('Matrix 7: International Geographic Regionalization across Global Markets', () => {
    const regions = [
        { country: 'India', city: 'Bengaluru', expected: 'IN' },
        { country: 'United States', city: 'Boston', expected: 'US' },
        { country: 'United Kingdom', city: 'London', expected: 'UK' },
        { country: 'Canada', city: 'Toronto', expected: 'CA' },
        { country: 'Australia', city: 'Sydney', expected: 'AU' },
        { country: 'Germany', city: 'Berlin', expected: 'EU' },
        { country: 'United Arab Emirates', city: 'Dubai', expected: 'GLOBAL' },
        { country: 'Singapore', city: 'Singapore', expected: 'GLOBAL' },
        { country: 'International', city: 'Metropolitan Area', expected: 'GLOBAL' }
    ];

    for (const r of regions) {
        const detected = detectGeographicRegion({ country: r.country, city: r.city });
        assert.equal(detected, r.expected, `Country ${r.country} (${r.city}) should map to region ${r.expected}`);
    }
});
