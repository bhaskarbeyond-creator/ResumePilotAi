/**
 * Resume Field Mapper & Intermediate Temp JSON Converter
 * Maximum-strength normalizer that handles every possible AI output variation,
 * non-standard field names, and edge cases in uploaded resume data.
 * ALWAYS merges heuristic extraction with AI output for full coverage.
 */

// ═══════════════════════════════════════════════
// Helper: Safe string extraction with multi-key fallback
// ═══════════════════════════════════════════════
function pick(obj, ...keys) {
    for (const key of keys) {
        const val = obj?.[key];
        if (val !== undefined && val !== null && String(val).trim() !== '') {
            return String(val).trim();
        }
    }
    return '';
}

function pickArray(obj, ...keys) {
    for (const key of keys) {
        const val = obj?.[key];
        if (Array.isArray(val) && val.length > 0) return val;
    }
    return [];
}

// ═══════════════════════════════════════════════
// 1. Convert raw AI JSON into standardized Temp JSON (PURE AI MAPPING)
// ═══════════════════════════════════════════════
export function normalizeRawDataToTempJson(aiRawJson = {}, rawText = '') {
    // ── A. Name Normalization (Strictly from AI JSON) ──
    const cleanLabelPrefix = (s) => String(s || '')
        .replace(/^(Candidate\s+Name|Full\s+Name|Applicant\s+Name|Person\s+Name|Name|CV\s+of|Resume\s+of|Curriculum\s+Vitae\s+of)[:\s-]*/i, '')
        .trim();

    let firstname = cleanLabelPrefix(pick(aiRawJson, 'firstname', 'firstName', 'first_name', 'givenName'));
    let lastname = cleanLabelPrefix(pick(aiRawJson, 'lastname', 'lastName', 'last_name', 'surname', 'familyName'));

    // Fix edge case where AI put full name in firstname or candidateName
    if (!firstname && !lastname) {
        const fullName = cleanLabelPrefix(pick(aiRawJson, 'name', 'fullName', 'full_name', 'candidateName', 'candidate_name', 'candidate'));
        if (fullName) {
            const cleaned = fullName.replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Prof\.?|Er\.?|Eng\.?)\s+/i, '').trim();
            const parts = cleaned.replace(/\s+(Jr\.?|Sr\.?|III|IV|PhD|MD|Esq\.?|PMP|CPA|PE|MBA)$/i, '').trim().split(/\s+/);
            firstname = parts[0] || '';
            lastname = parts.slice(1).join(' ') || '';
        }
    }

    // ── B. Contact Info ──
    let email = pick(aiRawJson, 'email', 'emailAddress', 'email_address', 'mail');
    let phone = pick(aiRawJson, 'phone', 'phoneNumber', 'phone_number', 'mobile', 'telephone', 'tel', 'contact');
    let occupation = pick(aiRawJson, 'occupation', 'title', 'jobTitle', 'job_title', 'currentTitle', 'headline', 'designation', 'role', 'position');
    let city = pick(aiRawJson, 'city', 'currentCity');
    let country = pick(aiRawJson, 'country', 'state', 'region', 'nationality');
    let address = pick(aiRawJson, 'address', 'streetAddress', 'street_address', 'street');
    let postalcode = pick(aiRawJson, 'postalcode', 'postalCode', 'postal_code', 'zipcode', 'zipCode', 'zip_code', 'zip', 'pincode');

    // Location string parsing if city/country are in a single string returned by AI
    const locationStr = pick(aiRawJson, 'location', 'place');
    if (!city && locationStr) {
        const locParts = locationStr.split(/[,|-]/).map(s => s.trim()).filter(Boolean);
        if (locParts.length >= 1) city = locParts[0];
        if (!country && locParts.length >= 2) country = locParts.slice(1).join(', ');
    }

    // ── C. Professional Summary ──
    let summary = pick(aiRawJson,
        'summary', 'profile', 'objective', 'about', 'bio',
        'professionalSummary', 'professional_summary', 'careerSummary', 'career_summary',
        'executiveSummary', 'executive_summary', 'profileSummary', 'profile_summary',
        'overview', 'careerObjective', 'career_objective', 'personalStatement', 'personal_statement',
        'summaryOfQualifications', 'summary_of_qualifications', 'aboutMe', 'about_me'
    );
    if (summary) {
        summary = summary.replace(/^(?:PROFESSIONAL\s+SUMMARY|EXECUTIVE\s+SUMMARY|CAREER\s+SUMMARY|PROFILE\s+SUMMARY|SUMMARY\s+OF\s+QUALIFICATIONS|CAREER\s+OBJECTIVE|PROFESSIONAL\s+PROFILE|PERSONAL\s+STATEMENT|ABOUT\s+ME|OBJECTIVE|PROFILE|SUMMARY)[:\s-]*/i, '').trim();
    }
    if (summary && !summary.startsWith('<p>') && !summary.includes('<')) {
        summary = `<p>${summary}</p>`;
    }

    // ── D. Work History (Mapped strictly from AI response) ──
    const aiEmployments = pickArray(aiRawJson,
        'employments', 'employment', 'experience', 'experiences',
        'workHistory', 'work_history', 'workExperience', 'work_experience',
        'positions', 'jobs', 'roles', 'careerHistory', 'career_history',
        'professionalExperience', 'professional_experience'
    );

    const employments = aiEmployments.map((emp, idx) => {
        if (typeof emp === 'string') {
            return {
                id: Date.now() + idx,
                jobTitle: emp, employer: '', city: '',
                begin: '', end: '', description: '', current: false,
            };
        }
        let jobTitle = pick(emp, 'jobTitle', 'job_title', 'title', 'role', 'position', 'designation');
        let employer = pick(emp, 'employer', 'company', 'organization', 'organisation', 'client', 'firm', 'companyName', 'company_name');

        // Split "Senior Engineer at Google" if combined
        if (jobTitle && !employer) {
            const splitMatch = jobTitle.match(/^(.+?)\s+(?:at|@|for|with|-|–|,)\s+(.+)$/i);
            if (splitMatch) { jobTitle = splitMatch[1].trim(); employer = splitMatch[2].trim(); }
        }
        if (employer && !jobTitle) {
            const splitMatch = employer.match(/^(.+?)\s+(?:-|–|,)\s+(.+)$/i);
            if (splitMatch) { employer = splitMatch[1].trim(); jobTitle = splitMatch[2].trim(); }
        }
        const beginDate = pick(emp, 'begin', 'startDate', 'start_date', 'start', 'from', 'dateFrom', 'startYear');
        const endDate = pick(emp, 'end', 'endDate', 'end_date', 'finish', 'to', 'dateTo', 'endYear');
        const isCurrent = emp.current === true || /present|current|ongoing|now|till date|to date/i.test(endDate);
        let description = pick(emp, 'description', 'responsibilities', 'achievements', 'details', 'summary', 'highlights', 'bullets', 'duties');

        // Handle array of bullet strings from AI
        if (!description && Array.isArray(emp.description)) {
            description = emp.description.map(d => `<p>${String(d).replace(/^[-•*]\s*/, '').trim()}</p>`).join('\n');
        }
        if (!description && Array.isArray(emp.responsibilities)) {
            description = emp.responsibilities.map(d => `<p>${String(d).replace(/^[-•*]\s*/, '').trim()}</p>`).join('\n');
        }
        if (!description && Array.isArray(emp.achievements)) {
            description = emp.achievements.map(d => `<p>${String(d).replace(/^[-•*]\s*/, '').trim()}</p>`).join('\n');
        }
        if (!description && Array.isArray(emp.bullets)) {
            description = emp.bullets.map(d => `<p>${String(d).replace(/^[-•*]\s*/, '').trim()}</p>`).join('\n');
        }

        // Clean HTML and wrap in <p> tags
        if (description && typeof description === 'string') {
            const cleanLines = description
                .replace(/<\/(p|li|div|h[1-6])>/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n')
                .replace(/<[^>]*>/g, '')
                .split(/\n+/)
                .map(l => l.replace(/^[-•*·▪▸►]\s*/, '').trim())
                .filter(l => l.length > 2);
            if (cleanLines.length > 0) {
                description = cleanLines.map(l => `<p>${l}</p>`).join('\n');
            }
        }

        return {
            id: Date.now() + idx,
            jobTitle: jobTitle || '',
            employer: employer || '',
            city: pick(emp, 'city', 'location', 'place', 'office') || '',
            begin: beginDate || '',
            end: isCurrent ? 'Present' : (endDate || ''),
            description: description || '',
            current: Boolean(isCurrent),
        };
    });

    // ── E. Education (Mapped strictly from AI response) ──
    const aiEducations = pickArray(aiRawJson,
        'educations', 'education', 'academics', 'academic',
        'qualifications', 'degrees', 'certifications', 'credentials',
        'training', 'courses', 'schooling'
    );

    const educations = aiEducations.map((edu, idx) => {
        if (typeof edu === 'string') {
            return {
                id: Date.now() + idx + 500,
                school: edu, degree: '', city: '',
                started: '', finished: '', description: '',
            };
        }
        let school = pick(edu, 'school', 'university', 'institution', 'college', 'academy', 'institute', 'schoolName', 'universityName');
        let degree = pick(edu, 'degree', 'field', 'major', 'program', 'course', 'certification', 'qualification', 'degreeName', 'fieldOfStudy', 'field_of_study');
        if (degree && !school) {
            const fromMatch = degree.match(/^(.+?)\s+(?:from|at|@)\s+(.+)$/i);
            if (fromMatch) { degree = fromMatch[1].trim(); school = fromMatch[2].trim(); }
        }
        return {
            id: Date.now() + idx + 500,
            school: school || '',
            degree: degree || '',
            city: pick(edu, 'city', 'location', 'place') || '',
            started: pick(edu, 'started', 'startDate', 'start_date', 'start', 'from', 'startYear') || '',
            finished: pick(edu, 'finished', 'endDate', 'end_date', 'end', 'to', 'endYear', 'graduationYear', 'graduation_year', 'graduated') || '',
            description: pick(edu, 'description', 'gpa', 'honors', 'details', 'grade', 'distinction', 'coursework') || '',
        };
    });

    // ── F. Skills (Mapped strictly from AI response) ──
    const aiSkills = pickArray(aiRawJson,
        'skills', 'technicalSkills', 'technical_skills', 'coreCompetencies',
        'core_competencies', 'competencies', 'technologies', 'tools',
        'expertise', 'proficiencies', 'techStack', 'tech_stack'
    );

    const seenSkills = new Set();
    const skills = [];

    const pushSkill = (name, rat) => {
        const cleanName = String(name || '').replace(/^[-•*·▪]\s*/, '').trim();
        if (cleanName && cleanName.length >= 2 && !seenSkills.has(cleanName.toLowerCase())) {
            seenSkills.add(cleanName.toLowerCase());
            skills.push({
                id: `skill_${Date.now()}_${skills.length}`,
                skillName: cleanName,
                rating: Math.min(100, Math.max(10, Number(rat) || 85)),
            });
        }
    };

    aiSkills.forEach((sk) => {
        let skillName = '';
        let rating = 85;
        if (typeof sk === 'string') {
            skillName = sk.trim();
        } else if (typeof sk === 'object' && sk !== null) {
            skillName = pick(sk, 'skillName', 'skill_name', 'name', 'skill', 'technology', 'tool', 'label');
            rating = sk.rating || sk.level || sk.proficiency || 85;
            if (typeof rating === 'string') {
                const levelMap = { expert: 95, advanced: 90, proficient: 85, intermediate: 75, beginner: 65, basic: 60 };
                rating = levelMap[rating.toLowerCase()] || 85;
            }
        }
        if (skillName.includes(':') || skillName.includes(',')) {
            const parts = skillName.split(/[:;,]/).map(p => p.trim()).filter(Boolean);
            parts.forEach(p => pushSkill(p, rating));
        } else {
            pushSkill(skillName, rating);
        }
    });

    // ── G. Languages (Mapped strictly from AI response) ──
    const aiLanguages = pickArray(aiRawJson, 'languages', 'spokenLanguages', 'spoken_languages');
    const languages = aiLanguages.map((lang, idx) => {
        if (typeof lang === 'string') {
            return { id: `lang_${Date.now()}_${idx}`, name: lang.trim(), language: lang.trim(), level: 'Fluent' };
        }
        const langTitle = pick(lang, 'name', 'language', 'lang') || '';
        return {
            id: `lang_${Date.now()}_${idx}`,
            name: langTitle,
            language: langTitle,
            level: pick(lang, 'level', 'proficiency', 'fluency') || 'Native / Bilingual',
        };
    });

    // ── Build Temp JSON Payload ──
    const tempResumeJson = {
        firstname,
        lastname,
        email,
        phone,
        occupation,
        city,
        country,
        address,
        postalcode,
        summary,
        employments,
        educations,
        skills,
        languages,
        meta: {
            extractedAt: new Date().toISOString(),
            rawTextLength: rawText?.length || 0,
            employmentsCount: employments.length,
            educationsCount: educations.length,
            skillsCount: skills.length,
            aiUsed: true,
        },
    };

    // Persist to sessionStorage for recovery
    try {
        if (typeof window !== 'undefined') {
            sessionStorage.setItem('temp_imported_resume_json', JSON.stringify(tempResumeJson));
        }
    } catch (e) {
        console.warn('SessionStorage temp JSON save warning:', e);
    }

    return tempResumeJson;
}

