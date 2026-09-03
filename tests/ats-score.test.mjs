import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { ATS_QUALITY_MAX, ATS_WEIGHTS, calculateAtsScore, composeDisplayedScore, extractJdKeywords, matchJobDescription, expandKeywordVariants, detectNonEnglish, analyzeStuffing, extractBullets, extractMetrics, leadingActionVerb } from '../src/utils/atsScore.js';

const TARGET_JD = `
We are hiring a Senior Software Engineer to own product delivery.

Required experience:
- React Native and Node.js services
- Machine Learning features
- Spring Boot microservices
- Google Cloud and AWS Lambda
- CI/CD pipelines
- Product Management collaboration
`;

function emptyResume() {
  return {
    firstname: '', lastname: '', email: '', phone: '', city: '', country: '',
    summary: '', employments: [], educations: [], skills: [],
    projects: [], certifications: [], achievements: [], references: [],
    languages: [], hobbies: [], customSections: [],
  };
}

function basicResume() {
  return {
    firstname: 'Ada', lastname: 'Khan', email: 'ada@example.com', phone: '5551234567',
    city: 'Austin', country: 'US',
    summary: 'Software engineer looking for a new role.',
    employments: [{ jobTitle: 'Engineer', employer: 'Acme', begin: '2021', description: 'Worked on internal tools and helped the team ship features.' }],
    educations: [{ school: 'State University', degree: 'B.S. Computer Science', started: '2016' }],
    skills: [{ name: 'JavaScript' }, { name: 'SQL' }, { name: 'Git' }],
  };
}

function strongResume() {
  return {
    firstname: 'Maya', lastname: 'Iyer', email: 'maya.iyer@example.com', phone: '+1 415 555 0199',
    city: 'San Francisco', country: 'US', occupation: 'Senior Software Engineer',
    summary: 'Senior engineer who ships reliable product surfaces. I lead cross-functional delivery, coach teammates, and keep production incidents rare.',
    employments: [
      {
        jobTitle: 'Senior Software Engineer',
        employer: 'Northwind Labs',
        begin: '2021',
        end: 'Present',
        description: `<ul>
          <li>Led a 6-person platform team that reduced checkout latency 37% for 2.1 million monthly buyers.</li>
          <li>Shipped a billing rewrite that cut failed payments by 18% and recovered $1.4M annual revenue.</li>
          <li>Mentored four engineers through on-call ownership and design reviews.</li>
        </ul>`,
      },
      {
        jobTitle: 'Software Engineer',
        employer: 'Harbor Systems',
        begin: '2018',
        end: '2021',
        description: `<ul>
          <li>Built event-driven services that processed 12 million daily messages with 99.95% success.</li>
          <li>Automated release checks and reduced rollback time from 40 minutes to 8 minutes.</li>
        </ul>`,
      },
    ],
    educations: [{ school: 'Carnegie Mellon University', degree: 'B.S. Computer Science', started: '2014', finished: '2018' }],
    skills: [
      { name: 'React Native' }, { name: 'Node.js' }, { name: 'TypeScript' },
      { name: 'PostgreSQL' }, { name: 'Google Cloud' }, { name: 'CI/CD' },
      { name: 'System Design' }, { name: 'Product Discovery' },
    ],
    projects: [{
      title: 'Field Ops Companion',
      url: 'https://github.com/example/field-ops',
      description: 'Mobile React Native app that routed 400 field techs and cut idle travel time 22% using live telemetry.',
    }],
    certifications: [{ title: 'Professional Cloud Architect', issuer: 'Google Cloud', date: '2023' }],
    achievements: [{ title: 'Delivery Excellence Award', description: 'Recognized for a zero-downtime migration serving 3M users.' }],
  };
}

function stuffedResume() {
  return {
    firstname: 'Pat', lastname: 'Lee', email: 'pat@example.com', phone: '5550001111',
    city: 'Remote',
    summary: 'Python Python Python Python Python Python Python Python Python Python Python Python',
    employments: [{
      jobTitle: 'Engineer',
      employer: 'Stuff Co',
      description: 'Python Python Python Python Python. Increased 10% 10% 10% 10%. Led led led led led.',
    }],
    educations: [{ school: 'College', degree: 'B.S.' }],
    skills: Array.from({ length: 40 }, (_, index) => ({ name: index % 2 ? 'Python' : `Python ${index}` })),
  };
}

