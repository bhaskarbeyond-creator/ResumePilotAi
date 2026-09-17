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
    // Software & Systems Engineering
    'Software Engineer', 'Senior Software Engineer', 'Lead Software Engineer', 'Principal Software Engineer', 'Staff Software Engineer',
    'Software Developer', 'Senior Software Developer', 'Lead Software Developer',
    'Software Architect', 'Senior Software Architect', 'Principal Software Architect',
    'Solutions Architect', 'Cloud Solutions Architect', 'Enterprise Architect',
    'Software Engineering Manager', 'Director of Software Engineering', 'VP of Engineering',
    'Embedded Software Engineer', 'Systems Software Engineer', 'Firmware Engineer', 'Platform Engineer',
    // Web, Frontend & Full Stack
    'Frontend Developer', 'Senior Frontend Developer', 'Lead Frontend Developer',
    'Frontend Engineer', 'Senior Frontend Engineer', 'Lead Frontend Engineer', 'Staff Frontend Engineer',
    'Backend Engineer', 'Senior Backend Engineer', 'Lead Backend Engineer', 'Staff Backend Engineer',
    'Backend Developer', 'Senior Backend Developer', 'Lead Backend Developer',
    'Full Stack Developer', 'Senior Full Stack Developer', 'Lead Full Stack Developer',
    'Full Stack Engineer', 'Senior Full Stack Engineer', 'Lead Full Stack Engineer', 'Staff Full Stack Engineer',
    'Web Developer', 'Senior Web Developer', 'Web Application Architect', 'WordPress Developer',
    // Mobile Development
    'Mobile Application Developer', 'Senior Mobile Developer', 'Lead Mobile Engineer',
    'iOS Developer', 'Senior iOS Developer', 'Lead iOS Engineer',
    'Android Developer', 'Senior Android Developer', 'Lead Android Engineer',
    'React Native Developer', 'Flutter Developer',
    // Cloud, DevOps, Infrastructure & SRE
    'DevOps Engineer', 'Senior DevOps Engineer', 'Lead DevOps Engineer', 'Principal DevOps Engineer',
    'Site Reliability Engineer (SRE)', 'Senior Site Reliability Engineer', 'Lead SRE',
    'Cloud Engineer', 'Senior Cloud Engineer', 'Cloud Infrastructure Engineer', 'Cloud Security Architect',
    'Kubernetes Platform Engineer', 'Infrastructure Engineer', 'Systems Administrator', 'Senior Systems Administrator',
    'Network Engineer', 'Senior Network Engineer', 'Network Security Engineer', 'Linux Systems Administrator',
    // QA & Test Engineering
    'QA Automation Engineer', 'Senior QA Automation Engineer', 'Lead QA Automation Engineer',
    'QA Engineer', 'Software Test Engineer', 'Quality Assurance Specialist', 'Quality Assurance Lead',
    'SDET (Software Development Engineer in Test)', 'Performance Test Engineer', 'Manual QA Tester',
    // Cybersecurity & Information Security
    'Cybersecurity Analyst', 'Senior Cybersecurity Analyst', 'Lead Cybersecurity Specialist',
    'Cybersecurity Engineer', 'Senior Cybersecurity Engineer', 'Information Security Officer (CISO)',
    'Security Operations Center (SOC) Analyst', 'Penetration Tester (Ethical Hacker)', 'Application Security Engineer',
    'Cloud Security Engineer', 'Incident Response Specialist', 'Security Architect',
    // Data Science, AI & Machine Learning
    'Data Analyst', 'Senior Data Analyst', 'Lead Data Analyst', 'Principal Data Analyst',
    'Data Scientist', 'Senior Data Scientist', 'Lead Data Scientist', 'Principal Data Scientist',
    'Data Engineer', 'Senior Data Engineer', 'Lead Data Engineer', 'Big Data Architect',
    'Machine Learning Engineer', 'Senior Machine Learning Engineer', 'Lead ML Engineer',
    'AI Research Scientist', 'AI Engineer', 'Deep Learning Specialist', 'MLOps Engineer',
    'Computer Vision Engineer', 'Natural Language Processing (NLP) Engineer', 'Generative AI Specialist',
    'Business Intelligence Analyst', 'Senior BI Developer', 'Analytics Engineer', 'Database Administrator (DBA)',
    // Product Management & Agile Leadership
    'Product Manager', 'Senior Product Manager', 'Lead Product Manager', 'Principal Product Manager',
    'Director of Product Management', 'Group Product Manager', 'Associate Product Manager (APM)',
    'Technical Product Manager', 'Product Marketing Manager (PMM)', 'Head of Product',
    'Project Manager', 'Senior Project Manager', 'Technical Project Manager', 'IT Project Manager',
    'PMP Certified Project Manager', 'Agile Project Manager', 'Scrum Master', 'Senior Scrum Master',
    'Agile Coach', 'Program Manager', 'Senior Program Manager', 'Director of Program Management',
    // UI/UX, Graphic Design & Creative Arts
    'UI/UX Designer', 'Senior UI/UX Designer', 'Lead UI/UX Designer', 'Product Designer',
    'Senior Product Designer', 'Lead Product Designer', 'UX Researcher', 'Interaction Designer',
    'Visual Designer', 'Design Systems Lead', 'Graphic Designer', 'Senior Graphic Designer',
    'Creative Director', 'Art Director', 'Motion Graphics Designer', '3D Animator', '3D Artist',
    'Video Producer', 'Video Editor', 'Videographer', 'Content Strategist', 'Technical Writer', 'Copywriter',
    // Marketing, Growth, SEO & Social Media
    'Marketing Specialist', 'Senior Marketing Specialist', 'Digital Marketing Specialist', 'Digital Marketing Manager',
    'Growth Marketing Lead', 'Growth Marketer', 'Performance Marketing Specialist',
    'SEO & Content Specialist', 'Content Marketing Manager', 'Brand Marketing Manager',
    'Social Media Manager', 'Public Relations (PR) Specialist', 'Communications Manager', 'Email Marketing Specialist',
    // Sales, Business Development & Customer Success
    'Sales Representative', 'Inside Sales Representative', 'Outside Sales Representative',
    'Sales Development Representative (SDR)', 'Business Development Representative (BDR)',
    'Account Executive (AE)', 'Senior Account Executive', 'Enterprise Account Executive',
    'Account Manager', 'Key Account Manager', 'Sales Manager', 'Regional Sales Director',
    'Vice President of Sales', 'Customer Success Manager (CSM)', 'Senior Customer Success Manager',
    'Customer Support Specialist', 'Client Relations Specialist',
    // Accounting, Finance, Banking & Investment
    'Senior Accountant', 'Staff Accountant', 'Junior Accountant', 'Cost Accountant',
    'Certified Public Accountant (CPA)', 'Forensic Accountant', 'Accounting Manager', 'Corporate Controller',
    'Financial Analyst', 'Senior Financial Analyst', 'Lead Financial Analyst',
    'Finance Director', 'Vice President of Finance', 'Chief Financial Officer (CFO)',
    'Internal Auditor', 'Senior Auditor', 'Tax Accountant', 'Tax Consultant', 'Tax Preparer',
    'Investment Banking Analyst', 'Commercial Banking Officer', 'Portfolio Manager',
    'Wealth Management Advisor', 'Credit Analyst', 'Actuary', 'Actuarial Analyst',
    // Healthcare, Medicine, Nursing & Clinical
    'Medical Doctor (MD)', 'Physician', 'General Practitioner (GP)', 'Family Medicine Physician',
    'Internal Medicine Physician', 'Attending Physician', 'Emergency Medicine Physician', 'Resident Physician',
    'Pediatrician', 'Cardiologist', 'Dermatologist', 'Neurologist', 'Psychiatrist', 'Radiologist', 'Anesthesiologist',
    'Oncologist', 'Medical Oncologist', 'Surgical Oncologist', 'Radiation Oncologist', 'Pediatric Oncologist', 'Hematologist-Oncologist', 'Clinical Oncologist',
    'General Surgeon', 'Orthopedic Surgeon', 'Cardiothoracic Surgeon', 'Neurosurgeon',
    'Registered Nurse (RN)', 'Nurse Practitioner (NP)', 'Critical Care Registered Nurse (CCRN)',
    'Emergency Room Nurse (ER RN)', 'Charge Nurse', 'Pediatric Nurse', 'Operating Room Nurse (OR RN)',
    'Clinical Nurse Specialist (CNS)', 'Nurse Manager', 'Licensed Practical Nurse (LPN)',
    'Physician Assistant (PA)', 'Clinical Pharmacist', 'Staff Pharmacist', 'Pharmacy Technician',
    'Physical Therapist (PT)', 'Occupational Therapist (OT)', 'Speech Language Pathologist (SLP)',
    'Medical Laboratory Technologist', 'Phlebotomist', 'Clinical Research Coordinator',
    'Healthcare Administrator', 'Dentist (DDS)', 'Dental Hygienist', 'Dental Assistant', 'Orthodontist',
    // Skilled Trades, Construction & Maintenance
    'Licensed Electrician', 'Master Electrician', 'Journeyman Electrician', 'Industrial Electrician', 'Commercial Electrician',
    'Licensed Plumber', 'Master Plumber', 'Journeyman Plumber', 'Commercial Plumber', 'Pipefitter',
    'HVAC Service Technician', 'Commercial HVAC Specialist', 'HVAC Installation Lead', 'Refrigeration Technician',
    'Certified Welder', 'Pipe Welder', 'Structural Welder', 'MIG / TIG Welder',
    'Master Carpenter', 'Finish Carpenter', 'Framing Carpenter', 'Cabinetmaker',
    'Construction Project Manager', 'General Contractor', 'Construction Superintendent', 'Heavy Equipment Operator',
    'Automotive Technician', 'Master Automotive Mechanic', 'Diesel Mechanic', 'Maintenance Technician',
    // Engineering (Multi-Discipline)
    'Mechanical Engineer', 'Senior Mechanical Engineer', 'Lead Mechanical Engineer', 'Mechanical Design Engineer',
    'Electrical Engineer', 'Senior Electrical Engineer', 'Electrical Project Manager',
    'Civil Engineer', 'Senior Civil Engineer', 'Civil Project Manager', 'Civil Design Engineer', 'Structural Civil Engineer',
    'Structural Engineer', 'Senior Structural Designer', 'Environmental Engineer', 'Transportation Civil Engineer',
    'Aerospace Engineer', 'Aeronautical Systems Specialist', 'Aerodynamics Engineer', 'Avionics Technician',
    'Chemical Engineer', 'Biomedical Engineer', 'Industrial Engineer', 'Manufacturing Engineer', 'Robotics Engineer',
    // Aviation, Transportation & Logistics
    'Commercial Airline Pilot', 'Airline Transport Pilot (ATP)', 'First Officer Pilot', 'Airline Captain',
    'Flight Instructor (CFI)', 'Corporate Jet Pilot', 'Helicopter Pilot', 'Air Traffic Controller', 'Flight Attendant',
    'Aircraft Maintenance Technician (A&P)', 'Flight Operations Manager', 'Flight Dispatcher',
    'Logistics Coordinator', 'Logistics Manager', 'Supply Chain Analyst', 'Supply Chain Manager',
    'Warehouse Operations Manager', 'Fleet Manager', 'Transportation Dispatcher', 'Freight Broker',
    // Legal, Compliance, Governance & Risk
    'Attorney at Law', 'Corporate Lawyer', 'Litigation Attorney', 'Associate Attorney', 'Partner Attorney',
    'Criminal Defense Lawyer', 'Trial Lawyer', 'General Counsel', 'Senior Legal Counsel', 'Corporate Counsel',
    'Paralegal', 'Senior Paralegal', 'Litigation Paralegal', 'Certified Paralegal (CP)', 'Legal Assistant', 'Law Clerk',
    'Compliance Officer', 'Chief Compliance Officer (CCO)', 'Regulatory Compliance Specialist',
    'AML / KYC Compliance Analyst', 'Risk Management Analyst', 'Contract Administrator',
    // Education, Academia, Teaching & Training
    'Teacher', 'Elementary School Teacher', 'High School Teacher', 'Middle School Teacher',
    'Special Education Teacher', 'STEM Teacher', 'Lead Science Teacher', 'ESL Teacher',
    'School Principal', 'Vice Principal', 'Academic Counselor', 'Instructional Designer', 'Instructional Coach',
    'College Professor', 'Assistant Professor', 'Associate Professor', 'Adjunct Professor', 'Corporate Trainer',
    // Hospitality, Culinary Arts & Event Management
    'Executive Chef', 'Sous Chef', 'Pastry Chef', 'Head Chef', 'Chef de Cuisine', 'Private Chef',
    'Lead Line Cook', 'Prep Cook', 'Head Barista', 'Coffee Roaster & Barista', 'Master Baker',
    'Restaurant General Manager', 'Food & Beverage Director', 'Sommelier', 'Lead Bartender',
    'Hotel General Manager', 'Front Desk Supervisor', 'Event Planner', 'Catering Director',
    // Human Resources & Talent Acquisition
    'Human Resources Manager', 'HR Generalist', 'HR Business Partner (HRBP)', 'Director of Human Resources',
    'Talent Acquisition Specialist', 'Senior Technical Recruiter', 'Recruiting Coordinator',
    'People Operations Manager', 'Compensation and Benefits Specialist',
    // Executive, Management & Operations
    'Chief Executive Officer (CEO)', 'Chief Operating Officer (COO)', 'Chief Technology Officer (CTO)',
    'Chief Financial Officer (CFO)', 'Chief Information Officer (CIO)', 'Chief Marketing Officer (CMO)',
    'Operations Manager', 'Director of Operations', 'General Manager', 'Business Operations Analyst',
    'Management Consultant', 'Strategy Consultant', 'Business Analyst', 'Senior Business Analyst',
    'Executive Assistant', 'Office Manager'
]);

