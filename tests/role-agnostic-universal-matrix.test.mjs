import test from 'node:test';
import assert from 'node:assert/strict';
import { getCandidateContext, DOMAINS, DOMAIN_REGISTRY, detectGeographicRegion } from '../src/utils/candidateContext.js';
import backendCandidateContextPkg from '../backend/services/candidateContext.js';
const { getCandidateContext: getBackendCandidateContext, detectDomainFromText } = backendCandidateContextPkg;
import aiRuntime from '../backend/services/aiRuntime.js';
import { getDynamicPlaceholder } from '../src/utils/dynamicPlaceholders.js';
import { calculateAtsScore } from '../src/utils/atsScore.js';

const { validateOperation, getContentOperationFallback, buildGroundedPrompt } = aiRuntime;

const TECH_CONTAMINANTS = [
    'react', 'angular', 'vue', 'docker', 'kubernetes', 'aws', 'azure cloud', 'microservices',
    'sql server', 'ci/cd', 'devops', 'tcs', 'infosys', 'wipro', 'b.tech', 'github actions'
];

export const UNIVERSAL_30_PERSONAS = [
    {
        id: 'dentist',
        title: 'General Dentist',
        expectedDomain: 'DENTISTRY',
        domainTerm: 'Dental',
        sampleInput: { occupation: 'General Dentist', employments: [{ jobTitle: 'Associate Dentist', employer: 'Smile Care Dental Clinic' }] },
        expectedKeyword: 'dental',
    },
    {
        id: 'cardiologist',
        title: 'Consultant Cardiologist',
        expectedDomain: 'MEDICINE',
        domainTerm: 'Clinical',
        sampleInput: { occupation: 'Consultant Cardiologist', employments: [{ jobTitle: 'Cardiology Fellow', employer: 'St. Jude Heart Institute' }] },
        expectedKeyword: 'patient',
    },
    {
        id: 'pharmacist',
        title: 'Clinical Pharmacist',
        expectedDomain: 'PHARMACY',
        domainTerm: 'Pharmacy',
        sampleInput: { occupation: 'Clinical Pharmacist', employments: [{ jobTitle: 'Staff Pharmacist', employer: 'Metro Health Dispensary' }] },
        expectedKeyword: 'pharmacy',
    },
    {
        id: 'nurse',
        title: 'Registered Nurse',
        expectedDomain: 'NURSING',
        domainTerm: 'Nursing',
        sampleInput: { occupation: 'Registered Nurse (RN)', employments: [{ jobTitle: 'ICU Staff Nurse', employer: 'City General Hospital' }] },
        expectedKeyword: 'patient',
    },
    {
        id: 'lawyer',
        title: 'Corporate Lawyer / Legal Counsel',
        expectedDomain: 'LAW',
        domainTerm: 'Legal',
        sampleInput: { occupation: 'Corporate Legal Counsel', employments: [{ jobTitle: 'Associate Attorney', employer: 'Sterling & Partners LLP' }] },
        expectedKeyword: 'legal',
    },
    {
        id: 'judge',
        title: 'Administrative Law Judge',
        expectedDomain: 'JUDICIARY',
        domainTerm: 'Judicial',
        sampleInput: { occupation: 'Administrative Law Judge', employments: [{ jobTitle: 'Judicial Hearing Officer', employer: 'District Court Chambers' }] },
        expectedKeyword: 'judicial',
    },
    {
        id: 'teacher',
        title: 'High School Educator',
        expectedDomain: 'EDUCATION',
        domainTerm: 'Education',
        sampleInput: { occupation: 'High School Mathematics Teacher', employments: [{ jobTitle: 'Secondary School Educator', employer: 'Oakridge High School' }] },
        expectedKeyword: 'curriculum',
    },
    {
        id: 'professor',
        title: 'University Professor',
        expectedDomain: 'HIGHER_EDUCATION',
        domainTerm: 'Higher Education',
        sampleInput: { occupation: 'Associate Professor & Research Chair', employments: [{ jobTitle: 'University Faculty Lecturer', employer: 'State University Faculty of Arts' }] },
        expectedKeyword: 'research',
    },
    {
        id: 'chartered_accountant',
        title: 'Chartered Accountant / CPA',
        expectedDomain: 'ACCOUNTING',
        domainTerm: 'Accounting',
        sampleInput: { occupation: 'Chartered Accountant (CA)', employments: [{ jobTitle: 'Senior Statutory Auditor', employer: 'Deloitte & Touche LLP' }] },
        expectedKeyword: 'audit',
    },
    {
        id: 'banker',
        title: 'Investment Banker / Wealth Manager',
        expectedDomain: 'FINANCE',
        domainTerm: 'Finance',
        sampleInput: { occupation: 'Investment Banking Associate', employments: [{ jobTitle: 'Financial Analyst', employer: 'Goldman Sachs Asset Management' }] },
        expectedKeyword: 'financial',
    },
    {
        id: 'hr_manager',
        title: 'Human Resources Director',
        expectedDomain: 'HUMAN_RESOURCES',
        domainTerm: 'People Operations',
        sampleInput: { occupation: 'Human Resources Director', employments: [{ jobTitle: 'Senior Talent Acquisition Specialist', employer: 'Global Services Corp' }] },
        expectedKeyword: 'recruitment',
    },
    {
        id: 'sales_executive',
        title: 'Enterprise Account Executive',
        expectedDomain: 'SALES',
        domainTerm: 'Commercial',
        sampleInput: { occupation: 'Enterprise Account Executive', employments: [{ jobTitle: 'Senior Business Development Lead', employer: 'Enterprise Commercial Solutions' }] },
        expectedKeyword: 'pipeline',
    },
    {
        id: 'marketing_manager',
        title: 'Digital Marketing Strategist',
        expectedDomain: 'MARKETING',
        domainTerm: 'Marketing',
        sampleInput: { occupation: 'Digital Marketing Strategist', employments: [{ jobTitle: 'Brand Growth Lead', employer: 'Omnicom Media Group' }] },
        expectedKeyword: 'campaign',
    },
    {
        id: 'graphic_designer',
        title: 'Senior Visual Identity Designer',
        expectedDomain: 'GRAPHIC_DESIGN',
        domainTerm: 'Creative Arts',
        sampleInput: { occupation: 'Graphic Designer & Brand Specialist', employments: [{ jobTitle: 'Senior Visual Designer', employer: 'Pentagram Design Studio' }] },
        expectedKeyword: 'design',
    },
    {
        id: 'architect',
        title: 'Licensed Project Architect',
        expectedDomain: 'ARCHITECTURE',
        domainTerm: 'Architecture',
        sampleInput: { occupation: 'Licensed Project Architect', employments: [{ jobTitle: 'Architectural Designer', employer: 'Foster + Partners' }] },
        expectedKeyword: 'architecture',
    },
    {
        id: 'civil_engineer',
        title: 'Structural Civil Engineer',
        expectedDomain: 'CIVIL_ENGINEERING',
        domainTerm: 'Civil Infrastructure',
        sampleInput: { occupation: 'Structural Civil Engineer', employments: [{ jobTitle: 'Site Civil Supervisor', employer: 'Larsen & Toubro Construction' }] },
        expectedKeyword: 'structural',
    },
    {
        id: 'mechanical_engineer',
        title: 'Mechanical Design Engineer',
        expectedDomain: 'MECHANICAL_ENGINEERING',
        domainTerm: 'Mechanical Systems',
        sampleInput: { occupation: 'Mechanical Design Engineer', employments: [{ jobTitle: 'Thermal Systems Engineer', employer: 'Siemens Energy & Industrial' }] },
        expectedKeyword: 'mechanical',
    },
    {
        id: 'scientist',
        title: 'Postdoctoral Research Scientist',
        expectedDomain: 'SCIENTIFIC_RESEARCH',
        domainTerm: 'Scientific Research',
        sampleInput: { occupation: 'Postdoctoral Research Scientist', employments: [{ jobTitle: 'Research Chemist', employer: 'National Institute of Chemical Sciences' }] },
        expectedKeyword: 'scientific',
    },
    {
        id: 'chef',
        title: 'Executive Head Chef',
        expectedDomain: 'HOSPITALITY',
        domainTerm: 'Culinary Arts',
        sampleInput: { occupation: 'Executive Head Chef', employments: [{ jobTitle: 'Sous Chef', employer: 'The Grand Heritage Culinary Hotel' }] },
        expectedKeyword: 'culinary',
    },
    {
        id: 'hotel_manager',
        title: 'Hotel General Manager',
        expectedDomain: 'HOTEL_MANAGEMENT',
        domainTerm: 'Hospitality Management',
        sampleInput: { occupation: 'Hotel General Manager', employments: [{ jobTitle: 'Front Office Director', employer: 'Marriott International Resort' }] },
        expectedKeyword: 'hotel',
    },
    {
        id: 'pilot',
        title: 'Commercial Airline Pilot',
        expectedDomain: 'AVIATION',
        domainTerm: 'Aviation',
        sampleInput: { occupation: 'Commercial Airline Pilot (Captain)', employments: [{ jobTitle: 'First Officer', employer: 'Delta Air Lines Flight Operations' }] },
        expectedKeyword: 'flight',
    },
    {
        id: 'journalist',
        title: 'Investigative Journalist',
        expectedDomain: 'JOURNALISM',
        domainTerm: 'Journalism',
        sampleInput: { occupation: 'Senior Investigative Journalist', employments: [{ jobTitle: 'Staff Reporter', employer: 'The Washington Post / National Broadcaster' }] },
        expectedKeyword: 'investigative',
    },
    {
        id: 'government_officer',
        title: 'Public Administration Director',
        expectedDomain: 'GOVERNMENT',
        domainTerm: 'Public Administration',
        sampleInput: { occupation: 'Public Sector Administrative Officer', employments: [{ jobTitle: 'Deputy Collector / Civil Servant', employer: 'State Department of Public Administration' }] },
        expectedKeyword: 'public',
    },
    {
        id: 'police_officer',
        title: 'Police Detective / Sergeant',
        expectedDomain: 'PUBLIC_SAFETY',
        domainTerm: 'Law Enforcement',
        sampleInput: { occupation: 'Police Detective', employments: [{ jobTitle: 'Patrol Sergeant', employer: 'Metropolitan Police Department' }] },
        expectedKeyword: 'police',
    },
    {
        id: 'ngo_manager',
        title: 'Humanitarian Program Director',
        expectedDomain: 'NON_PROFIT',
        domainTerm: 'Humanitarian Development',
        sampleInput: { occupation: 'Humanitarian Program Director (NGO)', employments: [{ jobTitle: 'Field Coordinator', employer: 'Oxfam International / UNICEF Field Mission' }] },
        expectedKeyword: 'humanitarian',
    },
    {
        id: 'musician',
        title: 'Principal Concert Violist',
        expectedDomain: 'PERFORMING_ARTS',
        domainTerm: 'Performing Arts',
        sampleInput: { occupation: 'Concert Pianist & Orchestral Musician', employments: [{ jobTitle: 'Principal Violist', employer: 'City Philharmonic Orchestra' }] },
        expectedKeyword: 'music',
    },
    {
        id: 'athlete',
        title: 'Professional Track Athlete & Coach',
        expectedDomain: 'SPORTS',
        domainTerm: 'Athletics & Sports',
        sampleInput: { occupation: 'Professional Athletic Performance Coach', employments: [{ jobTitle: 'Strength & Conditioning Specialist', employer: 'Olympic Training Center' }] },
        expectedKeyword: 'athlete',
    },
    {
        id: 'photographer',
        title: 'Commercial Studio Photographer',
        expectedDomain: 'PHOTOGRAPHY',
        domainTerm: 'Photography',
        sampleInput: { occupation: 'Commercial Studio Photographer', employments: [{ jobTitle: 'Director of Visual Photography', employer: 'Vogue Commercial Studio' }] },
        expectedKeyword: 'photography',
    },
    {
        id: 'skilled_trades',
        title: 'Master Industrial Electrician',
        expectedDomain: 'SKILLED_TRADES',
        domainTerm: 'Skilled Trades',
        sampleInput: { occupation: 'Master Electrician', employments: [{ jobTitle: 'Industrial Maintenance Electrician', employer: 'Apex Industrial Services' }] },
        expectedKeyword: 'wiring',
    },
    {
        id: 'physiotherapist',
        title: 'Senior Clinical Physiotherapist',
        expectedDomain: 'PHYSIOTHERAPY',
        domainTerm: 'Physiotherapy',
        sampleInput: { occupation: 'Senior Physiotherapist', employments: [{ jobTitle: 'Physical Therapist', employer: 'Rehabilitation Clinic' }] },
        expectedKeyword: 'physiotherapy',
    },
    {
        id: 'psychologist',
        title: 'Licensed Clinical Psychologist',
        expectedDomain: 'PSYCHOLOGY',
        domainTerm: 'Psychology',
        sampleInput: { occupation: 'Clinical Psychologist', employments: [{ jobTitle: 'Licensed Psychologist', employer: 'Mental Health Center' }] },
        expectedKeyword: 'psychology',
    },
    {
        id: 'veterinarian',
        title: 'Veterinary Surgeon / DVM',
        expectedDomain: 'VETERINARY',
        domainTerm: 'Veterinary',
        sampleInput: { occupation: 'Veterinary Surgeon', employments: [{ jobTitle: 'Associate Veterinarian', employer: 'Animal Hospital' }] },
        expectedKeyword: 'veterinary',
    },
    {
        id: 'company_secretary',
        title: 'Company Secretary & Compliance Officer',
        expectedDomain: 'CORPORATE_SECRETARIAL',
        domainTerm: 'Corporate Governance',
        sampleInput: { occupation: 'Company Secretary', employments: [{ jobTitle: 'Corporate Secretary', employer: 'Enterprise Group' }] },
        expectedKeyword: 'governance',
    },
    {
        id: 'supply_chain_manager',
        title: 'Senior Supply Chain & Logistics Manager',
        expectedDomain: 'SUPPLY_CHAIN',
        domainTerm: 'Supply Chain',
        sampleInput: { occupation: 'Supply Chain Manager', employments: [{ jobTitle: 'Logistics Manager', employer: 'Global Logistics' }] },
        expectedKeyword: 'supply chain',
    },
    {
        id: 'real_estate',
        title: 'Commercial Real Estate Broker',
        expectedDomain: 'REAL_ESTATE',
        domainTerm: 'Real Estate',
        sampleInput: { occupation: 'Real Estate Broker', employments: [{ jobTitle: 'Commercial Realtor', employer: 'Property Realty Advisors' }] },
        expectedKeyword: 'real estate',
    },
    {
        id: 'construction_manager',
        title: 'Senior Construction Project Manager',
        expectedDomain: 'CONSTRUCTION',
        domainTerm: 'Construction Infrastructure',
        sampleInput: { occupation: 'Construction Project Manager', employments: [{ jobTitle: 'Site Superintendent', employer: 'General Contractors' }] },
        expectedKeyword: 'construction',
    },
    {
        id: 'content_writer',
        title: 'Senior Content Strategist & Copywriter',
        expectedDomain: 'WRITING',
        domainTerm: 'Writing',
        sampleInput: { occupation: 'Senior Content Writer', employments: [{ jobTitle: 'Lead Copywriter', employer: 'Digital Media Agency' }] },
        expectedKeyword: 'content',
    },
    {
        id: 'interior_designer',
        title: 'Senior Interior Designer',
        expectedDomain: 'INTERIOR_DESIGN',
        domainTerm: 'Interior Design',
        sampleInput: { occupation: 'Senior Interior Designer', employments: [{ jobTitle: 'Spatial Designer', employer: 'Interiors Studio' }] },
        expectedKeyword: 'interior',
    },
    {
        id: 'agriculture',
        title: 'Senior Agronomist & Crop Consultant',
        expectedDomain: 'AGRICULTURE',
        domainTerm: 'Agriculture',
        sampleInput: { occupation: 'Senior Agronomist', employments: [{ jobTitle: 'Crop Manager', employer: 'Commercial Farming Group' }] },
        expectedKeyword: 'agriculture',
    },
    {
        id: 'artist',
        title: 'Professional Fine Artist',
        expectedDomain: 'VISUAL_ARTS',
        domainTerm: 'Visual Arts',
        sampleInput: { occupation: 'Fine Artist', employments: [{ jobTitle: 'Studio Painter', employer: 'Independent Studio' }] },
        expectedKeyword: 'art',
    },
    {
        id: 'actor',
        title: 'Professional Theatrical Actor',
        expectedDomain: 'ACTING',
        domainTerm: 'Dramatic Arts',
        sampleInput: { occupation: 'Theatrical Actor', employments: [{ jobTitle: 'Dramatic Performer', employer: 'Repertory Theatre' }] },
        expectedKeyword: 'acting',
    },
    {
        id: 'unknown_niche',
        title: 'Artisan Watchmaker & Restorer',
        expectedDomain: 'UNKNOWN_NICHE',
        domainTerm: 'Specialized Discipline',
        sampleInput: { occupation: 'Artisan Watchmaker', employments: [{ jobTitle: 'Master Horologist', employer: 'Atelier de Haute Horlogerie' }] },
        expectedKeyword: 'precision',
    },
    {
        id: 'marine_robotics_compliance',
        title: 'Marine Robotics Compliance Specialist',
        expectedDomain: 'UNKNOWN_NICHE',
        domainTerm: 'Marine Robotics Compliance',
        sampleInput: { occupation: 'Marine Robotics Compliance Specialist' },
        expectedKeyword: 'compliance',
    },
    {
        id: 'renewable_energy_policy',
        title: 'Renewable Energy Policy Advisor',
        expectedDomain: 'UNKNOWN_NICHE',
        domainTerm: 'Renewable Energy Policy',
        sampleInput: { occupation: 'Renewable Energy Policy Advisor' },
        expectedKeyword: 'policy',
    },
    {
        id: 'clinical_trial_operations',
        title: 'Clinical Trial Operations Lead',
        expectedDomain: 'UNKNOWN_NICHE',
        domainTerm: 'Clinical Trial Operations',
        sampleInput: { occupation: 'Clinical Trial Operations Lead' },
        expectedKeyword: 'clinical',
    },
    {
        id: 'luxury_retail_experience',
        title: 'Luxury Retail Experience Director',
        expectedDomain: 'UNKNOWN_NICHE',
        domainTerm: 'Luxury Retail Experience',
        sampleInput: { occupation: 'Luxury Retail Experience Director' },
        expectedKeyword: 'retail',
    },
    {
        id: 'quantum_materials_researcher',
        title: 'Quantum Materials Researcher',
        expectedDomain: 'UNKNOWN_NICHE',
        domainTerm: 'Quantum Materials Researcher',
        sampleInput: { occupation: 'Quantum Materials Researcher' },
        expectedKeyword: 'materials',
    },
    {
        id: 'interplanetary_logistics',
        title: 'Interplanetary Habitat Logistics Coordinator',
        expectedDomain: 'UNKNOWN_NICHE',
        domainTerm: 'Interplanetary Habitat Logistics',
        sampleInput: { occupation: 'Interplanetary Habitat Logistics Coordinator' },
        expectedKeyword: 'logistics',
    }
];

