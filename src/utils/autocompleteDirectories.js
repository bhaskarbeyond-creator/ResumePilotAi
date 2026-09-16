/**
 * Autocomplete Universal Directories — ResumePilot AI
 *
 * Provides instant (0ms) keystroke filtering across all resume builder steps:
 * - Companies / Employers / Organizations
 * - Schools / Colleges / Universities / Institutions
 * - Degrees / Qualifications
 * - Job Titles / Occupations
 * - Technical & Domain Skills
 * - Certifications & Issuing Bodies
 * - World Languages
 */

export const UNIVERSAL_COMPANIES = Object.freeze([
    // Technology & Cloud
    'Google', 'Microsoft', 'Amazon', 'Apple', 'Meta', 'Netflix', 'Salesforce', 'Oracle', 'IBM', 'Adobe',
    'Cisco Systems', 'Intel', 'NVIDIA', 'Qualcomm', 'Broadcom', 'ServiceNow', 'Workday', 'Snowflake',
    'Databricks', 'Palantir Technologies', 'VMware', 'Dell Technologies', 'HP Inc.', 'Atlassian', 'Shopify',
    'Spotify', 'Stripe', 'Uber', 'Airbnb', 'DoorDash', 'Lyft', 'Pinterest', 'Snap Inc.', 'Twitter (X)',
    'Zoom Video Communications', 'Slack', 'Dropbox', 'Twilio', 'HubSpot', 'Intuit', 'Square (Block)',
    'PayPal', 'eBay', 'Coinbase', 'Robinhood', 'GitHub', 'GitLab', 'Cloudflare', 'CrowdStrike', 'Palo Alto Networks',
    // IT Services & Global Consulting
    'Accenture', 'Deloitte', 'McKinsey & Company', 'Boston Consulting Group (BCG)', 'Bain & Company',
    'PwC (PricewaterhouseCoopers)', 'EY (Ernst & Young)', 'KPMG', 'Tata Consultancy Services (TCS)',
    'Infosys', 'Wipro', 'HCL Technologies', 'Cognizant', 'Capgemini', 'DXC Technology', 'Booz Allen Hamilton',
    'Gartner', 'Oliver Wyman', 'LTI Mindtree', 'Tech Mahindra',
    // Financial Services, Banking & Fintech
    'JPMorgan Chase', 'Goldman Sachs', 'Morgan Stanley', 'Bank of America', 'Citigroup', 'Wells Fargo',
    'Barclays', 'HSBC', 'UBS', 'Credit Suisse', 'BlackRock', 'Vanguard', 'Fidelity Investments',
    'American Express', 'Visa', 'Mastercard', 'Capital One', 'Charles Schwab', 'BNP Paribas', 'Deutsche Bank',
    // Healthcare, Pharmaceuticals & Biotech
    'Johnson & Johnson', 'Pfizer', 'Roche', 'Novartis', 'Merck & Co.', 'AbbVie', 'AstraZeneca',
    'Bristol Myers Squibb', 'Eli Lilly', 'Amgen', 'Gilead Sciences', 'Moderna', 'Sanofi', 'GSK (GlaxoSmithKline)',
    'UnitedHealth Group', 'CVS Health', 'Elevance Health', 'Cigna', 'Humana', 'Medtronic', 'Thermo Fisher Scientific',
    'Abbott Laboratories', 'Danaher', 'Siemens Healthineers', 'GE HealthCare', 'Mayo Clinic', 'Cleveland Clinic',
    'Kaiser Permanente', 'Mount Sinai Health System',
    // Manufacturing, Automotive & Aerospace
    'Tesla', 'General Motors', 'Ford Motor Company', 'Toyota', 'Volkswagen Group', 'BMW Group',
    'Mercedes-Benz', 'Honda', 'Hyundai Motor', 'Boeing', 'Airbus', 'Lockheed Martin', 'Northrop Grumman',
    'General Dynamics', 'Raytheon Technologies (RTX)', 'SpaceX', 'General Electric (GE)', 'Honeywell',
    '3M', 'Caterpillar', 'Deere & Company', 'Siemens', 'Bosch',
    // Consumer Goods, Retail & E-Commerce
    'Walmart', 'Target', 'Costco Wholesale', 'The Home Depot', 'Nike', 'Adidas', 'Lululemon',
    'Procter & Gamble (P&G)', 'Unilever', 'Nestlé', 'Coca-Cola Company', 'PepsiCo', 'Mondelez International',
    'Starbucks', 'McDonald\'s', 'L\'Oréal', 'Estée Lauder', 'Sony', 'Samsung Electronics', 'LG Electronics',
    // Telecommunications & Media
    'Verizon Communications', 'AT&T', 'T-Mobile', 'Comcast', 'Walt Disney Company', 'Warner Bros. Discovery',
    'Paramount Global', 'NBCUniversal', 'Sony Pictures', 'Bloomberg LP', 'Thomson Reuters', 'New York Times'
]);

