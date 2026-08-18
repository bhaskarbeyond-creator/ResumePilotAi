import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateAtsScore } from '../src/utils/atsScore.js';

test('wizard-shaped resume updates the score after each real section', () => {
  let data = {
    firstname: '', lastname: '', email: '', phone: '', city: '',
    summary: '', employments: [], educations: [], skills: [],
    projects: [], certifications: [], achievements: [], references: [], languages: [],
  };
  const scores = [calculateAtsScore(data).totalScore];

  data = { ...data, firstname: 'Maya', lastname: 'Iyer', email: 'maya@example.com', phone: '4155550199', city: 'SF' };
  scores.push(calculateAtsScore(data).totalScore);

  data = { ...data, summary: 'Senior engineer who ships reliable product surfaces and coaches teammates on delivery.' };
  scores.push(calculateAtsScore(data).totalScore);

  data = {
    ...data,
    employments: [{
      jobTitle: 'Senior Software Engineer', employer: 'Northwind', begin: '2021',
      description: '<ul><li>Led a platform rewrite that reduced checkout latency 37%.</li><li>Shipped billing fixes that recovered $1.2M annual revenue.</li></ul>',
    }],
  };
  scores.push(calculateAtsScore(data).totalScore);

  data = { ...data, educations: [{ school: 'CMU', degree: 'B.S. Computer Science', started: '2014' }] };
  scores.push(calculateAtsScore(data).totalScore);

  data = { ...data, skills: [{ name: 'React Native' }, { name: 'Node.js' }, { name: 'TypeScript' }, { name: 'CI/CD' }] };
  scores.push(calculateAtsScore(data).totalScore);

  data = {
    ...data,
    projects: [{ title: 'Field Ops', url: 'https://example.com/ops', description: 'React Native app that routed 400 techs and cut idle travel 22%.' }],
  };
  scores.push(calculateAtsScore(data).totalScore);

  data = { ...data, certifications: [{ title: 'Professional Cloud Architect', issuer: 'Google Cloud', date: '2023' }] };
  scores.push(calculateAtsScore(data).totalScore);

  data = { ...data, achievements: [{ title: 'Delivery Award', description: 'Zero-downtime migration serving 3M users.' }] };
  scores.push(calculateAtsScore(data).totalScore);

  data = { ...data, references: [{ name: 'Priya Nair', reference: 'VP Engineering' }], languages: [{ name: 'English' }, { name: 'Hindi' }] };
  const afterRefs = calculateAtsScore(data);
  scores.push(afterRefs.totalScore);

  for (let index = 1; index < scores.length - 1; index += 1) {
    assert.ok(scores[index] >= scores[index - 1], `step ${index}: ${scores[index - 1]} -> ${scores[index]}`);
  }
  assert.equal(afterRefs.informational.references, 1);
  assert.equal(afterRefs.informational.languages, 2);

  const withJd = calculateAtsScore(data, {
    jobDescription: 'Senior Software Engineer, React Native, Node.js, CI/CD, Google Cloud, Product Management.',
  });
  assert.ok(withJd.hasJobDescription);
  assert.ok(withJd.jdMatch.matched.length >= 3);
  assert.notEqual(withJd.totalScore, afterRefs.totalScore);
});