// MATRIX 1: Frontend Context Domain Classification Parity across all Personas
test('Matrix 1: Universal Personas - Frontend Context Domain Classification', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const context = getCandidateContext(persona.sampleInput);
        if (persona.expectedDomain === 'UNKNOWN_NICHE') {
            assert.ok(context.isNicheRole || context.domain === DOMAINS.UNSPECIFIED, `Persona ${persona.id} should be identified as a niche role`);
            assert.ok(context.starterBlueprints?.workHistory?.length > 0, `Persona ${persona.id} must have starter blueprints`);
            assert.ok(context.actionVerbs?.length >= 6, `Persona ${persona.id} must have dynamic action verbs`);
        } else {
            const expectedDomainId = DOMAINS[persona.expectedDomain];
            assert.strictEqual(
                context.domain,
                expectedDomainId,
                `Persona "${persona.id}" mapped to "${context.domain}", expected "${expectedDomainId}"`
            );
        }
    }
});

// MATRIX 2: Backend Context Domain Classification Parity across all Personas
test('Matrix 2: Universal Personas - Backend Context Domain Classification Parity', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const backendContext = getBackendCandidateContext(persona.sampleInput);
        if (persona.expectedDomain === 'UNKNOWN_NICHE') {
            assert.ok(backendContext.isNicheRole || backendContext.domain === DOMAINS.UNSPECIFIED, `Backend Persona ${persona.id} should be identified as a niche role`);
            assert.ok(backendContext.domainData?.skills?.length > 0, `Backend Persona ${persona.id} must have domain skills`);
        } else {
            const expectedDomainId = DOMAINS[persona.expectedDomain];
            assert.strictEqual(
                backendContext.domain,
                expectedDomainId,
                `Backend persona "${persona.id}" mapped to "${backendContext.domain}", expected "${expectedDomainId}"`
            );
        }
    }
});

