import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function captureCv3() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

    await page.addInitScript(() => {
        const dummyDoc = {
            id: 'cv3_test_id',
            item: {
                firstname: 'Bhaskar',
                lastname: 'Babu',
                occupation: 'Senior Software Engineer & Tech Lead',
                phone: '+91 98765 43210',
                email: 'bhaskar.babu@example.com',
                photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=250&q=80',
                address: '123 Tech Park, HITEC City',
                city: 'Hyderabad',
                country: 'India',
                postalcode: '500081',
                summary: 'Results-driven Senior Software Engineer and Tech Lead with over 12 years of experience leading cross-functional engineering teams, building scalable cloud microservices, and architecting high-performance digital platforms.',
                employments: [
                    { jobTitle: 'Senior Software Engineer & Tech Lead', employer: 'Beyond Technologies', begin: '2018', end: 'Present', description: 'Led cross-functional engineering teams of 15+ developers building resilient cloud services and frontend applications. Improved system throughput by 40%.' },
                    { jobTitle: 'Lead Frontend Developer', employer: 'Tech Solutions Inc', begin: '2014', end: '2018', description: 'Architected enterprise React and Node applications with dynamic client dashboard views.' }
                ],
                educations: [
                    { school: 'Andhra University', degree: 'Master of Business Administration (MBA)', started: '2012', finished: '2014', description: 'Graduated with Distinction in Executive Management & Leadership.' },
                    { school: 'Chaitanya Engineering College', degree: 'B.Tech in Electronics & Communication', started: '2008', finished: '2012', description: 'IEEE Student Branch President & Lead Project Architect.' }
                ],
                skills: [
                    { name: 'Digital Advertising', rating: 95 },
                    { name: 'Full Stack Architecture', rating: 95 },
                    { name: 'React & Node.js', rating: 90 },
                    { name: 'Google Analytics 4', rating: 85 },
                    { name: 'Cloud Infrastructure (AWS)', rating: 88 },
                    { name: 'Agile Team Leadership', rating: 92 }
                ],
                languages: [
                    { name: 'English', level: 'Professional Working (Advanced)' },
                    { name: 'Telugu', level: 'Native / Bilingual' },
                    { name: 'Hindi', level: 'Limited Working (Intermediate)' }
                ],
                colors: { primary: '#b86877', secondary: '#f8fafc' },
                template: 'Cv3'
            },
            template: 'Cv3'
        };

        localStorage.setItem('resumeData', JSON.stringify(dummyDoc.item));
        localStorage.setItem('resume_cv3_test_id', JSON.stringify(dummyDoc.item));
        localStorage.setItem('selectedTemplate', 'Cv3');
    });

    console.log("Navigating to Cv3 Export Preview page...");
    await page.goto('http://localhost:5173/export/Cv3/cv3_test_id/en', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);

    const ssPath = path.join(artifactDir, 'cv3_initial_preview.png');
    await page.screenshot({ path: ssPath, fullPage: true });
    console.log("Saved cv3_initial_preview.png!");

    await browser.close();
}

captureCv3().catch(console.error);
