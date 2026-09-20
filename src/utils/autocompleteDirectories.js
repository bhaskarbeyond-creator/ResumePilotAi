/**
 * Autocomplete Universal Directories — ResumePilot AI
 *
 * Instant (0ms) keystroke filtering across all resume-builder steps.
 *
 * Design principles
 * -----------------
 *   1. Zero regex-injection surface: No `new RegExp(userInput)` on runtime queries.
 *      `matchUniversalDirectory('skill', 'C++')` or `(PMP)` cannot throw.
 *   2. Dataset indexes are built once and cached in a WeakMap for 0ms lookup.
 *   3. Multi-tier deterministic scoring:
 *        exact (1000) → prefix (800) → word-prefix (600) → substring (400) → fuzzy-stripped (200)
 *        with length penalty prioritizing concise, relevant results.
 *   4. Acronyms (AWS, GCP, SQL, SRE, IIT, FAA, OSHA, etc.) and mixed-case brands
 *      (iOS, JavaScript, McDonald's) are preserved through smart title casing.
 *   5. Real-world integrity:
 *        - Cities are strictly seed-matched to genuine global metros (no fake country permutations).
 *        - Hobbies are authentic recreational pursuits, decoupled from technical job roles.
 *        - Safe domain synthesis for roles, skills, hobbies, degrees, certs, and organizations.
 */

// ============================================================================
// 1. SEED DATASETS
// ============================================================================

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
    // Healthcare, Hospitals, Pharmaceuticals & Biotech
    'Apollo Hospitals', 'Fortis Healthcare', 'Max Healthcare', 'Manipal Hospitals',
    'Narayana Health', 'KIMS Hospitals', 'Yashoda Hospitals', 'Care Hospitals',
    'AIIMS (All India Institute of Medical Sciences)', 'Johns Hopkins Medicine',
    'Mayo Clinic', 'Cleveland Clinic', 'Massachusetts General Hospital',
    'NewYork-Presbyterian Hospital', 'Cedars-Sinai Medical Center',
    'Stanford Health Care', 'UCLA Health', 'Kaiser Permanente',
    'Mount Sinai Health System', 'Memorial Sloan Kettering Cancer Center',
    'MD Anderson Cancer Center', 'St. Jude Children\'s Research Hospital',
    'NHS (National Health Service)',
    'Johnson & Johnson', 'Pfizer', 'Roche', 'Novartis', 'Merck & Co.', 'AbbVie', 'AstraZeneca',
    'Bristol Myers Squibb', 'Eli Lilly', 'Amgen', 'Gilead Sciences', 'Moderna', 'Sanofi', 'GSK (GlaxoSmithKline)',
    'UnitedHealth Group', 'CVS Health', 'Elevance Health', 'Cigna', 'Humana', 'Medtronic', 'Thermo Fisher Scientific',
    'Abbott Laboratories', 'Danaher', 'Siemens Healthineers', 'GE HealthCare',
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
    'XLRI Xavier School of Management', 'Faculty of Management Studies (FMS Delhi)',
    // Premier Medical Institutes & Universities
    'AIIMS (All India Institute of Medical Sciences)',
    'All India Institute of Medical Sciences (AIIMS Delhi)',
    'AIIMS New Delhi',
    'AIIMS Bhopal',
    'AIIMS Bhubaneswar',
    'AIIMS Jodhpur',
    'AIIMS Rishikesh',
    'AIIMS Patna',
    'AIIMS Raipur',
    'Postgraduate Institute of Medical Education and Research (PGIMER Chandigarh)',
    'Christian Medical College (CMC Vellore)',
    'JIPMER (Jawaharlal Institute of Postgraduate Medical Education and Research)',
    'National Institute of Mental Health and Neurosciences (NIMHANS)',
    'King George\'s Medical University (KGMU Lucknow)',
    'Kasturba Medical College (KMC Manipal)',
    'St. John\'s Medical College, Bangalore'
]);

export const UNIVERSAL_DEGREES = Object.freeze([
    'Bachelor of Science (B.S.)', 'Bachelor of Arts (B.A.)', 'Bachelor of Engineering (B.E.)',
    'Bachelor of Technology (B.Tech)', 'Bachelor of Business Administration (BBA)',
    'Bachelor of Commerce (B.Com)', 'Bachelor of Computer Applications (BCA)',
    'Bachelor of Science in Computer Science (B.S. CS)', 'Bachelor of Science in Information Technology (B.S. IT)',
    'Bachelor of Science in Electrical Engineering (B.S. EE)', 'Bachelor of Science in Mechanical Engineering',
    'Bachelor of Science in Data Science', 'Bachelor of Science in Nursing (BSN)',
    'Bachelor of Fine Arts (B.F.A.)', 'Bachelor of Architecture (B.Arch)', 'Bachelor of Laws (LL.B.)',
    'Master of Science (M.S.)', 'Master of Arts (M.A.)', 'Master of Business Administration (MBA)',
    'Master of Technology (M.Tech)', 'Master of Engineering (M.Eng)', 'Master of Computer Applications (MCA)',
    'Master of Science in Computer Science (M.S. CS)', 'Master of Science in Data Science / Analytics',
    'Master of Science in Artificial Intelligence', 'Master of Science in Finance (MSF)',
    'Master of Health Administration (MHA)', 'Master of Public Health (MPH)',
    'Master of Science in Nursing (MSN)', 'Master of Laws (LL.M.)', 'Master of Public Administration (MPA)',
    'Executive Master of Business Administration (EMBA)',
    'Doctor of Philosophy (Ph.D.)', 'Doctor of Medicine (M.D.)', 'Doctor of Pharmacy (Pharm.D.)',
    'Juris Doctor (J.D.)', 'Doctor of Dental Surgery (D.D.S.)', 'Doctor of Education (Ed.D.)',
    'Doctor of Business Administration (DBA)',
    'Associate of Science (A.S.)', 'Associate of Arts (A.A.)', 'Associate of Applied Science (A.A.S.)',
    'Postgraduate Diploma (PGD)', 'Diploma in Computer Science & Engineering', 'Higher National Diploma (HND)'
]);

export const UNIVERSAL_CERTIFICATIONS = Object.freeze([
    'AWS Certified Solutions Architect – Associate', 'AWS Certified Solutions Architect – Professional',
    'AWS Certified Developer – Associate', 'AWS Certified DevOps Engineer – Professional',
    'Microsoft Certified: Azure Fundamentals (AZ-900)', 'Microsoft Certified: Azure Administrator (AZ-104)',
    'Microsoft Certified: Azure Solutions Architect Expert (AZ-305)', 'Google Cloud Certified Professional Cloud Architect',
    'Google Cloud Certified Associate Cloud Engineer', 'Certified Kubernetes Administrator (CKA)',
    'Certified Kubernetes Application Developer (CKAD)', 'HashiCorp Certified: Terraform Associate',
    'Project Management Professional (PMP)', 'Certified ScrumMaster (CSM)', 'Professional Scrum Master (PSM I)',
    'PMI Agile Certified Practitioner (PMI-ACP)', 'PRINCE2 Foundation / Practitioner',
    'Certified Information Systems Auditor (CISA)', 'Certified Information Security Manager (CISM)',
    'Certified Information Systems Security Professional (CISSP)', 'CompTIA Security+', 'CompTIA Network+',
    'CompTIA A+', 'Certified Ethical Hacker (CEH)',
    'Databricks Certified Data Engineer Associate', 'Databricks Certified Data Engineer Professional',
    'Snowflake SnowPro Core Certified', 'TensorFlow Developer Certificate',
    'Google Data Analytics Professional Certificate', 'Microsoft Certified: Power BI Data Analyst (PL-300)',
    'Tableau Certified Desktop Specialist', 'AWS Certified Machine Learning – Specialty',
    'Certified Public Accountant (CPA)', 'Chartered Financial Analyst (CFA Level I/II/III)',
    'Financial Risk Manager (FRM)', 'Certified Management Accountant (CMA)',
    'Six Sigma Green Belt (CSSGB)', 'Six Sigma Black Belt (CSSBB)',
    'SHRM Certified Professional (SHRM-CP)', 'SHRM Senior Certified Professional (SHRM-SCP)',
    'Professional in Human Resources (PHR)', 'HubSpot Inbound Marketing Certified',
    'Salesforce Certified Administrator', 'Salesforce Certified Platform Developer I',
    // Aviation, Safety & Compliance
    'FAA Commercial Pilot Certificate', 'FAA Airline Transport Pilot (ATP)', 'FAA Certified Flight Instructor (CFI)',
    'OSHA 30-Hour Construction Safety Certification', 'OSHA 10-Hour General Industry Certification'
]);

