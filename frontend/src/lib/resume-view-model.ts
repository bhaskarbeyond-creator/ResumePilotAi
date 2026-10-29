/**
 * Resume view-model normalisation (DIR-008).
 *
 * Shared by the export/print page and the anonymous public viewer so that the
 * preview, the PDF/print surface and a shared link render the same document for
 * the same persisted resume. Pure functions only — no React, no network, and no
 * fabricated demo profile.
 */

export type ResumeDocumentModel = {
  id: string;
  name: string;
  template: string;
  heading: {
    firstName: string; lastName: string; title: string; email: string; phone: string;
    location: string; website: string; linkedin: string; github: string;
    photo: string; showPhoto: boolean; address?: string; postalCode?: string;
  };
  summary: string;
  /** Supplied cover-letter text, when this is a cover export. */
  letterBody?: string;
  coverDetails?: {
    jobTitle: string; companyName: string; recipientName: string;
    companyAddress: string; companyCity: string; companyPostalCode: string;
    candidateAddress: string; candidateCity: string; candidatePostalCode: string;
  };
  experience: any[];
  education: any[];
  skillCategories: any[];
  certifications: any[];
  projects: any[];
  languages: any[];
  achievements: any[];
  hobbies: string[];
  references: any[];
  customSections?: Array<{ id: string; sectionTitle: string; items: Array<{ id: string; title: string; description: string }> }>;
};

export function parseIfJson(val: any) {
  if (typeof val === 'string') {
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  }
  return val;
}

/**
 * Converts any persisted resume shape (builder draft, legacy flattened row or
 * publication snapshot) into the view model the document renderer consumes.
 * There is deliberately no demo fallback here: an empty payload produces an
 * empty view model, never another person's resume.
 */
