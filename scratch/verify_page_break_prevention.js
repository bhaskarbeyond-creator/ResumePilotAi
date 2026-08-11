import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function verifyPageBreakPrevention() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

    await page.addInitScript(() => {
        const dummyDoc = {
            id: 'resume_multi_section',
            item: {
                firstname: 'Bhaskar',
                lastname: 'Babu',
                occupation: 'Senior Software Engineer & Tech Lead',
                summary: 'Experienced software engineer with strong technical skills and leadership background.',
                employments: [
                    { jobTitle: 'Senior Software Engineer', employer: 'Beyond Technologies', begin: '2013', end: '2022', description: 'Led cross-functional teams of 12 project managers and 25 technical leads to implement a new Agile framework, resulting in a 45% reduction in project timelines and a 25% increase in team productivity across 10 concurrent projects.' },
                    { jobTitle: 'Lead Developer', employer: 'Tech Corp', begin: '2010', end: '2013', description: 'Architected high-throughput microservices using React and Node.js.' }
                ],
                educations: [
                    { school: 'Andhra University', degree: 'Master of Business Administration', started: '2013', finished: '2015', description: 'Graduated with honors in Master of Business Administration.' },
                    { school: 'Chaitanya Engineering College', degree: 'B.Tech Electronics and Communication', started: '2009', finished: '2013', description: 'Project Lead for the college IEEE Student Branch.' }
                ],
                skills: [
                    { name: 'Digital Advertising', rating: 95 },
                    { name: 'Programmatic Advertising', rating: 90 },
                    { name: 'Full Stack Development', rating: 95 },
                    { name: 'DoubleClick Campaign Manager', rating: 90 },
                    { name: 'Digital Display Advertising', rating: 85 },
                    { name: 'Google Analytics 4', rating: 90 }
                ],
                languages: [
                    { name: 'English', level: 'Professional Working (Advanced)' },
                    { name: 'Telugu', level: 'Native / Bilingual' },
                    { name: 'Hindi', level: 'Limited Working (Intermediate)' }
                ],
                template: 'Cv2'
            },
            template: 'Cv2'
        };
        localStorage.setItem('currentResumeItem', JSON.stringify(dummyDoc.item));
        localStorage.setItem('userResumes', JSON.stringify([dummyDoc]));
        localStorage.setItem('selectedTemplate', 'Cv2');
        localStorage.setItem('currentResumeId', 'resume_multi_section');
    });

    console.log("Navigating to Dashboard...");
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const previewBox = await page.$('.group\\/preview') || await page.$('.relative.h-72');
    if (previewBox) {
        console.log("Opening preview modal...");
        await previewBox.click();
        await page.waitForTimeout(2500);

        const modalSsPath = path.join(artifactDir, `page_break_avoid_verified.png`);
        await page.screenshot({ path: modalSsPath, fullPage: true });
        console.log("Saved page_break_avoid_verified.png!");
    } else {
        console.log("Preview box element not found!");
    }

    await browser.close();
}

verifyPageBreakPrevention().catch(console.error);