export const UNIVERSAL_LANGUAGES = Object.freeze([
    'English', 'Spanish (Español)', 'French (Français)', 'German (Deutsch)', 'Mandarin Chinese (中文)',
    'Hindi (हिन्दी)', 'Arabic (العربية)', 'Portuguese (Português)', 'Russian (Русский)', 'Japanese (日本語)',
    'Italian (Italiano)', 'Korean (한국어)', 'Dutch (Nederlands)', 'Turkish (Türkçe)', 'Polish (Polski)',
    'Swedish (Svenska)', 'Danish (Dansk)', 'Norwegian (Norsk)', 'Finnish (Suomi)', 'Greek (Ελληνικά)',
    'Hebrew (עברית)', 'Vietnamese (Tiếng Việt)', 'Thai (ไทย)', 'Indonesian (Bahasa Indonesia)',
    'Malay (Bahasa Melayu)', 'Tagalog (Filipino)', 'Bengali (বাংলা)', 'Tamil (தமிழ்)', 'Telugu (తెలుగు)',
    'Urdu (اردو)', 'Persian / Farsi (فارسی)', 'Ukrainian (Українська)', 'Czech (Čeština)',
    'Hungarian (Magyar)', 'Romanian (Română)', 'Slovak', 'Bulgarian', 'Croatian', 'Serbian'
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

export const UNIVERSAL_HOBBIES = Object.freeze([
    'Marathon Running', 'Hiking & Trekking', 'Rock Climbing & Bouldering', 'Cycling & Mountain Biking',
    'Swimming', 'Scuba Diving & Snorkeling', 'Tennis & Pickleball', 'Basketball', 'Soccer / Football',
    'Badminton', 'Volleyball', 'Golf', 'Skiing & Snowboarding', 'Surfing', 'Yoga & Pilates',
    'Martial Arts & Brazilian Jiu-Jitsu', 'Rowing & Kayaking', 'Triathlon Training',
    'Digital Photography & Editing', 'Film Photography', 'Creative Writing & Blogging', 'Poetry',
    'Painting & Watercolor', 'Sketching & Illustration', 'Graphic Design & 3D Modeling',
    'Playing Guitar', 'Playing Piano', 'Playing Drums', 'Playing Violin', 'Music Production & DJing',
    'Singing & Choral Music', 'Theater & Improv Acting', 'Podcasting & Audio Storytelling',
    'Open Source Software Contributor', 'Robotics & Arduino Projects', '3D Printing & CAD Design',
    'Ham Radio (Amateur Radio)', 'Woodworking & Carpentry', 'Home Automation (IoT)', 'Electronics Repair',
    'Chess & Competitive Strategy', 'Astronomy & Stargazing', 'Board Gaming & Tabletop RPGs',
    'Reading Non-Fiction & History', 'Language Learning & Polyglotism', 'Trivia & Quiz Competitions',
    'Philosophy & Ethics Discussion', 'Cryptic Crosswords & Puzzles',
    'Culinary Arts & Gourmet Cooking', 'Artisan Bread Baking', 'Specialty Coffee Brewing & Roasting',
    'Gardening & Urban Horticulture', 'Beekeeping & Apiculture', 'Aquascaping & Fishkeeping',
    'Volunteering & Community Outreach', 'Youth Mentorship & Tutoring', 'Animal Rescue & Foster Volunteering',
    'Traveling & Cultural Exploration'
]);

export const UNIVERSAL_CITIES = Object.freeze([
    // India — Major Metros, NCR, Tech Hubs & Key Cities (City, State)
    'Hyderabad, Telangana', 'Bangalore (Bengaluru), Karnataka', 'Mumbai, Maharashtra',
    'Delhi / New Delhi, Delhi', 'Pune, Maharashtra', 'Chennai, Tamil Nadu',
    'Gurgaon (Gurugram), Haryana', 'Noida, Uttar Pradesh', 'Ghaziabad, Uttar Pradesh',
    'Faridabad, Haryana', 'Greater Noida, Uttar Pradesh', 'Kolkata, West Bengal',
    'Ahmedabad, Gujarat', 'Visakhapatnam, Andhra Pradesh', 'Vijayawada, Andhra Pradesh',
    'Chandigarh, Punjab', 'Jaipur, Rajasthan', 'Indore, Madhya Pradesh',
    'Kochi (Cochin), Kerala', 'Coimbatore, Tamil Nadu', 'Thiruvananthapuram, Kerala',
    'Lucknow, Uttar Pradesh', 'Kanpur, Uttar Pradesh', 'Bhopal, Madhya Pradesh', 'Nagpur, Maharashtra',
    'Surat, Gujarat', 'Vadodara, Gujarat', 'Patna, Bihar', 'Prayagraj (Allahabad), Uttar Pradesh',
    'Meerut, Uttar Pradesh', 'Bareilly, Uttar Pradesh', 'Aligarh, Uttar Pradesh', 'Moradabad, Uttar Pradesh',
    'Bhubaneswar, Odisha', 'Guwahati, Assam', 'Mangalore (Mangaluru), Karnataka',
    'Mysore (Mysuru), Karnataka', 'Tirupati, Andhra Pradesh', 'Warangal, Telangana',
    'Rajahmundry, Andhra Pradesh', 'Guntur, Andhra Pradesh', 'Nellore, Andhra Pradesh',
    'Kurnool, Andhra Pradesh', 'Calicut (Kozhikode), Kerala', 'Madurai, Tamil Nadu',
    'Amritsar, Punjab', 'Ludhiana, Punjab', 'Jalandhar, Punjab', 'Dehradun, Uttarakhand', 'Ranchi, Jharkhand',
    'Jamshedpur, Jharkhand', 'Nashik, Maharashtra', 'Thane, Maharashtra', 'Navi Mumbai, Maharashtra',
    'Aurangabad (Chhatrapati Sambhajinagar), Maharashtra', 'Agra, Uttar Pradesh', 'Varanasi, Uttar Pradesh',
    'Jabalpur, Madhya Pradesh', 'Gwalior, Madhya Pradesh', 'Kota, Rajasthan', 'Jodhpur, Rajasthan',
    'Udaipur, Rajasthan', 'Raipur, Chhattisgarh', 'Cuttack, Odisha', 'Salem, Tamil Nadu',
    'Tiruchirappalli (Trichy), Tamil Nadu', 'Secunderabad, Telangana', 'Hubli-Dharwad, Karnataka',
    'Panaji, Goa', 'Puducherry, Puducherry', 'Shimla, Himachal Pradesh', 'Jammu, Jammu & Kashmir', 'Srinagar, Jammu & Kashmir',
    // United States (City, State)
    'San Francisco, CA', 'San Jose, CA', 'New York, NY', 'Seattle, WA',
    'Austin, TX', 'Boston, MA', 'Chicago, IL', 'Los Angeles, CA',
    'San Diego, CA', 'Denver, CO', 'Dallas, TX', 'Houston, TX',
    'Atlanta, GA', 'Washington, DC', 'Miami, FL', 'Philadelphia, PA',
    'Phoenix, AZ', 'Portland, OR', 'Raleigh-Durham, NC', 'Charlotte, NC',
    'Minneapolis, MN', 'Detroit, MI', 'Salt Lake City, UT', 'Pittsburgh, PA',
    'Tampa, FL', 'Orlando, FL', 'Nashville, TN', 'Las Vegas, NV',
    'Indianapolis, IN', 'Columbus, OH', 'Kansas City, MO', 'Baltimore, MD',
    // Canada (City, Province)
    'Toronto, ON', 'Vancouver, BC', 'Montreal, QC', 'Ottawa, ON',
    'Calgary, AB', 'Edmonton, AB', 'Waterloo, ON', 'Quebec City, QC',
    'Winnipeg, MB', 'Halifax, NS',
    // UK & Europe
    'London, England', 'Manchester, England', 'Birmingham, England',
    'Edinburgh, Scotland', 'Glasgow, Scotland', 'Cambridge, England',
    'Oxford, England', 'Bristol, England', 'Leeds, England', 'Dublin, Leinster',
    'Berlin, Berlin', 'Munich, Bavaria', 'Frankfurt, Hesse', 'Hamburg, Hamburg',
    'Paris, Île-de-France', 'Amsterdam, North Holland', 'Rotterdam, South Holland',
    'Zurich, Zurich', 'Geneva, Geneva', 'Stockholm, Stockholm', 'Copenhagen, Capital Region',
    'Oslo, Oslo', 'Helsinki, Uusimaa', 'Brussels, Brussels', 'Madrid, Madrid',
    'Barcelona, Catalonia', 'Milan, Lombardy', 'Rome, Lazio', 'Vienna, Vienna',
    'Warsaw, Masovia', 'Prague, Prague', 'Budapest, Central Hungary', 'Lisbon, Lisbon',
    // Asia-Pacific, Australia & Americas
    'Sydney, NSW', 'Melbourne, VIC', 'Brisbane, QLD', 'Perth, WA',
    'Adelaide, SA', 'Canberra, ACT', 'Auckland, Auckland', 'Wellington, Wellington',
    'Singapore, Singapore', 'Tokyo, Tokyo', 'Osaka, Osaka', 'Seoul, Seoul',
    'Hong Kong, Hong Kong', 'Taipei, Taipei', 'Bangkok, Bangkok', 'Kuala Lumpur, Federal Territory',
    'Jakarta, Jakarta', 'Manila, Metro Manila', 'Dubai, Dubai', 'Abu Dhabi, Abu Dhabi',
    'Doha, Doha', 'Riyadh, Riyadh Province', 'Tel Aviv, Tel Aviv District',
    'São Paulo, São Paulo', 'Mexico City, CDMX', 'Buenos Aires, Buenos Aires'
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
    // Healthcare
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
    // Skilled Trades
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
    // Aviation & Logistics
    'Commercial Airline Pilot', 'Airline Transport Pilot (ATP)', 'First Officer Pilot', 'Airline Captain',
    'Flight Instructor (CFI)', 'Corporate Jet Pilot', 'Helicopter Pilot', 'Air Traffic Controller', 'Flight Attendant',
    'Aircraft Maintenance Technician (A&P)', 'Flight Operations Manager', 'Flight Dispatcher',
    'Logistics Coordinator', 'Logistics Manager', 'Supply Chain Analyst', 'Supply Chain Manager',
    'Warehouse Operations Manager', 'Fleet Manager', 'Transportation Dispatcher', 'Freight Broker',
    // Legal, Compliance & Risk
    'Attorney at Law', 'Corporate Lawyer', 'Litigation Attorney', 'Associate Attorney', 'Partner Attorney',
    'Criminal Defense Lawyer', 'Trial Lawyer', 'General Counsel', 'Senior Legal Counsel', 'Corporate Counsel',
    'Paralegal', 'Senior Paralegal', 'Litigation Paralegal', 'Certified Paralegal (CP)', 'Legal Assistant', 'Law Clerk',
    'Compliance Officer', 'Chief Compliance Officer (CCO)', 'Regulatory Compliance Specialist',
    'AML / KYC Compliance Analyst', 'Risk Management Analyst', 'Contract Administrator',
    // Education
    'Teacher', 'Elementary School Teacher', 'High School Teacher', 'Middle School Teacher',
    'Special Education Teacher', 'STEM Teacher', 'Lead Science Teacher', 'ESL Teacher',
    'School Principal', 'Vice Principal', 'Academic Counselor', 'Instructional Designer', 'Instructional Coach',
    'College Professor', 'Assistant Professor', 'Associate Professor', 'Adjunct Professor', 'Corporate Trainer',
    // Hospitality & Culinary
    'Executive Chef', 'Sous Chef', 'Pastry Chef', 'Head Chef', 'Chef de Cuisine', 'Private Chef',
    'Lead Line Cook', 'Prep Cook', 'Head Barista', 'Coffee Roaster & Barista', 'Master Baker',
    'Restaurant General Manager', 'Food & Beverage Director', 'Sommelier', 'Lead Bartender',
    'Hotel General Manager', 'Front Desk Supervisor', 'Event Planner', 'Catering Director',
    // HR
    'Human Resources Manager', 'HR Generalist', 'HR Business Partner (HRBP)', 'Director of Human Resources',
    'Talent Acquisition Specialist', 'Senior Technical Recruiter', 'Recruiting Coordinator',
    'People Operations Manager', 'Compensation and Benefits Specialist',
    // Executive & Operations
    'Chief Executive Officer (CEO)', 'Chief Operating Officer (COO)', 'Chief Technology Officer (CTO)',
    'Chief Financial Officer (CFO)', 'Chief Information Officer (CIO)', 'Chief Marketing Officer (CMO)',
    'Operations Manager', 'Director of Operations', 'General Manager', 'Business Operations Analyst',
    'Management Consultant', 'Strategy Consultant', 'Business Analyst', 'Senior Business Analyst',
    'Executive Assistant', 'Office Manager'
]);

// ============================================================================
// 2. LOW-LEVEL UTILITIES
// ============================================================================

/** Fast Unicode diacritic stripping (e.g. "São Paulo" -> "Sao Paulo", "Zürich" -> "Zurich"). */
export function stripDiacritics(str) {
    if (!str || typeof str !== 'string') return '';
    return str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/** Colloquial city names, airport codes, and regional abbreviations. */
export const CITY_ALIASES = Object.freeze({
    // Andhra Pradesh & Telangana
    'vizag': 'Visakhapatnam, Andhra Pradesh',
    'visakha': 'Visakhapatnam, Andhra Pradesh',
    'waltair': 'Visakhapatnam, Andhra Pradesh',
    'vzg': 'Visakhapatnam, Andhra Pradesh',
    'hyd': 'Hyderabad, Telangana',
    'secunderabad': 'Secunderabad, Telangana',
    'secbad': 'Secunderabad, Telangana',
    'wgl': 'Warangal, Telangana',
    'bezawada': 'Vijayawada, Andhra Pradesh',
    'vja': 'Vijayawada, Andhra Pradesh',
    'tpty': 'Tirupati, Andhra Pradesh',
    'rjy': 'Rajahmundry, Andhra Pradesh',
    'gnt': 'Guntur, Andhra Pradesh',

    // Maharashtra
    'bombay': 'Mumbai, Maharashtra',
    'bom': 'Mumbai, Maharashtra',
    'poona': 'Pune, Maharashtra',
    'pun': 'Pune, Maharashtra',
    'navimumbai': 'Navi Mumbai, Maharashtra',
    'chhatrapati sambhajinagar': 'Aurangabad (Chhatrapati Sambhajinagar), Maharashtra',
    'sambhajinagar': 'Aurangabad (Chhatrapati Sambhajinagar), Maharashtra',
    'aurangabad': 'Aurangabad (Chhatrapati Sambhajinagar), Maharashtra',
    'nag': 'Nagpur, Maharashtra',

    // Karnataka
    'bangalore': 'Bangalore (Bengaluru), Karnataka',
    'bengaluru': 'Bangalore (Bengaluru), Karnataka',
    'blr': 'Bangalore (Bengaluru), Karnataka',
    'bglr': 'Bangalore (Bengaluru), Karnataka',
    'mysore': 'Mysore (Mysuru), Karnataka',
    'mysuru': 'Mysore (Mysuru), Karnataka',
    'mangaluru': 'Mangalore (Mangaluru), Karnataka',
    'mangalore': 'Mangalore (Mangaluru), Karnataka',
    'hubli': 'Hubli-Dharwad, Karnataka',
    'dharwad': 'Hubli-Dharwad, Karnataka',

    // Tamil Nadu
    'madras': 'Chennai, Tamil Nadu',
    'maa': 'Chennai, Tamil Nadu',
    'chennai': 'Chennai, Tamil Nadu',
    'trichy': 'Tiruchirappalli (Trichy), Tamil Nadu',
    'tiruchirappalli': 'Tiruchirappalli (Trichy), Tamil Nadu',
    'kovai': 'Coimbatore, Tamil Nadu',
    'cbe': 'Coimbatore, Tamil Nadu',

    // West Bengal
    'calcutta': 'Kolkata, West Bengal',
    'ccu': 'Kolkata, West Bengal',
    'kolkata': 'Kolkata, West Bengal',

    // Delhi NCR, Haryana & Uttar Pradesh
    'del': 'Delhi / New Delhi, Delhi',
    'delhi': 'Delhi / New Delhi, Delhi',
    'new delhi': 'Delhi / New Delhi, Delhi',
    'dcr': 'Delhi / New Delhi, Delhi',
    'ncr': 'Delhi / New Delhi, Delhi',
    'gurgaon': 'Gurgaon (Gurugram), Haryana',
    'gurugram': 'Gurgaon (Gurugram), Haryana',
    'ggn': 'Gurgaon (Gurugram), Haryana',
    'noida': 'Noida, Uttar Pradesh',
    'gr noida': 'Greater Noida, Uttar Pradesh',
    'greater noida': 'Greater Noida, Uttar Pradesh',
    'gaziabad': 'Ghaziabad, Uttar Pradesh',
    'ghaziabad': 'Ghaziabad, Uttar Pradesh',
    'faridabad': 'Faridabad, Haryana',
    'fbd': 'Faridabad, Haryana',
    'allahabad': 'Prayagraj (Allahabad), Uttar Pradesh',
    'prayag': 'Prayagraj (Allahabad), Uttar Pradesh',
    'prayagraj': 'Prayagraj (Allahabad), Uttar Pradesh',
    'banaras': 'Varanasi, Uttar Pradesh',
    'kashi': 'Varanasi, Uttar Pradesh',
    'varanasi': 'Varanasi, Uttar Pradesh',

    // Kerala
    'cochin': 'Kochi (Cochin), Kerala',
    'kochi': 'Kochi (Cochin), Kerala',
    'cok': 'Kochi (Cochin), Kerala',
    'trivandrum': 'Thiruvananthapuram, Kerala',
    'thiruvananthapuram': 'Thiruvananthapuram, Kerala',
    'trv': 'Thiruvananthapuram, Kerala',
    'calicut': 'Calicut (Kozhikode), Kerala',
    'kozhikode': 'Calicut (Kozhikode), Kerala',
    'ccj': 'Calicut (Kozhikode), Kerala',

    // Gujarat
    'baroda': 'Vadodara, Gujarat',
    'vadodara': 'Vadodara, Gujarat',
    'amd': 'Ahmedabad, Gujarat',
    'ahmedabad': 'Ahmedabad, Gujarat',

    // Union Territories, Punjab, Odisha, MP, etc.
    'pondicherry': 'Puducherry, Puducherry',
    'puducherry': 'Puducherry, Puducherry',
    'chandigarh': 'Chandigarh, Punjab',
    'ixc': 'Chandigarh, Punjab',
    'bhubaneshwar': 'Bhubaneswar, Odisha',
    'bbsr': 'Bhubaneswar, Odisha',
    'ind': 'Indore, Madhya Pradesh',
    'bho': 'Bhopal, Madhya Pradesh',
    'jpr': 'Jaipur, Rajasthan',
    'pat': 'Patna, Bihar',
    'gau': 'Guwahati, Assam',

    // United States Metros & Airport Codes
    'nyc': 'New York, NY',
    'ny': 'New York, NY',
    'jfk': 'New York, NY',
    'lga': 'New York, NY',
    'ewr': 'New York, NY',
    'sf': 'San Francisco, CA',
    'sfo': 'San Francisco, CA',
    'bay area': 'San Francisco, CA',
    'silicon valley': 'San Jose, CA',
    'sj': 'San Jose, CA',
    'sjc': 'San Jose, CA',
    'la': 'Los Angeles, CA',
    'lax': 'Los Angeles, CA',
    'dc': 'Washington, DC',
    'dmv': 'Washington, DC',
    'iad': 'Washington, DC',
    'dca': 'Washington, DC',
    'sea': 'Seattle, WA',
    'seatac': 'Seattle, WA',
    'atx': 'Austin, TX',
    'aus': 'Austin, TX',
    'dfw': 'Dallas, TX',
    'dal': 'Dallas, TX',
    'hou': 'Houston, TX',
    'iah': 'Houston, TX',
    'chi': 'Chicago, IL',
    'ord': 'Chicago, IL',
    'mdw': 'Chicago, IL',
    'bos': 'Boston, MA',
    'phx': 'Phoenix, AZ',
    'den': 'Denver, CO',
    'atl': 'Atlanta, GA',
    'pdx': 'Portland, OR',
    'philly': 'Philadelphia, PA',
    'phl': 'Philadelphia, PA',
    'vegas': 'Las Vegas, NV',
    'las': 'Las Vegas, NV',
    'mia': 'Miami, FL',
    'msp': 'Minneapolis, MN',
    'dtw': 'Detroit, MI',
    'slc': 'Salt Lake City, UT',
    'pit': 'Pittsburgh, PA',
    'clt': 'Charlotte, NC',
    'rdu': 'Raleigh-Durham, NC',
    'mco': 'Orlando, FL',
    'tpa': 'Tampa, FL',
    'bna': 'Nashville, TN',

    // Canada
    'gta': 'Toronto, ON',
    'yyz': 'Toronto, ON',
    'yvr': 'Vancouver, BC',
    'yul': 'Montreal, QC',
    'yow': 'Ottawa, ON',
    'yyc': 'Calgary, AB',
    'yeg': 'Edmonton, AB',

    // UK & Europe
    'lon': 'London, England',
    'lhr': 'London, England',
    'lgw': 'London, England',
    'edi': 'Edinburgh, Scotland',
    'gla': 'Glasgow, Scotland',
    'man': 'Manchester, England',
    'bhx': 'Birmingham, England',
    'dub': 'Dublin, Leinster',
    'ber': 'Berlin, Berlin',
    'muc': 'Munich, Bavaria',
    'munchen': 'Munich, Bavaria',
    'münchen': 'Munich, Bavaria',
    'fra': 'Frankfurt, Hesse',
    'ham': 'Hamburg, Hamburg',
    'cdg': 'Paris, Île-de-France',
    'ory': 'Paris, Île-de-France',
    'ams': 'Amsterdam, North Holland',
    'zrh': 'Zurich, Zurich',
    'zürich': 'Zurich, Zurich',
    'gva': 'Geneva, Geneva',
    'arn': 'Stockholm, Stockholm',
    'cph': 'Copenhagen, Capital Region',
    'osl': 'Oslo, Oslo',
    'hel': 'Helsinki, Uusimaa',
    'bru': 'Brussels, Brussels',
    'mad': 'Madrid, Madrid',
    'bcn': 'Barcelona, Catalonia',
    'mxp': 'Milan, Lombardy',
    'fco': 'Rome, Lazio',
    'vie': 'Vienna, Vienna',
    'waw': 'Warsaw, Masovia',
    'prg': 'Prague, Prague',
    'bud': 'Budapest, Central Hungary',
    'lis': 'Lisbon, Lisbon',

    // Asia-Pacific & Others
    'syd': 'Sydney, NSW',
    'mel': 'Melbourne, VIC',
    'bne': 'Brisbane, QLD',
    'per': 'Perth, WA',
    'akl': 'Auckland, Auckland',
    'sin': 'Singapore, Singapore',
    'tyo': 'Tokyo, Tokyo',
    'hnd': 'Tokyo, Tokyo',
    'nrt': 'Tokyo, Tokyo',
    'kix': 'Osaka, Osaka',
    'icn': 'Seoul, Seoul',
    'hkg': 'Hong Kong, Hong Kong',
    'tpe': 'Taipei, Taipei',
    'bkk': 'Bangkok, Bangkok',
    'kul': 'Kuala Lumpur, Federal Territory',
    'cgk': 'Jakarta, Jakarta',
    'mnl': 'Manila, Metro Manila',
    'dxb': 'Dubai, Dubai',
    'auh': 'Abu Dhabi, Abu Dhabi',
    'doh': 'Doha, Doha',
    'ruh': 'Riyadh, Riyadh Province',
    'tlv': 'Tel Aviv, Tel Aviv District',
    'sao': 'São Paulo, São Paulo',
    'gru': 'São Paulo, São Paulo',
    'mex': 'Mexico City, CDMX',
    'eze': 'Buenos Aires, Buenos Aires'
});

/** State and province abbreviation mappings for ranking tier-1 cities. */
export const STATE_ABBREVIATIONS = Object.freeze({
    'california': 'ca',
    'texas': 'tx',
    'new york': 'ny',
    'florida': 'fl',
    'washington': 'wa',
    'illinois': 'il',
    'massachusetts': 'ma',
    'colorado': 'co',
    'georgia': 'ga',
    'pennsylvania': 'pa',
    'arizona': 'az',
    'oregon': 'or',
    'north carolina': 'nc',
    'michigan': 'mi',
    'utah': 'ut',
    'tennessee': 'tn',
    'nevada': 'nv',
    'indiana': 'in',
    'ohio': 'oh',
    'missouri': 'mo',
    'maryland': 'md',
    'ontario': 'on',
    'british columbia': 'bc',
    'quebec': 'qc',
    'alberta': 'ab',
    'manitoba': 'mb',
    'nova scotia': 'ns',
    'england': 'england',
    'scotland': 'scotland'
});

const NON_ALNUM = /[^a-z0-9]/g;
const TOKEN_SPLIT = /[\s(/,-]+/;

/** Acronyms we never want clobbered to "Aws" / "Sql" / "Hr". */
const ACRONYMS = new Set([
    'AI', 'ML', 'QA', 'QC', 'UI', 'UX', 'HR', 'IT', 'SQL', 'AWS', 'GCP', 'API', 'CI', 'CD', 'SRE',
    'CRM', 'ERP', 'SEO', 'SEM', 'PPC', 'KPI', 'OKR', 'ETL', 'ELT', 'NLP', 'NLU', 'BI', 'DB', 'OS',
    'IoT', 'SaaS', 'PaaS', 'IaaS', 'RPA', 'VP', 'CEO', 'CTO', 'CFO', 'COO', 'CIO', 'CMO', 'CRO',
    'CHRO', 'PM', 'EM', 'SDK', 'IDE', 'CDN', 'DNS', 'HTTP', 'HTTPS', 'TCP', 'UDP', 'IP', 'SSO',
    'RBAC', 'SOC', 'IAM', 'VPN', 'GPU', 'CPU', 'RAM', 'SSD', 'REST', 'SOAP', 'JSON', 'XML',
    'YAML', 'CSV', 'MDM', 'CMS', 'WMS', 'TMS', 'LMS', 'ATS', 'CPQ', 'BPM', 'OCR', 'ASR', 'TTS',
    'CV', 'GAN', 'RNN', 'CNN', 'LSTM', 'RL', 'PCA', 'SVM', 'AR', 'VR', 'XR', 'NFT', 'IPO',
    'B2B', 'B2C', 'D2C', 'ROI', 'ROAS', 'CTR', 'CPC', 'CPM', 'CAC', 'LTV', 'ARPU', 'MRR', 'ARR',
    'GMV', 'TDD', 'BDD', 'DDD', 'OOP', 'MVC', 'MVVM', 'MVP', 'CRUD', 'ACID', 'CAP', 'FTP', 'SSH',
    'TLS', 'SSL', 'JWT', 'OAuth', 'SAML', 'LDAP', 'AD', 'ACL', 'DLP', 'SIEM', 'SOAR', 'EDR',
    'XDR', 'MDR', 'IDS', 'IPS', 'WAF', 'DDoS', 'APT', 'CVE', 'CVSS', 'HIPAA', 'GDPR', 'CCPA',
    'PCI', 'FERPA', 'SOX', 'GLBA', 'ISO', 'NIST', 'FISMA', 'MBA', 'EMBA', 'PMP', 'CPA', 'CFA', 'FRM', 'CMA',
    'FAA', 'OSHA', 'AICPA', 'CBIT', 'JNTU', 'BITS', 'NIT', 'IIT', 'IIM',
    'AIIMS', 'AIMMS', 'PGIMER', 'JIPMER', 'NIMHANS', 'CMC', 'KGMU', 'KMC'
]);
const ACRONYM_LOOKUP = new Map();
for (const a of ACRONYMS) ACRONYM_LOOKUP.set(a.toLowerCase(), a);

/** Seniority words that should never be duplicated or required in filtering. */
const SENIORITY_WORDS = new Set([
    'senior', 'sr', 'lead', 'principal', 'staff', 'junior', 'jr', 'associate',
    'chief', 'head', 'deputy', 'assistant', 'master', 'graduate', 'entry',
    'intern', 'vp', 'vice', 'president', 'director', 'of', 'executive'
]);
const SENIORITY_PREFIX = /^(?:(?:senior|sr\.?|lead|principal|staff|junior|jr\.?|associate|chief|head|deputy|assistant|master|graduate|entry[- ]level|intern|vp|vice president|executive|director of)\s+)+/i;

/** Words that already act as a role suffix — don't append "Specialist" to "X Manager". */
const ROLE_SUFFIX_WORD = /\b(?:manager|specialist|consultant|coordinator|director|engineer|developer|analyst|designer|architect|technician|administrator|officer|scientist|researcher|lead|associate|assistant|executive|president|owner|founder|partner|practitioner|strategist|operator|supervisor|foreman|inspector|writer|editor|artist|animator|producer|planner|therapist|nurse|physician|surgeon|chef|pilot|attorney|lawyer|paralegal|accountant|auditor|recruiter|marketer)\s*$/i;

/** Known role headwords. Any token in a query that is a ≥3-char prefix of one of these counts as "role-shaped". */
const ROLE_WORDS = Object.freeze([
    'engineer', 'developer', 'programmer', 'manager', 'analyst', 'designer', 'architect',
    'specialist', 'consultant', 'technician', 'coordinator', 'director', 'administrator',
    'officer', 'scientist', 'researcher', 'lead', 'nurse', 'doctor', 'physician', 'surgeon',
    'therapist', 'teacher', 'professor', 'chef', 'pilot', 'attorney', 'lawyer', 'paralegal',
    'accountant', 'auditor', 'recruiter', 'marketer', 'writer', 'editor', 'artist', 'animator',
    'producer', 'planner', 'supervisor', 'foreman', 'inspector', 'mechanic', 'electrician',
    'plumber', 'carpenter', 'welder', 'technologist', 'strategist', 'operator', 'practitioner',
    'dentist', 'pharmacist', 'paramedic', 'librarian', 'translator', 'interpreter'
]);

/** Strong professional endings — used as a fallback shape detector. */
const ROLE_SUFFIX_RE = /(?:ologist|iatrician|ician|ographer|icist|arian)$/i;

/** Title-case with acronym + mixed-case preservation. Never mutates user letters blindly. */
function smartTitleCase(input) {
    if (!input) return '';
    const words = String(input).trim().split(/\s+/);
    const out = new Array(words.length);
    for (let i = 0; i < words.length; i++) {
        const w = words[i];
        if (!w) { out[i] = ''; continue; }
        const lower = w.toLowerCase();
        if (ACRONYM_LOOKUP.has(lower)) { out[i] = ACRONYM_LOOKUP.get(lower); continue; }
        // Preserve intentional mixed case (iOS, iPhone, JavaScript, McDonald's)
        if (/[a-z]/.test(w) && /[A-Z]/.test(w)) { out[i] = w; continue; }
        // Preserve short all-caps tokens we don't know about
        if (w.length <= 6 && w === w.toUpperCase() && /[A-Z]/.test(w)) { out[i] = w; continue; }
        out[i] = w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
    }
    return out.join(' ');
}

/** Case-insensitive de-duplication that preserves first-seen casing. */
function dedupe(list) {
    const seen = new Set();
    const out = [];
    for (const raw of list) {
        const s = String(raw == null ? '' : raw).trim();
        if (!s) continue;
        const k = s.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(s);
    }
    return out;
}

/** True when the query *could plausibly* be a job title. Guards against "asdf" synthesis. */
function looksLikeRoleQuery(qLower) {
    const tokens = qLower.split(/\s+/).filter(t => t.length >= 3);
    if (!tokens.length) return false;
    for (const t of tokens) {
        if (SENIORITY_WORDS.has(t)) continue;
        for (const rw of ROLE_WORDS) {
            if (rw.startsWith(t)) return true;
        }
        if (ROLE_SUFFIX_RE.test(t)) return true;
    }
    return false;
}

// ============================================================================
// 3. DOMAIN-AWARE ROLE EXPANSIONS
//    All patterns use \b so /ai/ no longer matches "Thai", /tax/ no longer
//    matches "syntax", etc. Each entry maps a domain keyword → curated titles.
// ============================================================================

const DOMAIN_ROLE_EXPANSIONS = Object.freeze([
    { pattern: /\b(?:soft|software)\b/i, roles: ['Software Engineer', 'Senior Software Engineer', 'Lead Software Engineer', 'Principal Software Engineer', 'Software Developer', 'Senior Software Developer', 'Software Architect', 'Software Engineering Manager', 'Embedded Software Engineer', 'Software QA Engineer'] },
    { pattern: /\bfront[\s-]?end\b/i, roles: ['Frontend Developer', 'Senior Frontend Developer', 'Frontend Engineer', 'Senior Frontend Engineer', 'Lead Frontend Developer', 'Staff Frontend Engineer', 'UI Frontend Specialist', 'React Frontend Developer'] },
    { pattern: /\bback[\s-]?end\b/i, roles: ['Backend Engineer', 'Senior Backend Engineer', 'Backend Developer', 'Senior Backend Developer', 'Lead Backend Engineer', 'Staff Backend Engineer', 'Cloud Backend Architect', 'Node.js Backend Developer'] },
    { pattern: /\bfull[\s-]?stack\b/i, roles: ['Full Stack Developer', 'Senior Full Stack Developer', 'Full Stack Engineer', 'Senior Full Stack Engineer', 'Lead Full Stack Engineer', 'Staff Full Stack Engineer', 'Full Stack Web Developer'] },
    { pattern: /\bdata\b/i, roles: ['Data Analyst', 'Senior Data Analyst', 'Data Scientist', 'Senior Data Scientist', 'Data Engineer', 'Senior Data Engineer', 'Big Data Architect', 'Business Intelligence Analyst', 'Database Administrator (DBA)'] },
    { pattern: /\b(?:doctor|physician|surgeon|medical)\w*\b/i, roles: ['Doctor (General Practitioner)', 'Medical Doctor (MD)', 'Family Medicine Doctor', 'Resident Doctor', 'Attending Physician', 'Physician', 'Internal Medicine Physician', 'Physician Assistant (PA)', 'General Surgeon', 'Orthopedic Surgeon'] },
    { pattern: /\bnurse|nursing\b/i, roles: ['Registered Nurse (RN)', 'Nurse Practitioner (NP)', 'Critical Care Registered Nurse (CCRN)', 'Emergency Room Nurse (ER RN)', 'Charge Nurse', 'Pediatric Nurse', 'Clinical Nurse Specialist (CNS)', 'Nurse Manager', 'Surgical Nurse', 'Staff Nurse'] },
    { pattern: /\bteach\w*\b/i, roles: ['Teacher', 'High School Teacher', 'Elementary School Teacher', 'Middle School Teacher', 'Special Education Teacher', 'STEM Teacher', 'Lead Science Teacher', 'ESL Teacher', 'Instructional Coach', 'Substitute Teacher'] },
    { pattern: /\bplumb\w*\b/i, roles: ['Licensed Master Plumber', 'Journeyman Plumber', 'Commercial Plumber', 'Residential Service Plumber', 'Plumbing Contractor', 'Plumbing Inspector', 'Pipefitter', 'Service Plumber'] },
    { pattern: /\b(?:law|lawyer|attorn)\w*\b/i, roles: ['Corporate Lawyer', 'Litigation Lawyer', 'Associate Lawyer', 'Criminal Defense Lawyer', 'Trial Lawyer', 'Family Lawyer', 'Immigration Lawyer', 'Intellectual Property Lawyer', 'Staff Lawyer', 'General Counsel', 'Attorney at Law', 'Staff Attorney', 'Law Clerk'] },
    { pattern: /\bpilot\w*\b/i, roles: ['Commercial Airline Pilot', 'Airline Transport Pilot (ATP)', 'First Officer Pilot', 'Airline Captain', 'Flight Instructor (CFI)', 'Corporate Jet Pilot', 'Helicopter Pilot', 'Cargo Pilot'] },
    { pattern: /\b(?:aero|aviat)\w*\b/i, roles: ['Aerospace Engineer', 'Aeronautical Systems Specialist', 'Aerodynamics Engineer', 'Avionics Technician', 'Flight Test Engineer', 'Aerospace Project Manager', 'Aviation Safety Specialist'] },
    { pattern: /\belec\w*\b/i, roles: ['Master Electrician', 'Journeyman Electrician', 'Industrial Electrician', 'Commercial Electrician', 'Electrical Systems Technician', 'Electrical Engineer', 'Electrical Project Manager', 'Residential Electrician'] },
    { pattern: /\b(?:chef|culin)\w*\b/i, roles: ['Executive Chef', 'Sous Chef', 'Pastry Chef', 'Head Chef', 'Chef de Cuisine', 'Private Chef', 'Line Cook', 'Catering Chef', 'Chef de Partie'] },
    { pattern: /\b(?:accountant|accounting|accountancy)\b/i, roles: ['Senior Accountant', 'Staff Accountant', 'Certified Public Accountant (CPA)', 'Accounting Manager', 'Cost Accountant', 'Forensic Accountant', 'Tax Accountant', 'Corporate Controller', 'Financial Analyst'] },
    { pattern: /\bcivil\b/i, roles: ['Civil Engineer', 'Senior Civil Engineer', 'Civil Project Manager', 'Civil Design Engineer', 'Structural Civil Engineer', 'Transportation Civil Engineer', 'Water Resources Civil Engineer'] },
    { pattern: /\bmech\w*\b/i, roles: ['Mechanical Engineer', 'Senior Mechanical Engineer', 'Mechanical Design Engineer', 'Electromechanical Engineer', 'HVAC Mechanical Engineer', 'Robotics Mechanical Engineer', 'Master Automotive Mechanic'] },
    { pattern: /\bproduct\b/i, roles: ['Product Manager', 'Senior Product Manager', 'Lead Product Manager', 'Principal Product Manager', 'Director of Product Management', 'Technical Product Manager', 'Product Marketing Manager (PMM)', 'Associate Product Manager (APM)'] },
    { pattern: /\bproject\b/i, roles: ['Project Manager', 'Senior Project Manager', 'Technical Project Manager', 'IT Project Manager', 'PMP Certified Project Manager', 'Agile Project Manager', 'Construction Project Manager', 'Project Coordinator'] },
    { pattern: /\bsales\b/i, roles: ['Sales Representative', 'Sales Development Representative (SDR)', 'Business Development Representative (BDR)', 'Account Executive (AE)', 'Senior Account Executive', 'Enterprise Sales Director', 'Sales Manager', 'Inside Sales Representative'] },
    { pattern: /\bmarket\w*\b/i, roles: ['Marketing Specialist', 'Digital Marketing Specialist', 'Digital Marketing Manager', 'Growth Marketing Lead', 'Performance Marketing Specialist', 'SEO & Content Specialist', 'Brand Marketing Manager', 'Product Marketing Manager (PMM)'] },
    { pattern: /\b(?:qa|test|tester)\b/i, roles: ['QA Automation Engineer', 'Senior QA Automation Engineer', 'QA Engineer', 'Software Test Engineer', 'Quality Assurance Specialist', 'Lead QA Automation Engineer', 'SDET (Software Development Engineer in Test)', 'Software QA Tester'] },
    { pattern: /\b(?:dev|developer|devops)\b/i, roles: ['DevOps Engineer', 'Developer (Software)', 'Full Stack Developer', 'Frontend Developer', 'Backend Developer', 'Mobile App Developer', 'Cloud Developer', 'Software Developer'] },
    { pattern: /\bcloud\b/i, roles: ['Cloud Solutions Architect', 'Senior Cloud Solutions Architect', 'Cloud Infrastructure Engineer', 'Cloud Security Architect', 'Cloud DevOps Engineer', 'AWS Cloud Architect', 'Azure Cloud Engineer'] },
    { pattern: /\b(?:cyber|security|secur)\w*\b/i, roles: ['Cybersecurity Analyst', 'Senior Cybersecurity Analyst', 'Cybersecurity Engineer', 'Information Security Officer (CISO)', 'Penetration Tester', 'SOC Analyst', 'Cloud Security Architect', 'Application Security Engineer'] },
    { pattern: /\brobot\w*\b/i, roles: ['Robotics Engineer', 'Senior Robotics Engineer', 'Robotics Software Developer', 'Robotics Systems Specialist', 'Automation & Robotics Technician', 'Lead Robotics Architect'] },
    { pattern: /\bsolar\b/i, roles: ['Solar Installation Technician', 'Solar Energy Engineer', 'Solar Project Manager', 'Commercial Solar Specialist', 'Renewable Energy Consultant', 'Solar Systems Designer'] },
    { pattern: /\b(?:ai|machine)\b/i, roles: ['Machine Learning Engineer', 'AI Engineer', 'AI Research Scientist', 'Senior Machine Learning Engineer', 'MLOps Engineer', 'Deep Learning Specialist', 'Generative AI Specialist', 'NLP Engineer'] },
    { pattern: /\bdent\w*\b/i, roles: ['General Dentist', 'Doctor of Dental Surgery (DDS)', 'Dental Hygienist', 'Dental Assistant', 'Orthodontist', 'Periodontist', 'Dental Practice Manager'] },
    { pattern: /\bpharma\w*\b/i, roles: ['Clinical Pharmacist', 'Staff Pharmacist', 'Pharmacy Technician', 'Director of Pharmacy', 'Hospital Pharmacist', 'Retail Pharmacist', 'Pharmacologist'] },
    { pattern: /\bsurg\w*\b/i, roles: ['General Surgeon', 'Orthopedic Surgeon', 'Cardiothoracic Surgeon', 'Neurosurgeon', 'Trauma Surgeon', 'Surgical Technologist', 'Operating Room Nurse'] },
    { pattern: /\banim\w*\b/i, roles: ['3D Animator', 'Character Animator', 'Motion Graphics Animator', '2D Animator', 'Lead Technical Animator'] },
    { pattern: /\bvideo\b/i, roles: ['Video Editor', 'Video Producer', 'Videographer', 'Post-Production Specialist', 'Senior Motion Video Lead'] },
    { pattern: /\b(?:hr|talent)\b/i, roles: ['Human Resources Manager', 'HR Generalist', 'HR Business Partner (HRBP)', 'Director of Human Resources', 'Talent Acquisition Specialist', 'Senior Technical Recruiter'] },
    { pattern: /\b(?:logist|supply)\w*\b/i, roles: ['Logistics Coordinator', 'Logistics Manager', 'Supply Chain Analyst', 'Supply Chain Manager', 'Warehouse Operations Manager', 'Fleet Manager'] },
    { pattern: /\b(?:strat|consult)\w*\b/i, roles: ['Management Consultant', 'Strategy Consultant', 'Business Analyst', 'Senior Business Analyst', 'Strategic Operations Manager'] },
    { pattern: /\bcardio\w*\b/i, roles: ['Cardiologist', 'Cardiology Fellow', 'Cardiovascular Technologist', 'Cardiothoracic Surgeon', 'Cardiac Nurse Practitioner', 'Director of Cardiology'] },
    { pattern: /\bneuro\w*\b/i, roles: ['Neurologist', 'Neurosurgeon', 'Neuroscience Researcher', 'Neurointensive Care Nurse', 'Neurology Physician Assistant'] },
    { pattern: /\bpediat\w*\b/i, roles: ['Pediatrician', 'Pediatric Nurse', 'Pediatric Surgeon', 'Pediatric Intensive Care Specialist', 'Pediatric Nurse Practitioner'] },
    { pattern: /\bflight\b/i, roles: ['Flight Attendant', 'Flight Instructor (CFI)', 'Flight Operations Manager', 'Flight Dispatcher', 'Flight Test Engineer'] },
    { pattern: /\bweld\w*\b/i, roles: ['Certified Welder', 'Pipe Welder', 'Structural Welder', 'MIG / TIG Welder', 'Welding Inspector (CWI)'] },
    { pattern: /\bhvac\b/i, roles: ['HVAC Service Technician', 'Commercial HVAC Specialist', 'HVAC Installation Lead', 'Refrigeration & HVAC Mechanic'] },
    { pattern: /\bcarp\w*\b/i, roles: ['Master Carpenter', 'Framing Carpenter', 'Finish Carpenter', 'Cabinet Maker', 'Carpentry Foreman'] },
    { pattern: /\bmachin\w*\b/i, roles: ['CNC Machinist', 'Precision Machinist', 'Tool & Die Maker', 'Manual Machinist', 'CNC Programmer'] },
    { pattern: /\bparal\w*\b/i, roles: ['Senior Paralegal', 'Litigation Paralegal', 'Corporate Paralegal', 'Certified Paralegal (CP)', 'Intellectual Property Paralegal'] },
    { pattern: /\baudit\w*\b/i, roles: ['Internal Auditor', 'Senior Auditor', 'Lead Quality Auditor', 'IT Audit Specialist', 'Financial Auditor'] },
    { pattern: /\btax\b/i, roles: ['Tax Accountant', 'Senior Tax Manager', 'Tax Consultant', 'International Tax Specialist', 'Tax Analyst'] },
    { pattern: /\bactua\w*\b/i, roles: ['Actuarial Analyst', 'Associate Actuary', 'Senior Consulting Actuary', 'Life & Health Actuary', 'Pricing Actuary'] },
    { pattern: /\bbank\w*\b/i, roles: ['Investment Banking Analyst', 'Commercial Banking Officer', 'Branch Banking Manager', 'Credit Analyst', 'Private Banker'] },
    { pattern: /\bstruct\w*\b/i, roles: ['Structural Engineer', 'Senior Structural Designer', 'Structural Project Engineer', 'Bridge Structural Engineer'] },
    { pattern: /\barchit\w*\b/i, roles: ['Architectural Designer', 'Licensed Architect', 'Project Architect', 'Enterprise Architect', 'Landscape Architect'] },
    { pattern: /\bprof\w*\b/i, roles: ['Assistant Professor', 'Associate Professor', 'Adjunct Professor', 'Distinguished Professor', 'Research Professor'] },
    { pattern: /\bart\b/i, roles: ['Art Director', 'Concept Artist', 'Storyboard Artist', 'Technical Artist', 'Digital Artist', 'Visual Development Artist'] },
    { pattern: /\bkube\w*\b/i, roles: ['Kubernetes Administrator', 'Kubernetes Platform Engineer', 'DevOps Engineer (Kubernetes)', 'Cloud Infrastructure Engineer (K8s)'] },
    { pattern: /\bpyth\w*\b/i, roles: ['Python Developer', 'Senior Python Engineer', 'Python Data Engineer', 'Python Backend Developer', 'Machine Learning Engineer (Python)'] },
    { pattern: /\breact\b/i, roles: ['React Developer', 'Senior React.js Engineer', 'React Native Developer', 'Frontend Engineer (React)', 'Full Stack React / Node Engineer'] },
    { pattern: /\bonco\w*\b/i, roles: ['Medical Oncologist', 'Radiation Oncologist', 'Surgical Oncologist', 'Hematologist-Oncologist', 'Pediatric Oncologist', 'Clinical Oncologist', 'Gynecologic Oncologist', 'Consultant Oncologist'] }
]);

// ============================================================================
// 4. INDEX CACHE + MATCHER
// ============================================================================

const INDEX_CACHE = new WeakMap();

function buildIndex(dataset) {
    const n = dataset.length;
    const lower = new Array(n);
    const tokens = new Array(n);
    const stripped = new Array(n);
    for (let i = 0; i < n; i++) {
        const s = dataset[i];
        const l = stripDiacritics(String(s).toLowerCase());
        lower[i] = l;
        tokens[i] = l.split(TOKEN_SPLIT).filter(Boolean);
        stripped[i] = l.replace(NON_ALNUM, '');
    }
    return { lower, tokens, stripped };
}

function getIndex(dataset) {
    let idx = INDEX_CACHE.get(dataset);
    if (!idx) {
        idx = buildIndex(dataset);
        INDEX_CACHE.set(dataset, idx);
    }
    return idx;
}

/**
 * Fast Levenshtein distance with early exit threshold for typo detection.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshteinDistance(a, b) {
    if (a === b) return 0;
    const la = a.length, lb = b.length;
    if (!la) return lb;
    if (!lb) return la;
    if (Math.abs(la - lb) > 2) return 999;
    const v0 = new Array(lb + 1);
    const v1 = new Array(lb + 1);
    for (let i = 0; i <= lb; i++) v0[i] = i;
    for (let i = 0; i < la; i++) {
        v1[0] = i + 1;
        for (let j = 0; j < lb; j++) {
            const cost = a[i] === b[j] ? 0 : 1;
            v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost);
        }
        for (let j = 0; j <= lb; j++) v0[j] = v1[j];
    }
    return v1[lb];
}

/**
 * Checks whether candidate matches query, including typo tolerance / spell check.
 * @param {string} candidateStr
 * @param {string} queryStr
 * @returns {boolean}
 */
export function isTypoMatch(candidateStr, queryStr) {
    if (!candidateStr || !queryStr) return false;
    const itemLower = stripDiacritics(String(candidateStr).toLowerCase());
    const cleanQ = stripDiacritics(String(queryStr).trim().toLowerCase());
    if (!cleanQ) return false;
    if (itemLower.includes(cleanQ)) return true;

    // Check city alias target match (e.g. candidate="Visakhapatnam, Andhra Pradesh", query="vizag")
    const aliasTarget = CITY_ALIASES[cleanQ];
    if (aliasTarget) {
        const targetCityLower = stripDiacritics(aliasTarget.toLowerCase().split(',')[0].trim());
        if (itemLower.includes(targetCityLower)) return true;
    }

    // Check state abbreviation expansion (e.g. query="california" matches "San Francisco, CA")
    const stateAbbr = STATE_ABBREVIATIONS[cleanQ];
    if (stateAbbr && (itemLower.endsWith(`, ${stateAbbr}`) || itemLower.includes(`, ${stateAbbr}`))) {
        return true;
    }

    const itemStripped = itemLower.replace(/[^a-z0-9]/g, '');
    const cleanQStripped = cleanQ.replace(/[^a-z0-9]/g, '');
    if (cleanQStripped.length >= 2 && itemStripped.includes(cleanQStripped)) return true;

    const itemTokens = itemLower.split(/[\s,./()\-]+/).filter(Boolean);
    const qTokens = cleanQ.split(/[\s,./()\-]+/).filter(Boolean);
    if (!qTokens.length) return false;

    return qTokens.every(qTok => {
        if (qTok.length < 3) return itemTokens.some(iTok => iTok.startsWith(qTok));
        return itemTokens.some(iTok => {
            if (iTok.includes(qTok) || iTok.startsWith(qTok)) return true;
            const maxDist = qTok.length <= 4 ? 1 : 2;
            return Math.abs(qTok.length - iTok.length) <= maxDist && levenshteinDistance(qTok, iTok) <= maxDist;
        });
    });
}

/**
 * Domain-specific dictionary words across healthcare, education, engineering, and business.
 */
export const DOMAIN_KEYWORDS = Object.freeze([
    // Healthcare & Medical
    'hospital', 'hospitals', 'clinic', 'clinics', 'infirmary', 'medical', 'medicine',
    'health', 'healthcare', 'center', 'centre', 'care', 'pharma', 'pharmacy', 'foundation',
    'physician', 'doctor', 'nurse', 'nursing', 'oncologist', 'oncology', 'cardiology',
    'cardiologist', 'radiology', 'radiologist', 'pediatric', 'pediatrician', 'neurology',
    'neurologist', 'nephrology', 'nephrologist', 'surgeon', 'surgery', 'dentist', 'dental',
    'therapist', 'psychologist', 'psychiatrist', 'pathology', 'pathologist', 'anesthesiology',
    'anesthesiologist', 'dermatology', 'dermatologist', 'gastroenterology', 'gastroenterologist',
    'pulmonology', 'pulmonologist', 'endocrinology', 'endocrinologist', 'hematology', 'hematologist',
    'rheumatology', 'rheumatologist', 'urology', 'urologist', 'ophthalmology', 'ophthalmologist',
    // Education & Academia
    'aiims', 'aimms',
    'university', 'universities', 'college', 'colleges', 'school', 'schools', 'academy',
    'institute', 'institutes', 'institution', 'institutions', 'polytechnic', 'campus',
    // Engineering & Tech
    'engineer', 'engineers', 'engineering', 'developer', 'developers', 'development',
    'software', 'hardware', 'frontend', 'backend', 'fullstack', 'devops', 'architect',
    'architecture', 'technologies', 'technology', 'solutions', 'systems', 'analyst',
    'analytics', 'data', 'cloud', 'security', 'cybersecurity', 'infrastructure',
    // Business & Management
    'manager', 'managers', 'management', 'director', 'directors', 'specialist', 'specialists',
    'consultant', 'consultants', 'consulting', 'administrator', 'executive', 'officer',
    'lead', 'leader', 'leadership', 'associate', 'associates', 'partner', 'partners',
    'accountant', 'accountants', 'accounting', 'auditor', 'finance', 'financial',
    'enterprises', 'enterprise', 'corporation', 'corporate', 'company', 'companies',
    'group', 'global', 'international', 'services', 'logistics', 'operations',
    // Key Cities, Metros & Aliases (for auto-correcting typos like "gaziabad" -> "ghaziabad")
    'ghaziabad', 'faridabad', 'noida', 'gurgaon', 'gurugram', 'hyderabad', 'bangalore',
    'bengaluru', 'mumbai', 'chennai', 'kolkata', 'pune', 'ahmedabad', 'jaipur', 'lucknow',
    'kanpur', 'chandigarh', 'indore', 'bhopal', 'nagpur', 'patna', 'vadodara', 'surat',
    'visakhapatnam', 'vijayawada', 'tirupati', 'warangal', 'mysore', 'mysuru', 'mangalore',
    'mangaluru', 'thiruvananthapuram', 'trivandrum', 'kochi', 'cochin', 'calicut', 'kozhikode',
    'coimbatore', 'madurai', 'varanasi', 'prayagraj', 'allahabad', 'agra', 'amritsar',
    'nashik', 'thane', 'aurangabad', 'dehradun', 'ranchi', 'jamshedpur', 'bhubaneswar',
    'guwahati', 'secunderabad', 'puducherry', 'pondicherry', 'bombay', 'calcutta', 'madras',
    'baroda', 'vizag'
]);

const EXPLICIT_AUTOCORRECT = Object.freeze({
    'aimms': 'aiims',
    'aaiims': 'aiims',
    'standford': 'stanford',
    'harvad': 'harvard',
    'harvrd': 'harvard',
    'caltec': 'caltech',
    'oxfrd': 'oxford',
    'cambrdge': 'cambridge',
    'priceton': 'princeton',
    'colubia': 'columbia',
    'berkely': 'berkeley',
});

/**
 * Autocorrects words in a user query if they are within a small edit distance
 * (<= 2) of recognized domain keywords.
 * E.g., "histitals" -> "hospitals", "enginer" -> "engineer", "acountant" -> "accountant", "aimms" -> "aiims".
 *
 * @param {string} rawQuery
 * @returns {string}
 */
export function autocorrectQuery(rawQuery) {
    if (!rawQuery || typeof rawQuery !== 'string') return rawQuery;
    const cleanLower = rawQuery.trim().toLowerCase();
    if (EXPLICIT_AUTOCORRECT[cleanLower]) {
        const target = EXPLICIT_AUTOCORRECT[cleanLower];
        if (rawQuery === rawQuery.toUpperCase()) return target.toUpperCase();
        if (rawQuery[0] === rawQuery[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1);
        return target;
    }

    const tokens = rawQuery.trim().split(/\s+/);
    if (!tokens.length) return rawQuery;

    const correctedTokens = tokens.map(tok => {
        const clean = tok.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (EXPLICIT_AUTOCORRECT[clean]) {
            const target = EXPLICIT_AUTOCORRECT[clean];
            if (tok === tok.toUpperCase()) return target.toUpperCase();
            if (tok[0] === tok[0].toUpperCase()) return target[0].toUpperCase() + target.slice(1);
            return target;
        }
        if (clean.length < 4) return tok;

        let bestWord = tok;
        let bestDist = 999;
        for (let i = 0; i < DOMAIN_KEYWORDS.length; i++) {
            const kw = DOMAIN_KEYWORDS[i];
            if (clean === kw) return tok;
            if (clean.endsWith('ologist') && kw.endsWith('ologist') && clean !== kw) {
                continue;
            }
            if (clean.endsWith('ology') && kw.endsWith('ology') && clean !== kw) {
                continue;
            }
            const maxD = clean.length <= 5 ? 1 : 2;
            if (Math.abs(clean.length - kw.length) <= maxD) {
                const d = levenshteinDistance(clean, kw);
                if (d <= maxD && d < bestDist) {
                    bestDist = d;
                    if (tok[0] === tok[0].toUpperCase()) {
                        bestWord = kw[0].toUpperCase() + kw.slice(1);
                    } else {
                        bestWord = kw;
                    }
                }
            }
        }
        return bestWord;
    });

    return correctedTokens.join(' ');
}

/** Rank a single item against the query. Higher score = better. Shorter = tiebreak. */
function scoreItem(itemLower, itemTokens, itemStripped, q, qStripped, qTokens) {
    const lenPenalty = Math.min(itemLower.length, 50);

    if (itemLower === q) return 1000 - lenPenalty;
    if (itemLower.startsWith(q)) return 800 - lenPenalty;

    // word-prefix ("engineer" should match "Senior Software Engineer")
    for (let i = 0; i < itemTokens.length; i++) {
        if (itemTokens[i].startsWith(q)) return 600 - lenPenalty;
    }

    if (q.length >= 3 && itemLower.includes(q)) return 400 - lenPenalty;
    if (qStripped.length >= 3 && itemStripped.includes(qStripped)) return 200 - lenPenalty;

    // State abbreviation expansion (e.g. "california" should match "San Francisco, CA")
    const stateAbbr = STATE_ABBREVIATIONS[q];
    if (stateAbbr && (itemLower.endsWith(`, ${stateAbbr}`) || itemTokens.includes(stateAbbr))) {
        return 550 - lenPenalty;
    }

    // Typo-tolerant / spell-check distance match
    if (qTokens && qTokens.length > 0) {
        let allMatched = true;
        let totalDist = 0;
        for (let j = 0; j < qTokens.length; j++) {
            const qTok = qTokens[j];
            let tokenMatched = false;
            let bestTokenDist = 999;
            for (let i = 0; i < itemTokens.length; i++) {
                const iTok = itemTokens[i];
                if (iTok.startsWith(qTok) || iTok.includes(qTok)) {
                    tokenMatched = true;
                    bestTokenDist = 0;
                    break;
                }
                if (qTok.length >= 3 && iTok.length >= 3) {
                    const maxDist = qTok.length <= 4 ? 1 : 2;
                    if (Math.abs(qTok.length - iTok.length) <= maxDist) {
                        const d = levenshteinDistance(qTok, iTok);
                        if (d <= maxDist && d < bestTokenDist) {
                            bestTokenDist = d;
                            tokenMatched = true;
                        }
                    }
                }
            }
            if (!tokenMatched) {
                allMatched = false;
                break;
            }
            totalDist += bestTokenDist;
        }
        if (allMatched) {
            return Math.max(50, 180 - totalDist * 40) - lenPenalty;
        }
    }

    return 0;
}

/** Ranked dataset search. No regex is ever built from the query. */
function findMatches(dataset, rawQuery, maxResults) {
    const q = stripDiacritics(String(rawQuery || '').trim().toLowerCase());
    if (!q) return [];

    const qStripped = q.replace(NON_ALNUM, '');
    const qTokens = q.split(/[\s,./()\-]+/).filter(Boolean);
    const { lower, tokens, stripped } = getIndex(dataset);
    const n = dataset.length;

    const scored = [];
    for (let i = 0; i < n; i++) {
        const s = scoreItem(lower[i], tokens[i], stripped[i], q, qStripped, qTokens);
        if (s > 0) scored.push({ i, s });
    }
    if (!scored.length) return [];

    scored.sort((a, b) => b.s - a.s);
    const take = Math.min(maxResults, scored.length);
    const out = new Array(take);
    for (let k = 0; k < take; k++) out[k] = dataset[scored[k].i];
    return out;
}

// ============================================================================
// 5. SYNTHESIS (job titles, skills, hobbies, degrees, certs, companies, schools)
// ============================================================================

function synthesizeJobTitles(query, maxResults) {
    const q = query.trim();
    if (q.length < 2) return [];

    const qLower = q.toLowerCase();
    const base = smartTitleCase(q);

    // 1. Curated domain expansions — return curated roles untouched
    const domainHits = [];
    for (const { pattern, roles } of DOMAIN_ROLE_EXPANSIONS) {
        if (pattern.test(qLower)) domainHits.push(...roles);
    }
    if (domainHits.length) {
        return dedupe(domainHits).slice(0, maxResults);
    }

    // 2. Structural synthesis — only for role-shaped queries
    if (!looksLikeRoleQuery(qLower)) return [];

    const out = [base];
    if (!SENIORITY_PREFIX.test(q)) {
        out.push(`Senior ${base}`, `Lead ${base}`, `Principal ${base}`, `Staff ${base}`);
    }
    if (!ROLE_SUFFIX_WORD.test(base)) {
        out.push(`${base} Specialist`, `${base} Manager`, `${base} Consultant`);
    }

    // 3. Filter to results that still plausibly match the user's words
    const requiredTokens = qLower
        .split(/\s+/)
        .map(t => t.replace(NON_ALNUM, ''))
        .filter(t => t.length >= 3 && !SENIORITY_WORDS.has(t));

    const matched = out.filter(item => {
        const itemLower = item.toLowerCase();
        const itemStripped = itemLower.replace(NON_ALNUM, '');
        if (!requiredTokens.length) return itemLower.includes(qLower);
        for (const t of requiredTokens) {
            if (!itemLower.includes(t) && !itemStripped.includes(t)) return false;
        }
        return true;
    });

    return dedupe(matched).slice(0, maxResults);
}

function synthesizeSkills(query, maxResults) {
    const q = query.trim();
    if (q.length < 2) return [];
    const base = smartTitleCase(q);
    const out = [
        base,
        `Advanced ${base}`,
        `${base} Architecture`,
        `${base} Management`,
        `${base} Analysis`,
        `${base} Engineering`,
        `${base} Best Practices`,
        `${base} Optimization`,
        `${base} Troubleshooting`,
        `${base} Integration`
    ];
    return dedupe(out).slice(0, maxResults);
}

function synthesizeHobbies(query, maxResults) {
    const q = query.trim();
    if (q.length < 2) return [];
    const base = smartTitleCase(q);
    const out = [base];
    // Only synthesize natural creative/recreational phrasing, never robotic "Competitive Reading"
    if (q.length >= 3 && !/\b(?:arts?|crafts?|club|reading|writing|playing|running|hiking|swimming|cooking)\b/i.test(q)) {
        out.push(`${base} & Creative Arts`, `${base} & Recreation`);
    }
    return dedupe(out).slice(0, maxResults);
}

function synthesizeCompanies(query, maxResults) {
    const q = autocorrectQuery(query.trim());
    if (q.length < 2) return [];
    const qLower = q.toLowerCase();
    const base = smartTitleCase(q);

    // 1. Healthcare / Clinical entities: NEVER append "Technologies" or "Solutions"
    if (/\b(?:hospitals?|hospitls?|clinics?|clincs?|infirmar(?:y|ies)|medicals?|medicines?|health|healthcare|pharma|sanatorium|dispensar(?:y|ies)|care)\b/i.test(qLower)) {
        const cleanBase = base
            .replace(/\bHospitls?\b/i, 'Hospitals')
            .replace(/\bClincs?\b/i, 'Clinics')
            .replace(/\bMedicl\b/i, 'Medical')
            .replace(/\bHelth\b/i, 'Health');
        const out = [cleanBase];
        if (!/\b(?:health\s*system|medical\s*center|research|network)\b/i.test(qLower)) {
            out.push(
                `${cleanBase} & Research Centre`,
                `${cleanBase} Health System`,
                `${cleanBase} Medical Center`,
                `${cleanBase} Healthcare Network`
            );
        }
        return dedupe(out).slice(0, maxResults);
    }

    // 2. Academic / Educational entities: NEVER append corporate tech suffixes
    if (/\b(?:school|university|college|academy|institute|institution|polytechnic|campus)\b/i.test(qLower)) {
        return [base];
    }

    // 3. Already has an organizational or business suffix: NEVER duplicate
    if (/\b(?:technologies|technology|tech|solutions|systems|software|labs|studios|media|agency|foundation|trust|association|group|global|holdings|enterprises|corporation|corp|inc|llc|ltd|pvt|co|company|partners|associates|consulting|services|industries|bank|capital|fund|investments|logistics|airlines|hotel|restaurant)\b/i.test(qLower)) {
        return [base];
    }

    // 4. For plain abstract root words (e.g. "Acme", "Apex", "Nova"):
    // offer standard enterprise structures to satisfy dynamic company requirements
    const out = [
        base,
        `${base} Technologies`,
        `${base} Solutions`,
        `${base} Group`,
        `${base} Global`,
        `${base} Corporation`,
        `${base} Enterprises`,
        `${base} International`
    ];
    return dedupe(out).slice(0, maxResults);
}

function synthesizeSchools(query, maxResults) {
    const q = query.trim();
    if (q.length < 2) return [];
    const qLower = q.toLowerCase();
    const base = smartTitleCase(q);

    // AIIMS / AIMMS special handling
    if (qLower === 'aiims' || qLower === 'aimms') {
        return [
            'AIIMS (All India Institute of Medical Sciences)',
            'All India Institute of Medical Sciences (AIIMS Delhi)',
            'AIIMS New Delhi',
            'AIIMS Bhopal',
            'AIIMS Bhubaneswar',
            'AIIMS Jodhpur',
            'AIIMS Rishikesh',
            'AIIMS Patna'
        ].slice(0, maxResults);
    }

    // If query already contains university/college/school, do not append to avoid "Valencia University University"
    if (/\b(?:university|college|school|institute|academy|polytechnic)\b/i.test(qLower)) {
        return [base];
    }

    const out = [
        `${base} University`,
        `University of ${base}`,
        `${base} College`,
        `${base} State University`,
        `${base} Institute of Technology`,
        `${base} Polytechnic Institute`
    ];
    return dedupe(out).slice(0, maxResults);
}

function synthesizeDegrees(query, maxResults) {
    const q = query.trim();
    if (q.length < 2) return [];
    const qLower = q.toLowerCase();
    const base = smartTitleCase(q);

    if (/\b(?:bachelor|master|doctor|ph\.?d|associate|b\.?s|m\.?s|b\.?a|m\.?a|b\.?tech|m\.?tech|b\.?e)\b/i.test(qLower)) {
        return [base];
    }

    const out = [
        `Bachelor of Science in ${base} (B.S.)`,
        `Master of Science in ${base} (M.S.)`,
        `Bachelor of Arts in ${base} (B.A.)`,
        `Master of Arts in ${base} (M.A.)`,
        `Doctor of Philosophy in ${base} (Ph.D.)`,
        `Associate of Science in ${base} (A.S.)`,
        `Bachelor of Engineering in ${base} (B.E.)`,
        `Master of Engineering in ${base} (M.Eng)`
    ];
    return dedupe(out).slice(0, maxResults);
}

function synthesizeCertifications(query, maxResults) {
    const q = query.trim();
    if (q.length < 2) return [];
    const qLower = q.toLowerCase();
    const base = smartTitleCase(q);
    const out = [];

    if (qLower === 'faa' || qLower.startsWith('faa')) {
        out.push(
            'FAA Commercial Pilot Certificate',
            'FAA Airline Transport Pilot (ATP)',
            'FAA Certified Flight Instructor (CFI)',
            'FAA Remote Pilot Certificate (Part 107)'
        );
    }
    if (qLower === 'osha' || qLower.startsWith('osha')) {
        out.push(
            'OSHA 30-Hour Construction Safety Certification',
            'OSHA 10-Hour General Industry Certification',
            'OSHA Certified Safety Specialist'
        );
    }
    if (qLower === 'aws' || qLower.startsWith('aws')) {
        out.push(
            'AWS Certified Solutions Architect – Associate',
            'AWS Certified Solutions Architect – Professional',
            'AWS Certified Developer – Associate',
            'AWS Certified DevOps Engineer – Professional'
        );
    }
    if (qLower === 'cpa' || qLower.startsWith('cpa')) {
        out.push(
            'Certified Public Accountant (CPA)',
            'CPA Licensed Practice Credential'
        );
    }

    if (/\b(?:certified|certification|licensed|license|credential|certificate)\b/i.test(qLower)) {
        out.push(base);
    } else {
        out.push(
            `Certified ${base} Professional (CPP)`,
            `${base} Specialist Certification`,
            `Licensed ${base} Practitioner`,
            `Advanced ${base} Credential`,
            `Certified ${base} Associate`,
            `Professional ${base} Certificate`
        );
    }
    return dedupe(out).slice(0, maxResults);
}

function synthesizeIssuers(query, maxResults) {
    const q = query.trim();
    if (q.length < 2) return [];
    const base = smartTitleCase(q);
    const out = [
        `${base} Institute`,
        `${base} Association`,
        `${base} Board of Examiners`,
        `International ${base} Society`,
        `National ${base} Council`
    ];
    return dedupe(out).slice(0, maxResults);
}

// ============================================================================
// 6. DATASET ROUTER
// ============================================================================

const DATASET_MAP = Object.freeze({
    company: UNIVERSAL_COMPANIES,
    employer: UNIVERSAL_COMPANIES,
    organization: UNIVERSAL_COMPANIES,
    organisation: UNIVERSAL_COMPANIES,

    school: UNIVERSAL_SCHOOLS,
    university: UNIVERSAL_SCHOOLS,
    institution: UNIVERSAL_SCHOOLS,
    college: UNIVERSAL_SCHOOLS,

    degree: UNIVERSAL_DEGREES,
    qualification: UNIVERSAL_DEGREES,

    certification: UNIVERSAL_CERTIFICATIONS,
    credential: UNIVERSAL_CERTIFICATIONS,
    issuer: UNIVERSAL_CERTIFICATIONS,

    language: UNIVERSAL_LANGUAGES,
    languages: UNIVERSAL_LANGUAGES,

    skill: UNIVERSAL_SKILLS,
    skills: UNIVERSAL_SKILLS,

    hobby: UNIVERSAL_HOBBIES,
    hobbies: UNIVERSAL_HOBBIES,
    interest: UNIVERSAL_HOBBIES,
    interests: UNIVERSAL_HOBBIES,

    city: UNIVERSAL_CITIES,
    location: UNIVERSAL_CITIES,

    jobtitle: UNIVERSAL_JOB_TITLES,
    jobtitles: UNIVERSAL_JOB_TITLES,
    occupation: UNIVERSAL_JOB_TITLES,
    title: UNIVERSAL_JOB_TITLES,
    role: UNIVERSAL_JOB_TITLES
});

function normalizeKey(directoryType) {
    return String(directoryType || '').trim().toLowerCase().replace(/[\s_-]/g, '');
}

function resolveDataset(directoryType) {
    return DATASET_MAP[normalizeKey(directoryType)] || null;
}

// ============================================================================
// 7. PUBLIC API
// ============================================================================

const ROLE_KEYS = new Set(['jobtitle', 'jobtitles', 'occupation', 'title', 'role']);
const SKILL_KEYS = new Set(['skill', 'skills']);
const HOBBY_KEYS = new Set(['hobby', 'hobbies', 'interest', 'interests']);
const COMPANY_KEYS = new Set(['company', 'employer', 'organization', 'organisation']);
const SCHOOL_KEYS = new Set(['school', 'university', 'institution', 'college']);
const DEGREE_KEYS = new Set(['degree', 'qualification']);
const CERT_KEYS = new Set(['certification', 'credential']);
const ISSUER_KEYS = new Set(['issuer']);

/**
 * Synthesize context-aware completions for a directory type.
 *
 * NOTE: City & location suggestions are strictly seed-matched to genuine
 * real-world cities and return [] here to prevent synthetic country hallucinations.
 *
 * @param {string} directoryType
 * @param {string} query
 * @param {unknown} [_context]       Reserved for future use (location, industry, …).
 * @param {number}  [maxResults=8]
 * @returns {string[]}
 */
export function synthesizeDynamicSuggestions(directoryType, query = '', _context = null, maxResults = 8) {
    if (!query || typeof query !== 'string') return [];
    const q = autocorrectQuery(query.trim());
    if (!q) return [];

    const key = normalizeKey(directoryType);

    if (ROLE_KEYS.has(key)) return synthesizeJobTitles(q, maxResults);
    if (SKILL_KEYS.has(key)) return synthesizeSkills(q, maxResults);
    if (HOBBY_KEYS.has(key)) return synthesizeHobbies(q, maxResults);
    if (COMPANY_KEYS.has(key)) return synthesizeCompanies(q, maxResults);
    if (SCHOOL_KEYS.has(key)) return synthesizeSchools(q, maxResults);
    if (DEGREE_KEYS.has(key)) return synthesizeDegrees(q, maxResults);
    if (CERT_KEYS.has(key)) return synthesizeCertifications(q, maxResults);
    if (ISSUER_KEYS.has(key)) return synthesizeIssuers(q, maxResults);

    // City, location, language are strictly seed-only
    return [];
}

/**
 * Universal instant matcher across all directory types.
 *
 * Behaviour
 * ---------
 *  • Empty / whitespace query  → [].
 *  • Unknown directory type    → [].
 *  • City & location           → authentic seed matches only (zero country fabrication).
 *  • Other types               → seed matches, supplemented with safe domain synthesis
 *                                up to `maxResults`.
 *
 * @param {string} directoryType
 * @param {string} [query='']
 * @param {number} [maxResults=8]
 * @returns {string[]}
 */
export function matchUniversalDirectory(directoryType, query = '', maxResults = 8) {
    const dataset = resolveDataset(directoryType);
    if (!dataset) return [];

    if (typeof query !== 'string' || !query.trim()) {
        return [];
    }

    const cleanQ = query.trim();
    const cleanQLower = stripDiacritics(cleanQ.toLowerCase());
    const isCity = normalizeKey(directoryType) === 'city' || normalizeKey(directoryType) === 'location';

    // 0. Instant City Alias & State Abbreviation check
    if (isCity) {
        const aliasTarget = CITY_ALIASES[cleanQLower];
        if (aliasTarget) {
            const exactTarget = dataset.find(c => c === aliasTarget || c.toLowerCase().startsWith(aliasTarget.toLowerCase())) || aliasTarget;
            const otherMatches = findMatches(dataset, aliasTarget, maxResults);
            return dedupe([exactTarget, ...otherMatches]).slice(0, maxResults);
        }

        // Direct state name check (e.g. "telangana", "karnataka", "maharashtra")
        if (cleanQLower.length >= 3) {
            const directStateMatches = dataset.filter(c => {
                const commaIdx = c.indexOf(',');
                if (commaIdx === -1) return false;
                const statePart = stripDiacritics(c.slice(commaIdx + 1).trim().toLowerCase());
                return statePart === cleanQLower || statePart.startsWith(cleanQLower);
            });
            if (directStateMatches.length > 0) {
                return directStateMatches.slice(0, maxResults);
            }
        }

        // State abbreviation check (e.g. "california" -> ending with ", ca")
        const stateCode = STATE_ABBREVIATIONS[cleanQLower];
        if (stateCode) {
            const stateMatches = dataset.filter(c => {
                const cLower = stripDiacritics(c.toLowerCase());
                return cLower.endsWith(`, ${stateCode}`);
            });
            if (stateMatches.length > 0) {
                return stateMatches.slice(0, maxResults);
            }
        }
    }

    const correctedQuery = autocorrectQuery(cleanQ);

    // 1. Search seed dataset with spell-corrected query first
    let seed = findMatches(dataset, correctedQuery, maxResults);

    // 2. If corrected query differed from raw query and didn't fill all slots, supplement with raw query matches
    if (seed.length < maxResults && correctedQuery.toLowerCase() !== cleanQ.toLowerCase()) {
        const rawSeed = findMatches(dataset, cleanQ, maxResults - seed.length);
        seed = dedupe([...seed, ...rawSeed]);
    }
    if (seed.length >= maxResults) return seed;

    // 3. Dynamic synthesis using the spell-corrected query
    const synthesized = synthesizeDynamicSuggestions(directoryType, correctedQuery, null, maxResults - seed.length);
    if (!synthesized.length) return seed;

    return dedupe([...seed, ...synthesized]).slice(0, maxResults);
}

/**
 * Strict domain boundary validator to prevent cross-domain contamination
 * (e.g. software/job titles leaking into educational schools, degrees, cities, etc.)
 *
 * @param {string} directoryType - The field type (school, degree, company, jobTitle, city, skill, etc.)
 * @param {string} candidate - The suggested completion text
 * @returns {boolean} - true if candidate is compatible with the domain, false otherwise
 */
export function isDomainCompatible(directoryType, candidate) {
    if (!candidate || typeof candidate !== 'string') return false;
    const clean = candidate.trim();
    if (!clean) return false;
    const normType = String(directoryType || '').trim().toLowerCase().replace(/[\s_-]/g, '');
    const cleanLower = clean.toLowerCase();

    // 1. SCHOOL / UNIVERSITY / COLLEGE / INSTITUTION
    if (normType === 'school' || normType === 'university' || normType === 'college' || normType === 'institution') {
        // Must NEVER end with or contain job role suffixes without academic institution qualifier
        const hasRoleTitle = /\b(?:consultant|developer|modeler|analyst|engineer|manager|director|officer|specialist|assistant|associate|lead|architect|administrator|programmer|technician|operator|designer|intern|representative|salesperson|recruiter|coordinator|nurse|physician|surgeon|doctor|therapist|chef|pilot|driver)\b/i.test(cleanLower);
        const hasAcademicQualifier = /\b(?:university|universities|college|colleges|school|schools|institute|institutes|institution|institutions|academy|academies|polytechnic|polytechnics|conservatory|campus|faculty|seminary|sciences?|studies|centre|center|hospital|health system)\b/i.test(cleanLower);
        if (hasRoleTitle && !hasAcademicQualifier) {
            return false;
        }
        // Must NEVER be an academic degree qualification
        if (/^(?:bachelor|master|doctor of philosophy|ph\.?d|associate of|diploma in|b\.?s\.|m\.?s\.|b\.?a\.|m\.?a\.|b\.?tech|m\.?tech)\b/i.test(cleanLower)) {
            return false;
        }
        // Must NOT be a city format (e.g. "City, State")
        if (/^[a-z\s.'-]+,\s*[a-z]{2}(?:\s*\(.*?\))?$/i.test(cleanLower)) {
            return false;
        }
        return true;
    }

    // 2. DEGREE / QUALIFICATION
    if (normType === 'degree' || normType === 'qualification') {
        const hasDegreeIndicator = /\b(?:bachelor|master|doctor|ph\.?d|doctorate|associate|diploma|certificate|credential|degree|b\.?s|m\.?s|b\.?a|m\.?a|b\.?tech|m\.?tech|b\.?e|m\.?eng|mba|emba|bba|bca|mca|b\.?com|m\.?com|ll\.?b|ll\.?m|m\.?d|d\.?d\.?s|pharm\.?d|ed\.?d|dba|bsn|msn|pgd|hnd|ged|matriculation|secondary|undergraduate|postgraduate|graduate)\b/i.test(cleanLower);
        const isBareJobRole = /^(?:senior|lead|principal|staff|junior|associate)?\s*(?:software engineer|developer|programmer|consultant|analyst|project manager|accountant|nurse|surgeon|doctor|sales representative|recruiter)$/i.test(cleanLower);
        if (isBareJobRole) return false;
        if (/\b(?:university|college|polytechnic institute)\b/i.test(cleanLower) && !hasDegreeIndicator) {
            return false;
        }
        return hasDegreeIndicator || clean.length <= 10;
    }

    // 3. COMPANY / EMPLOYER / ORGANIZATION
    if (normType === 'company' || normType === 'employer' || normType === 'organization' || normType === 'organisation') {
        const isJobTitle = /^(?:senior|lead|principal|staff|junior|associate|chief)?\s*(?:software engineer|software developer|frontend developer|backend developer|full stack engineer|data scientist|cybersecurity analyst|project manager|product manager|scrum master|account executive|sales representative|registered nurse|attending physician|general surgeon)$/i.test(cleanLower);
        if (isJobTitle) return false;
        if (/^(?:bachelor|master|doctor of philosophy|ph\.?d)\b/i.test(cleanLower)) return false;
        return true;
    }

    // 4. JOB TITLE / OCCUPATION / ROLE
    if (normType === 'jobtitle' || normType === 'jobtitles' || normType === 'occupation' || normType === 'title' || normType === 'role') {
        if (/\b(?:university|college|polytechnic)\b/i.test(cleanLower) && !/\b(?:professor|lecturer|instructor|dean|researcher|fellow|chancellor|counselor)\b/i.test(cleanLower)) {
            return false;
        }
        if (/^(?:bachelor of|master of|doctor of philosophy|associate of|diploma in)\b/i.test(cleanLower)) {
            return false;
        }
        if (/^[a-z\s.'-]+,\s*[a-z]{2}$/i.test(cleanLower)) {
            return false;
        }
        return true;
    }

    // 5. CITY / LOCATION
    if (normType === 'city' || normType === 'location') {
        if (/\b(?:engineer|developer|manager|consultant|technologies|solutions|corporation|inc|llc|ltd|university|hospital)\b/i.test(cleanLower)) {
            return false;
        }
        return true;
    }

    // 6. LANGUAGE / LANGUAGES
    if (normType === 'language' || normType === 'languages') {
        const isProgrammingLang = /\b(?:python|javascript|typescript|java|golang|rust|ruby|php|swift|kotlin|html5?|css3?|sql|r\b|perl|bash|powershell|react|angular|vue|node\.?js)\b|c\+\+|c#/i.test(cleanLower);
        if (isProgrammingLang) return false;
        if (/\b(?:engineer|developer|manager|specialist|consultant)\b/i.test(cleanLower)) return false;
        return true;
    }

    // 7. HOBBY / HOBBIES / INTEREST / INTERESTS
    if (normType === 'hobby' || normType === 'hobbies' || normType === 'interest' || normType === 'interests') {
        if (/\b(?:software engineering|code reviews?|deploying|devops consulting|sales outreach|sprint planning|jira management|bug fixing|database optimization)\b/i.test(cleanLower)) {
            return false;
        }
        return true;
    }

    // 8. SKILL / SKILLS
    if (normType === 'skill' || normType === 'skills') {
        if (/\b(?:university|college of|polytechnic)\b/i.test(cleanLower)) return false;
        if (/^(?:bachelor of|master of|ph\.?d in)\b/i.test(cleanLower)) return false;
        return true;
    }

    // 9. ISSUER / CERTIFICATIONISSUER
    if (normType === 'issuer' || normType === 'certificationissuer') {
        if (/^(?:software developer|engineer|consultant|analyst)$/i.test(cleanLower)) return false;
        return true;
    }

    return true;
}
