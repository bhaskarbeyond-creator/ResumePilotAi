import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function testLiveDownloadPdf() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

    await page.addInitScript(() => {
        const dummyDoc = {
            id: 'resume_live_pdf_test',
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
                    { school: 'Andhra University', degree: 'Master of Business Administration', started: '2013', finished: '2015', description: 'Graduated with honors in Master of Business Administration from Andhra University, showcasing exceptional academic distinction and dedication to business acumen.' },
                    { school: 'Chaitanya Engineering College', degree: 'B.Tech Electronics and Communication', started: '2009', finished: '2013', description: 'Project Lead for the college IEEE Student Branch, where I led the organization of various technical events, workshops, and seminars, fostering a culture of innovation and collaboration among students and professionals.' }
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

        localStorage.setItem('user', 'test_user_bhaskar');
        localStorage.setItem('currentResumeItem', JSON.stringify(dummyDoc.item));
        localStorage.setItem('userResumes', JSON.stringify([dummyDoc]));
        localStorage.setItem('selectedTemplate', 'Cv2');
        localStorage.setItem('currentResumeId', 'resume_live_pdf_test');
    });

    console.log("Navigating to Dashboard...");
    await page.goto('http://localhost:5173/dashboard', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    console.log("Clicking Download PDF button...");
    const downloadPromise = page.waitForEvent('download', { timeout: 30000 });
    const downloadBtn = await page.$('button:has-text("Download PDF")');
    if (downloadBtn) {
        await downloadBtn.click();
        const download = await downloadPromise;
        const savedPath = path.join(artifactDir, 'live_downloaded_resume.pdf');
        await download.saveAs(savedPath);
        console.log("Successfully downloaded live PDF to live_downloaded_resume.pdf!");
    } else {
        console.log("Download button not found!");
    }

    await browser.close();
}

testLiveDownloadPdf().catch(console.error);
