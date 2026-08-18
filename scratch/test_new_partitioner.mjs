/**
 * TEST NEW UNIFIED PARTITIONER ON USER SCENARIO
 */

import { partitionResumeContent } from '../src/engine/hybrid/smartPartitioner.js';
import { THEME_PRESETS } from '../src/engine/hybrid/themePresets.js';

const userScenario = {
  firstname: 'Bhaskar Babu',
  lastname: 'Madala',
  occupation: 'Account Manager · Display',
  email: 'bhaskar.madala@example.com',
  phone: '+91 98765 43210',
  city: 'Hyderabad, India',
  summary: '',
  employments: [
    {
      jobTitle: 'Full Stack Developer',
      employer: 'Digital Solutions Group',
      startDate: '2018',
      endDate: '2021',
      description: 'Engineered RESTful backend services, resulting in a 30% surge in user engagement and consistently high client satisfaction through streamlined development and optimized performance.'
    },
    {
      jobTitle: 'Junior Interns',
      employer: 'Tata Consultancy Services',
      startDate: 'Jan 2026',
      endDate: 'Mar 2026',
      description: 'Designed and implemented a billing software project, achieving a 30% reduction in financial processing time and a 25% decrease in errors.'
    }
  ],
  educations: [
    {
      school: 'Chaitanya Engineering College',
      degree: 'B.Tech in Electronics and Communication Engineering',
      startDate: '',
      endDate: 'Jun 2013'
    },
    {
      school: 'Andhra University',
      degree: 'Master of Business Administration',
      startDate: '',
      endDate: 'Jun 2023'
    }
  ],
  skills: [
    { name: 'Display Advertising' },
    { name: 'Google Analytics' },
    { name: 'Ad Exchange' },
    { name: 'Data Analysis' },
    { name: 'SQL' }
  ],
  languages: [
    { name: 'Telugu', level: 'Native / Bilingual' },
    { name: 'English', level: 'Full Professional (Fluent)' },
    { name: 'Hindi', level: 'Professional Working (Advanced)' }
  ],
  certifications: [
    { name: 'Google Analytics 4 Certification', issuer: 'Google', date: '2026' },
    { name: 'Certified Digital Marketing Professional (CDMP)', issuer: 'American Marketing Association', date: '2026' },
    { name: 'HubSpot Inbound Sales and Marketing Certification', issuer: 'HubSpot', date: '2026' },
    { name: 'Google Ads Certification – Display', issuer: 'Google', date: '2026' },
    { name: 'Certified Data Scientist (CDS)', issuer: 'Data Science Council of America (DASCA)', date: '2026' },
    { name: 'Certified Cloud Security Professional (CCSP)', issuer: 'International Information Systems Security Certification', date: '2026' }
  ]
};

const theme = THEME_PRESETS['Cv51'];
const result = partitionResumeContent(userScenario, theme);
console.log('Result total pages:', result.totalPages);
console.log('Page 1 items count:', result.pages[0]?.flowItems?.length);
console.log('Page 1 item types:', result.pages[0]?.flowItems?.map(it => it.type));
if (result.pages[1]) {
  console.log('Page 2 items count:', result.pages[1]?.flowItems?.length);
  console.log('Page 2 item types:', result.pages[1]?.flowItems?.map(it => it.type));
}