function metricsStuffedResume() {
  const resume = basicResume();
  resume.summary = 'Results results results results with 10% 10% 10% 10% 10% 10% 10% 10%.';
  resume.employments = [{
    jobTitle: 'Analyst',
    employer: 'Numbers Inc',
    begin: '2020',
    description: 'Increased 10% 10% 10% 10% 10%. Reduced 10% 10% 10% 10%. Delivered 10% 10%.',
  }];
  return resume;
}

function skillsOnlyResume() {
  return {
    firstname: 'Sam', lastname: 'Ortiz', email: 'sam@example.com',
    skills: [
      { name: 'Python' }, { name: 'Java' }, { name: 'C++' }, { name: 'Go' },
      { name: 'Rust' }, { name: 'SQL' }, { name: 'AWS' }, { name: 'Docker' },
    ],
  };
}

function experienceHeavyResume() {
  const resume = strongResume();
  resume.projects = [];
  resume.certifications = [];
  resume.achievements = [];
  return resume;
}

function projectHeavyResume() {
  return {
    ...basicResume(),
    employments: [],
    projects: [
      {
        title: 'Realtime Dispatch Board',
        url: 'https://example.com/dispatch',
        description: 'Designed a dispatch board used by 80 operators and reduced missed jobs 15% with live routing.',
      },
      {
        title: 'Inventory Twin',
        description: 'Built a warehouse twin that tracked 50k SKUs and cut stockouts 11%.',
      },
    ],
  };
}

function certificationHeavyResume() {
  return {
    ...basicResume(),
    certifications: [
      { title: 'AWS Solutions Architect', issuer: 'Amazon Web Services', date: '2022' },
      { title: 'Certified Kubernetes Administrator', issuer: 'CNCF', date: '2023' },
      { title: 'PMP', issuer: 'PMI', date: '2021' },
      { title: 'Scrum Master', issuer: 'Scrum Alliance', date: '2020' },
    ],
  };
}

function fillerExtrasResume() {
  const resume = basicResume();
  resume.projects = [{ title: 'Project', description: 'test' }];
  resume.certifications = [{ title: 'Certification' }];
  resume.achievements = [{ title: 'Achievement', description: 'n/a' }];
  return resume;
}

function frenchResume() {
  return {
    firstname: 'Camille', lastname: 'Dupont', email: 'camille@example.fr', phone: '0612345678',
    city: 'Lyon', country: 'France',
    summary: 'Ingénieure logicielle avec une solide expérience dans la conception de services fiables et la collaboration avec des équipes produit.',
    employments: [{
      jobTitle: 'Ingénieure logicielle',
      employer: 'Société Dupont',
      begin: '2019',
      description: '<ul><li>Conçu une plateforme utilisée par 120 magasins et réduit les incidents de 25%.</li><li>Mis en place des revues de code hebdomadaires pour six développeurs.</li></ul>',
    }],
    educations: [{ school: 'INSA Lyon', degree: 'Diplôme d\'ingénieur', started: '2014' }],
    skills: [{ name: 'Java' }, { name: 'Spring Boot' }, { name: 'PostgreSQL' }, { name: 'Kubernetes' }],
  };
}

test('weights sum to 100 and the public formula stays explicit', () => {
  assert.equal(ATS_QUALITY_MAX, 100);
  assert.deepEqual(ATS_WEIGHTS, {
    contact: 10,
    summary: 10,
    experience: 28,
    education: 8,
    skills: 14,
    evidence: 14,
    integrity: 16,
  });
  assert.equal(composeDisplayedScore(100), 100);
  assert.equal(composeDisplayedScore(41), 41);
  const strong = calculateAtsScore(strongResume());
  const withJd = calculateAtsScore(strongResume(), { jobDescription: TARGET_JD });
  assert.equal(strong.totalScore, strong.qualityScore);
  assert.equal(withJd.totalScore, withJd.qualityScore);
  assert.equal(strong.totalScore, withJd.totalScore);
  assert.equal(strong.jdMatch.score, null);
  assert.notEqual(withJd.jdMatch.score, null);
});