// MATRIX 3: Zero Tech Leakage in Non-Technical Starter Blueprints across all 30 Personas
test('Matrix 3: Zero Tech Leakage in Non-Technical Starter Blueprints across all 30 Personas', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const context = getCandidateContext(persona.sampleInput);
        const serialized = JSON.stringify(context.starterBlueprints).toLowerCase();

        for (const contaminant of TECH_CONTAMINANTS) {
            const regex = new RegExp(`(?:^|[^a-z])${contaminant.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:[^a-z]|$)`, 'i');
            assert.ok(
                !regex.test(serialized),
                `Contaminant "${contaminant}" found in starter blueprints for persona "${persona.id}"!`
            );
        }
    }
});

// MATRIX 4: Backend AI Fallback - Skills Generation Zero Tech Leakage
test('Matrix 4: Backend AI Fallback - Skills Generation Zero Tech Leakage & Domain Relevance', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const fallback = getContentOperationFallback('generate-skills', {
            jobTitle: persona.title,
            context: { domain: persona.expectedDomain === 'UNKNOWN_NICHE' ? 'unspecified' : DOMAINS[persona.expectedDomain], profession: persona.title }
        });

        assert.ok(fallback && Array.isArray(fallback.skills), `Fallback skills missing for ${persona.id}`);
        assert.ok(fallback.skills.length >= 3, `Expected at least 3 skills for ${persona.id}`);

        const serialized = JSON.stringify(fallback.skills).toLowerCase();
        for (const contaminant of TECH_CONTAMINANTS) {
            const regex = new RegExp(`(?:^|[^a-z])${contaminant.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:[^a-z]|$)`, 'i');
            assert.ok(
                !regex.test(serialized),
                `Contaminant "${contaminant}" found in fallback skills for persona "${persona.id}"`
            );
        }
    }
});

