import { createPool } from 'mysql2/promise';

const pool = createPool({
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: 'ai_resume_builder',
});

console.log('Updating res_1792228937289 and res_1792231546845 in MariaDB with cohesive professional data...');

// 1. Update res_1792228937289 (Cv34 Fintech Executive)
const cv34Summary = '<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">High-impact Fintech Executive and Principal Platform Architect with 10+ years of experience engineering mission-critical settlement engines, low-latency financial protocols, and distributed cloud topologies. Proven track record leading multi-disciplinary engineering divisions, maintaining 99.999% availability on $25M+ daily transaction volumes, and reducing cloud infrastructure costs by 38%.</span></p>';

const cv34Employments = JSON.stringify([
  {
    id: "exp-34-1",
    position: "Staff Platform Engineer & Fintech Architect",
    jobTitle: "Staff Platform Engineer & Fintech Architect",
    company: "Goldman Financial Systems",
    employer: "Goldman Financial Systems",
    location: "New York, NY",
    startDate: "Jun 2022",
    begin: "Jun 2022",
    endDate: "Present",
    end: "Present",
    current: true,
    description: "• Architected distributed clearing and real-time ledger settlement engine processing $25M+ daily volume with sub-50ms p99 latency.\n• Led cloud native migration of 45+ banking microservices to Kubernetes multi-region clusters, achieving SOC2 Type II compliance.\n• Engineered optimistic state consensus with Kafka and PostgreSQL, eliminating transactional ledger drift.",
    summary: "• Architected distributed clearing and real-time ledger settlement engine processing $25M+ daily volume with sub-50ms p99 latency.\n• Led cloud native migration of 45+ banking microservices to Kubernetes multi-region clusters, achieving SOC2 Type II compliance.\n• Engineered optimistic state consensus with Kafka and PostgreSQL, eliminating transactional ledger drift."
  },
  {
    id: "exp-34-2",
    position: "Senior Software Engineer — Payments Infrastructure",
    jobTitle: "Senior Software Engineer — Payments Infrastructure",
    company: "Stripe Technologies",
    employer: "Stripe Technologies",
    location: "San Francisco, CA",
    startDate: "Mar 2018",
    begin: "Mar 2018",
    endDate: "May 2022",
    end: "May 2022",
    current: false,
    description: "• Engineered high-concurrency payment gateway routing handling 40,000 req/sec with 99.99% service availability.\n• Implemented automated transaction reconciliation pipeline slashing settlement dispute resolution turnaround by 60%.\n• Mentored 12 senior engineers across distributed systems design, gRPC protocol buffers, and CI/CD canary deployments.",
    summary: "• Engineered high-concurrency payment gateway routing handling 40,000 req/sec with 99.99% service availability.\n• Implemented automated transaction reconciliation pipeline slashing settlement dispute resolution turnaround by 60%.\n• Mentored 12 senior engineers across distributed systems design, gRPC protocol buffers, and CI/CD canary deployments."
  },
  {
    id: "exp-34-3",
    position: "Software Engineer — Core Banking Platform",
    jobTitle: "Software Engineer — Core Banking Platform",
    company: "Nexus Global Banking",
    employer: "Nexus Global Banking",
    location: "Austin, TX",
    startDate: "Jul 2015",
    begin: "Jul 2015",
    endDate: "Feb 2018",
    end: "Feb 2018",
    current: false,
    description: "• Developed customer telemetry and fraud event streaming pipeline with Redis Cluster and Elasticsearch.\n• Optimized database query plans and indexing strategies, decreasing query latency by 55%.",
    summary: "• Developed customer telemetry and fraud event streaming pipeline with Redis Cluster and Elasticsearch.\n• Optimized database query plans and indexing strategies, decreasing query latency by 55%."
  }
]);

const cv34Educations = JSON.stringify([
  {
    id: "edu-34-1",
    degree: "B.Tech in Computer Science & Engineering",
    school: "Andhra University College of Engineering",
    institution: "Andhra University College of Engineering",
    field: "Computer Science",
    startDate: "2011",
    begin: "2011",
    endDate: "2015",
    end: "2015",
    gpa: "3.92 / 4.0",
    description: "First Class with Distinction. Specialization in Distributed Computing & Network Security."
  }
]);

