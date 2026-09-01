require('dotenv').config({ path: './backend/.env' });
const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('=== DEEP DIAGNOSTIC: Resume Import Debug ===');
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    // Capture ALL console messages
    const consoleLogs = [];
    page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push({ type: msg.type(), text });
        if (text.includes('Temp resume JSON') || text.includes('Failsafe') || text.includes('NVIDIA') || text.includes('Gemini') || text.includes('parser error') || text.includes('sessionStorage')) {
            console.log(`[BROWSER ${msg.type().toUpperCase()}] ${text}`);
        }
    });

    // Set auth
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/build-resume/heading');
    await page.evaluate(() => {
        localStorage.setItem('authUser', JSON.stringify({uid:'test123',email:'test@test.com',displayName:'Test User'}));
    });

    // Navigate with import=true
    await page.goto('${process.env.TARGET_URL || process.env.APP_URL}/build-resume/heading?import=true');
    await page.waitForTimeout(3000);

    // Check modal
    const modal = await page.$('[role="dialog"]');
    console.log(`✔ Modal visible: ${!!modal}`);

    // Upload file
    const filePath = path.resolve('C:\\Users\\mbhas\\Downloads\\Bhaskar_Resume_Manager (1).txt');
    const fileInput = await page.$('input[type="file"]');
    if (fileInput) {
        await fileInput.setInputFiles(filePath);
        console.log('✔ File uploaded');
    } else {
        console.log('✘ No file input found');
        await browser.close();
        return;
    }

    // Wait for parsing to complete (up to 45s)
    console.log('⏳ Waiting for AI parsing (up to 45s)...');
    let status = 'pending';
    for (let i = 0; i < 90; i++) {
        await page.waitForTimeout(500);
        
        // Check for success button
        const applyBtn = await page.$('button:has-text("Apply")');
        if (applyBtn) {
            status = 'success';
            break;
        }
        
        // Check for error
        const errorEl = await page.$('.text-red-600, .text-red-500');
        if (errorEl) {
            const errorText = await errorEl.textContent();
            console.log(`✘ ERROR: ${errorText}`);
            status = 'error';
            break;
        }
    }
    console.log(`✔ Final status: ${status}`);

    if (status === 'success') {
        // Check what sessionStorage has BEFORE clicking Apply
        const tempJson = await page.evaluate(() => {
            try {
                return JSON.parse(sessionStorage.getItem('temp_imported_resume_json'));
            } catch(e) { return null; }
        });

        console.log('\n═══════════════════════════════════════');
        console.log('  TEMP JSON (what AI extracted):');
        console.log('═══════════════════════════════════════');
        if (tempJson) {
            console.log(`  firstname:   "${tempJson.firstname}"`);
            console.log(`  lastname:    "${tempJson.lastname}"`);
            console.log(`  email:       "${tempJson.email}"`);
            console.log(`  phone:       "${tempJson.phone}"`);
            console.log(`  occupation:  "${tempJson.occupation}"`);
            console.log(`  city:        "${tempJson.city}"`);
            console.log(`  country:     "${tempJson.country}"`);
            console.log(`  address:     "${tempJson.address}"`);
            console.log(`  postalcode:  "${tempJson.postalcode}"`);
            console.log(`  summary:     "${(tempJson.summary || '').substring(0, 120)}..."`);
            console.log(`  employments: ${tempJson.employments?.length || 0} jobs`);
            if (tempJson.employments) {
                tempJson.employments.forEach((emp, i) => {
                    console.log(`    [${i}] "${emp.jobTitle}" at "${emp.employer}" (${emp.begin} - ${emp.end})`);
                    console.log(`        city: "${emp.city}"`);
                    console.log(`        desc: "${(emp.description || '').substring(0, 100)}..."`);
                });
            }
            console.log(`  educations:  ${tempJson.educations?.length || 0} entries`);
            if (tempJson.educations) {
                tempJson.educations.forEach((edu, i) => {
                    console.log(`    [${i}] "${edu.degree}" at "${edu.school}" (${edu.started} - ${edu.finished})`);
                });
            }
            console.log(`  skills:      ${tempJson.skills?.length || 0} skills`);
            if (tempJson.skills) {
                console.log(`    ${tempJson.skills.map(s => `${s.skillName}(${s.rating})`).join(', ')}`);
            }
            console.log(`  languages:   ${tempJson.languages?.length || 0}`);
        } else {
            console.log('  ✘ No temp JSON found in sessionStorage!');
        }

        // Click Apply
        const applyBtn = await page.$('button:has-text("Apply")');
        if (applyBtn) {
            await applyBtn.click();
            console.log('\n✔ Apply button clicked');
        }

        await page.waitForTimeout(3000);

        // Read form fields
        console.log('\n═══════════════════════════════════════');
        console.log('  FORM FIELDS (what user sees):');
        console.log('═══════════════════════════════════════');
        
        const fields = await page.evaluate(() => {
            const get = (sel) => {
                const el = document.querySelector(sel);
                return el ? (el.value || el.textContent || '').trim() : 'NOT FOUND';
            };
            return {
                firstName: get('input[name="firstname"], input[id*="first"], input[placeholder*="First"]'),
                lastName: get('input[name="lastname"], input[id*="last"], input[placeholder*="Last"]'),
                email: get('input[name="email"], input[type="email"], input[placeholder*="email"]'),
                phone: get('input[name="phone"], input[type="tel"], input[placeholder*="phone"]'),
                occupation: get('input[name="occupation"], input[placeholder*="Job"], input[placeholder*="title"], input[placeholder*="occupation"]'),
                city: get('input[name="city"], input[placeholder*="city"], input[placeholder*="City"]'),
                country: get('input[name="country"], input[placeholder*="country"]'),
                address: get('input[name="address"], input[placeholder*="address"]'),
                postalcode: get('input[name="postalcode"], input[placeholder*="postal"], input[placeholder*="zip"]'),
            };
        });
        
        Object.entries(fields).forEach(([k, v]) => {
            const icon = v && v !== 'NOT FOUND' && v.length > 0 ? '✔' : '✘';
            console.log(`  ${icon} ${k}: "${v}"`);
        });
    }

    // Print relevant console logs
    console.log('\n═══════════════════════════════════════');
    console.log('  RELEVANT BROWSER CONSOLE LOGS:');
    console.log('═══════════════════════════════════════');
    const relevantLogs = consoleLogs.filter(l => 
        l.text.includes('resume') || l.text.includes('Resume') || 
        l.text.includes('AI') || l.text.includes('Temp') ||
        l.text.includes('error') || l.text.includes('Error') ||
        l.text.includes('Failsafe') || l.text.includes('NVIDIA') ||
        l.text.includes('Gemini') || l.text.includes('Heuristic') ||
        l.text.includes('parser') || l.text.includes('sessionStorage') ||
        l.text.includes('fallback')
    );
    relevantLogs.forEach(l => console.log(`  [${l.type}] ${l.text.substring(0, 200)}`));

    await browser.close();
    console.log('\n=== DIAGNOSTIC COMPLETE ===');
})();
