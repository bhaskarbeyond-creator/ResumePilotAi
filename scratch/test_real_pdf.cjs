const http = require('http');
const express = require('express');
const path = require('path');
const { chromium } = require('playwright');

const app = express();
app.use(express.static(path.join(__dirname, '..', 'dist')));
app.get('/api/export-render-data', (req, res) => {
  res.json({
    success: true,
    data: {
      firstname: 'Ananya',
      lastname: 'Sharma',
      template: 'Cv1',
      language: 'en',
      phone: '+91 98765 43210',
      email: 'ananya.sharma@example.com',
      address: 'Hyderabad, Telangana, India',
      occupation: 'Senior Full Stack Engineer',
      summary: 'Experienced systems architect with 8+ years leading high-throughput distributed microservices and modern web applications.',
      experiences: [
        {
          jobTitle: 'Principal Engineer',
          employer: 'TechCorp Solutions',
          city: 'Hyderabad',
          startDate: '2021',
          endDate: 'Present',
          description: 'Architected low-latency resume generation engine and distributed payment processing systems.'
        }
      ],
      educations: [
        {
          school: 'Indian Institute of Technology',
          degree: 'B.Tech in Computer Science',
          city: 'Hyderabad',
          startDate: '2013',
          endDate: '2017'
        }
      ],
      skills: [
        { name: 'JavaScript / Node.js', rating: 95 },
        { name: 'React / Next.js', rating: 90 },
        { name: 'Distributed Systems', rating: 92 }
      ]
    }
  });
});
app.get('/export/*', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'dist', 'index.html'));
});

const server = app.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  console.log('Local test server running on port:', port);
  try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });
    const validToken = 'a'.repeat(43);
    const target = `http://127.0.0.1:${port}/export/Cv1/test-1/en#renderToken=${validToken}`;
    console.log('Navigating to:', target);
    await page.goto(target, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForFunction(
      () => document.documentElement.getAttribute('data-export-ready') === 'true' || document.documentElement.hasAttribute('data-export-error'),
      { timeout: 15000 }
    );
    const isReady = await page.evaluate(() => document.documentElement.getAttribute('data-export-ready'));
    const isError = await page.evaluate(() => document.documentElement.getAttribute('data-export-error'));
    console.log('Page state:', { isReady, isError });
    const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true });
    console.log('PDF generated successfully!');
    console.log('Bytes length:', pdfBuffer.length);
    console.log('Signature:', pdfBuffer.subarray(0, 8).toString('latin1'));
    console.log('A4 Dimensions (First 500 bytes preview):', pdfBuffer.subarray(0, 300).toString('latin1'));
    await browser.close();
  } catch(e) {
    console.error('Test execution error:', e.stack || e.message);
  } finally {
    server.close();
  }
});