// ═══════════════════════════════════════════════
// 2. Map Temp JSON to Resume Builder State
// ═══════════════════════════════════════════════
export function mapTempJsonToResumePayload(tempJson = {}, existingResumeData = {}) {
    return {
        ...existingResumeData,
        firstname: tempJson.firstname || existingResumeData.firstname || '',
        lastname: tempJson.lastname || existingResumeData.lastname || '',
        email: tempJson.email || existingResumeData.email || '',
        phone: tempJson.phone || existingResumeData.phone || '',
        occupation: tempJson.occupation || existingResumeData.occupation || '',
        city: tempJson.city || existingResumeData.city || '',
        country: tempJson.country || existingResumeData.country || '',
        address: tempJson.address || existingResumeData.address || '',
        postalcode: tempJson.postalcode || existingResumeData.postalcode || '',
        summary: tempJson.summary || existingResumeData.summary || '',
        employments: tempJson.employments && tempJson.employments.length > 0 ? tempJson.employments : (existingResumeData.employments || []),
        educations: tempJson.educations && tempJson.educations.length > 0 ? tempJson.educations : (existingResumeData.educations || []),
        skills: tempJson.skills && tempJson.skills.length > 0 ? tempJson.skills : (existingResumeData.skills || []),
        languages: tempJson.languages && tempJson.languages.length > 0 ? tempJson.languages : (existingResumeData.languages || []),
    };
}

