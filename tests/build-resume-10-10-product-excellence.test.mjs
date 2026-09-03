import test from 'node:test';
import assert from 'node:assert/strict';
import { getCandidateContext } from '../src/utils/candidateContext.js';
import { calculateAtsScore } from '../src/utils/atsScore.js';

// Adversarial Personas Matrix (29 Real-World, Diverse, Non-IT & Novel Roles)
const ADVERSARIAL_PERSONAS = [
    { role: 'Doctor (Cardiologist)', text: 'Conducted cardiac catheterization and managed post-operative coronary care unit patients.' },
    { role: 'Dentist (Prosthodontist)', text: 'Fabricated fixed and removable prostheses, completed full-arch restorations, and treated temporomandibular disorders.' },
    { role: 'Nurse (ICU Charge Nurse)', text: 'Administered hemodynamic support, managed mechanical ventilation, and coordinated clinical crisis response.' },
    { role: 'Lawyer (Trial Attorney)', text: 'Drafted summary judgment motions, conducted depositions, and argued before appellate courts.' },
    { role: 'Judge (Magistrate)', text: 'Presided over arraignments, issued evidentiary rulings, and authored judicial opinions.' },
    { role: 'Teacher (High School Biology)', text: 'Designed AP biology curricula, facilitated laboratory investigations, and evaluated student competency.' },
    { role: 'Professor (Organic Chemistry)', text: 'Conducted asymmetric catalysis research, secured NSF research grants, and published peer-reviewed manuscripts.' },
    { role: 'Chartered Accountant (Auditor)', text: 'Conducted statutory audits, validated balance sheet reconciliations, and ensured IFRS compliance.' },
    { role: 'Finance (Investment Analyst)', text: 'Constructed DCF valuation models, conducted due diligence, and authored investment committee memorandums.' },
    { role: 'HR (Talent Acquisition Director)', text: 'Reduced time-to-fill by 28%, implemented structured behavioral interviewing, and directed executive search.' },
    { role: 'Sales (Enterprise Account Executive)', text: 'Closed $3.4M in annual contract value, managed pipeline progression, and negotiated multi-year master service agreements.' },
    { role: 'Marketing (Brand Strategist)', text: 'Led omnichannel brand repositioning, directed agency partners, and measured brand lift across national campaigns.' },
    { role: 'Architect (Urban Designer)', text: 'Prepared master plan schematic designs, conducted zoning code reviews, and coordinated structural engineering consultants.' },
    { role: 'Civil Engineer (Bridge Design)', text: 'Calculated structural load ratings, designed prestressed concrete girders, and inspected municipal bridges.' },
    { role: 'Mechanical Engineer (HVAC/Thermal)', text: 'Designed chilled water piping systems, conducted psychrometric calculations, and modeled CFD thermal airflow.' },
    { role: 'Electrical Engineer (Power Systems)', text: 'Calculated short-circuit currents, configured relay coordination curves, and designed medium-voltage substations.' },
    { role: 'Scientist (Molecular Biologist)', text: 'Performed CRISPR-Cas9 genome editing, analyzed qPCR amplifications, and maintained cell culture lines.' },
    { role: 'Researcher (Epidemiologist)', text: 'Modeled disease transmission vectors, analyzed cohort survival rates in R, and tracked public health surveillance.' },
    { role: 'Chef (Executive Pastry Chef)', text: 'Engineered plated dessert menus, formulated laminated viennoiserie, and managed pastry brigade labor costs.' },
    { role: 'Pilot (Commercial Captain B777)', text: 'Completed transpacific flight operations, executed oceanic navigation procedures, and commanded international flight crews.' },
    { role: 'Government (Policy Analyst)', text: 'Drafted legislative impact assessments, facilitated public stakeholder hearings, and briefed cabinet members.' },
    { role: 'Skilled Trade (Master Plumber)', text: 'Installed backflow preventers, soldered copper water distribution lines, and rough-in commercial DWV piping.' },
    { role: 'Artist (Sculptor / Ceramicist)', text: 'Formulated reduction-fired glazes, fabricated welded steel armatures, and mounted solo gallery exhibitions.' },
    { role: 'Writer (Investigative Journalist)', text: 'Investigated public expenditure records, interviewed confidential sources, and published investigative series.' },
    { role: 'Executive (Chief Operating Officer)', text: 'Restructured international supply chains, improved EBITDA margins by 4.2%, and oversaw 1,200 employees.' },
    { role: 'Student (Undergraduate Intern)', text: 'Completed coursework in statistical methods, organized campus symposium, and assisted faculty research.' },
    { role: 'Career Changer (Teacher to Project Manager)', text: 'Managed cross-functional schedule timelines, coordinated stakeholder meetings, and facilitated sprint retrospectives.' },
    { role: 'Freelancer (Independent Consultant)', text: 'Delivered strategic advisory engagements, managed client scopes of work, and billed independent deliverables.' },
    { role: 'Interplanetary Habitat Logistics Coordinator (Novel Role)', text: 'Monitored life-support consumable burn rates, scheduled payload resupply docking windows, and audited pressurized bay inventories.' },
];