export const UNIVERSAL_SCHOOLS = Object.freeze([
    // United States — Ivy League & Top Tier
    'Harvard University', 'Stanford University', 'Massachusetts Institute of Technology (MIT)',
    'Princeton University', 'Yale University', 'Columbia University', 'University of Pennsylvania',
    'Cornell University', 'Dartmouth College', 'Brown University', 'University of Chicago',
    'California Institute of Technology (Caltech)', 'Duke University', 'Johns Hopkins University',
    'Northwestern University', 'Vanderbilt University', 'Rice University', 'Washington University in St. Louis',
    'University of Notre Dame', 'Georgetown University', 'Emory University', 'Carnegie Mellon University',
    // US Public Flagships
    'University of California, Berkeley (UC Berkeley)', 'University of California, Los Angeles (UCLA)',
    'University of Michigan, Ann Arbor', 'University of Virginia', 'University of North Carolina at Chapel Hill',
    'University of California, San Diego (UCSD)', 'University of California, Davis (UC Davis)',
    'University of California, Irvine (UCI)', 'University of California, Santa Barbara (UCSB)',
    'University of Texas at Austin', 'University of Washington', 'University of Wisconsin-Madison',
    'University of Illinois Urbana-Champaign', 'Georgia Institute of Technology (Georgia Tech)',
    'Purdue University', 'Ohio State University', 'Penn State University', 'University of Florida',
    'Texas A&M University', 'University of Maryland, College Park', 'Boston University', 'New York University (NYU)',
    'University of Southern California (USC)', 'Northeastern University',
    // United Kingdom & Europe
    'University of Oxford', 'University of Cambridge', 'Imperial College London',
    'London School of Economics and Political Science (LSE)', 'University College London (UCL)',
    'King\'s College London', 'University of Edinburgh', 'University of Manchester',
    'University of Warwick', 'University of Bristol', 'University of Glasgow',
    'ETH Zurich (Swiss Federal Institute of Technology)', 'EPFL (École Polytechnique Fédérale de Lausanne)',
    'Technical University of Munich (TUM)', 'LMU Munich', 'Heidelberg University',
    'Sorbonne University', 'École Polytechnique', 'INSEAD', 'London Business School (LBS)',
    'Delft University of Technology (TU Delft)', 'University of Amsterdam', 'Karolinska Institute',
    'KU Leuven', 'Trinity College Dublin',
    // Canada
    'University of Toronto', 'University of British Columbia (UBC)', 'McGill University',
    'McMaster University', 'University of Waterloo', 'University of Alberta', 'Western University',
    'Queen\'s University', 'University of Montreal', 'Simon Fraser University',
    // Asia-Pacific & India
    'National University of Singapore (NUS)', 'Nanyang Technological University (NTU)',
    'University of Tokyo', 'Kyoto University', 'Tsinghua University', 'Peking University',
    'University of Hong Kong (HKU)', 'Hong Kong University of Science and Technology (HKUST)',
    'Seoul National University', 'KAIST', 'University of Melbourne', 'University of Sydney',
    'Australian National University (ANU)', 'University of New South Wales (UNSW)',
    'Indian Institute of Technology Bombay (IIT Bombay)', 'Indian Institute of Technology Delhi (IIT Delhi)',
    'Indian Institute of Technology Madras (IIT Madras)', 'Indian Institute of Technology Kharagpur (IIT KGP)',
    'Indian Institute of Technology Kanpur (IIT Kanpur)', 'Indian Institute of Technology Roorkee (IIT Roorkee)',
    'Indian Institute of Technology Guwahati (IIT Guwahati)', 'Indian Institute of Science (IISc Bangalore)',
    'International Institute of Information Technology Hyderabad (IIIT Hyderabad)',
    'International Institute of Information Technology Bangalore (IIIT Bangalore)',
    'International Institute of Information Technology Delhi (IIIT Delhi)',
    'BITS Pilani', 'Birla Institute of Technology, Mesra (BIT Mesra)',
    'National Institute of Technology (NIT)', 'NIT Tiruchirappalli (NIT Trichy)', 'NIT Surathkal', 'NIT Warangal', 'NIT Rourkela', 'NIT Calicut',
    'Chaitanya Bharathi Institute of Technology (CBIT)',
    'Sri Chaitanya Educational Institutions',
    'Chaitanya (Deemed to be University)',
    'Andhra University',
    'Jawaharlal Nehru Technological University (JNTU Hyderabad)',
    'Jawaharlal Nehru Technological University (JNTU Kakinada)',
    'Jawaharlal Nehru Technological University (JNTU Anantapur)',
    'Osmania University',
    'Sri Venkateswara University',
    'Vellore Institute of Technology (VIT)',
    'SRM Institute of Science and Technology',
    'Manipal Academy of Higher Education (MAHE)',
    'Amity University',
    'Thapar Institute of Engineering and Technology',
    'PSG College of Technology',
    'College of Engineering, Guindy (CEG)',
    'University of Mumbai',
    'Savitribai Phule Pune University',
    'University of Delhi (Delhi University)',
    'University of Calcutta',
    'Jadavpur University',
    'Banaras Hindu University (BHU)',
    'Aligarh Muslim University (AMU)',
    'Jawaharlal Nehru University (JNU)',
    'Anna University',
    'University of Hyderabad (UoH)',
    'Symbiosis International University',
    'Ashoka University',
    'Shiv Nadar University',
    'Indian Institute of Management Ahmedabad (IIM Ahmedabad)', 'Indian Institute of Management Bangalore (IIM Bangalore)',
    'Indian Institute of Management Calcutta (IIM Calcutta)', 'Indian Institute of Management Lucknow (IIM Lucknow)',
    'XLRI Xavier School of Management', 'Faculty of Management Studies (FMS Delhi)'
]);