// MATRIX 5: Dynamic Contextual Placeholders across all 30 Personas
test('Matrix 5: Dynamic Contextual Placeholders - Adapts to Role and Country', () => {
    for (const persona of UNIVERSAL_30_PERSONAS) {
        const context = getCandidateContext(persona.sampleInput);
        const headingTitle = getDynamicPlaceholder('heading', 'occupation', context);
        const workJobTitle = getDynamicPlaceholder('work-history', 'jobTitle', context);
        const workCompany = getDynamicPlaceholder('work-history', 'employer', context);
        const eduDegree = getDynamicPlaceholder('education', 'degree', context);
        const summaryPlaceholder = getDynamicPlaceholder('summary', 'text', context);

        assert.ok(headingTitle && headingTitle.length > 5, `Heading placeholder empty for ${persona.id}`);
        assert.ok(workJobTitle && workJobTitle.length > 5, `Work jobTitle placeholder empty for ${persona.id}`);
        assert.ok(workCompany && workCompany.length > 5, `Work company placeholder empty for ${persona.id}`);
        assert.ok(eduDegree && eduDegree.length > 5, `Education degree placeholder empty for ${persona.id}`);
        assert.ok(summaryPlaceholder && summaryPlaceholder.length > 20, `Summary placeholder empty for ${persona.id}`);

        const serializedPlaceholders = `${headingTitle} ${workJobTitle} ${workCompany} ${eduDegree} ${summaryPlaceholder}`.toLowerCase();
        for (const contaminant of TECH_CONTAMINANTS) {
            const regex = new RegExp(`(?:^|[^a-z])${contaminant.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}(?:[^a-z]|$)`, 'i');
            assert.ok(
                !regex.test(serializedPlaceholders),
                `Tech contaminant "${contaminant}" found in placeholders for persona "${persona.id}"`
            );
        }
    }
});