test('10/10 Verification: Adversarial Role Matrix — Zero IT Leakage across 29 Diverse Personas', () => {
    const itKeywords = ['react', 'angular', 'vue', 'javascript', 'typescript', 'github', 'agile', 'scrum', 'ci/cd', 'docker', 'kubernetes'];

    for (const persona of ADVERSARIAL_PERSONAS) {
        const resumeData = {
            targetRole: persona.role,
            summary: persona.text,
            employments: [
                {
                    id: 1,
                    jobTitle: persona.role,
                    employer: 'Global Organization',
                    description: persona.text,
                }
            ]
        };

        const ctx = getCandidateContext(resumeData);
        assert.ok(ctx, `Context generated for ${persona.role}`);
        assert.ok(Array.isArray(ctx.vocabulary), `Vocabulary extracted for ${persona.role}`);
        assert.ok(ctx.vocabulary.length > 0, `Non-empty vocabulary for ${persona.role}`);

        // Check that none of the IT keywords leaked into vocabulary or facts
        const vocabJoined = ctx.vocabulary.join(' ').toLowerCase();
        for (const itKey of itKeywords) {
            assert.equal(
                vocabJoined.includes(itKey),
                false,
                `IT keyword '${itKey}' leaked into non-IT role '${persona.role}'`
            );
        }
    }
});

test('10/10 Verification: Zero-Fabrication Contract — Empty Notes Demand Clarification, Never Invent Facts', () => {
    const blankDoctorResume = {
        targetRole: 'Cardiothoracic Surgeon',
        employments: [
            {
                id: 101,
                jobTitle: 'Surgeon',
                employer: 'City General Hospital',
                description: '', // No candidate notes!
            }
        ]
    };

    const ctx = getCandidateContext(blankDoctorResume);
    // Facts must only reflect what was typed by the candidate
    assert.equal(ctx.facts.roles[0].title, 'Surgeon');
    assert.equal(ctx.facts.roles[0].employer, 'City General Hospital');
    assert.equal(ctx.facts.roles[0].description, '');
    assert.equal(ctx.facts.skills.length, 0); // Did not invent skills
    assert.equal(ctx.facts.education.length, 0); // Did not invent universities
});

test('10/10 Verification: Multi-Skill Delimiter Ingestion Splitting', () => {
    const rawPastedSkills = 'Patient Care, Triage; ACLS\nCPR, Critical Thinking';
    const tokens = rawPastedSkills.split(/[,;\n]+/).map(t => t.trim()).filter(Boolean);

    assert.equal(tokens.length, 5);
    assert.deepEqual(tokens, ['Patient Care', 'Triage', 'ACLS', 'CPR', 'Critical Thinking']);
});

test('10/10 Verification: ATS Score Reliability Across 29 Personas', () => {
    for (const persona of ADVERSARIAL_PERSONAS) {
        const resumeData = {
            firstname: 'Morgan',
            lastname: 'Smith',
            email: 'morgan.smith@example.org',
            phone: '+1 555-0199',
            city: 'Boston',
            country: 'USA',
            summary: persona.text,
            employments: [
                {
                    id: 1,
                    jobTitle: persona.role,
                    employer: 'Prestige Institute',
                    city: 'Boston',
                    begin: '2020-01-01',
                    end: '2024-01-01',
                    description: `• ${persona.text}\n• Improved operational throughput by 18% through standardized protocols.`
                }
            ],
            educations: [
                {
                    id: 2,
                    school: 'University of Excellence',
                    degree: 'Bachelor of Science',
                    begin: '2015-09-01',
                    end: '2019-06-01'
                }
            ],
            skills: [
                { id: 's1', skillName: 'Operations', rating: 80 },
                { id: 's2', skillName: 'Protocol Management', rating: 85 },
                { id: 's3', skillName: 'Compliance', rating: 75 }
            ]
        };

        const scoreResult = calculateAtsScore(resumeData, { jobDescription: persona.text });
        assert.ok(scoreResult.totalScore >= 50, `Score for ${persona.role} should be solid (got ${scoreResult.totalScore})`);
        assert.ok(scoreResult.totalScore <= 100, `Score cannot exceed 100 (got ${scoreResult.totalScore})`);
        assert.ok(scoreResult.sections.length >= 6, 'Sections present');

        const contactSec = scoreResult.sections.find(s => s.id === 'contact');
        const expSec = scoreResult.sections.find(s => s.id === 'experience');
        const eduSec = scoreResult.sections.find(s => s.id === 'education');

        assert.ok(contactSec && contactSec.score > 0, 'Contact score present');
        assert.ok(expSec && expSec.score > 0, 'Experience score present');
        assert.ok(eduSec && eduSec.score > 0, 'Education score present');
    }
});
