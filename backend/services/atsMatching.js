'use strict';

/**
 * Automated Candidate ATS Scoring & Ranking Service
 * Implements FP-F16 (Automated Candidate Ranking & ATS Scoring Engine)
 *
 * Provides deterministic, multi-factor ATS candidate scoring:
 * 1. Skills Matching (40% weight): Canonical taxonomy intersection (matched vs missing skills)
 * 2. Experience Alignment (30% weight): Years of relevant industry experience and role seniority match
 * 3. Education Qualification (15% weight): Degree level, STEM/relevant field alignment
 * 4. Keyword & Context Coverage (15% weight): High-signal domain terminology density across resume & cover letter
 *
 * Overall Composite Score: 0 to 100 integer.
 */

// Common high-frequency English stop words to filter out
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren\'t',
  'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but', 'by',
  'can', 'cannot', 'could', 'couldn\'t', 'did', 'didn\'t', 'do', 'does', 'doesn\'t', 'doing', 'don\'t',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn\'t', 'has', 'hasn\'t',
  'have', 'haven\'t', 'having', 'he', 'he\'d', 'he\'ll', 'he\'s', 'her', 'here', 'here\'s', 'hers',
  'herself', 'him', 'himself', 'his', 'how', 'how\'s', 'i', 'i\'d', 'i\'ll', 'i\'m', 'i\'ve', 'if',
  'in', 'into', 'is', 'isn\'t', 'it', 'it\'s', 'its', 'itself', 'let\'s', 'me', 'more', 'most',
  'mustn\'t', 'my', 'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other',
  'ought', 'our', 'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan\'t', 'she', 'she\'d',
  'she\'ll', 'she\'s', 'should', 'shouldn\'t', 'so', 'some', 'such', 'than', 'that', 'that\'s',
  'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'there\'s', 'these', 'they',
  'they\'d', 'they\'ll', 'they\'re', 'they\'ve', 'this', 'those', 'through', 'to', 'too', 'under',
  'until', 'up', 'very', 'was', 'wasn\'t', 'we', 'we\'d', 'we\'ll', 'we\'re', 'we\'ve', 'were',
  'weren\'t', 'what', 'what\'s', 'when', 'when\'s', 'where', 'where\'s', 'which', 'while', 'who',
  'who\'s', 'whom', 'why', 'why\'s', 'with', 'won\'t', 'would', 'wouldn\'t', 'you', 'you\'d',
  'you\'ll', 'you\'re', 'you\'ve', 'your', 'yours', 'yourself', 'yourselves', 'will', 'must', 'shall',
  'including', 'looking', 'work', 'working', 'ability', 'responsible', 'requirements', 'responsibilities'
]);

// Canonical technical & industry skill aliases for taxonomy normalization
const SKILL_ALIASES = {
  // Aliases -> Canonical
  'nodejs': 'node.js',
  'node': 'node.js',
  'reactjs': 'react',
  'react.js': 'react',
  'react native': 'react-native',
  'vuejs': 'vue',
  'vue.js': 'vue',
  'angularjs': 'angular',
  'nextjs': 'next.js',
  'next.js': 'next.js',
  'nestjs': 'nest.js',
  'ts': 'typescript',
  'js': 'javascript',
  'py': 'python',
  'golang': 'go',
  'k8s': 'kubernetes',
  'kube': 'kubernetes',
  'postgres': 'postgresql',
  'psql': 'postgresql',
  'ms sql': 'sql server',
  'mssql': 'sql server',
  'amazon web services': 'aws',
  'google cloud': 'gcp',
  'microsoft azure': 'azure',
  'ci/cd': 'ci/cd',
  'cicd': 'ci/cd',
  'graphql': 'graphql',
  'rest': 'rest api',
  'restful': 'rest api',
  'rest api': 'rest api',
  'microservices': 'microservices',
  'system design': 'system design',
  'tailwind': 'tailwind css',
  'tailwindcss': 'tailwind css',
  'css3': 'css',
  'html5': 'html',
  'github': 'git',
  'gitlab': 'git',
  'agile': 'agile',
  'scrum': 'scrum',
  'jira': 'jira',
  'rabbitmq': 'rabbitmq',
  'elasticsearch': 'elasticsearch',
  'ansible': 'ansible',
  'testing': 'automated testing',
  'jest': 'jest',
  'vitest': 'vitest',
  'playwright': 'playwright',
  'cypress': 'cypress',
  'selenium': 'selenium',
  'ml': 'machine learning',
  'genai': 'generative ai',
  // Canonical Self-Mappings
  'react': 'react',
  'node.js': 'node.js',
  'typescript': 'typescript',
  'javascript': 'javascript',
  'python': 'python',
  'java': 'java',
  'go': 'go',
  'rust': 'rust',
  'php': 'php',
  'ruby': 'ruby',
  'sql': 'sql',
  'postgresql': 'postgresql',
  'mysql': 'mysql',
  'mariadb': 'mariadb',
  'mongodb': 'mongodb',
  'docker': 'docker',
  'kubernetes': 'kubernetes',
  'aws': 'aws',
  'gcp': 'gcp',
  'azure': 'azure',
  'html': 'html',
  'css': 'css',
  'git': 'git',
  'redis': 'redis',
  'kafka': 'kafka',
  'linux': 'linux',
  'terraform': 'terraform',
  'machine learning': 'machine learning',
  'ai': 'ai',
  'deep learning': 'deep learning',
  'nlp': 'nlp',
  'llm': 'llm',
  'generative ai': 'generative ai'
};