const cv34Skills = JSON.stringify([
  { id: "sk-1", name: "FinTech Architecture", rating: 95, level: "Expert", date: 1 },
  { id: "sk-2", name: "Go & Microservices", rating: 90, level: "Expert", date: 2 },
  { id: "sk-3", name: "Kubernetes & AWS", rating: 88, level: "Advanced", date: 3 },
  { id: "sk-4", name: "PostgreSQL & Redis", rating: 92, level: "Expert", date: 4 },
  { id: "sk-5", name: "Distributed Ledger", rating: 85, level: "Advanced", date: 5 },
  { id: "sk-6", name: "Zero-Trust Security", rating: 90, level: "Expert", date: 6 },
  { id: "sk-7", name: "CI/CD & DevOps", rating: 88, level: "Advanced", date: 7 },
  { id: "sk-8", name: "Executive Leadership", rating: 95, level: "Expert", date: 8 }
]);

const cv34Certifications = JSON.stringify([
  { id: "cert-34-1", title: "AWS Certified Solutions Architect — Professional", name: "AWS Certified Solutions Architect — Professional", issuer: "Amazon Web Services", date: "2023" },
  { id: "cert-34-2", title: "Certified Information Systems Security Professional (CISSP)", name: "Certified Information Systems Security Professional (CISSP)", issuer: "ISC2", date: "2022" },
  { id: "cert-34-3", title: "Certified Kubernetes Administrator (CKA)", name: "Certified Kubernetes Administrator (CKA)", issuer: "Linux Foundation", date: "2021" }
]);

const cv34Projects = JSON.stringify([
  {
    id: "proj-34-1",
    title: "Global Multi-Region Consensus Engine",
    technologies: "Go, Raft, gRPC, PostgreSQL",
    liveUrl: "github.com/bhaskar-beyond/consensus-engine",
    description: "High-throughput asynchronous Raft-based state machine handling 50k consensus ops/sec with zero linearizability violations."
  }
]);

const cv34Achievements = JSON.stringify([
  {
    id: "ach-34-1",
    title: "Engineering Excellence Award",
    description: "Awarded top honor for orchestrating zero-downtime payments core migration across 14 jurisdictions.",
    date: "2023"
  }
]);

await pool.query(
  `UPDATE resumes SET
    title = 'Bhaskar Beyond — Fintech Executive',
    occupation = 'Fintech Executive & Platform Architect',
    summary = ?,
    employments = ?,
    educations = ?,
    skills = ?,
    certifications = ?,
    projects = ?,
    achievements = ?,
    template = 'Cv34',
    updated_at = NOW()
  WHERE id = 'res_1792228937289'`,
  [cv34Summary, cv34Employments, cv34Educations, cv34Skills, cv34Certifications, cv34Projects, cv34Achievements]
);

console.log('✓ Successfully updated res_1792228937289 with complete Fintech Executive data');

// 2. Also ensure res_1792231546845 has complete cohesive Recruiter data
const recruiterSummary = '<p class="editor-paragraph" dir="ltr"><span style="white-space: pre-wrap;">Strategic Senior Talent Acquisition Leader and Executive Recruiter with 8+ years of experience partnering with C-suite leadership and engineering directors to scale high-velocity technology enterprises. Proven track record closing 150+ senior, staff, and director-level engineering positions across Cloud, AI, and Fintech domains while reducing agency spend by 45% and maintaining a 94% candidate satisfaction NPS.</span></p>';

