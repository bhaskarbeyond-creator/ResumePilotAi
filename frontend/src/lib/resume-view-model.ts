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
    photo: string; showPhoto: boolean;
  };
  summary: string;
  experience: any[];
  education: any[];
  skillCategories: any[];
  certifications: any[];
  projects: any[];
  languages: any[];
  achievements: any[];
  hobbies: string[];
  references: any[];
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
  const res = raw.resume || raw.data || raw;

  // Heading extraction
  const firstName = res.heading?.firstName || res.firstname || res.firstName || '';
  const lastName = res.heading?.lastName || res.lastname || res.lastName || '';
  const title = res.heading?.title || res.occupation || res.jobTitle || res.title || '';
  const email = res.heading?.email || res.email || '';
  const phone = res.heading?.phone || res.phone || '';
  const location = res.heading?.location || [res.city, res.country].filter(Boolean).join(', ') || res.address || '';
  const website = res.heading?.website || res.website || res.websiteUrl || '';
  const linkedin = res.heading?.linkedin || res.linkedin || res.linkedinUrl || '';
  const github = res.heading?.github || res.github || res.githubUrl || '';
  const photo = res.heading?.photo || res.photo || res.avatar || res.picture || '';
  const showPhoto = res.heading?.showPhoto !== false && res.showPhoto !== false && Boolean(photo);

  // Experience / Employments
  const rawExp = parseIfJson(res.experience || res.employments || res.workExperiences || []);
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
  const rawEdu = parseIfJson(res.education || res.educations || []);
  const education = Array.isArray(rawEdu) && rawEdu.length > 0 ? rawEdu.map((ed: any, idx: number) => ({
    id: ed.id || `edu-${idx}`,
    institution: ed.institution || ed.school || ed.organization || '',
    degree: ed.degree || ed.qualification || '',
    field: ed.field || ed.major || '',
    startDate: ed.startDate || ed.started || ed.begin || '',
    endDate: ed.endDate || ed.finished || ed.end || '',
    gpa: ed.gpa || '',
    description: ed.description || '',
  })) : [];

  // Skills
  let skillCategories = parseIfJson(res.skillCategories);
  const rawSkills = parseIfJson(res.skills);
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
  const rawCerts = parseIfJson(res.certifications);
  const certifications = Array.isArray(rawCerts) && rawCerts.length > 0 ? rawCerts.map((c: any, idx: number) => ({
    id: c.id || `cert-${idx}`,
    name: c.name || c.title || c.certificationName || '',
    issuer: c.issuer || c.institution || c.organization || '',
    date: c.date || c.issueDate || c.year || '',
    credentialId: c.credentialId || c.url || '',
  })) : [];

  // Projects
  const rawProjects = parseIfJson(res.projects);
  const projects = Array.isArray(rawProjects) && rawProjects.length > 0 ? rawProjects.map((p: any, idx: number) => ({
    id: p.id || `proj-${idx}`,
    title: p.title || p.name || p.projectName || '',
    technologies: p.technologies || p.techStack || p.skills || '',
    liveUrl: p.liveUrl || p.link || p.url || '',
    description: p.description || p.summary || '',
  })) : [];

  // Languages
  const rawLanguages = parseIfJson(res.languages);
  const languages = Array.isArray(rawLanguages) && rawLanguages.length > 0 ? rawLanguages.map((l: any, idx: number) => ({
    id: l.id || `lang-${idx}`,
    name: l.name || l.language || (typeof l === 'string' ? l : ''),
    language: l.language || l.name || (typeof l === 'string' ? l : ''),
    proficiency: l.proficiency || l.level || '',
  })) : [];

  // Achievements
  const rawAchievements = parseIfJson(res.achievements);
  const achievements = Array.isArray(rawAchievements) && rawAchievements.length > 0 ? rawAchievements.map((a: any, idx: number) => ({
    id: a.id || `ach-${idx}`,
    title: a.title || a.name || '',
    description: a.description || a.summary || '',
  })) : [];

  // Hobbies
  const rawHobbies = parseIfJson(res.hobbies);
  const hobbies = Array.isArray(rawHobbies) && rawHobbies.length > 0 ? rawHobbies.map((h: any) =>
    typeof h === 'string' ? h : (h.name || h.hobby || '')
  ).filter(Boolean) : [];

  // References
  const rawRefs = parseIfJson(res.references);
  const references = Array.isArray(rawRefs) && rawRefs.length > 0 ? rawRefs.map((r: any, idx: number) => ({
    id: r.id || `ref-${idx}`,
    name: r.name || r.referenceName || '',
    position: r.position || r.title || r.jobTitle || '',
    company: r.company || r.organization || '',
    email: r.email || '',
    phone: r.phone || '',
    description: r.description || r.recommendation || '',
  })) : [];

  return {
    id: res.id || 'resume-1',
    name: res.name || `${firstName} ${lastName}`.trim() || 'Untitled Resume',
    template: res.template || 'Cv1',
    heading: { firstName, lastName, title, email, phone, location, website, linkedin, github, photo, showPhoto },
    summary: res.summary || '',
    experience,
    education,
    skillCategories: skillCategories && skillCategories.length > 0 ? skillCategories : [],
    certifications,
    projects,
    languages,
    achievements,
    hobbies,
    references,
  };
}