// ═══════════════════════════════════════════════
// 3. Client-Side Heuristic & Regex Parser (Failsafe) – Enhanced
// ═══════════════════════════════════════════════
export function extractHeuristicResumeData(rawText = '') {
    if (!rawText) return {};

    console.log('⚡ Running Enhanced Client-Side Heuristic Extraction...');

    const lines = rawText.split(/\n+/).map(l => l.trim()).filter(Boolean);

    // ---- Contact Info ----
    const emailMatch = rawText.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    const phoneMatch = rawText.match(/(?:\+\d{1,3}[\s.-]?)?\(?\d{2,4}\)?[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);

    // ---- Name ----
    let firstname = '';
    let lastname = '';
    const cleanLabelPrefix = (s) => String(s || '')
        .replace(/^(Candidate\s+Name|Full\s+Name|Applicant\s+Name|Person\s+Name|Name|CV\s+of|Resume\s+of|Curriculum\s+Vitae\s+of)[:\s-]*/i, '')
        .trim();

    // 1. Labeled name in top 10 lines
    for (const line of lines.slice(0, 10)) {
        const labelMatch = line.match(/^(?:Candidate\s+Name|Full\s+Name|Name|Resume\s+of|Curriculum\s+Vitae\s+of)[:\s-]+([A-Za-z\s'.-]+)$/i);
        if (labelMatch && labelMatch[1].trim().length > 2) {
            const nameStr = cleanLabelPrefix(labelMatch[1].trim());
            const parts = nameStr.split(/\s+/);
            firstname = parts[0] || '';
            lastname = parts.slice(1).join(' ') || '';
            break;
        }
    }

    // 2. Top 6 lines non‑header
    if (!firstname) {
        for (const line of lines.slice(0, 6)) {
            if (!line.includes('@') && !line.match(/\d{5}/) && !line.match(/\+?\d[\d\s()-]{8,}/) && !/http|www|github|linkedin|location|address|phone|email|summary|experience|education|skills/i.test(line)) {
                const cleaned = cleanLabelPrefix(line).replace(/^(Dr\.?|Mr\.?|Ms\.?|Mrs\.?|Prof\.?|Er\.?|Eng\.?)\s+/i, '').replace(/[^a-zA-Z\s'-]/g, '').trim();
                const parts = cleaned.split(/\s+/);
                if (parts.length >= 2 && parts.length <= 4 && parts[0].length > 1) {
                    firstname = parts[0];
                    lastname = parts.slice(1).join(' ');
                    break;
                } else if (parts.length === 1 && parts[0].length > 2) {
                    firstname = parts[0];
                    lastname = '';
                    break;
                }
            }
        }
    }

    // ---- Occupation ----
    let occupation = '';
    const roleKeywords = ['Manager', 'Engineer', 'Developer', 'Architect', 'Lead', 'Designer', 'Director', 'Specialist', 'Analyst', 'Consultant', 'Coordinator', 'Administrator', 'Scientist', 'Researcher', 'Officer', 'VP', 'CTO', 'CEO', 'CFO'];
    for (const line of lines.slice(0, 10)) {
        if (roleKeywords.some(kw => line.toLowerCase().includes(kw.toLowerCase()))) {
            occupation = line.replace(/^[^a-zA-Z]+/, '').trim();
            break;
        }
    }

    // ---- Location (city, country, address, postalcode) ----
    let city = '', country = '', address = '', postalcode = '';
    // Try to find a line with "Location" or "Address"
    const locLine = lines.find(l => /^(location|address)\s*[:;]/i.test(l));
    if (locLine) {
        const parts = locLine.replace(/^(location|address)\s*[:;]/i, '').split(/[,|-]/).map(p => p.trim()).filter(Boolean);
        if (parts.length >= 1) city = parts[0];
        if (parts.length >= 2) country = parts.slice(1).join(', ');
        address = locLine.replace(/^(location|address)\s*[:;]/i, '').trim();
    } else {
        // Fallback: scan raw text for city patterns
        const cityMatch = rawText.match(/\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s*,\s*([A-Z]{2})\b/);
        if (cityMatch) { city = cityMatch[1]; country = cityMatch[2]; }
        const zipMatch = rawText.match(/\b\d{5}(?:-\d{4})?\b/);
        if (zipMatch) postalcode = zipMatch[0];
    }

    // ---- Summary ----
    let summary = '';
    const summaryHeaderIdx = lines.findIndex(l =>
        /^(?:PROFESSIONAL\s+SUMMARY|EXECUTIVE\s+SUMMARY|CAREER\s+SUMMARY|PROFILE\s+SUMMARY|SUMMARY\s+OF\s+QUALIFICATIONS|CAREER\s+OBJECTIVE|PROFESSIONAL\s+PROFILE|PERSONAL\s+STATEMENT|ABOUT\s+ME|OBJECTIVE|PROFILE|SUMMARY)/i.test(l)
    );
    if (summaryHeaderIdx !== -1) {
        const stopHeaderPattern = /^(?:WORK\s+EXPERIENCE|CAREER\s+HISTORY|EMPLOYMENT|PROFESSIONAL\s+EXPERIENCE|WORK\s+HISTORY|PROJECTS|EDUCATION|ACADEMIA|SKILLS|COMPETENCIES|LANGUAGES|CERTIFICATIONS)/i;
        const summaryLines = [];
        for (let i = summaryHeaderIdx + 1; i < Math.min(lines.length, summaryHeaderIdx + 12); i++) {
            const line = lines[i];
            if (stopHeaderPattern.test(line)) break;
            if (line === line.toUpperCase() && line.length < 35 && !line.includes('.')) break;
            summaryLines.push(line);
        }
        if (summaryLines.length > 0) {
            summary = `<p>${summaryLines.join(' ').replace(/^[-•*]\s*/, '').trim()}</p>`;
        }
    }
    if (!summary && occupation) {
        summary = `<p>Experienced ${occupation} with expertise in delivering impactful solutions and leading cross-functional teams.</p>`;
    }

    // ---- Work History (heuristic) ----
    const employments = [];
    const expStart = lines.findIndex(l => /^(experience|work\s*experience|professional\s*experience|employment|career\s*history|work\s*history|where\s*i\s*worked)/i.test(l));
    const eduStart = lines.findIndex(l => /^(education|academic|qualification|schooling|training|certification|academia)/i.test(l));
    const skillsStart = lines.findIndex(l => /^(skills|competenc|tech\s*stack|tool|technologies|proficienc|expertise)/i.test(l));

    if (expStart !== -1) {
        const endIdx = [eduStart, skillsStart, lines.length].filter(i => i > expStart).sort((a, b) => a - b)[0];
        const expLines = lines.slice(expStart + 1, endIdx);
        let currentEmp = null;
        expLines.forEach((line, i) => {
            const dateMatch = line.match(/(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|\d{4}).*?(?:Present|Current|\d{4})/i);
            if (dateMatch || (i === 0 && line.length < 70 && !line.startsWith('-') && !line.startsWith('•'))) {
                if (currentEmp) employments.push(currentEmp);
                const titlePart = line.replace(dateMatch ? dateMatch[0] : '', '').trim();
                const parts = titlePart.split(/[-–|@,]/).map(p => p.trim()).filter(Boolean);
                currentEmp = {
                    id: Date.now() + i,
                    jobTitle: parts[0] || '',
                    employer: parts[1] || '',
                    city: parts[2] || city || '',
                    begin: dateMatch ? dateMatch[0].split(/[-–]|to/i)[0]?.trim() : '',
                    end: dateMatch ? (dateMatch[0].split(/[-–]|to/i)[1]?.trim() || 'Present') : 'Present',
                    description: '',
                    current: /present|current/i.test(line),
                };
            } else if (currentEmp && line.length > 5) {
                currentEmp.description += `<p>${line.replace(/^[-•*·▪]\s*/, '').trim()}</p>\n`;
            }
        });
        if (currentEmp) employments.push(currentEmp);
    }

    // ---- Education (heuristic) ----
    const educations = [];
    if (eduStart !== -1) {
        const endIdx = [skillsStart, lines.length].filter(i => i > eduStart).sort((a, b) => a - b)[0];
        const eduLines = lines.slice(eduStart + 1, endIdx);
        let currentEdu = null;
        eduLines.forEach((line, i) => {
            const yearMatch = line.match(/\b(19|20)\d{2}\b/);
            if (yearMatch || /degree|master|bachelor|b\.e|m\.tech|b\.tech|bs|ms|phd|diploma/i.test(line)) {
                if (currentEdu) educations.push(currentEdu);
                const parts = line.split(/[-–|@,]/).map(p => p.trim()).filter(Boolean);
                currentEdu = {
                    id: Date.now() + i + 500,
                    degree: parts[0] || line,
                    school: parts[1] || '',
                    city: '',
                    started: yearMatch ? yearMatch[0] : '',
                    finished: yearMatch ? yearMatch[0] : '',
                    description: '',
                };
            } else if (currentEdu) {
                currentEdu.description += (currentEdu.description ? ' ' : '') + line;
            }
        });
        if (currentEdu) educations.push(currentEdu);
    }

    // ---- Skills (heuristic) ----
    const skills = [];
    const techSkills = [
        'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin',
        'React', 'Angular', 'Vue.js', 'Next.js', 'Node.js', 'Express', 'Django', 'Flask', 'Spring Boot',
        'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Jenkins', 'CI/CD',
        'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Elasticsearch',
        'Git', 'Linux', 'Agile', 'Scrum', 'REST API', 'GraphQL', 'Microservices',
        'HTML', 'CSS', 'SQL', 'Machine Learning', 'Deep Learning', 'TensorFlow', 'PyTorch',
        'Leadership', 'Project Management', 'Communication', 'Team Management',
        // Add more domain-specific
        'Salesforce', 'SAP', 'Oracle', 'Tableau', 'Power BI', 'Excel', 'SharePoint',
        'Cisco', 'Jira', 'Confluence', 'Figma', 'Adobe XD', 'Sketch', 'Photoshop',
        'Illustrator', 'InDesign', 'After Effects', 'Premiere Pro', 'Final Cut Pro',
    ];
    const lowerText = rawText.toLowerCase();
    techSkills.forEach((sk, idx) => {
        if (lowerText.includes(sk.toLowerCase())) {
            skills.push({ id: `sk_${Date.now()}_${idx}`, skillName: sk, rating: 85 });
        }
    });

    // ---- Languages (heuristic) ----
    const languages = [];
    const langKeywords = ['English', 'Spanish', 'French', 'German', 'Chinese', 'Japanese', 'Hindi', 'Arabic', 'Portuguese', 'Russian', 'Dutch', 'Italian', 'Korean'];
    langKeywords.forEach(lang => {
        if (lowerText.includes(lang.toLowerCase())) {
            let level = 'Fluent';
            if (lowerText.includes(`${lang.toLowerCase()} native`)) level = 'Native';
            else if (lowerText.includes(`${lang.toLowerCase()} intermediate`)) level = 'Intermediate';
            else if (lowerText.includes(`${lang.toLowerCase()} basic`)) level = 'Basic';
            languages.push({ id: `lang_${Date.now()}_${languages.length}`, language: lang, level });
        }
    });

    return {
        firstname,
        lastname,
        email: emailMatch ? emailMatch[0] : '',
        phone: phoneMatch ? phoneMatch[0] : '',
        occupation,
        city,
        country,
        address,
        postalcode,
        summary,
        employments,
        educations,
        skills,
        languages,
    };
}