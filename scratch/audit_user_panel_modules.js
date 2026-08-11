import fs from 'fs';

const userModules = [
    { name: 'Dashboard Homepage', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx' },
    { name: 'AI Resume Builder (Main)', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/BuildResume/BuildResume.jsx' },
    { name: 'Heading Step', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/BuildResume/steps/HeadingStep.jsx' },
    { name: 'Work History Step', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/BuildResume/steps/WorkHistoryStep.jsx' },
    { name: 'Education Step', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/BuildResume/steps/EducationStep.jsx' },
    { name: 'Skills Step', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/BuildResume/steps/SkillsStep.jsx' },
    { name: 'Summary Step', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/BuildResume/steps/SummaryStep.jsx' },
    { name: 'AI Cover Letter', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/Actions/action/Action.jsx' },
    { name: 'Portfolio Builder', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/PortfolioBuilder/PortfolioBuilder.jsx' },
    { name: 'Job Listings Portal', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/MainJobListings/MainJobListings.jsx' },
    { name: 'Billing & Plans', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/Billing/Plans/Plans.jsx' },
    { name: 'User Profile Settings', file: 'd:/xampp/htdocs/ai-resume-builder/src/components/Dashboard/ProfileDisplay/ProfileDisplay.jsx' }
];

console.log("=================================================");
console.log("🔍 USER PANEL FULL MODULE INTEGRITY AUDIT 🔍");
console.log("=================================================");

userModules.forEach(mod => {
    try {
        if (fs.existsSync(mod.file)) {
            const stats = fs.statSync(mod.file);
            console.log(`✅ [EXISTS] ${mod.name.padEnd(26)} (${(stats.size / 1024).toFixed(1)} KB)`);
        } else {
            console.log(`❌ [MISSING] ${mod.name.padEnd(26)}`);
        }
    } catch (e) {
        console.log(`⚠️ [ERROR] ${mod.name}: ${e.message}`);
    }
});

console.log("=================================================");