const recruiterEmployments = JSON.stringify([
  {
    id: "exp-rec-1",
    position: "Lead Executive & Technical Recruiter",
    jobTitle: "Lead Executive & Technical Recruiter",
    company: "TalentScale Global Solutions",
    employer: "TalentScale Global Solutions",
    location: "Visakhapatnam & Hyderabad, India",
    startDate: "Jan 2022",
    begin: "Jan 2022",
    endDate: "Present",
    end: "Present",
    current: true,
    description: "• Spearheaded executive search and high-volume tech recruitment across Cloud Architecture, AI Research, and Platform Engineering.\n• Partnered with C-suite executives to formulate competency-based interview rubrics, cutting time-to-hire from 54 to 26 days.\n• Closed 65+ senior hires with a 92% offer acceptance rate and zero 90-day attrition.",
    summary: "• Spearheaded executive search and high-volume tech recruitment across Cloud Architecture, AI Research, and Platform Engineering.\n• Partnered with C-suite executives to formulate competency-based interview rubrics, cutting time-to-hire from 54 to 26 days.\n• Closed 65+ senior hires with a 92% offer acceptance rate and zero 90-day attrition."
  },
  {
    id: "exp-rec-2",
    position: "Senior Talent Acquisition Specialist",
    jobTitle: "Senior Talent Acquisition Specialist",
    company: "Apex Tech Staffing",
    employer: "Apex Tech Staffing",
    location: "Bangalore, India",
    startDate: "Mar 2018",
    begin: "Mar 2018",
    endDate: "Dec 2021",
    end: "Dec 2021",
    current: false,
    description: "• Sourced and placed 85+ senior software engineers, DevOps leads, and Product Managers across high-scale product startups.\n• Engineered automated candidate outreach pipelines using modern ATS tools, boosting response rates by 35%.\n• Managed diversity and inclusion talent initiatives, increasing female engineering representation by 28%.",
    summary: "• Sourced and placed 85+ senior software engineers, DevOps leads, and Product Managers across high-scale product startups.\n• Engineered automated candidate outreach pipelines using modern ATS tools, boosting response rates by 35%.\n• Managed diversity and inclusion talent initiatives, increasing female engineering representation by 28%."
  }
]);

const recruiterEducations = JSON.stringify([
  {
    id: "edu-rec-1",
    degree: "Master of Business Administration (MBA) in Human Resources",
    school: "Andhra University School of International Business",
    institution: "Andhra University School of International Business",
    field: "Human Resources Management",
    startDate: "2016",
    begin: "2016",
    endDate: "2018",
    end: "2018",
    gpa: "3.85 / 4.0",
    description: "President of Human Resource Management Society. Distinction in Talent Strategy & Labor Relations."
  },
  {
    id: "edu-rec-2",
    degree: "Bachelor of Business Administration (BBA)",
    school: "Andhra University",
    institution: "Andhra University",
    field: "Business Administration",
    startDate: "2013",
    begin: "2013",
    endDate: "2016",
    end: "2016",
    gpa: "3.80 / 4.0",
    description: "First Class Honors."
  }
]);

const recruiterSkills = JSON.stringify([
  { id: "sk-r1", name: "Executive Search", rating: 95, level: "Expert", date: 1 },
  { id: "sk-r2", name: "Technical Recruiting", rating: 92, level: "Expert", date: 2 },
  { id: "sk-r3", name: "Talent Pipeline Sourcing", rating: 90, level: "Advanced", date: 3 },
  { id: "sk-r4", name: "Competency Rubrics", rating: 92, level: "Expert", date: 4 },
  { id: "sk-r5", name: "Compensation Negotiation", rating: 88, level: "Advanced", date: 5 },
  { id: "sk-r6", name: "Diversity & Inclusion Hiring", rating: 90, level: "Expert", date: 6 },
  { id: "sk-r7", name: "ATS & HRIS Systems", rating: 92, level: "Expert", date: 7 },
  { id: "sk-r8", name: "Employer Branding", rating: 88, level: "Advanced", date: 8 }
]);

const recruiterCertifications = JSON.stringify([
  { id: "cert-rec-1", title: "SHRM Senior Certified Professional (SHRM-SCP)", name: "SHRM Senior Certified Professional (SHRM-SCP)", issuer: "Society for Human Resource Management", date: "2023" },
  { id: "cert-rec-2", title: "AIRS Certified Diversity and Inclusion Recruiter (CDR)", name: "AIRS Certified Diversity and Inclusion Recruiter (CDR)", issuer: "AIRS by HireRight", date: "2022" },
  { id: "cert-rec-3", title: "Certified Physician Executive (CPE)", name: "Certified Physician Executive (CPE)", issuer: "American Association for Physician Leadership", date: "2021" }
]);

await pool.query(
  `UPDATE resumes SET
    title = 'Recruiter Resume',
    occupation = 'Senior Talent Acquisition Lead',
    summary = ?,
    employments = ?,
    educations = ?,
    skills = ?,
    certifications = ?,
    updated_at = NOW()
  WHERE id = 'res_1792231546845'`,
  [recruiterSummary, recruiterEmployments, recruiterEducations, recruiterSkills, recruiterCertifications]
);

console.log('✓ Successfully updated res_1792231546845 with complete Recruiter data');

await pool.end();