// MATRIX 6: Universal Role-Agnostic ATS Scoring across Diverse Occupations
test('Matrix 6: Universal Role-Agnostic ATS Scoring - Zero Penalty for Non-Tech Roles', () => {
    const dentistResume = {
        firstname: 'Sarah', lastname: 'Jenkins', email: 'sarah.jenkins@example.com', phone: '+1 555-234-5678',
        city: 'Boston', country: 'United States', occupation: 'General Dentist',
        summary: 'Licensed Dental Surgeon with 7+ years of comprehensive clinical experience in restorative procedures, root canal treatments, and compassionate patient dental care.',
        employments: [
            {
                jobTitle: 'Associate General Dentist', employer: 'Boston Dental Group', begin: '2019',
                description: '<ul><li>Diagnosed and treated 25+ patients daily, performing root canals and aesthetic crown restorations.</li><li>Reduced patient recovery discomfort by 30% through advanced local anesthesia delivery.</li></ul>'
            },
            {
                jobTitle: 'Resident Dental Surgeon', employer: 'Tufts Clinical Dental Center', begin: '2016', end: '2019',
                description: '<ul><li>Administered pediatric and adult dental evaluations, achieving a 98% patient satisfaction rating.</li><li>Collaborated with orthodontic specialists on complex restorative treatment plans.</li></ul>'
            }
        ],
        educations: [{ school: 'Tufts School of Dental Medicine', degree: 'Doctor of Dental Surgery (DDS)', started: '2015' }],
        skills: [{ name: 'Oral Surgery' }, { name: 'Endodontics' }, { name: 'Restorative Dentistry' }]
    };

    const pilotResume = {
        firstname: 'David', lastname: 'Miller', email: 'david.miller@example.com', phone: '+1 555-345-6789',
        city: 'Atlanta', country: 'United States', occupation: 'Commercial Airline Pilot',
        summary: 'Airline Transport Pilot with 4,500+ flight hours logged across multi-engine commercial jet aircraft, domestic corridors, and trans-oceanic routes.',
        employments: [
            {
                jobTitle: 'Commercial First Officer', employer: 'Delta Air Lines Flight Operations', begin: '2018',
                description: '<ul><li>Piloted Boeing 737 aircraft across domestic routes, maintaining a 100% on-time flight departure record.</li><li>Navigated instrument approaches in adverse meteorological conditions, ensuring absolute passenger safety.</li></ul>'
            },
            {
                jobTitle: 'Flight Instructor (CFI / CFII)', employer: 'Embry-Riddle Aviation Flight Academy', begin: '2015', end: '2018',
                description: '<ul><li>Commanded single- and multi-engine training flights, instructing 45 student pilots to complete FAA commercial ratings.</li><li>Briefed students on emergency procedures and meteorological safety protocols.</li></ul>'
            }
        ],
        educations: [{ school: 'Embry-Riddle Aeronautical University', degree: 'Bachelor of Science in Aeronautical Science', started: '2014' }],
        skills: [{ name: 'Instrument Flight Rules (IFR)' }, { name: 'Crew Resource Management (CRM)' }, { name: 'Flight Navigation' }]
    };

    const scoreDentist = calculateAtsScore(dentistResume);
    const scorePilot = calculateAtsScore(pilotResume);

    assert.ok(scoreDentist.qualityScore >= 65, `Dentist score should be strong (got ${scoreDentist.qualityScore})`);
    assert.ok(scorePilot.qualityScore >= 65, `Pilot score should be strong (got ${scorePilot.qualityScore})`);

    // Verify action verbs were detected for both without requiring tech verbs
    const expDentist = scoreDentist.sections.find(s => s.id === 'experience');
    const expPilot = scorePilot.sections.find(s => s.id === 'experience');
    assert.ok(expDentist.facts.verbs >= 1, 'Dentist should receive credit for diagnosed/treated action verbs');
    assert.ok(expPilot.facts.verbs >= 1, 'Pilot should receive credit for piloted/navigated action verbs');
});

// MATRIX 7: Target JD Override Dynamic Inference
test('Matrix 7: Target JD Override Dynamic Inference', () => {
    const candidateInput = {
        occupation: '',
        summary: 'Experienced professional seeking next career growth opportunity.'
    };
    const targetJd = `
        We are seeking a Lead Pilot to command regional passenger flights.
        Requirements:
        - Active Airline Transport Pilot License (ATPL)
        - 3,000+ flight hours on multi-engine aircraft
        - In-depth mastery of Instrument Flight Rules (IFR) and Crew Resource Management (CRM)
    `;

    const context = getCandidateContext(candidateInput, targetJd);
    assert.strictEqual(context.domain, DOMAINS.AVIATION, 'Domain should be dynamically inferred as AVIATION from Target JD');
});

// MATRIX 8: Unknown Role Handled as a Valid First-Class Production State
test('Matrix 8: Unknown Role Handled as a Valid Production State - Never Guesses or Defaults to IT', () => {
    const emptyResume = { occupation: '', summary: '' };
    const context = getCandidateContext(emptyResume);

    assert.strictEqual(context.domain, DOMAINS.UNSPECIFIED);
    assert.ok(context.isUnknownRole, 'isUnknownRole should be true for blank candidate input');
    assert.strictEqual(context.profession, 'Specialist');
    assert.ok(context.actionVerbs.length >= 6);

    // Verify blueprints are purely structural with 0 tech bias
    const serialized = JSON.stringify(context.starterBlueprints).toLowerCase();
    for (const contaminant of TECH_CONTAMINANTS) {
        assert.ok(!serialized.includes(contaminant), `Tech contaminant "${contaminant}" found in unknown role blueprints!`);
    }
});

// MATRIX 9: Backend Operation Validator Accepts Context Payload
test('Matrix 9: Backend Operation Validator Permits Context Field', () => {
    const payloadWithContext = {
        jobTitle: 'Commercial Airline Pilot',
        context: {
            domain: 'aviation',
            profession: 'Commercial Airline Pilot',
            seniority: 'senior',
            geography: { region: 'US' }
        }
    };

    const validated = validateOperation('generate-skills', payloadWithContext);
    assert.ok(validated.context, 'Context must be preserved through validateOperation');
    assert.strictEqual(validated.context.domain, 'aviation');
});

// MATRIX 10: Zero Cross-Candidate Contamination & Complete Context Isolation
test('Matrix 10: Zero Cross-Candidate Contamination & Complete Context Isolation', () => {
    // Candidate 1: Doctor
    const candDoctor = {
        occupation: 'Surgeon',
        summary: 'General surgeon with 10 years experience performing laparoscopic surgeries.',
        employments: [{ jobTitle: 'Chief of Surgery', employer: 'Memorial Hospital' }]
    };
    const ctxDoctor = getCandidateContext(candDoctor);
    assert.strictEqual(ctxDoctor.domain, DOMAINS.MEDICINE);
    assert.ok(ctxDoctor.actionVerbs.includes('Diagnosed'));

    // Candidate 2: Mechanical Engineer (Switched sequentially)
    const candEngineer = {
        occupation: 'Mechanical Design Engineer',
        summary: 'CAD engineer specializing in SolidWorks and thermal analysis.',
        employments: [{ jobTitle: 'Mechanical Engineer', employer: 'Siemens' }]
    };
    const ctxEngineer = getCandidateContext(candEngineer);
    assert.strictEqual(ctxEngineer.domain, DOMAINS.MECHANICAL_ENGINEERING);
    assert.ok(ctxEngineer.actionVerbs.includes('Designed'));
    const engStr = JSON.stringify(ctxEngineer).toLowerCase();
    assert.ok(!engStr.includes('surgeon') && !engStr.includes('laparoscopic'), 'Zero doctor leakage into engineer');

    // Candidate 3: Lawyer (Switched sequentially)
    const candLawyer = {
        occupation: 'Litigation Lawyer',
        summary: 'Trial lawyer specializing in appellate disputes and commercial litigation.',
        employments: [{ jobTitle: 'Senior Partner', employer: 'Blackstone Chambers' }]
    };
    const ctxLawyer = getCandidateContext(candLawyer);
    assert.strictEqual(ctxLawyer.domain, DOMAINS.LAW);
    assert.ok(ctxLawyer.actionVerbs.includes('Drafted'));
    const lawStr = JSON.stringify(ctxLawyer).toLowerCase();
    assert.ok(!lawStr.includes('solidworks') && !lawStr.includes('surgeon'), 'Zero engineer/doctor leakage into lawyer');

    // Candidate 4: Interplanetary Habitat Logistics Coordinator
    const candSpace = {
        occupation: 'Interplanetary Habitat Logistics Coordinator',
        summary: 'Coordinates cargo manifests and resource allocation for long-duration habitats.'
    };
    const ctxSpace = getCandidateContext(candSpace);
    assert.strictEqual(ctxSpace.domain, DOMAINS.UNSPECIFIED);
    assert.ok(ctxSpace.actionVerbs.includes('Coordinated') || ctxSpace.actionVerbs.includes('Dispatched'));
    assert.strictEqual(ctxSpace.domainLabel, 'Interplanetary Habitat Logistics Coordinator');
    const spaceStr = JSON.stringify(ctxSpace).toLowerCase();
    assert.ok(!spaceStr.includes('lawyer') && !spaceStr.includes('surgeon') && !spaceStr.includes('solidworks'), 'Zero contamination from previous candidates');
});