export const UNIVERSAL_DEGREES = Object.freeze([
    // Bachelor's Degrees
    'Bachelor of Science (B.S.)', 'Bachelor of Arts (B.A.)', 'Bachelor of Engineering (B.E.)',
    'Bachelor of Technology (B.Tech)', 'Bachelor of Business Administration (BBA)',
    'Bachelor of Commerce (B.Com)', 'Bachelor of Computer Applications (BCA)',
    'Bachelor of Science in Computer Science (B.S. CS)', 'Bachelor of Science in Information Technology (B.S. IT)',
    'Bachelor of Science in Electrical Engineering (B.S. EE)', 'Bachelor of Science in Mechanical Engineering',
    'Bachelor of Science in Data Science', 'Bachelor of Science in Nursing (BSN)',
    'Bachelor of Fine Arts (B.F.A.)', 'Bachelor of Architecture (B.Arch)', 'Bachelor of Laws (LL.B.)',
    // Master's Degrees
    'Master of Science (M.S.)', 'Master of Arts (M.A.)', 'Master of Business Administration (MBA)',
    'Master of Technology (M.Tech)', 'Master of Engineering (M.Eng)', 'Master of Computer Applications (MCA)',
    'Master of Science in Computer Science (M.S. CS)', 'Master of Science in Data Science / Analytics',
    'Master of Science in Artificial Intelligence', 'Master of Science in Finance (MSF)',
    'Master of Health Administration (MHA)', 'Master of Public Health (MPH)',
    'Master of Science in Nursing (MSN)', 'Master of Laws (LL.M.)', 'Master of Public Administration (MPA)',
    'Executive Master of Business Administration (EMBA)',
    // Doctoral & Professional Degrees
    'Doctor of Philosophy (Ph.D.)', 'Doctor of Medicine (M.D.)', 'Doctor of Pharmacy (Pharm.D.)',
    'Juris Doctor (J.D.)', 'Doctor of Dental Surgery (D.D.S.)', 'Doctor of Education (Ed.D.)',
    'Doctor of Business Administration (DBA)',
    // Associate Degrees & Diplomas
    'Associate of Science (A.S.)', 'Associate of Arts (A.A.)', 'Associate of Applied Science (A.A.S.)',
    'Postgraduate Diploma (PGD)', 'Diploma in Computer Science & Engineering', 'Higher National Diploma (HND)'
]);

export const UNIVERSAL_CERTIFICATIONS = Object.freeze([
    // Cloud & Infrastructure
    'AWS Certified Solutions Architect – Associate', 'AWS Certified Solutions Architect – Professional',
    'AWS Certified Developer – Associate', 'AWS Certified DevOps Engineer – Professional',
    'Microsoft Certified: Azure Fundamentals (AZ-900)', 'Microsoft Certified: Azure Administrator (AZ-104)',
    'Microsoft Certified: Azure Solutions Architect Expert (AZ-305)', 'Google Cloud Certified Professional Cloud Architect',
    'Google Cloud Certified Associate Cloud Engineer', 'Certified Kubernetes Administrator (CKA)',
    'Certified Kubernetes Application Developer (CKAD)', 'HashiCorp Certified: Terraform Associate',
    // Project Management & Agile
    'Project Management Professional (PMP)', 'Certified ScrumMaster (CSM)', 'Professional Scrum Master (PSM I)',
    'PMI Agile Certified Practitioner (PMI-ACP)', 'PRINCE2 Foundation / Practitioner',
    'Certified Information Systems Auditor (CISA)', 'Certified Information Security Manager (CISM)',
    'Certified Information Systems Security Professional (CISSP)', 'CompTIA Security+', 'CompTIA Network+',
    'CompTIA A+', 'Certified Ethical Hacker (CEH)',
    // Data & AI / Machine Learning
    'Databricks Certified Data Engineer Associate', 'Databricks Certified Data Engineer Professional',
    'Snowflake SnowPro Core Certified', 'TensorFlow Developer Certificate',
    'Google Data Analytics Professional Certificate', 'Microsoft Certified: Power BI Data Analyst (PL-300)',
    'Tableau Certified Desktop Specialist', 'AWS Certified Machine Learning – Specialty',
    // Business, Accounting & Finance
    'Certified Public Accountant (CPA)', 'Chartered Financial Analyst (CFA Level I/II/III)',
    'Financial Risk Manager (FRM)', 'Certified Management Accountant (CMA)',
    'Six Sigma Green Belt (CSSGB)', 'Six Sigma Black Belt (CSSBB)',
    'SHRM Certified Professional (SHRM-CP)', 'SHRM Senior Certified Professional (SHRM-SCP)',
    'Professional in Human Resources (PHR)', 'HubSpot Inbound Marketing Certified',
    'Salesforce Certified Administrator', 'Salesforce Certified Platform Developer I'
]);

export const UNIVERSAL_LANGUAGES = Object.freeze([
    'English', 'Spanish (Español)', 'French (Français)', 'German (Deutsch)', 'Mandarin Chinese (中文)',
    'Hindi (हिन्दी)', 'Arabic (العربية)', 'Portuguese (Português)', 'Russian (Русский)', 'Japanese (日本語)',
    'Italian (Italiano)', 'Korean (한국어)', 'Dutch (Nederlands)', 'Turkish (Türkçe)', 'Polish (Polski)',
    'Swedish (Svenska)', 'Danish (Dansk)', 'Norwegian (Norsk)', 'Finnish (Suomi)', 'Greek (Ελληνικά)',
    'Hebrew (עברית)', 'Vietnamese (Tiếng Việt)', 'Thai (ไทย)', 'Indonesian (Bahasa Indonesia)',
    'Malay (Bahasa Melayu)', 'Tagalog (Filipino)', 'Bengali (বাংলা)', 'Tamil (தமிழ்)', 'Telugu (తెలుగు)',
    'Urdu (اردو)', 'Persian / Farsi (فارسی)', 'Ukrainian (Українська)', 'Czech (Čeština)', 'Hungarian (Magyar)',
    'Romanian (Română)', 'Czech', 'Slovak', 'Bulgarian', 'Croatian', 'Serbian'
]);