const DOMAIN_ROLE_EXPANSIONS = Object.freeze([
    { regex: /soft|software/i, roles: ['Software Engineer', 'Senior Software Engineer', 'Lead Software Engineer', 'Principal Software Engineer', 'Software Developer', 'Senior Software Developer', 'Software Architect', 'Software Engineering Manager', 'Embedded Software Engineer', 'Software QA Engineer'] },
    { regex: /front|frontend/i, roles: ['Frontend Developer', 'Senior Frontend Developer', 'Frontend Engineer', 'Senior Frontend Engineer', 'Lead Frontend Developer', 'Staff Frontend Engineer', 'UI Frontend Specialist', 'React Frontend Developer'] },
    { regex: /back|backend/i, roles: ['Backend Engineer', 'Senior Backend Engineer', 'Backend Developer', 'Senior Backend Developer', 'Lead Backend Engineer', 'Staff Backend Engineer', 'Cloud Backend Architect', 'Node.js Backend Developer'] },
    { regex: /full|fullstack/i, roles: ['Full Stack Developer', 'Senior Full Stack Developer', 'Full Stack Engineer', 'Senior Full Stack Engineer', 'Lead Full Stack Engineer', 'Staff Full Stack Engineer', 'Full Stack Web Developer'] },
    { regex: /data/i, roles: ['Data Analyst', 'Senior Data Analyst', 'Data Scientist', 'Senior Data Scientist', 'Data Engineer', 'Senior Data Engineer', 'Big Data Architect', 'Business Intelligence Analyst', 'Database Administrator (DBA)'] },
    { regex: /\bdoc\b|\bdoctor|\bphysic/i, roles: ['Doctor (General Practitioner)', 'Medical Doctor (MD)', 'Family Medicine Doctor', 'Doctor of Dental Surgery (DDS)', 'Doctor of Pharmacy (PharmD)', 'Doctor of Veterinary Medicine', 'Doctor of Optometry', 'Doctor of Physical Therapy', 'Resident Doctor', 'Clinic Doctor', 'Physician', 'Internal Medicine Physician', 'Physician Assistant (PA)'] },
    { regex: /nurs/i, roles: ['Registered Nurse (RN)', 'Nurse Practitioner (NP)', 'Critical Care Registered Nurse (CCRN)', 'Emergency Room Nurse (ER RN)', 'Charge Nurse', 'Pediatric Nurse', 'Clinical Nurse Specialist (CNS)', 'Nurse Manager', 'Surgical Nurse', 'Staff Nurse'] },
    { regex: /teach/i, roles: ['Teacher', 'High School Teacher', 'Elementary School Teacher', 'Middle School Teacher', 'Special Education Teacher', 'STEM Teacher', 'Lead Science Teacher', 'ESL Teacher', 'Instructional Coach', 'Substitute Teacher'] },
    { regex: /plumb/i, roles: ['Licensed Master Plumber', 'Journeyman Plumber', 'Commercial Plumber', 'Residential Service Plumber', 'Plumbing Contractor', 'Plumbing Inspector', 'Pipefitter', 'Service Plumber'] },
    { regex: /law|lawyer|attorn/i, roles: ['Corporate Lawyer', 'Litigation Lawyer', 'Associate Lawyer', 'Criminal Defense Lawyer', 'Trial Lawyer', 'Family Lawyer', 'Immigration Lawyer', 'Intellectual Property Lawyer', 'Staff Lawyer', 'General Counsel', 'Attorney at Law', 'Staff Attorney', 'Law Clerk'] },
    { regex: /pilot/i, roles: ['Commercial Airline Pilot', 'Airline Transport Pilot (ATP)', 'First Officer Pilot', 'Airline Captain', 'Flight Instructor (CFI)', 'Corporate Jet Pilot', 'Helicopter Pilot', 'Cargo Pilot'] },
    { regex: /aero|aviat/i, roles: ['Aerospace Engineer', 'Aeronautical Systems Specialist', 'Aerodynamics Engineer', 'Avionics Technician', 'Flight Test Engineer', 'Aerospace Project Manager', 'Aviation Safety Specialist'] },
    { regex: /elec/i, roles: ['Master Electrician', 'Journeyman Electrician', 'Industrial Electrician', 'Commercial Electrician', 'Electrical Systems Technician', 'Electrical Engineer', 'Electrical Project Manager', 'Residential Electrician'] },
    { regex: /chef|culin/i, roles: ['Executive Chef', 'Sous Chef', 'Pastry Chef', 'Head Chef', 'Chef de Cuisine', 'Private Chef', 'Line Cook', 'Catering Chef', 'Chef de Partie'] },
    { regex: /\bacc\b|\baccount/i, roles: ['Senior Accountant', 'Staff Accountant', 'Certified Public Accountant (CPA)', 'Accounting Manager', 'Cost Accountant', 'Forensic Accountant', 'Tax Accountant', 'Corporate Controller', 'Account Executive (AE)'] },
    { regex: /civil/i, roles: ['Civil Engineer', 'Senior Civil Engineer', 'Civil Project Manager', 'Civil Design Engineer', 'Structural Civil Engineer', 'Transportation Civil Engineer', 'Water Resources Civil Engineer'] },
    { regex: /mech/i, roles: ['Mechanical Engineer', 'Senior Mechanical Engineer', 'Mechanical Design Engineer', 'Electromechanical Engineer', 'HVAC Mechanical Engineer', 'Robotics Mechanical Engineer', 'Master Automotive Mechanic'] },
    { regex: /product/i, roles: ['Product Manager', 'Senior Product Manager', 'Lead Product Manager', 'Principal Product Manager', 'Director of Product Management', 'Technical Product Manager', 'Product Marketing Manager (PMM)', 'Associate Product Manager (APM)'] },
    { regex: /project/i, roles: ['Project Manager', 'Senior Project Manager', 'Technical Project Manager', 'IT Project Manager', 'PMP Certified Project Manager', 'Agile Project Manager', 'Construction Project Manager', 'Project Coordinator'] },
    { regex: /sales/i, roles: ['Sales Representative', 'Sales Development Representative (SDR)', 'Business Development Representative (BDR)', 'Account Executive (AE)', 'Senior Account Executive', 'Enterprise Sales Director', 'Sales Manager', 'Inside Sales Representative'] },
    { regex: /market/i, roles: ['Marketing Specialist', 'Digital Marketing Specialist', 'Digital Marketing Manager', 'Growth Marketing Lead', 'Performance Marketing Specialist', 'SEO & Content Specialist', 'Brand Marketing Manager', 'Product Marketing Manager (PMM)'] },
    { regex: /\bqa\b|\btest/i, roles: ['QA Automation Engineer', 'Senior QA Automation Engineer', 'QA Engineer', 'Software Test Engineer', 'Quality Assurance Specialist', 'Lead QA Automation Engineer', 'SDET (Software Development Engineer in Test)', 'Software QA Tester'] },
    { regex: /\bdev\b|\bdeveloper|\bdevops/i, roles: ['DevOps Engineer', 'Developer (Software)', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Mobile App Developer', 'Cloud Developer', 'Software Developer'] },
    { regex: /cloud/i, roles: ['Cloud Solutions Architect', 'Senior Cloud Solutions Architect', 'Cloud Infrastructure Engineer', 'Cloud Security Architect', 'Cloud DevOps Engineer', 'AWS Cloud Architect', 'Azure Cloud Engineer'] },
    { regex: /cyber|secur/i, roles: ['Cybersecurity Analyst', 'Senior Cybersecurity Analyst', 'Cybersecurity Engineer', 'Information Security Officer (CISO)', 'Penetration Tester', 'SOC Analyst', 'Cloud Security Architect', 'Application Security Engineer'] },
    { regex: /robot/i, roles: ['Robotics Engineer', 'Senior Robotics Engineer', 'Robotics Software Developer', 'Robotics Systems Specialist', 'Automation & Robotics Technician', 'Lead Robotics Architect'] },
    { regex: /solar/i, roles: ['Solar Installation Technician', 'Solar Energy Engineer', 'Solar Project Manager', 'Commercial Solar Specialist', 'Renewable Energy Consultant', 'Solar Systems Designer'] },
    { regex: /\bai\b|\bmachine/i, roles: ['Machine Learning Engineer', 'AI Engineer', 'AI Research Scientist', 'Senior Machine Learning Engineer', 'MLOps Engineer', 'Deep Learning Specialist', 'Generative AI Specialist', 'NLP Engineer'] },
    { regex: /dent/i, roles: ['General Dentist', 'Doctor of Dental Surgery (DDS)', 'Dental Hygienist', 'Dental Assistant', 'Orthodontist', 'Periodontist', 'Dental Practice Manager'] },
    { regex: /pharma/i, roles: ['Clinical Pharmacist', 'Staff Pharmacist', 'Pharmacy Technician', 'Director of Pharmacy', 'Hospital Pharmacist', 'Retail Pharmacist', 'Pharmacologist'] },
    { regex: /surg/i, roles: ['General Surgeon', 'Orthopedic Surgeon', 'Cardiothoracic Surgeon', 'Neurosurgeon', 'Trauma Surgeon', 'Surgical Technologist', 'Operating Room Nurse'] },
    { regex: /anim/i, roles: ['3D Animator', 'Character Animator', 'Motion Graphics Animator', '2D Animator', 'Lead Technical Animator'] },
    { regex: /video/i, roles: ['Video Editor', 'Video Producer', 'Videographer', 'Post-Production Specialist', 'Senior Motion Video Lead'] },
    { regex: /\bhr\b|\btalent/i, roles: ['Human Resources Manager', 'HR Generalist', 'HR Business Partner (HRBP)', 'Director of Human Resources', 'Talent Acquisition Specialist', 'Senior Technical Recruiter'] },
    { regex: /\blogist|\bsupply/i, roles: ['Logistics Coordinator', 'Logistics Manager', 'Supply Chain Analyst', 'Supply Chain Manager', 'Warehouse Operations Manager', 'Fleet Manager'] },
    { regex: /strat|consult/i, roles: ['Management Consultant', 'Strategy Consultant', 'Business Analyst', 'Senior Business Analyst', 'Strategic Operations Manager'] },
    { regex: /cardio/i, roles: ['Cardiologist', 'Cardiology Fellow', 'Cardiovascular Technologist', 'Cardiothoracic Surgeon', 'Cardiac Nurse Practitioner', 'Director of Cardiology'] },
    { regex: /neuro/i, roles: ['Neurologist', 'Neurosurgeon', 'Neuroscience Researcher', 'Neurointensive Care Nurse', 'Neurology Physician Assistant'] },
    { regex: /pediat/i, roles: ['Pediatrician', 'Pediatric Nurse', 'Pediatric Surgeon', 'Pediatric Intensive Care Specialist', 'Pediatric Nurse Practitioner'] },
    { regex: /flight/i, roles: ['Flight Attendant', 'Flight Instructor (CFI)', 'Flight Operations Manager', 'Flight Dispatcher', 'Flight Test Engineer'] },
    { regex: /weld/i, roles: ['Certified Welder', 'Pipe Welder', 'Structural Welder', 'MIG / TIG Welder', 'Welding Inspector (CWI)'] },
    { regex: /hvac/i, roles: ['HVAC Service Technician', 'Commercial HVAC Specialist', 'HVAC Installation Lead', 'Refrigeration & HVAC Mechanic'] },
    { regex: /carp/i, roles: ['Master Carpenter', 'Framing Carpenter', 'Finish Carpenter', 'Cabinet Maker', 'Carpentry Foreman'] },
    { regex: /machin/i, roles: ['CNC Machinist', 'Precision Machinist', 'Tool & Die Maker', 'Manual Machinist', 'CNC Programmer'] },
    { regex: /paral/i, roles: ['Senior Paralegal', 'Litigation Paralegal', 'Corporate Paralegal', 'Certified Paralegal (CP)', 'Intellectual Property Paralegal'] },
    { regex: /audit/i, roles: ['Internal Auditor', 'Senior Auditor', 'Lead Quality Auditor', 'IT Audit Specialist', 'Financial Auditor'] },
    { regex: /tax/i, roles: ['Tax Accountant', 'Senior Tax Manager', 'Tax Consultant', 'International Tax Specialist', 'Tax Analyst'] },
    { regex: /actua/i, roles: ['Actuarial Analyst', 'Associate Actuary', 'Senior Consulting Actuary', 'Life & Health Actuary', 'Pricing Actuary'] },
    { regex: /bank/i, roles: ['Investment Banking Analyst', 'Commercial Banking Officer', 'Branch Banking Manager', 'Credit Analyst', 'Private Banker'] },
    { regex: /struct/i, roles: ['Structural Engineer', 'Senior Structural Designer', 'Structural Project Engineer', 'Bridge Structural Engineer'] },
    { regex: /archit/i, roles: ['Architectural Designer', 'Licensed Architect', 'Project Architect', 'Enterprise Architect', 'Landscape Architect'] },
    { regex: /prof/i, roles: ['Assistant Professor', 'Associate Professor', 'Adjunct Professor', 'Distinguished Professor', 'Research Professor'] },
    { regex: /\bart\b|\bartist/i, roles: ['Art Director', 'Concept Artist', 'Storyboard Artist', 'Technical Artist', 'Digital Artist', 'Visual Development Artist'] },
    { regex: /kube/i, roles: ['Kubernetes Administrator', 'Kubernetes Platform Engineer', 'DevOps Engineer (Kubernetes)', 'Cloud Infrastructure Engineer (K8s)'] },
    { regex: /pyth/i, roles: ['Python Developer', 'Senior Python Engineer', 'Python Data Engineer', 'Python Backend Developer', 'Machine Learning Engineer (Python)'] },
    { regex: /react/i, roles: ['React Developer', 'Senior React.js Engineer', 'React Native Developer', 'Frontend Engineer (React)', 'Full Stack React / Node Engineer'] },
    { regex: /onco/i, roles: ['Medical Oncologist', 'Radiation Oncologist', 'Surgical Oncologist', 'Hematologist-Oncologist', 'Pediatric Oncologist', 'Clinical Oncologist', 'Gynecologic Oncologist', 'Consultant Oncologist'] }
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
        let matchedAnyDomain = false;
        // 1. High-precision semantic expansions for recognized professional domains
        for (const domain of DOMAIN_ROLE_EXPANSIONS) {
            if (domain.regex.test(cleanQLower)) {
                suggestions.push(...domain.roles);
                matchedAnyDomain = true;
            }
        }

        // 2. Only for unclassified / emerging / niche professions: synthesize clean professional titles with morpheme awareness
        if (!matchedAnyDomain) {
            if (/olog(?:ist|y)$/i.test(cleanQLower) || /dermat|pathol|gastro|pulmon|endocrin|nephrol|immunol|rheumat/i.test(cleanQLower)) {
                const base = titleCaseQ.replace(/y$/, 'ist');
                suggestions.push(
                    base,
                    `Medical ${base}`,
                    `Surgical ${base}`,
                    `Clinical ${base}`,
                    `Senior ${base}`,
                    `Consultant ${base}`,
                    `Pediatric ${base}`,
                    `Chief ${base}`
                );
            } else if (/iatr(?:ist|ic|ian)$/i.test(cleanQLower)) {
                suggestions.push(
                    titleCaseQ,
                    `Clinical ${titleCaseQ}`,
                    `Consultant ${titleCaseQ}`,
                    `Senior ${titleCaseQ}`,
                    `Adult & Pediatric ${titleCaseQ}`,
                    `Chief ${titleCaseQ}`
                );
            } else if (/engineer|develop|programm|softw|cloud|devops|data|full\s*stack|front\s*end|back\s*end/i.test(cleanQLower)) {
                suggestions.push(
                    titleCaseQ,
                    `Senior ${titleCaseQ}`,
                    `Lead ${titleCaseQ}`,
                    `Principal ${titleCaseQ}`,
                    `Staff ${titleCaseQ}`,
                    `${titleCaseQ} Lead`,
                    `${titleCaseQ} Manager`,
                    `Associate ${titleCaseQ}`
                );
            } else {
                suggestions.push(
                    titleCaseQ,
                    `Senior ${titleCaseQ}`,
                    `Lead ${titleCaseQ}`,
                    `Associate ${titleCaseQ}`,
                    `Principal ${titleCaseQ}`,
                    `${titleCaseQ} Specialist`,
                    `${titleCaseQ} Consultant`,
                    `${titleCaseQ} Manager`,
                    `${titleCaseQ} Coordinator`,
                    `${titleCaseQ} Director`
                );
            }
        }
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
    const isShort = cleanQ.length <= 2;

    for (const item of dataset) {
        const itemLower = item.toLowerCase();
        if (itemLower.startsWith(cleanQ)) {
            prefixMatches.push(item);
        } else if (new RegExp(`(?:^|[\\s(/,-])${cleanQ}`, 'i').test(item)) {
            wordMatches.push(item);
        } else if (!isShort && itemLower.includes(cleanQ)) {
            substringMatches.push(item);
        } else if (!isShort && cleanQStripped.length >= 3 && itemLower.replace(/[^a-z0-9]/g, '').includes(cleanQStripped)) {
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