// MATRIX 11: Dynamic Open-Role Synthesizer on Arbitrary Novel Roles (Zero Predefined Taxonomy)
test('Matrix 11: Dynamic Open-Role Synthesizer on Arbitrary Novel Roles', () => {
    const novelRoles = [
        {
            title: 'Interplanetary Habitat Logistics Coordinator',
            expectedVerbs: ['Coordinated', 'Dispatched', 'Streamlined'],
            expectedDiscipline: 'Interplanetary Habitat Logistics',
            requiredKey: 'logistics'
        },
        {
            title: 'Arctic Infrastructure Resilience Strategist',
            expectedVerbs: ['Advised', 'Formulated', 'Drafted', 'Synthesized'],
            expectedDiscipline: 'Arctic Infrastructure Resilience',
            requiredKey: 'policy'
        },
        {
            title: 'Marine Robotics Compliance Specialist',
            expectedVerbs: ['Audited', 'Inspected', 'Standardized', 'Verified'],
            expectedDiscipline: 'Marine Robotics Compliance',
            requiredKey: 'compliance'
        },
        {
            title: 'Quantum Materials Researcher',
            expectedVerbs: ['Investigated', 'Synthesized', 'Characterized', 'Published'],
            expectedDiscipline: 'Quantum Materials',
            requiredKey: 'materials'
        },
        {
            title: 'Heritage Conservation Technology Advisor',
            expectedVerbs: ['Preserved', 'Conserved', 'Restored', 'Curated'],
            expectedDiscipline: 'Heritage Conservation Technology',
            requiredKey: 'heritage'
        },
        {
            title: 'Autonomous Agriculture Systems Planner',
            expectedVerbs: ['Surveyed', 'Sampled', 'Cultivated', 'Monitored'],
            expectedDiscipline: 'Autonomous Agriculture Systems',
            requiredKey: 'agriculture'
        },
        {
            title: 'Luxury Aviation Guest Experience Director',
            expectedVerbs: ['Curated', 'Elevated', 'Merchandised', 'Drove'],
            expectedDiscipline: 'Luxury Aviation Guest Experience',
            requiredKey: 'luxury'
        },
        {
            title: 'Deep-Sea Environmental Policy Consultant',
            expectedVerbs: ['Advised', 'Formulated', 'Drafted', 'Synthesized'],
            expectedDiscipline: 'Deep Sea Environmental Policy',
            requiredKey: 'policy'
        },
        {
            title: 'Synthetic Biology Regulatory Affairs Lead',
            expectedVerbs: ['Audited', 'Inspected', 'Standardized', 'Verified'],
            expectedDiscipline: 'Synthetic Biology Regulatory Affairs',
            requiredKey: 'regulatory'
        },
        {
            title: 'Cultural Festival Operations Director',
            expectedVerbs: ['Orchestrated', 'Directed', 'Coordinated', 'Programmed'],
            expectedDiscipline: 'Cultural Festival Operations',
            requiredKey: 'event'
        }
    ];

    for (const r of novelRoles) {
        const ctx = getCandidateContext({ occupation: r.title });
        assert.strictEqual(ctx.domain, DOMAINS.UNSPECIFIED, `${r.title} must be unspecified domain so synthesizer dynamically derives blueprints`);
        assert.strictEqual(ctx.domainLabel, r.title, `${r.title} must have matching domainLabel`);
        for (const v of r.expectedVerbs) {
            assert.ok(ctx.actionVerbs.includes(v), `${r.title} must include action verb ${v}, got: ${ctx.actionVerbs.join(',')}`);
        }
        assert.ok(ctx.starterBlueprints?.workHistory?.length > 0, `${r.title} must have starter blueprints`);
        assert.ok(ctx.domainData?.skills?.length >= 5, `${r.title} must have at least 5 synthesized skills`);

        // Check backend parity
        const beCtx = getBackendCandidateContext({ occupation: r.title });
        assert.strictEqual(beCtx.domain, DOMAINS.UNSPECIFIED);
        assert.strictEqual(beCtx.domainLabel, r.title);
        assert.ok(beCtx.actionVerbs.includes(r.expectedVerbs[0]));

        // Check AI fallback skills and certifications
        const fbSkills = getContentOperationFallback('generate-skills', { occupation: r.title });
        assert.ok(fbSkills.skills.length >= 5, `${r.title} fallback skills must have at least 5 items`);
        const fbCerts = getContentOperationFallback('generate-certifications', { occupation: r.title });
        assert.ok(fbCerts.certifications.length >= 2, `${r.title} fallback certifications must have at least 2 items`);

        // Verify zero tech contaminant in fallback
        const fbStr = JSON.stringify({ fbSkills, fbCerts }).toLowerCase();
        for (const contaminant of TECH_CONTAMINANTS) {
            assert.ok(!fbStr.includes(contaminant), `Contaminant ${contaminant} found in ${r.title} fallback!`);
        }
    }
});