test('empty resume scores 0 and never exceeds bounds', () => {
  const result = calculateAtsScore(emptyResume());
  assert.equal(result.totalScore, 0);
  assert.equal(result.qualityScore, 0);
  assert.ok(result.totalScore >= 0 && result.totalScore <= 100);
  assert.equal(result.sections.reduce((sum, section) => sum + section.score, 0), 0);
});

test('score is always an integer in 0-100 inclusive', () => {
  for (const resume of [emptyResume(), basicResume(), strongResume(), stuffedResume(), skillsOnlyResume(), frenchResume()]) {
    const result = calculateAtsScore(resume, { jobDescription: TARGET_JD });
    assert.equal(Number.isInteger(result.totalScore), true);
    assert.ok(result.totalScore >= 0 && result.totalScore <= 100, String(result.totalScore));
  }
});

test('adversarial score order is logical', () => {
  const empty = calculateAtsScore(emptyResume()).totalScore;
  const basic = calculateAtsScore(basicResume()).totalScore;
  const strong = calculateAtsScore(strongResume()).totalScore;
  const targeted = calculateAtsScore(strongResume(), { jobDescription: TARGET_JD });
  const unrelated = calculateAtsScore(strongResume(), {
    jobDescription: 'Seeking a pediatric nurse with neonatal ICU experience, EHR charting, and BLS certification.',
  });
  const stuffed = calculateAtsScore(stuffedResume(), { jobDescription: TARGET_JD }).totalScore;
  const metrics = calculateAtsScore(metricsStuffedResume()).totalScore;
  const skillsOnly = calculateAtsScore(skillsOnlyResume()).totalScore;
  const experienceHeavy = calculateAtsScore(experienceHeavyResume()).totalScore;
  const projectHeavy = calculateAtsScore(projectHeavyResume()).totalScore;
  const certHeavy = calculateAtsScore(certificationHeavyResume()).totalScore;
  const french = calculateAtsScore(frenchResume()).totalScore;

  assert.ok(empty < basic, `empty ${empty} < basic ${basic}`);
  assert.ok(basic < strong, `basic ${basic} < strong ${strong}`);
  const aligned = calculateAtsScore({
    ...strongResume(),
    skills: [
      { name: 'React Native' }, { name: 'Node.js' }, { name: 'Machine Learning' },
      { name: 'Spring Boot' }, { name: 'Google Cloud' }, { name: 'AWS Lambda' },
      { name: 'CI/CD' }, { name: 'Product Management' },
    ],
    employments: strongResume().employments.map((item, index) => index === 0 ? {
      ...item,
      description: `${item.description}<p>Delivered React Native and Node.js features, Spring Boot services, AWS Lambda jobs, Machine Learning ranking on Google Cloud, and CI/CD with Product Management.</p>`,
    } : item),
  }, { jobDescription: TARGET_JD });
  assert.equal(targeted.totalScore, strong, 'JD must not change readiness');
  assert.equal(unrelated.totalScore, strong, 'an unrelated JD must not punish readiness');
  assert.ok((aligned.jdMatch.score || 0) > (targeted.jdMatch.score || 0), `aligned match ${aligned.jdMatch.score} > partial ${targeted.jdMatch.score}`);
  assert.ok((targeted.jdMatch.score || 0) > (unrelated.jdMatch.score || 0), `targeted match ${targeted.jdMatch.score} > unrelated ${unrelated.jdMatch.score}`);
  assert.ok(aligned.totalScore >= 80, `fully aligned strong resume should stay high: ${aligned.totalScore}`);
  assert.ok(stuffed < targeted.totalScore, `stuffed ${stuffed} < targeted ${targeted.totalScore}`);
  assert.ok(stuffed < strong, `stuffed ${stuffed} < strong ${strong}`);
  assert.ok(metrics < strong, `metrics-stuffed ${metrics} < strong ${strong}`);
  assert.ok(skillsOnly < experienceHeavy, `skills-only ${skillsOnly} < experience-heavy ${experienceHeavy}`);
  assert.ok(skillsOnly < 50, `skills-only should not look complete: ${skillsOnly}`);
  const projectEvidence = calculateAtsScore(projectHeavyResume()).sections.find((section) => section.id === 'evidence').score;
  const basicEvidence = calculateAtsScore(basicResume()).sections.find((section) => section.id === 'evidence').score;
  assert.ok(projectEvidence > basicEvidence, `project evidence ${projectEvidence} > basic evidence ${basicEvidence}`);
  assert.ok(projectHeavy < experienceHeavy, `project-heavy without jobs ${projectHeavy} < experience-heavy ${experienceHeavy}`);
  assert.ok(certHeavy >= basic, `cert-heavy ${certHeavy} >= basic ${basic}`);
  assert.ok(french >= 45, `non-English strong-ish resume should not collapse: ${french}`);
  assert.ok(strong >= 70, `strong resume should be Strong or better: ${strong}`);
});