export function normalizeResumeToDocument(raw: any) {
  if (!raw) {
    return {
      id: '', name: '', template: '', heading: { firstName: '', lastName: '', title: '', email: '', phone: '', location: '', website: '', linkedin: '', github: '', photo: '', showPhoto: false },
      summary: '', experience: [], education: [], skillCategories: [], certifications: [], projects: [], languages: [], achievements: [], hobbies: [], references: [],
    };
  }
  const envelope = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  const nestedValue = parseIfJson(envelope.resume ?? envelope.data);
  const nested = nestedValue && typeof nestedValue === 'object' && !Array.isArray(nestedValue) ? nestedValue : {};
  const res: Record<string, any> = { ...nested };
  for (const [key, value] of Object.entries(envelope)) {
    if (value !== null && value !== undefined && value !== '') res[key] = value;
    else if (!(key in res)) res[key] = value;
  }
  const hiddenValues = parseIfJson(res.hiddenSections);
  const hidden = new Set(Array.isArray(hiddenValues) ? hiddenValues.filter((value: unknown): value is string => typeof value === 'string') : []);
  const isHidden = (...names: string[]) => names.some(name => hidden.has(name));
  const withoutNulls = (value: unknown) => Array.isArray(value) ? value.filter(item => item !== null && item !== undefined) : [];
  const priorCover = res.coverDetails && typeof res.coverDetails === 'object' ? res.coverDetails : {};
  const coverText = (key: string): string => {
    const value = res[key] ?? priorCover[key];
    return typeof value === 'string' ? value : '';
  };

  // Heading extraction
  const firstName = isHidden('heading') ? '' : res.heading?.firstName || res.firstname || res.firstName || res.candidateFirstname || '';
  const lastName = isHidden('heading') ? '' : res.heading?.lastName || res.lastname || res.lastName || res.candidateLastname || '';
  const title = isHidden('heading') ? '' : res.heading?.title || res.occupation || res.jobTitle || res.title || '';
  const email = isHidden('heading') ? '' : res.heading?.email || res.email || res.candidateEmail || '';
  const phone = isHidden('heading') ? '' : res.heading?.phone || res.phone || res.candidatePhone || '';
  const location = isHidden('heading') ? '' : res.heading?.location || [res.city, res.country].filter(Boolean).join(', ') || res.address || [res.candidateCity, res.candidatePostalCode].filter(Boolean).join(' ') || res.candidateAddress || '';
  const address = isHidden('heading') ? '' : res.heading?.address || res.address || '';
  const postalCode = isHidden('heading') ? '' : res.heading?.postalcode || res.heading?.postalCode || res.postalcode || res.postalCode || res.zip || '';
  const website = isHidden('heading') ? '' : res.heading?.website || res.website || res.websiteUrl || '';
  const linkedin = isHidden('heading') ? '' : res.heading?.linkedin || res.linkedin || res.linkedinUrl || '';
  const github = isHidden('heading') ? '' : res.heading?.github || res.github || res.githubUrl || '';
  const photo = isHidden('heading') ? '' : res.heading?.photo || res.photo || res.avatar || res.picture || '';
  const showPhoto = !isHidden('heading') && res.heading?.showPhoto !== false && res.showPhoto !== false && res.hidePhoto !== true && res.includePhoto !== false && Boolean(photo);

  // Experience / Employments
  const rawExp = withoutNulls(parseIfJson(res.experience || res.employments || res.workExperiences || []));
  const experience = Array.isArray(rawExp) && rawExp.length > 0 ? rawExp.map((e: any, idx: number) => ({
    id: e.id || `exp-${idx}`,
    company: e.company || e.employer || e.organization || '',
    position: e.position || e.jobTitle || e.title || '',
    location: e.location || '',
    startDate: e.startDate || e.begin || e.started || '',
    endDate: e.endDate || e.end || e.finished || (e.current || e.currentWork ? 'Present' : ''),
    current: Boolean(e.current || e.currentWork || e.endDate === 'Present'),
    description: e.description || e.summary || '',
  })) : [];

  // Education
  const rawEdu = withoutNulls(parseIfJson(res.education || res.educations || []));
  const education = Array.isArray(rawEdu) && rawEdu.length > 0 ? rawEdu.map((ed: any, idx: number) => ({
    id: ed.id || `edu-${idx}`,
    institution: ed.institution || ed.school || ed.organization || '',
    location: ed.location || '',
    degree: ed.degree || ed.qualification || '',
    field: ed.field || ed.major || '',
    startDate: ed.startDate || ed.started || ed.begin || '',
    endDate: ed.endDate || ed.finished || ed.end || '',
    gpa: ed.gpa || '',
    description: ed.description || '',
  })) : [];

  // Skills
  const parsedCategories = withoutNulls(parseIfJson(res.skillCategories));
  let skillCategories = parsedCategories.filter((category: any) => category && typeof category === 'object' && Array.isArray(category.skills));
  const rawSkills = withoutNulls(parseIfJson(res.skills));
  if ((!skillCategories || skillCategories.length === 0) && Array.isArray(rawSkills) && rawSkills.length > 0) {
    if (typeof rawSkills[0] === 'string') {
      skillCategories = [{ id: 'skills-1', category: 'Core Competencies', skills: rawSkills }];
    } else if (typeof rawSkills[0] === 'object') {
      const grouped: Record<string, string[]> = {};
      for (const s of rawSkills) {
        const cat = s.category || 'Skills';
        // Rows saved by the builder before P002 C6 hold `{ category, skills: [...] }` groups.
        const names: string[] = Array.isArray(s.skills)
          ? s.skills.map((skill: any) => (typeof skill === 'string' ? skill : skill?.name || '')).filter(Boolean)
          : [s.name || s.skillName || s.skill || s.value || ''].filter(Boolean);
        if (names.length) {
          if (!grouped[cat]) grouped[cat] = [];
          grouped[cat].push(...names);
        }
      }
      skillCategories = Object.entries(grouped).map(([category, skills], i) => ({
        id: `cat-${i}`,
        category,
        skills,
      }));
    }
  }

  // Certifications
  const rawCerts = withoutNulls(parseIfJson(res.certifications));
  const certifications = Array.isArray(rawCerts) && rawCerts.length > 0 ? rawCerts.map((c: any, idx: number) => ({
    id: c.id || `cert-${idx}`,
    name: c.name || c.title || c.certificationName || '',
    issuer: c.issuer || c.institution || c.organization || '',
    date: c.date || c.issueDate || c.year || '',
    credentialId: c.credentialId || '',
    credentialUrl: c.credentialUrl || c.url || '',
    expiryDate: c.expiryDate || '',
  })) : [];

  // Projects
  const rawProjects = withoutNulls(parseIfJson(res.projects));
  const projects = Array.isArray(rawProjects) && rawProjects.length > 0 ? rawProjects.map((p: any, idx: number) => ({
    id: p.id || `proj-${idx}`,
    title: p.title || p.name || p.projectName || '',
    technologies: p.technologies || p.techStack || p.skills || '',
    liveUrl: p.liveUrl || p.link || p.url || '',
    githubUrl: p.githubUrl || '',
    startDate: p.startDate || '',
    endDate: p.endDate || '',
    description: p.description || p.summary || '',
  })) : [];

  // Languages
  const rawLanguages = withoutNulls(parseIfJson(res.languages));
  const languages = Array.isArray(rawLanguages) && rawLanguages.length > 0 ? rawLanguages.map((l: any, idx: number) => ({
    id: l.id || `lang-${idx}`,
    name: l.name || l.language || (typeof l === 'string' ? l : ''),
    language: l.language || l.name || (typeof l === 'string' ? l : ''),
    proficiency: l.proficiency || l.level || '',
  })) : [];

  // Achievements
  const rawAchievements = withoutNulls(parseIfJson(res.achievements));
  const achievements = Array.isArray(rawAchievements) && rawAchievements.length > 0 ? rawAchievements.map((a: any, idx: number) => ({
    id: a.id || `ach-${idx}`,
    title: a.title || a.name || '',
    date: a.date || '',
    description: a.description || a.summary || '',
  })) : [];

  // Hobbies
  const rawHobbies = withoutNulls(parseIfJson(res.hobbies));
  const hobbies = Array.isArray(rawHobbies) && rawHobbies.length > 0 ? rawHobbies.map((h: any) =>
    typeof h === 'string' ? h : (h.name || h.hobby || '')
  ).filter(Boolean) : [];

  // References
  const rawRefs = withoutNulls(parseIfJson(res.references));
  const references = Array.isArray(rawRefs) && rawRefs.length > 0 ? rawRefs.map((r: any, idx: number) => ({
    id: r.id || `ref-${idx}`,
    name: r.name || r.referenceName || '',
    position: r.position || r.title || r.jobTitle || '',
    company: r.company || r.organization || '',
    email: r.email || '',
    phone: r.phone || '',
    relationship: r.relationship || '',
    description: r.description || r.recommendation || '',
  })) : [];

  const customSections = withoutNulls(parseIfJson(res.customSections)).map((value: any, index: number) => {
    const section = value && typeof value === 'object' ? value : {};
    const sectionTitle = typeof (section.sectionTitle || section.title) === 'string' ? section.sectionTitle || section.title : '';
    const items = withoutNulls(parseIfJson(section.items)).map((item: any, itemIndex: number) => ({
      id: typeof item?.id === 'string' ? item.id : `item-${itemIndex}`,
      title: typeof item?.title === 'string' ? item.title : '',
      description: typeof item?.description === 'string' ? item.description : '',
    })).filter(item => item.title.trim() || item.description.trim());
    return { id: typeof section.id === 'string' ? section.id : `custom-${index}`, sectionTitle, items };
  }).filter(section => section.sectionTitle.trim() || section.items.length);

  return {
    id: res.id || 'resume-1',
    name: res.name || `${firstName} ${lastName}`.trim() || 'Untitled Resume',
    template: res.template || res.templateId || 'Cv1',
    heading: { firstName, lastName, title, email, phone, location, address, postalCode, website, linkedin, github, photo, showPhoto },
    summary: isHidden('summary') ? '' : res.summary || '',
    letterBody: typeof res.letterBody === 'string' ? res.letterBody : typeof res.body === 'string' ? res.body : '',
    coverDetails: {
      jobTitle: coverText('jobTitle'), companyName: coverText('companyName'), recipientName: coverText('recipientName'),
      companyAddress: coverText('companyAddress'), companyCity: coverText('companyCity'), companyPostalCode: coverText('companyPostalCode'),
      candidateAddress: coverText('candidateAddress'), candidateCity: coverText('candidateCity'), candidatePostalCode: coverText('candidatePostalCode'),
    },
    experience: isHidden('experience', 'employment', 'employments') ? [] : experience,
    education: isHidden('education', 'educations') ? [] : education,
    skillCategories: isHidden('skills', 'skillCategories') ? [] : skillCategories && skillCategories.length > 0 ? skillCategories : [],
    certifications: isHidden('certifications') ? [] : certifications,
    projects: isHidden('projects') ? [] : projects,
    languages: isHidden('languages') ? [] : languages,
    achievements: isHidden('achievements') ? [] : achievements,
    hobbies: isHidden('hobbies') ? [] : hobbies,
    references: isHidden('references') ? [] : references,
    customSections: isHidden('custom', 'customSections') ? [] : customSections,
  };
}