export const UNIVERSAL_SKILLS = Object.freeze([
    // Core Programming Languages
    'JavaScript', 'TypeScript', 'Python', 'Java', 'C++', 'C#', 'Go (Golang)', 'Rust', 'Ruby', 'PHP', 'Swift', 'Kotlin',
    // Web Frontend & Mobile
    'React.js', 'Next.js', 'Vue.js', 'Angular', 'HTML5', 'CSS3 / SASS', 'Tailwind CSS', 'Redux / Zustand',
    'React Native', 'Flutter', 'GraphQL', 'RESTful API Design',
    // Backend & Distributed Systems
    'Node.js', 'Express.js', 'NestJS', 'Spring Boot', 'Django', 'FastAPI', 'ASP.NET Core',
    'Microservices Architecture', 'gRPC', 'Apache Kafka', 'RabbitMQ', 'Redis',
    // Databases & Data Warehousing
    'PostgreSQL', 'MySQL', 'MongoDB', 'SQLite', 'Microsoft SQL Server', 'Oracle Database',
    'Snowflake', 'Google BigQuery', 'Amazon Redshift', 'Databricks', 'Apache Spark', 'dbt (data build tool)',
    // Cloud & DevOps
    'Amazon Web Services (AWS)', 'Microsoft Azure', 'Google Cloud Platform (GCP)',
    'Docker', 'Kubernetes', 'Terraform', 'CI/CD Pipelines (GitHub Actions / GitLab CI)', 'Linux / Unix Administration',
    // Data Science, Analytics & AI
    'Data Analysis', 'Data Modeling', 'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow',
    'Pandas / NumPy', 'Power BI', 'Tableau', 'Looker', 'Statistical Modeling', 'A/B Testing',
    // Product, Agile & Management
    'Agile Methodologies', 'Scrum', 'Product Management', 'Jira', 'Confluence', 'Sprint Planning',
    'Stakeholder Management', 'Cross-Functional Leadership', 'User Journey Mapping',
    // Cybersecurity & Infrastructure
    'Information Security', 'Vulnerability Assessment', 'Penetration Testing', 'Identity & Access Management (IAM)',
    'OAuth 2.0 / JWT', 'Zero Trust Architecture', 'SOC 2 Compliance', 'HIPAA Compliance'
]);

export const UNIVERSAL_CITIES = Object.freeze([
    // North America
    'New York, NY', 'San Francisco, CA', 'San Jose, CA', 'Los Angeles, CA', 'Seattle, WA',
    'Austin, TX', 'Boston, MA', 'Chicago, IL', 'Atlanta, GA', 'Denver, CO', 'Dallas, TX',
    'Washington, DC', 'San Diego, CA', 'Philadelphia, PA', 'Miami, FL', 'Houston, TX',
    'Toronto, ON, Canada', 'Vancouver, BC, Canada', 'Montreal, QC, Canada', 'Ottawa, ON, Canada',
    // Europe & UK
    'London, United Kingdom', 'Berlin, Germany', 'Munich, Germany', 'Frankfurt, Germany',
    'Paris, France', 'Amsterdam, Netherlands', 'Dublin, Ireland', 'Zurich, Switzerland',
    'Geneva, Switzerland', 'Stockholm, Sweden', 'Copenhagen, Denmark', 'Oslo, Norway',
    'Madrid, Spain', 'Barcelona, Spain', 'Milan, Italy', 'Rome, Italy', 'Vienna, Austria',
    'Brussels, Belgium', 'Warsaw, Poland', 'Prague, Czech Republic',
    // Asia-Pacific & India
    'Singapore', 'Tokyo, Japan', 'Sydney, Australia', 'Melbourne, Australia',
    'Hong Kong', 'Seoul, South Korea', 'Bangalore, India', 'Mumbai, India',
    'Delhi, India', 'Hyderabad, India', 'Pune, India', 'Chennai, India',
    'Gurgaon (Gurugram), India', 'Noida, India', 'Kolkata, India', 'Ahmedabad, India',
    // Middle East & Latin America
    'Dubai, United Arab Emirates', 'Abu Dhabi, United Arab Emirates', 'Riyadh, Saudi Arabia',
    'Tel Aviv, Israel', 'São Paulo, Brazil', 'Mexico City, Mexico', 'Buenos Aires, Argentina'
]);

export const UNIVERSAL_JOB_TITLES = Object.freeze([
    // Tech & Engineering
    'Software Engineer', 'Senior Software Engineer', 'Lead Software Engineer', 'Full Stack Developer',
    'Frontend Developer', 'Backend Engineer', 'Mobile Application Developer', 'iOS Developer', 'Android Developer',
    'DevOps Engineer', 'Cloud Solutions Architect', 'Site Reliability Engineer (SRE)', 'Cybersecurity Analyst',
    'Systems Administrator', 'Network Engineer', 'QA Automation Engineer', 'Embedded Systems Engineer',
    // Data & AI
    'Data Analyst', 'Senior Data Analyst', 'Data Scientist', 'Senior Data Scientist', 'Data Engineer',
    'Machine Learning Engineer', 'AI Research Scientist', 'Business Intelligence Analyst', 'Analytics Engineer', 'Database Administrator',
    // Product & Management
    'Product Manager', 'Senior Product Manager', 'Technical Project Manager', 'Scrum Master', 'Agile Coach',
    'Program Manager', 'Director of Product', 'Operations Manager', 'General Manager', 'Chief Technology Officer (CTO)',
    // Design & Creative
    'UI/UX Designer', 'Senior Product Designer', 'Graphic Designer', 'Creative Director', 'Art Director',
    'Content Strategist', 'Technical Writer', 'Motion Designer',
    // Marketing & Growth
    'Digital Marketing Specialist', 'Growth Marketing Lead', 'SEO & Content Specialist', 'Performance Marketer',
    'Social Media Manager', 'Brand Marketing Manager', 'Product Marketing Manager (PMM)',
    // Finance, Accounting & Consulting
    'Senior Accountant', 'Staff Accountant', 'Financial Analyst', 'Senior Financial Analyst', 'Accounting Manager',
    'Finance Director', 'Controller', 'Auditor', 'Tax Consultant', 'Management Consultant', 'Strategy Consultant',
    // Healthcare & Clinical
    'Registered Nurse (RN)', 'Nurse Practitioner (NP)', 'Clinical Research Coordinator', 'Healthcare Administrator',
    'Physical Therapist', 'Medical Technologist', 'Pharmacist', 'Physician Assistant (PA)',
    // Education, Sales & Legal
    'High School Teacher', 'Elementary School Teacher', 'Instructional Designer', 'Corporate Trainer',
    'Account Executive', 'Sales Development Representative (SDR)', 'Business Development Manager', 'Customer Success Manager',
    'Corporate Counsel', 'Paralegal', 'Legal Assistant', 'Compliance Officer', 'Contract Specialist'
]);