test('keyword stuffing does not beat a genuine targeted resume', () => {
  const targeted = calculateAtsScore(strongResume(), { jobDescription: TARGET_JD });
  const stuffed = calculateAtsScore({
    ...stuffedResume(),
    summary: `${'Python '.repeat(30)} React Native Node.js Machine Learning Spring Boot Google Cloud CI/CD AWS Lambda Product Management`,
    skills: ['Python', 'React Native', 'Node.js', 'Machine Learning', 'Spring Boot', 'Google Cloud', 'CI/CD', 'AWS Lambda', 'Product Management']
      .flatMap((name) => [{ name }, { name: `${name} ` }, { name }]),
  }, { jobDescription: TARGET_JD });
  assert.ok(stuffed.stuffing.stuffed);
  assert.ok(stuffed.totalScore < targeted.totalScore, `${stuffed.totalScore} < ${targeted.totalScore}`);
  assert.ok(stuffed.sections.find((section) => section.id === 'integrity').score <= 6);
});

test('duplicate keywords and duplicate bullets do not stack points', () => {
  const once = calculateAtsScore({
    ...basicResume(),
    employments: [{
      jobTitle: 'Engineer', employer: 'Acme', begin: '2020',
      description: '<ul><li>Led a billing rewrite that reduced failed payments 18%.</li></ul>',
    }],
  });
  const twice = calculateAtsScore({
    ...basicResume(),
    employments: [{
      jobTitle: 'Engineer', employer: 'Acme', begin: '2020',
      description: '<ul><li>Led a billing rewrite that reduced failed payments 18%.</li><li>Led a billing rewrite that reduced failed payments 18%.</li></ul>',
    }],
  });
  assert.equal(once.sections.find((section) => section.id === 'experience').facts.bullets, 1);
  assert.equal(twice.sections.find((section) => section.id === 'experience').facts.bullets, 1);
  assert.equal(
    once.sections.find((section) => section.id === 'experience').score,
    twice.sections.find((section) => section.id === 'experience').score,
  );
});

test('JD matcher understands multi-word skills, acronyms and punctuation variants', () => {
  const keywords = extractJdKeywords(TARGET_JD).map((item) => item.term.toLowerCase());
  for (const expected of ['react native', 'machine learning', 'spring boot', 'google cloud', 'ci/cd', 'node.js', 'aws lambda', 'product management']) {
    assert.ok(
      keywords.some((item) => item.includes(expected) || expected.includes(item) || expandKeywordVariants(expected).some((variant) => item.replace(/[\s./_-]/g, '') === variant.replace(/[\s./_-]/g, ''))),
      `missing ${expected} in ${keywords.join(', ')}`,
    );
  }

  const haystack = 'Built React Native apps, Node.js APIs, CI/CD, AWS Lambda workers and Machine Learning ranking on Google Cloud. Partnered with Product Management. Spring Boot services.';
  const match = matchJobDescription(haystack, TARGET_JD);
  assert.ok(match.matched.length >= 6, `matched ${match.matched.join(', ')}`);
  assert.ok(match.score >= 50);
});

test('Node.js and CI/CD variants match without a hard-coded synonym dictionary', () => {
  const resume = 'Experience with nodejs services and ci-cd automation.';
  const match = matchJobDescription(resume, 'Required: Node.js, CI/CD');
  assert.ok(match.matched.some((item) => /node/i.test(item)));
  assert.ok(match.matched.some((item) => /ci/i.test(item)));
});