/**
 * Normalizes a raw skill string to canonical form
 */
function normalizeSkill(skill) {
  if (!skill || typeof skill !== 'string') return '';
  const clean = skill.trim().toLowerCase().replace(/[^\w.+/# -]/g, '');
  return SKILL_ALIASES[clean] || clean;
}

/**
 * Extracts a set of skills from various data shapes (string, array of objects, array of strings)
 */
function extractSkillSet(source) {
  const result = new Set();
  if (!source) return result;

  if (Array.isArray(source)) {
    for (const item of source) {
      if (typeof item === 'string') {
        const norm = normalizeSkill(item);
        if (norm) result.add(norm);
      } else if (item && typeof item === 'object') {
        const name = item.name || item.skill || item.title || item.skillName;
        if (typeof name === 'string') {
          const norm = normalizeSkill(name);
          if (norm) result.add(norm);
        }
      }
    }
    return result;
  }

  if (typeof source === 'string') {
    // Check if it is JSON serialized
    try {
      const parsed = JSON.parse(source);
      if (Array.isArray(parsed) || typeof parsed === 'object') {
        return extractSkillSet(parsed);
      }
    } catch {
      // Plain text parsing
    }

    // Split on delimiters (commas, slashes, pipes, bullets, newlines)
    const tokens = source.split(/[,;\n\r|•·]+/);
    for (const raw of tokens) {
      const norm = normalizeSkill(raw);
      if (norm && norm.length >= 2 && !STOP_WORDS.has(norm)) {
        result.add(norm);
      }
    }

    // Also scan for known multi-word skill taxonomy
    const lower = source.toLowerCase();
    for (const [alias, canonical] of Object.entries(SKILL_ALIASES)) {
      if (lower.includes(alias)) {
        result.add(canonical);
      }
    }
  }

  return result;
}

/**
 * Extracts high-signal search tokens from text for keyword density
 */
function tokenizeText(text) {
  if (!text || typeof text !== 'string') return [];
  return text
    .toLowerCase()
    .replace(/[^\w\s+#.-]/g, ' ')
    .split(/\s+/)
    .map(t => t.trim())
    .filter(t => t.length >= 3 && !STOP_WORDS.has(t));
}

/**
 * 1. Skills Matching Dimension (40% Weight)
 */
function calculateSkillsScore(jobSkillsSet, candidateSkillsSet) {
  if (!jobSkillsSet || jobSkillsSet.size === 0) {
    // If no explicit skills listed in job, baseline default to 80
    return {
      score: 80,
      matchedSkills: Array.from(candidateSkillsSet).slice(0, 10),
      missingSkills: [],
      requiredCount: 0,
      matchedCount: 0,
    };
  }

  const matched = [];
  const missing = [];

  for (const skill of jobSkillsSet) {
    if (candidateSkillsSet.has(skill)) {
      matched.push(skill);
    } else {
      // Check partial token match (e.g. 'react' vs 'react-native')
      let partial = false;
      for (const candSkill of candidateSkillsSet) {
        if (candSkill.includes(skill) || skill.includes(candSkill)) {
          matched.push(skill);
          partial = true;
          break;
        }
      }
      if (!partial) {
        missing.push(skill);
      }
    }
  }

  const ratio = matched.length / jobSkillsSet.size;
  const score = Math.min(100, Math.max(0, Math.round(ratio * 100)));

  return {
    score,
    matchedSkills: matched,
    missingSkills: missing,
    requiredCount: jobSkillsSet.size,
    matchedCount: matched.length,
  };
}

/**
 * Parses total years of work experience from resume employments
 */
function calculateCandidateExperienceYears(employments) {
  if (!employments) return 0;
  let items = employments;
  if (typeof employments === 'string') {
    try {
      items = JSON.parse(employments);
    } catch {
      items = [];
    }
  }
  if (!Array.isArray(items)) return 0;

  let totalMonths = 0;
  for (const emp of items) {
    if (!emp || typeof emp !== 'object') continue;
    const startStr = emp.startDate || emp.start_date || emp.from;
    const endStr = emp.endDate || emp.end_date || emp.to;
    const isCurrent = emp.current === true || !endStr || /present|current|now/i.test(String(endStr));

    if (!startStr) {
      // If dates omitted, attribute a conservative 12 months per verified position
      totalMonths += 12;
      continue;
    }

    const start = new Date(startStr);
    const end = isCurrent ? new Date() : new Date(endStr);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end >= start) {
      const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
      totalMonths += Math.max(1, months);
    } else {
      totalMonths += 12;
    }
  }

  return Math.round((totalMonths / 12) * 10) / 10;
}

/**
 * Extracts minimum years of experience requirement from job
 */
function extractRequiredExperienceYears(job) {
  const text = `${job.title || ''} ${job.description || ''} ${job.requirements || ''}`.toLowerCase();
  
  // Explicit year regex: "5+ years", "3-5 years", "min 4 years"
  const match = text.match(/(\d+)\+?\s*(?:to|-)\s*(\d+)?\s*(?:years|yrs)/i) ||
                text.match(/(?:minimum|at least|min)\s*(\d+)\+?\s*(?:years|yrs)/i) ||
                text.match(/(\d+)\+?\s*(?:years|yrs)/i);

  if (match) {
    return parseInt(match[1], 10);
  }

  // Infer from seniority in job title
  const title = (job.title || '').toLowerCase();
  if (/intern|trainee|entry|fresher|graduate/i.test(title)) return 0;
  if (/junior|associate/i.test(title)) return 1;
  if (/senior|sr\.?|specialist/i.test(title)) return 5;
  if (/lead|staff|principal|manager|architect/i.test(title)) return 8;
  if (/director|vp|head|chief/i.test(title)) return 10;

  return 2; // Standard default requirement
}

/**
 * 2. Experience Alignment Dimension (30% Weight)
 */
function calculateExperienceScore(job, resume) {
  const requiredYears = extractRequiredExperienceYears(job);
  const candidateYears = calculateCandidateExperienceYears(resume.employments);

  let score = 50;
  if (requiredYears === 0) {
    score = 95;
  } else if (candidateYears >= requiredYears) {
    // Meets or exceeds required experience
    const surplus = candidateYears - requiredYears;
    score = Math.min(100, 85 + Math.round(surplus * 2.5));
  } else {
    // Below requirement, proportional degradation
    const ratio = candidateYears / requiredYears;
    score = Math.max(25, Math.round(ratio * 80));
  }

  // Role title alignment bonus
  const jobTitle = (job.title || '').toLowerCase();
  const candOccupation = (resume.occupation || resume.targetRole || '').toLowerCase();
  if (candOccupation && (jobTitle.includes(candOccupation) || candOccupation.includes(jobTitle))) {
    score = Math.min(100, score + 10);
  }

  return {
    score,
    requiredYears,
    candidateYears,
  };
}

/**
 * 3. Education Qualification Dimension (15% Weight)
 */
function calculateEducationScore(job, resume) {
  let educations = resume.educations;
  if (typeof educations === 'string') {
    try {
      educations = JSON.parse(educations);
    } catch {
      educations = [];
    }
  }

  if (!Array.isArray(educations) || educations.length === 0) {
    return { score: 65, highestDegree: 'Not specified' };
  }

  let highestScore = 65;
  let highestDegree = 'High School / Other';

  for (const edu of educations) {
    if (!edu) continue;
    const degreeStr = `${edu.degree || ''} ${edu.field || ''} ${edu.school || ''}`.toLowerCase();

    if (/ph\.?d|doctorate|doctoral/i.test(degreeStr)) {
      if (highestScore < 100) { highestScore = 100; highestDegree = 'Doctorate / PhD'; }
    } else if (/master|m\.?s\.?|m\.?tech|msc|mba/i.test(degreeStr)) {
      if (highestScore < 95) { highestScore = 95; highestDegree = 'Master\'s Degree'; }
    } else if (/bachelor|b\.?s\.?|b\.?tech|bsc|b\.?e\.?|undergraduate/i.test(degreeStr)) {
      if (highestScore < 85) { highestScore = 85; highestDegree = 'Bachelor\'s Degree'; }
    } else if (/associate|diploma/i.test(degreeStr)) {
      if (highestScore < 75) { highestScore = 75; highestDegree = 'Associate / Diploma'; }
    }
  }

  return {
    score: highestScore,
    highestDegree,
  };
}

/**
 * 4. Keyword & Context Coverage Dimension (15% Weight)
 */
function calculateKeywordScore(job, resume, coverLetter = '') {
  const jobText = `${job.title || ''} ${job.description || ''} ${job.requirements || ''}`;
  const jobTokens = new Set(tokenizeText(jobText));

  if (jobTokens.size === 0) {
    return { score: 75, matchCount: 0, totalJobKeywords: 0 };
  }

  // Aggregate candidate content
  const candText = [
    resume.summary || '',
    resume.occupation || '',
    resume.targetRole || '',
    resume.skills ? JSON.stringify(resume.skills) : '',
    resume.employments ? JSON.stringify(resume.employments) : '',
    resume.projects ? JSON.stringify(resume.projects) : '',
    coverLetter || '',
  ].join(' ');

  const candTokens = new Set(tokenizeText(candText));
  let matchCount = 0;

  for (const token of jobTokens) {
    if (candTokens.has(token)) {
      matchCount++;
    }
  }

  const ratio = matchCount / jobTokens.size;
  // Keyword curve: 40% keyword overlap on natural prose represents strong fit
  const scaledScore = Math.min(100, Math.max(30, Math.round((ratio / 0.40) * 100)));

  return {
    score: scaledScore,
    matchCount,
    totalJobKeywords: jobTokens.size,
  };
}

/**
 * Main ATS Scoring Function
 * Computes composite match percentage (0-100) and multidimensional breakdown
 */
function calculateAtsScore(job, resume = {}, coverLetter = '') {
  if (!job) {
    return {
      matchScore: 0,
      grade: 'LOW',
      breakdown: {
        skillsScore: 0,
        experienceScore: 0,
        educationScore: 0,
        keywordScore: 0,
        matchedSkills: [],
        missingSkills: [],
      },
    };
  }

  // Extract job skills
  const jobSkills = extractSkillSet(`${job.title || ''} ${job.requirements || ''} ${job.description || ''}`);
  
  // Extract candidate skills from resume
  const candSkills = extractSkillSet(resume.skills || '');
  // Also extract skills that may appear in summary or targetRole
  const extraSkills = extractSkillSet(`${resume.summary || ''} ${resume.occupation || ''} ${resume.targetRole || ''}`);
  for (const s of extraSkills) candSkills.add(s);

  // Compute 4 dimensions
  const skills = calculateSkillsScore(jobSkills, candSkills);
  const experience = calculateExperienceScore(job, resume);
  const education = calculateEducationScore(job, resume);
  const keywords = calculateKeywordScore(job, resume, coverLetter);

  // Weighted composite
  const composite = Math.round(
    skills.score * 0.40 +
    experience.score * 0.30 +
    education.score * 0.15 +
    keywords.score * 0.15
  );

  const matchScore = Math.min(100, Math.max(0, composite));

  let grade = 'LOW';
  if (matchScore >= 85) grade = 'EXCELLENT';
  else if (matchScore >= 70) grade = 'GOOD';
  else if (matchScore >= 50) grade = 'MODERATE';

  return {
    matchScore,
    grade,
    breakdown: {
      skillsScore: skills.score,
      experienceScore: experience.score,
      educationScore: education.score,
      keywordScore: keywords.score,
      matchedSkills: skills.matchedSkills,
      missingSkills: skills.missingSkills,
      requiredSkillsCount: skills.requiredCount,
      matchedSkillsCount: skills.matchedCount,
      candidateYearsExperience: experience.candidateYears,
      requiredYearsExperience: experience.requiredYears,
      highestDegree: education.highestDegree,
    },
  };
}

/**
 * Candidate Ranking Engine: Ranks an array of applications for a requisition
 */
function rankCandidatesForJob(job, applicationsWithResumes = []) {
  if (!Array.isArray(applicationsWithResumes) || applicationsWithResumes.length === 0) {
    return {
      totalApplicants: 0,
      averageMatchScore: 0,
      topMatchScore: 0,
      highFitCount: 0,
      moderateFitCount: 0,
      lowFitCount: 0,
      rankedCandidates: [],
    };
  }

  const scoredList = applicationsWithResumes.map((app) => {
    // If the application already has a cached ats_score and breakdown, reuse if valid
    let matchScore = typeof app.ats_score === 'number' ? app.ats_score : null;
    let breakdown = null;

    if (app.ats_breakdown) {
      try {
        breakdown = typeof app.ats_breakdown === 'string' ? JSON.parse(app.ats_breakdown) : app.ats_breakdown;
      } catch {
        breakdown = null;
      }
    }

    if (matchScore === null || !breakdown) {
      const evaluation = calculateAtsScore(job, app.resume || {}, app.cover_letter || app.coverLetter || '');
      matchScore = evaluation.matchScore;
      breakdown = evaluation.breakdown;
    }

    return {
      ...app,
      matchScore,
      matchBreakdown: breakdown,
    };
  });

  // Sort descending: matchScore first, then skillsScore, then appliedAt
  scoredList.sort((a, b) => {
    if (b.matchScore !== a.matchScore) {
      return b.matchScore - a.matchScore;
    }
    const aSkill = a.matchBreakdown?.skillsScore || 0;
    const bSkill = b.matchBreakdown?.skillsScore || 0;
    if (bSkill !== aSkill) {
      return bSkill - aSkill;
    }
    const aDate = new Date(a.created_at || a.appliedAt || 0).getTime();
    const bDate = new Date(b.created_at || b.appliedAt || 0).getTime();
    return aDate - bDate;
  });

  // Attach 1-based rank
  const rankedCandidates = scoredList.map((app, index) => ({
    ...app,
    rank: index + 1,
  }));

  // Platform telemetry statistics
  const total = rankedCandidates.length;
  const sum = rankedCandidates.reduce((acc, c) => acc + c.matchScore, 0);
  const avg = total > 0 ? Math.round(sum / total) : 0;
  const top = total > 0 ? rankedCandidates[0].matchScore : 0;
  const highFitCount = rankedCandidates.filter(c => c.matchScore >= 75).length;
  const moderateFitCount = rankedCandidates.filter(c => c.matchScore >= 50 && c.matchScore < 75).length;
  const lowFitCount = rankedCandidates.filter(c => c.matchScore < 50).length;

  return {
    totalApplicants: total,
    averageMatchScore: avg,
    topMatchScore: top,
    highFitCount,
    moderateFitCount,
    lowFitCount,
    rankedCandidates,
  };
}

module.exports = {
  calculateAtsScore,
  rankCandidatesForJob,
  extractSkillSet,
  normalizeSkill,
  calculateSkillsScore,
  calculateExperienceScore,
  calculateEducationScore,
  calculateKeywordScore,
  calculateCandidateExperienceYears,
  extractRequiredExperienceYears,
};