/**
 * Dynamic Domain-Aware Autocomplete Synthesizer
 * Generates rich, grammatically and semantically valid completions matching ANY prefix
 * across all professional industries (Healthcare, Aviation, Trades, Law, Culinary, Tech, etc.)
 */
export function synthesizeDynamicSuggestions(directoryType, query = '', _context = null, maxResults = 8) {
    if (!query || typeof query !== 'string') return [];
    const cleanQ = query.trim();
    if (!cleanQ) return [];

    const normType = String(directoryType || '').toLowerCase();
    const cleanQLower = cleanQ.toLowerCase();
    const titleCaseQ = cleanQ.split(/\s+/).map(w => w ? w.charAt(0).toUpperCase() + w.slice(1).toLowerCase() : '').join(' ');
    const cleanQStripped = cleanQLower.replace(/[^a-z0-9]/g, '');

    const suggestions = [];

    if (normType === 'jobtitle' || normType === 'occupation' || normType === 'title' || normType === 'role') {
        // 1. Domain-specific dictionary expansions based on prefix detection
        if (/cardio/i.test(cleanQLower)) {
            suggestions.push(
                'Cardiologist', 'Cardiology Fellow', 'Cardiovascular Technologist',
                'Cardiothoracic Surgeon', 'Pediatric Cardiologist', 'Cardiac Nurse Practitioner',
                'Cardiovascular Perfusionist', 'Director of Cardiology'
            );
        } else if (/neuro/i.test(cleanQLower)) {
            suggestions.push(
                'Neurologist', 'Neurosurgeon', 'Neuroscience Researcher',
                'Neurointensive Care Nurse', 'Neurodiagnostic Technologist', 'Neurology Physician Assistant'
            );
        } else if (/pediat/i.test(cleanQLower)) {
            suggestions.push(
                'Pediatrician', 'Pediatric Nurse', 'Pediatric Surgeon',
                'Pediatric Intensive Care Specialist', 'Pediatric Nurse Practitioner', 'Pediatric Medical Assistant'
            );
        } else if (/dent/i.test(cleanQLower)) {
            suggestions.push(
                'General Dentist', 'Dental Hygienist', 'Dental Assistant',
                'Orthodontist', 'Periodontist', 'Dental Practice Manager'
            );
        } else if (/nurs/i.test(cleanQLower)) {
            suggestions.push(
                'Registered Nurse (RN)', 'Nurse Practitioner (NP)', 'Critical Care Registered Nurse (CCRN)',
                'Charge Nurse', 'Clinical Nurse Specialist (CNS)', 'Nurse Manager'
            );
        } else if (/surg/i.test(cleanQLower)) {
            suggestions.push(
                'General Surgeon', 'Surgical Technologist', 'Surgical Assistant',
                'Trauma Surgeon', 'Operating Room Nurse (OR RN)', 'Orthopedic Surgeon'
            );
        } else if (/pharm/i.test(cleanQLower)) {
            suggestions.push(
                'Clinical Pharmacist', 'Staff Pharmacist', 'Pharmacy Technician',
                'Director of Pharmacy', 'Pharmacologist', 'Inpatient Pharmacist'
            );
        } else if (/pilot/i.test(cleanQLower)) {
            suggestions.push(
                'Commercial Pilot', 'Airline Transport Pilot (ATP)', 'Chief Pilot',
                'First Officer (Pilot)', 'Flight Instructor (CFI)', 'Test Pilot',
                'Helicopter Pilot', 'Corporate Jet Pilot'
            );
        } else if (/flight/i.test(cleanQLower)) {
            suggestions.push(
                'Flight Attendant', 'Flight Instructor', 'Flight Operations Manager',
                'Flight Dispatcher', 'Flight Test Engineer', 'Flight Safety Officer'
            );
        } else if (/aero/i.test(cleanQLower)) {
            suggestions.push(
                'Aerospace Engineer', 'Aeronautical Systems Specialist', 'Aerodynamics Engineer',
                'Avionics Technician', 'Aerospace Project Manager', 'Aerospace Stress Analyst'
            );
        } else if (/plumb/i.test(cleanQLower)) {
            suggestions.push(
                'Licensed Master Plumber', 'Journeyman Plumber', 'Commercial Plumber',
                'Plumbing Contractor', 'Plumbing Inspector', 'Service Plumber'
            );
        } else if (/weld/i.test(cleanQLower)) {
            suggestions.push(
                'Certified Welder', 'Pipe Welder', 'Structural Welder',
                'MIG / TIG Welder', 'Welding Inspector (CWI)', 'Fabrication Welder'
            );
        } else if (/elec/i.test(cleanQLower)) {
            suggestions.push(
                'Master Electrician', 'Journeyman Electrician', 'Industrial Electrician',
                'Electrical Systems Technician', 'Electrical Project Manager', 'Electrical Engineer'
            );
        } else if (/carp/i.test(cleanQLower)) {
            suggestions.push(
                'Master Carpenter', 'Framing Carpenter', 'Finish Carpenter',
                'Cabinet Maker', 'Carpentry Foreman', 'Commercial Carpenter'
            );
        } else if (/hvac/i.test(cleanQLower)) {
            suggestions.push(
                'HVAC Service Technician', 'Commercial HVAC Specialist', 'HVAC Installation Lead',
                'HVAC Project Manager', 'Refrigeration & HVAC Mechanic'
            );
        } else if (/machin/i.test(cleanQLower)) {
            suggestions.push(
                'CNC Machinist', 'Precision Machinist', 'Tool & Die Maker',
                'Manual Machinist', 'Machining Supervisor', 'CNC Programmer'
            );
        } else if (/paral/i.test(cleanQLower)) {
            suggestions.push(
                'Senior Paralegal', 'Litigation Paralegal', 'Corporate Paralegal',
                'Certified Paralegal (CP)', 'Intellectual Property Paralegal', 'Real Estate Paralegal'
            );
        } else if (/attorn|law/i.test(cleanQLower)) {
            suggestions.push(
                'Corporate Attorney', 'Associate Attorney', 'Trial Attorney',
                'Senior Legal Counsel', 'Litigation Lawyer', 'General Counsel', 'Staff Attorney'
            );
        } else if (/compli/i.test(cleanQLower)) {
            suggestions.push(
                'Compliance Officer', 'Chief Compliance Officer (CCO)', 'Regulatory Compliance Specialist',
                'AML / KYC Compliance Analyst', 'Corporate Governance Specialist'
            );
        } else if (/chef/i.test(cleanQLower)) {
            suggestions.push(
                'Executive Chef', 'Sous Chef', 'Pastry Chef',
                'Head Chef', 'Private Chef', 'Chef de Cuisine', 'Chef de Partie'
            );
        } else if (/cook/i.test(cleanQLower)) {
            suggestions.push(
                'Lead Line Cook', 'Prep Cook', 'Short Order Cook',
                'Institutional Cook', 'Catering Cook'
            );
        } else if (/baris/i.test(cleanQLower)) {
            suggestions.push(
                'Lead Barista', 'Head Barista', 'Coffee Roaster & Barista',
                'Barista Trainer', 'Cafe Supervisor'
            );
        } else if (/hotel/i.test(cleanQLower)) {
            suggestions.push(
                'Hotel General Manager', 'Hotel Front Desk Supervisor', 'Hotel Operations Manager',
                'Guest Relations Lead', 'Hotel Revenue Manager'
            );
        } else if (/accoun/i.test(cleanQLower)) {
            suggestions.push(
                'Senior Accountant', 'Staff Accountant', 'Accounting Manager',
                'Cost Accountant', 'Certified Public Accountant (CPA)', 'Forensic Accountant'
            );
        } else if (/audit/i.test(cleanQLower)) {
            suggestions.push(
                'Internal Auditor', 'Senior Auditor', 'Lead Quality Auditor',
                'IT Audit Specialist', 'Financial Auditor', 'Compliance Auditor'
            );
        } else if (/tax/i.test(cleanQLower)) {
            suggestions.push(
                'Tax Accountant', 'Senior Tax Manager', 'Tax Consultant',
                'International Tax Specialist', 'Tax Analyst', 'Corporate Tax Director'
            );
        } else if (/actua/i.test(cleanQLower)) {
            suggestions.push(
                'Actuarial Analyst', 'Associate Actuary', 'Senior Consulting Actuary',
                'Life & Health Actuary', 'Pricing Actuary'
            );
        } else if (/bank/i.test(cleanQLower)) {
            suggestions.push(
                'Investment Banking Analyst', 'Commercial Banking Officer', 'Branch Banking Manager',
                'Credit Analyst', 'Private Banker'
            );
        } else if (/civil/i.test(cleanQLower)) {
            suggestions.push(
                'Civil Engineer', 'Senior Civil Engineer', 'Civil Project Manager',
                'Civil Design Engineer', 'Structural / Civil Engineer', 'Transportation Civil Engineer'
            );
        } else if (/struct/i.test(cleanQLower)) {
            suggestions.push(
                'Structural Engineer', 'Senior Structural Designer', 'Structural Project Engineer',
                'Bridge Structural Engineer', 'Structural Forensic Engineer'
            );
        } else if (/mech/i.test(cleanQLower)) {
            suggestions.push(
                'Mechanical Engineer', 'Senior Mechanical Engineer', 'HVAC / Mechanical Designer',
                'Mechanical Systems Specialist', 'Electromechanical Engineer'
            );
        } else if (/archit/i.test(cleanQLower)) {
            suggestions.push(
                'Architectural Designer', 'Licensed Architect', 'Project Architect',
                'Landscape Architect', 'Naval Architect', 'Enterprise Architect'
            );
        } else if (/teach/i.test(cleanQLower)) {
            suggestions.push(
                'High School Teacher', 'Elementary School Teacher', 'Special Education Teacher',
                'STEM Teacher', 'Lead Science Teacher', 'Instructional Coach'
            );
        } else if (/prof/i.test(cleanQLower)) {
            suggestions.push(
                'Assistant Professor', 'Associate Professor', 'Adjunct Professor',
                'Distinguished Professor', 'Research Professor', 'Professor of Practice'
            );
        } else if (/art/i.test(cleanQLower)) {
            suggestions.push(
                'Art Director', 'Concept Artist', 'Storyboard Artist',
                'Technical Artist', 'Digital Artist', 'Visual Development Artist'
            );
        } else if (/anim/i.test(cleanQLower)) {
            suggestions.push(
                '3D Animator', 'Character Animator', 'Motion Graphics Animator',
                '2D Animator', 'Lead Technical Animator'
            );
        } else if (/video/i.test(cleanQLower)) {
            suggestions.push(
                'Video Editor', 'Video Producer', 'Videographer',
                'Post-Production Specialist', 'Senior Motion Video Lead'
            );
        } else if (/kube/i.test(cleanQLower)) {
            suggestions.push(
                'Kubernetes Administrator', 'Kubernetes Platform Engineer', 'DevOps Engineer (Kubernetes)',
                'Cloud Infrastructure Engineer (K8s)', 'Site Reliability Engineer (Kubernetes)'
            );
        } else if (/pyth/i.test(cleanQLower)) {
            suggestions.push(
                'Python Developer', 'Senior Python Engineer', 'Python Data Engineer',
                'Python Backend Developer', 'Machine Learning Engineer (Python)'
            );
        } else if (/react/i.test(cleanQLower)) {
            suggestions.push(
                'React Developer', 'Senior React.js Engineer', 'React Native Developer',
                'Frontend Engineer (React)', 'Full Stack React / Node Engineer'
            );
        } else if (/cyber/i.test(cleanQLower)) {
            suggestions.push(
                'Cybersecurity Analyst', 'Information Security Officer', 'SOC Analyst',
                'Penetration Tester', 'Cybersecurity Engineer', 'Cloud Security Architect'
            );
        }

        // 2. Open-ended hierarchical role synthesis for ANY query string
        suggestions.push(
            `Senior ${titleCaseQ}`,
            `Lead ${titleCaseQ}`,
            `${titleCaseQ} Specialist`,
            `${titleCaseQ} Manager`,
            `Principal ${titleCaseQ}`,
            `${titleCaseQ} Consultant`,
            `${titleCaseQ} Coordinator`,
            `Director of ${titleCaseQ}`,
            `Associate ${titleCaseQ}`,
            `${titleCaseQ} Analyst`,
            `${titleCaseQ} Engineer`,
            `${titleCaseQ} Supervisor`,
            `Chief ${titleCaseQ} Officer`
        );
    } else if (normType === 'company' || normType === 'employer' || normType === 'organization') {
        suggestions.push(
            `${titleCaseQ} Technologies`,
            `${titleCaseQ} Global`,
            `${titleCaseQ} Solutions`,
            `${titleCaseQ} Health System`,
            `${titleCaseQ} Group`,
            `${titleCaseQ} Industries`,
            `${titleCaseQ} Systems`,
            `${titleCaseQ} Labs`,
            `${titleCaseQ} Partners`,
            `${titleCaseQ} Services`,
            `${titleCaseQ} Corporation`,
            `${titleCaseQ} International`
        );
    } else if (normType === 'school' || normType === 'university' || normType === 'institution' || normType === 'college') {
        suggestions.push(
            `${titleCaseQ} University`,
            `${titleCaseQ} State University`,
            `University of ${titleCaseQ}`,
            `${titleCaseQ} Institute of Technology`,
            `${titleCaseQ} College`,
            `${titleCaseQ} Medical School`,
            `${titleCaseQ} Graduate School of Business`,
            `${titleCaseQ} Academy of Science`,
            `${titleCaseQ} Polytechnic Institute`
        );
    } else if (normType === 'degree' || normType === 'qualification') {
        suggestions.push(
            `Bachelor of Science in ${titleCaseQ} (B.S.)`,
            `Master of Science in ${titleCaseQ} (M.S.)`,
            `Bachelor of Arts in ${titleCaseQ} (B.A.)`,
            `Master of Arts in ${titleCaseQ} (M.A.)`,
            `Doctor of Philosophy in ${titleCaseQ} (Ph.D.)`,
            `Associate of Science in ${titleCaseQ} (A.S.)`,
            `Bachelor of Engineering in ${titleCaseQ} (B.E.)`,
            `Master of Engineering in ${titleCaseQ} (M.Eng)`,
            `Postgraduate Diploma in ${titleCaseQ}`,
            `Executive Certificate in ${titleCaseQ}`
        );
    } else if (normType === 'certification' || normType === 'credential') {
        if (/aws/i.test(cleanQLower)) {
            suggestions.push(
                'AWS Certified Solutions Architect – Associate',
                'AWS Certified Solutions Architect – Professional',
                'AWS Certified Developer – Associate',
                'AWS Certified DevOps Engineer – Professional',
                'AWS Certified Security – Specialty'
            );
        } else if (/azure/i.test(cleanQLower)) {
            suggestions.push(
                'Microsoft Certified: Azure Fundamentals (AZ-900)',
                'Microsoft Certified: Azure Administrator (AZ-104)',
                'Microsoft Certified: Azure Solutions Architect Expert (AZ-305)',
                'Microsoft Certified: Azure DevOps Engineer Expert (AZ-400)'
            );
        } else if (/gcp|google cloud/i.test(cleanQLower)) {
            suggestions.push(
                'Google Cloud Certified Professional Cloud Architect',
                'Google Cloud Certified Associate Cloud Engineer',
                'Google Cloud Certified Professional Data Engineer'
            );
        } else if (/cpa/i.test(cleanQLower)) {
            suggestions.push(
                'Certified Public Accountant (CPA)',
                'CPA Licensed Practice Credential',
                'AICPA Certificate of Educational Achievement'
            );
        } else if (/pmp/i.test(cleanQLower)) {
            suggestions.push(
                'Project Management Professional (PMP)',
                'PMI Agile Certified Practitioner (PMI-ACP)',
                'PMI Risk Management Professional (PMI-RMP)'
            );
        } else if (/faa/i.test(cleanQLower)) {
            suggestions.push(
                'FAA Commercial Pilot Certificate',
                'FAA Airline Transport Pilot (ATP)',
                'FAA Certified Flight Instructor (CFI)',
                'FAA Remote Pilot Certificate (Part 107)'
            );
        }

        suggestions.push(
            `Certified ${titleCaseQ} Professional (CPP)`,
            `${titleCaseQ} Specialist Certification`,
            `Licensed ${titleCaseQ} Practitioner`,
            `Advanced ${titleCaseQ} Credential`,
            `Certified ${titleCaseQ} Associate`,
            `Professional ${titleCaseQ} Certificate`,
            `Master ${titleCaseQ} Certification`,
            `${titleCaseQ} Fundamentals Certified`
        );
    } else if (normType === 'issuer') {
        suggestions.push(
            `${titleCaseQ} Institute`,
            `${titleCaseQ} Association`,
            `${titleCaseQ} Board of Examiners`,
            `International ${titleCaseQ} Society`,
            `National ${titleCaseQ} Council`,
            `American ${titleCaseQ} Academy`,
            `${titleCaseQ} Global Consortium`
        );
    } else if (normType === 'skill' || normType === 'skills') {
        suggestions.push(
            titleCaseQ,
            `${titleCaseQ} Architecture`,
            `${titleCaseQ} Management`,
            `${titleCaseQ} Analysis`,
            `${titleCaseQ} Engineering`,
            `${titleCaseQ} Best Practices`,
            `Advanced ${titleCaseQ}`,
            `${titleCaseQ} Optimization`,
            `${titleCaseQ} Troubleshooting`,
            `${titleCaseQ} Integration`
        );
    } else if (normType === 'city' || normType === 'location') {
        suggestions.push(
            `${titleCaseQ}, United States`,
            `${titleCaseQ}, Canada`,
            `${titleCaseQ}, United Kingdom`,
            `${titleCaseQ}, Australia`,
            `${titleCaseQ}, India`,
            `${titleCaseQ}, Germany`
        );
    } else {
        return [];
    }

    // Filter strictly to items containing the query characters
    const matched = suggestions.filter(item => {
        const itemLower = String(item || '').toLowerCase();
        if (itemLower.includes(cleanQLower)) return true;
        if (cleanQStripped.length >= 2 && itemLower.replace(/[^a-z0-9]/g, '').includes(cleanQStripped)) return true;
        return false;
    });

    const unique = [...new Set(matched.map(s => String(s).trim()))].filter(Boolean);
    return unique.slice(0, maxResults);
}