// MATRIX 12: Regional Awareness in Geographic Detection
test('Matrix 12: Regional Awareness in Geographic Detection', () => {
    const indianCandidate = { city: 'Bengaluru', country: 'India', occupation: 'General Dentist' };
    const ctxIN = getCandidateContext(indianCandidate);
    assert.strictEqual(ctxIN.geography.region, 'IN');
    assert.ok(ctxIN.domainData.schools[0].includes('State University') || ctxIN.domainData.schools[0].includes('National Institute'));

    const ukCandidate = { city: 'London', country: 'United Kingdom', occupation: 'Civil Engineer' };
    const ctxUK = getCandidateContext(ukCandidate);
    assert.strictEqual(ctxUK.geography.region, 'UK');
    assert.ok(ctxUK.domainData.schools[0].includes('Royal College') || ctxUK.domainData.schools[0].includes('Accredited University'));

    const usCandidate = { city: 'Chicago', country: 'United States', occupation: 'Chartered Accountant' };
    const ctxUS = getCandidateContext(usCandidate);
    assert.strictEqual(ctxUS.geography.region, 'US');
});

// MATRIX 13: Target JD Override Dynamic Inference (Operations Professional Scenarios)
test('Matrix 13: Target JD Override Dynamic Inference across Diverse Operational Industries', () => {
    const candidate = { occupation: 'Operations Professional', summary: 'Experienced operations leader' };

    const jdA = 'We are seeking a Hospital Operations Manager to oversee clinical workflows, inpatient patient care logistics, and JCAHO regulatory compliance across 300 hospital beds.';
    const jdB = 'We are seeking a Hotel Operations Manager to oversee front desk, guest hospitality, housekeeping, culinary banquet operations, and resort guest experience.';
    const jdC = 'We are seeking a Manufacturing Operations Manager to oversee mechanical assembly, fabrication lines, CNC machining, and industrial plant floor operations.';
    const jdD = 'We are seeking a Supply Chain Operations Manager to oversee 3PL warehousing, freight distribution, freight logistics dispatch, and global procurement.';

    const ctxA = getCandidateContext(candidate, jdA);
    assert.strictEqual(ctxA.targetTitle, 'Hospital Operations Manager');
    assert.strictEqual(ctxA.domain, DOMAINS.MEDICINE);
    assert.ok(ctxA.actionVerbs.includes('Diagnosed') || ctxA.actionVerbs.includes('Administered') || ctxA.actionVerbs.includes('Treated'));

    const ctxB = getCandidateContext(candidate, jdB);
    assert.strictEqual(ctxB.targetTitle, 'Hotel Operations Manager');
    assert.strictEqual(ctxB.domain, DOMAINS.HOTEL_MANAGEMENT);
    assert.ok(ctxB.actionVerbs.includes('Managed') || ctxB.actionVerbs.includes('Directed'));

    const ctxC = getCandidateContext(candidate, jdC);
    assert.strictEqual(ctxC.targetTitle, 'Manufacturing Operations Manager');
    assert.strictEqual(ctxC.domain, DOMAINS.MECHANICAL_ENGINEERING);
    assert.ok(ctxC.actionVerbs.includes('Designed') || ctxC.actionVerbs.includes('Engineered'));

    const ctxD = getCandidateContext(candidate, jdD);
    assert.strictEqual(ctxD.targetTitle, 'Supply Chain Operations Manager');
    assert.strictEqual(ctxD.domain, DOMAINS.SUPPLY_CHAIN);
    assert.ok(ctxD.actionVerbs.includes('Procured') || ctxD.actionVerbs.includes('Optimized'));

    // Verify backend parity for all 4
    const beCtxA = getBackendCandidateContext(candidate, jdA);
    assert.strictEqual(beCtxA.targetTitle, 'Hospital Operations Manager');
    assert.strictEqual(beCtxA.domain, DOMAINS.MEDICINE);

    const beCtxB = getBackendCandidateContext(candidate, jdB);
    assert.strictEqual(beCtxB.targetTitle, 'Hotel Operations Manager');
    assert.strictEqual(beCtxB.domain, DOMAINS.HOTEL_MANAGEMENT);

    const beCtxC = getBackendCandidateContext(candidate, jdC);
    assert.strictEqual(beCtxC.targetTitle, 'Manufacturing Operations Manager');
    assert.strictEqual(beCtxC.domain, DOMAINS.MECHANICAL_ENGINEERING);

    const beCtxD = getBackendCandidateContext(candidate, jdD);
    assert.strictEqual(beCtxD.targetTitle, 'Supply Chain Operations Manager');
    assert.strictEqual(beCtxD.domain, DOMAINS.SUPPLY_CHAIN);
});