test('empty extras earn nothing and filler extras barely move the needle', () => {
  const basic = calculateAtsScore(basicResume());
  const emptyExtras = calculateAtsScore({
    ...basicResume(),
    projects: [{ title: '', description: '<p></p>' }],
    certifications: [{ title: '   ' }],
    achievements: [{ title: '', description: '&nbsp;' }],
  });
  const filler = calculateAtsScore(fillerExtrasResume());
  const meaningful = calculateAtsScore({
    ...basicResume(),
    projects: [{
      title: 'Route Planner',
      url: 'https://github.com/example/routes',
      description: 'Built a planner used by 90 drivers and reduced idle miles 17% with live traffic.',
    }],
  });
  assert.equal(
    emptyExtras.sections.find((section) => section.id === 'evidence').score,
    basic.sections.find((section) => section.id === 'evidence').score,
  );
  assert.ok(filler.totalScore <= basic.totalScore + 3, `filler ${filler.totalScore} vs basic ${basic.totalScore}`);
  assert.ok(meaningful.totalScore > basic.totalScore, `meaningful ${meaningful.totalScore} > basic ${basic.totalScore}`);
});

test('irrelevant extras do not inflate target-JD score', () => {
  const targeted = calculateAtsScore(strongResume(), { jobDescription: TARGET_JD });
  const withHobbies = calculateAtsScore({
    ...strongResume(),
    hobbies: ['Baking', 'Travel', 'Chess', 'Yoga'],
    references: [{ name: 'A Friend', reference: 'Nice person' }],
    customSections: [{ title: 'Fun', items: [{ title: 'Karaoke nights', description: 'Weekly karaoke.' }] }],
  }, { jobDescription: TARGET_JD });
  assert.ok(Math.abs(withHobbies.totalScore - targeted.totalScore) <= 2);
});

test('metrics and action verbs require contextual uniqueness', () => {
  assert.deepEqual(extractMetrics('Joined in 2020 and left in 2024'), []);
  assert.ok(extractMetrics('Reduced cost 18% and saved $1.4M').length >= 2);
  assert.equal(leadingActionVerb('Led a migration'), 'led');
  assert.equal(leadingActionVerb('The team settled the invoice'), null);
  assert.equal(extractBullets('<ul><li>Short</li><li>A substantial bullet describing shipped work.</li></ul>').length, 1);
});

test('non-English resumes are not scolded for missing English action verbs', () => {
  const french = calculateAtsScore(frenchResume());
  assert.equal(french.language.nonEnglish, true);
  const experience = french.sections.find((section) => section.id === 'experience');
  assert.equal(experience.findings.some((item) => /action-led|strong verb/i.test(item.text)), false);
  assert.ok(french.improvements.every((item) => !/action-led|strong verb/i.test(item.text)));
});

test('unicode job matching is safe', () => {
  const match = matchJobDescription('Expérience avec Kubernetes et PostgreSQL', 'Recherche un profil Kubernetes, PostgreSQL et maîtrise de l’agilité');
  assert.ok(match.total >= 1);
  assert.doesNotThrow(() => calculateAtsScore(frenchResume(), { jobDescription: 'Ingénieur Java, Spring Boot, Kubernetes' }));
});

test('explainability payload includes score, max, reason and action', () => {
  const result = calculateAtsScore(basicResume());
  assert.ok(result.improvements.length <= 3);
  for (const section of result.sections) {
    assert.equal(typeof section.score, 'number');
    assert.equal(typeof section.maxScore, 'number');
    assert.ok(section.reason);
    assert.ok(section.action);
    assert.ok(Array.isArray(section.findings));
  }
  assert.ok(['Excellent', 'Strong', 'Needs Improvement', 'Getting Started'].includes(result.status.label));
});

