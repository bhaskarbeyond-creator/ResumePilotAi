import { chromium } from 'playwright';
import path from 'path';

const artifactDir = "C:\\Users\\mbhas\\.gemini\\antigravity-ide\\brain\\6614428e-2f2d-45c1-b414-359b6e071fda";

async function testPdfDownloadBreak() {
    const browser = await chromium.launch({ channel: 'msedge', headless: true });
    const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

    await page.addInitScript(() => {
        const fullCvData = {
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
            colors: { primary: '#f0c30e' },
            template: 'Cv2'
        };

        localStorage.setItem('resumeData', JSON.stringify(fullCvData));
        localStorage.setItem('resume_resume_pdf_test', JSON.stringify(fullCvData));
    });

    console.log("Navigating to Export page directly (simulating backend PDF rendering)...");
    await page.goto('http://localhost:5173/export/Cv2/resume_pdf_test/en', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    // Emulate print media & generate PDF exactly as Puppeteer backend does!
    await page.emulateMedia({ media: 'print' });
    const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' }
    });

    const pdfPath = path.join(artifactDir, 'downloaded_pdf_export_test.pdf');
    const fs = await import('fs');
    fs.writeFileSync(pdfPath, pdfBuffer);
    console.log("Generated downloaded_pdf_export_test.pdf!");

    await browser.close();
}

testPdfDownloadBreak().catch(console.error);