/**
 * Universal instant matcher function across all directory types.
 * Matches seed directory first, then seamlessly blends dynamic synthesis
 * so user never receives an empty or artificially limited dropdown.
 */
export function matchUniversalDirectory(directoryType, query = '', maxResults = 8) {
    if (!query || typeof query !== 'string') return [];
    const cleanQ = query.trim().toLowerCase();
    if (!cleanQ) return [];

    let dataset = [];
    const normType = String(directoryType || '').toLowerCase();

    if (normType === 'company' || normType === 'employer' || normType === 'organization') {
        dataset = UNIVERSAL_COMPANIES;
    } else if (normType === 'school' || normType === 'university' || normType === 'institution' || normType === 'college') {
        dataset = UNIVERSAL_SCHOOLS;
    } else if (normType === 'degree' || normType === 'qualification') {
        dataset = UNIVERSAL_DEGREES;
    } else if (normType === 'certification' || normType === 'credential') {
        dataset = UNIVERSAL_CERTIFICATIONS;
    } else if (normType === 'language') {
        dataset = UNIVERSAL_LANGUAGES;
    } else if (normType === 'skill' || normType === 'skills') {
        dataset = UNIVERSAL_SKILLS;
    } else if (normType === 'city' || normType === 'location') {
        dataset = UNIVERSAL_CITIES;
    } else if (normType === 'jobtitle' || normType === 'occupation' || normType === 'title' || normType === 'role') {
        dataset = UNIVERSAL_JOB_TITLES;
    } else {
        return [];
    }

    // Prioritize prefix match first, then word-boundary match, then general substring
    const cleanQStripped = cleanQ.replace(/[^a-z0-9]/g, '');
    const prefixMatches = [];
    const wordMatches = [];
    const substringMatches = [];
    const flexibleMatches = [];

    for (const item of dataset) {
        const itemLower = item.toLowerCase();
        if (itemLower.startsWith(cleanQ)) {
            prefixMatches.push(item);
        } else if (new RegExp(`(?:^|[\\s(/,-])${cleanQ}`, 'i').test(item)) {
            wordMatches.push(item);
        } else if (itemLower.includes(cleanQ)) {
            substringMatches.push(item);
        } else if (cleanQStripped.length >= 2 && itemLower.replace(/[^a-z0-9]/g, '').includes(cleanQStripped)) {
            flexibleMatches.push(item);
        }
    }

    const combinedSeed = [...new Set([...prefixMatches, ...wordMatches, ...substringMatches, ...flexibleMatches])];

    // If seed matches are less than maxResults, seamlessly synthesize dynamic suggestions
    if (combinedSeed.length < maxResults) {
        const synthesized = synthesizeDynamicSuggestions(directoryType, query, null, maxResults);
        const blended = [...new Set([...combinedSeed, ...synthesized])];
        return blended.slice(0, maxResults);
    }

    return combinedSeed.slice(0, maxResults);
}