// MATRIX 14: Side-by-Side 15 Profession ATS Scoring & Zero Tech Bias Audit
test('Matrix 14: Side-by-Side 15 Profession ATS Scoring & Zero Tech Bias Audit', () => {
    const testPersonas = [
        { role: 'General Dentist', jd: 'Seeking General Dentist with Restorative Dentistry and Endodontics experience. Active dental license required.' },
        { role: 'Consultant Cardiologist', jd: 'Seeking Cardiologist experienced in Echocardiography and Cardiac Catheterization. Board certification required.' },
        { role: 'Commercial Airline Pilot', jd: 'Seeking ATPL Captain with Boeing 737 type rating, 4000+ flight hours, and Crew Resource Management.' },
        { role: 'Administrative Law Judge', jd: 'Seeking Administrative Law Judge for statutory adjudication, evidentiary hearings, and legal opinions.' },
        { role: 'Executive Head Chef', jd: 'Hiring Executive Chef for culinary menu development, food safety compliance, HACCP, and fine dining.' },
        { role: 'Master Industrial Electrician', jd: 'Seeking Master Electrician for switchgear installation, wiring diagrams, PLC troubleshooting, and OSHA code.' },
        { role: 'High School Mathematics Teacher', jd: 'Hiring High School Mathematics Teacher for calculus curriculum, pedagogy, student assessment, and classroom leadership.' },
        { role: 'Chartered Accountant', jd: 'Seeking Chartered Accountant for statutory audit, GAAP compliance, financial reporting, and tax reconciliations.' },
        { role: 'Principal Concert Violist', jd: 'Seeking Principal Violist for orchestral repertoire, chamber ensemble performance, and rehearsal leadership.' },
        { role: 'Humanitarian Program Director', jd: 'Seeking NGO Director for community relief programs, grant administration, and stakeholder advocacy.' },
        { role: 'Artisan Watchmaker', jd: 'Seeking Watchmaker for mechanical movement restoration, escapement regulation, and precision machining.' },
        { role: 'Marine Robotics Compliance Specialist', jd: 'Seeking Marine Robotics Compliance Specialist for maritime safety codes, unmanned vehicle standards, and ISO audits.' },
        { role: 'Arctic Infrastructure Resilience Strategist', jd: 'Seeking Resilience Strategist for extreme climate infrastructure, permafrost engineering policy, and municipal standards.' },
        { role: 'Heritage Conservation Technology Advisor', jd: 'Seeking Heritage Conservation Advisor for non-destructive diagnostic imaging, museum artifact preservation, and material analysis.' },
        { role: 'Autonomous Agriculture Systems Planner', jd: 'Seeking Autonomous Agriculture Systems Planner for robotic harvesting pipelines, soil sensor telemetry, and precision agronomy.' }
    ];

    for (const p of testPersonas) {
        const candidateResume = {
            firstname: 'Alex',
            lastname: 'Morgan',
            email: 'alex.morgan@careerdomain.org',
            phone: '+1 (555) 321-9876',
            city: 'Regional Center',
            country: 'United States',
            occupation: p.role,
            summary: `Dedicated ${p.role} with 8 years of professional experience delivering rigorous standards and measurable operational results.`,
            employments: [
                {
                    jobTitle: p.role,
                    employer: 'Professional Organization',
                    description: `<ul><li>Spearheaded core deliverables for 200+ specialized projects, achieving 98% quality compliance.</li><li>Coordinated multidisciplinary teams and enforced standard operating procedures across all deliverables.</li></ul>`,
                    begin: '2016'
                }
            ],
            educations: [
                { school: 'Accredited University / Professional Institute', degree: `Bachelor's / Professional Degree in ${p.role}` }
            ],
            skills: [
                { name: 'Standard Operating Procedures (SOPs)' },
                { name: 'Quality Assurance Standards' },
                { name: 'Risk Assessment & Mitigation' },
                { name: 'Stakeholder Communication' },
                { name: 'Operational Compliance' },
                { name: 'Performance Optimization' },
                { name: 'Caseload / Project Oversight' },
                { name: 'Technical Documentation' }
            ]
        };

        const result = calculateAtsScore(candidateResume, { jobDescription: p.jd });
        assert.ok(result.totalScore >= 65, `${p.role} must achieve strong ATS readiness (>=65), got: ${result.totalScore}`);
        assert.ok(result.jdMatch.total > 0, `${p.role} must extract valid terms from JD`);

        // Verify zero IT tech penalty
        const missingIT = (result.jdMatch.missing || []).filter(t => ['aws', 'react', 'python', 'docker', 'kubernetes'].includes(t.toLowerCase()));
        assert.strictEqual(missingIT.length, 0, `Non-tech role ${p.role} must NOT be penalized for missing IT terms!`);
    }
});

// MATRIX 15: Cross-Candidate Contamination & Cache Isolation (6 Disparate Profiles)
test('Matrix 15: Cross-Candidate Contamination & Cache Isolation (6 Disparate Profiles)', () => {
    const candidates = [
        { name: 'Dr. John Watson', occupation: 'General Physician', domain: DOMAINS.MEDICINE },
        { name: 'Att. Harvey Specter', occupation: 'Litigation Lawyer', domain: DOMAINS.LAW },
        { name: 'Chef Gordon Ramsay', occupation: 'Executive Chef', domain: DOMAINS.HOSPITALITY },
        { name: 'Eng. Nikola Tesla', occupation: 'Mechanical Engineer', domain: DOMAINS.MECHANICAL_ENGINEERING },
        { name: 'Capt. Chesley Sullenberger', occupation: 'Commercial Airline Pilot', domain: DOMAINS.AVIATION },
        { name: 'Dr. Alistair Vance', occupation: 'Interplanetary Habitat Logistics Coordinator', domain: DOMAINS.UNSPECIFIED }
    ];

    let previousCandidateDump = '';

    for (const c of candidates) {
        const ctx = getCandidateContext({ firstname: c.name.split(' ')[0], lastname: c.name.split(' ')[1], occupation: c.occupation });
        assert.strictEqual(ctx.domain, c.domain);

        const currentDump = JSON.stringify(ctx).toLowerCase();

        if (previousCandidateDump) {
            if (c.domain === DOMAINS.LAW) {
                assert.ok(!currentDump.includes('physician') && !currentDump.includes('stethoscope'), 'Lawyer must not contain doctor data');
            } else if (c.domain === DOMAINS.HOSPITALITY) {
                assert.ok(!currentDump.includes('litigation') && !currentDump.includes('court'), 'Chef must not contain lawyer data');
            } else if (c.domain === DOMAINS.MECHANICAL_ENGINEERING) {
                assert.ok(!currentDump.includes('culinary') && !currentDump.includes('kitchen'), 'Engineer must not contain chef data');
            } else if (c.domain === DOMAINS.AVIATION) {
                assert.ok(!currentDump.includes('solidworks') && !/\bcad\b/i.test(currentDump), 'Pilot must not contain engineering data');
            } else if (c.domain === DOMAINS.UNSPECIFIED) {
                assert.ok(!currentDump.includes('cockpit') && !currentDump.includes('pilot'), 'Space Coordinator must not contain pilot data');
            }
        }

        previousCandidateDump = currentDump;
    }
});

// MATRIX 16: International Geographic Regionalization across 9 Markets
test('Matrix 16: International Geographic Regionalization across 9 Global Markets', () => {
    const regions = [
        { country: 'India', city: 'Bengaluru', expected: 'IN', phonePrefix: '+91' },
        { country: 'United States', city: 'Boston', expected: 'US', phonePrefix: '+1' },
        { country: 'United Kingdom', city: 'Edinburgh', expected: 'UK', phonePrefix: '+44' },
        { country: 'Canada', city: 'Toronto', expected: 'CA', phonePrefix: '+1' },
        { country: 'Australia', city: 'Sydney', expected: 'AU', phonePrefix: '+61' },
        { country: 'Germany', city: 'Berlin', expected: 'EU', phonePrefix: '+49' },
        { country: 'United Arab Emirates', city: 'Dubai', expected: 'GLOBAL', phonePrefix: '+1' },
        { country: 'Singapore', city: 'Singapore', expected: 'GLOBAL', phonePrefix: '+1' },
        { country: 'International', city: 'Metropolitan Area', expected: 'GLOBAL', phonePrefix: '+1' }
    ];

    for (const r of regions) {
        const detected = detectGeographicRegion({ country: r.country, city: r.city });
        assert.strictEqual(detected, r.expected, `Country ${r.country} (${r.city}) should map to region ${r.expected}`);

        const ph = getDynamicPlaceholder('heading', 'phone', { geography: { region: detected } });
        assert.ok(ph.includes(r.phonePrefix), `Region ${detected} phone placeholder must include ${r.phonePrefix}, got ${ph}`);
    }
});