test('JD is optional and does not call any network surface', () => {
  const source = fs.readFileSync('src/utils/atsScore.js', 'utf8');
  assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|generateUserAiContent/);
  const widget = fs.readFileSync('src/components/BuildResume/AtsScoreMeter.jsx', 'utf8');
  assert.doesNotMatch(widget, /generateUserAiContent|axios\.|fetch\(/);
  const without = calculateAtsScore(strongResume());
  const withJd = calculateAtsScore(strongResume(), { jobDescription: TARGET_JD });
  assert.equal(without.hasJobDescription, false);
  assert.equal(withJd.hasJobDescription, true);
  assert.equal(without.jdMatch.score, null);
  assert.ok(withJd.jdMatch.score != null);
});

test('BuildResume still mounts the meter on desktop and mobile without touching the renderer', () => {
  const build = fs.readFileSync('src/components/BuildResume/BuildResume.jsx', 'utf8');
  // Meter is mounted at two call sites (desktop ATS drawer + mobile nav drawer).
  assert.match(build, /<AtsScoreMeter\s+resumeData=\{resumeData\}\s+onNavigate=\{handleStepClick\}/);
  assert.match(build, /<AtsScoreMeter\s+resumeData=\{resumeData\}\s+onNavigate=\{\(path\)/);
  // Both call sites feed the meter the resume document's JD (single source of truth).
  assert.equal((build.match(/jobDescription=\{resumeData\.targetJobDescription\}/g) || []).length, 2);
  assert.match(build, /setIsMobileMenuOpen\(false\)/);
  assert.match(build, /isAtsEnabled/);
  assert.match(build, /resolveAtsScoreVisibility/);
  const flags = fs.readFileSync('src/utils/moduleFlags.js', 'utf8');
  assert.match(flags, /enableAtsScoreModule/);
  assert.equal((build.match(/<AtsScoreMeter[\s\n]/g) || []).length, 2);
  assert.match(build, /import TemplateRenderer/);
  const meter = fs.readFileSync('src/components/BuildResume/AtsScoreMeter.jsx', 'utf8');
  assert.match(meter, /from '\.\.\/\.\.\/utils\/atsScore'/);
  assert.match(meter, /aria-expanded/);
  assert.match(meter, /ATS readiness \{\{score\}\} out of 100/);
  assert.match(meter, /data-testid="ats-readiness-score"/);
  assert.match(meter, /data-testid="ats-jd-match"/);

  const modules = fs.readFileSync('src/components/admin/settings/ModulesSettings.jsx', 'utf8');
  assert.match(modules, /enableAtsScoreModule/);
  assert.match(modules, /ATS Score Checker & Optimization Meter/);
});

test('stuffing detector flags consecutive repeats and low lexical diversity', () => {
  const stuffed = analyzeStuffing('python python python python python python python python java java');
  assert.equal(stuffed.stuffed, true);
  const natural = analyzeStuffing(strongResume().summary + ' ' + strongResume().employments.map((item) => item.description).join(' '));
  assert.equal(natural.stuffed, false);
});

test('detectNonEnglish recognizes CJK and French function-word poverty', () => {
  assert.equal(detectNonEnglish('ソフトウェアエンジニアとして信頼性の高いサービスを設計して運用しています。').nonEnglish, true);
  assert.equal(detectNonEnglish(frenchResume().summary).nonEnglish, true);
  assert.equal(detectNonEnglish(strongResume().summary).nonEnglish, false);
});

function compactish(value) {
  return String(value).toLowerCase().replace(/[\s./_+#-]+/g, '');
}

test('punctuation-heavy JD terms extract and match', () => {
  const jd = 'Need C#, C++, .NET, SQL, Power BI, React, React Native, Deep Learning and Google Cloud Platform.';
  const keywords = extractJdKeywords(jd).map((item) => item.term.toLowerCase());
  for (const expected of ['c#', 'c++', '.net', 'sql', 'power bi', 'react native', 'deep learning', 'google cloud platform']) {
    assert.ok(
      keywords.some((item) => item.replace(/\s+/g, ' ').includes(expected) || compactish(item) === compactish(expected)),
      `missing ${expected} in ${keywords.join(', ')}`,
    );
  }
  const match = matchJobDescription(
    'Shipped csharp APIs on dotnet, used cpp for the engine, Power BI dashboards, React Native, Deep Learning ranking on Google Cloud Platform. SQL and C# daily.',
    jd,
  );
  assert.ok(match.matched.some((item) => /c#/i.test(item)));
  assert.ok(match.matched.some((item) => /c\+\+/i.test(item) || /cpp/i.test(item)));
  assert.ok(match.matched.some((item) => /net/i.test(item)));
  assert.ok(match.score >= 50, `score ${match.score} matched ${match.matched.join(', ')}`);
});

test('the same keyword in skills, cert, and project does not triple-count', () => {
  const base = basicResume();
  const once = calculateAtsScore({
    ...base,
    skills: [...base.skills, { name: 'AWS' }],
  });
  const thrice = calculateAtsScore({
    ...base,
    skills: [...base.skills, { name: 'AWS' }, { name: 'AWS' }, { name: 'aws' }],
    certifications: [{ title: 'AWS', issuer: 'Amazon', date: '2023' }],
    projects: [{ title: 'AWS', description: 'AWS AWS AWS lab notes without an outcome.' }],
  });
  assert.equal(
    once.sections.find((section) => section.id === 'skills').score,
    thrice.sections.find((section) => section.id === 'skills').score,
  );
  assert.equal(thrice.sections.find((section) => section.id === 'evidence').facts.projects, 0);
  const genuine = calculateAtsScore({
    ...base,
    skills: [...base.skills, { name: 'AWS' }],
    certifications: [{ title: 'AWS Solutions Architect', issuer: 'Amazon Web Services', date: '2023' }],
    projects: [{
      title: 'Cost Explorer',
      url: 'https://example.com/cost',
      description: 'Built an AWS cost explorer that cut idle spend 19% for 40 accounts.',
    }],
  });
  assert.ok(genuine.totalScore > once.totalScore);
});

test('ten natural Python mentions do not lose to a thirty-repeat block', () => {
  const natural = calculateAtsScore({
    ...basicResume(),
    summary: 'Backend engineer focused on Python services, testing, and careful delivery.',
    skills: [{ name: 'Python' }, { name: 'Django' }, { name: 'PostgreSQL' }, { name: 'Linux' }],
    employments: [{
      jobTitle: 'Backend Engineer', employer: 'Helix', begin: '2020',
      description: '<ul><li>Developed Python APIs that served 80k daily sessions.</li><li>Reduced Python batch runtime 22% by rewriting the hottest query.</li></ul>',
    }],
    projects: [{
      title: 'Forecast CLI',
      url: 'https://example.com/forecast',
      description: 'Python CLI that forecasted inventory and cut stockouts 11%.',
    }],
  });
  const block = calculateAtsScore({
    ...basicResume(),
    summary: `${'Python '.repeat(30)} We are looking for responsibilities and requirements.`,
    skills: Array.from({ length: 12 }, () => ({ name: 'Python' })),
    employments: [{
      jobTitle: 'Engineer', employer: 'Block', begin: '2020',
      description: 'Python Python Python Python Python Python Python Python Python Python',
    }],
    customSections: [{ title: 'Keywords', items: [{ title: 'Stack', description: 'Python '.repeat(20) }] }],
  });
  assert.equal(natural.stuffing.stuffed, false);
  assert.equal(block.stuffing.stuffed, true);
  assert.ok(natural.totalScore > block.totalScore, `natural ${natural.totalScore} > block ${block.totalScore}`);
});

test('Hindi, German and Spanish resumes are not English-verb-scolded', () => {
  const hindi = calculateAtsScore({
    firstname: 'Anya', lastname: 'Sharma', email: 'anya@example.com', phone: '9876543210',
    city: 'Delhi',
    summary: 'सॉफ्टवेयर इंजीनियर के रूप में मैं विश्वसनीय सेवाओं का डिज़ाइन और संचालन करती हूँ और टीम के साथ काम करती हूँ।',
    employments: [{ jobTitle: 'इंजीनियर', employer: 'नवोदय', begin: '2020', description: 'मैंने एक ऐसा सिस्टम बनाया जिससे 40 दुकानों के ऑर्डर समय पर पूरे होते हैं।' }],
    skills: [{ name: 'Java' }, { name: 'SQL' }],
  });
  const german = calculateAtsScore({
    firstname: 'Jonas', lastname: 'Becker', email: 'jonas@example.de', phone: '01511234567',
    city: 'Berlin', country: 'DE',
    summary: 'Softwareentwickler mit Schwerpunkt auf zuverlässigen Diensten und enger Zusammenarbeit mit Fachbereichen.',
    employments: [{ jobTitle: 'Entwickler', employer: 'Nordwind', begin: '2019', description: 'Ein Abrechnungssystem gebaut, das die Fehlerquote um 18 Prozent senkte.' }],
    skills: [{ name: 'Java' }, { name: 'Spring Boot' }],
  });
  const spanish = calculateAtsScore({
    firstname: 'Lucia', lastname: 'Ramos', email: 'lucia@example.es', phone: '612345678',
    city: 'Madrid', country: 'ES',
    summary: 'Ingeniera de software con experiencia diseñando servicios fiables y colaborando con equipos de producto.',
    employments: [{ jobTitle: 'Ingeniera', employer: 'Iberia Tech', begin: '2018', description: 'Desarrollé una plataforma usada por 90 tiendas y reduje incidentes un 20%.' }],
    skills: [{ name: 'Python' }, { name: 'SQL' }],
  });
  assert.equal(hindi.language.nonEnglish, true);
  assert.equal(german.language.nonEnglish, true);
  assert.equal(spanish.language.nonEnglish, true);
  for (const result of [hindi, german, spanish]) {
    const experience = result.sections.find((section) => section.id === 'experience');
    assert.equal(experience.findings.some((item) => /action-led|strong verb/i.test(item.text)), false);
  }
  assert.doesNotThrow(() => matchJobDescription('अनुभव Kubernetes', 'Kubernetes और PostgreSQL'));
});

test('large resumes and long JDs stay synchronous and cheap', () => {
  const huge = {
    ...strongResume(),
    skills: Array.from({ length: 100 }, (_, index) => ({ name: `Skill ${index + 1}` })),
    employments: Array.from({ length: 20 }, (_, index) => ({
      jobTitle: `Engineer ${index + 1}`,
      employer: `Company ${index + 1}`,
      begin: '2010',
      description: `<ul><li>Led workstream ${index + 1} and reduced cycle time ${index + 3}%.</li><li>Shipped module ${index + 1} used by ${index + 8}000 customers.</li></ul>`,
    })),
    projects: Array.from({ length: 20 }, (_, index) => ({
      title: `Project ${index + 1}`,
      url: `https://example.com/p${index + 1}`,
      description: `Delivered project ${index + 1} and saved ${index + 5}% operational time.`,
    })),
    certifications: Array.from({ length: 20 }, (_, index) => ({ title: `Cert ${index + 1}`, issuer: 'Org', date: '2020' })),
    summary: `${strongResume().summary} ${'Additional context about delivery, mentoring, and reliability. '.repeat(40)}`,
  };
  const jd = `${TARGET_JD}\n${'Additional requirement about collaboration, ownership, and documentation. '.repeat(80)}`;
  const start = Date.now();
  const result = calculateAtsScore(huge, { jobDescription: jd });
  const elapsed = Date.now() - start;
  assert.ok(Number.isInteger(result.totalScore));
  assert.ok(elapsed < 80, `scoring took ${elapsed}ms`);
});

test('Java does not match JavaScript and C family terms stay distinct', () => {
  const javaOnly = matchJobDescription('Built JavaScript front ends and Node.js APIs.', 'Need Java, Kubernetes');
  assert.equal(javaOnly.matched.some((item) => /^java$/i.test(item)), false);
  const realJava = matchJobDescription('Shipped Java services on Kubernetes.', 'Need Java, Kubernetes');
  assert.ok(realJava.matched.some((item) => /^java$/i.test(item) || item.toLowerCase() === 'java'));
  const cppResume = matchJobDescription('Used C++ and C# daily. No plain C.', 'Required: C++, C#');
  assert.ok(cppResume.matched.some((item) => /c\+\+/i.test(item) || /cpp/i.test(item)));
  assert.ok(cppResume.matched.some((item) => /c#/i.test(item)));
  const cFromCpp = matchJobDescription('Used C++ and C# daily.', 'Need experience in C programming');
  assert.equal(cFromCpp.matched.some((item) => item.trim().toLowerCase() === 'c'), false);
});
