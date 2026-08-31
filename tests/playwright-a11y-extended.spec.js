import { test, expect, request } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const BASE = 'http://localhost:5173';
const API = 'http://localhost:8080';
const KEY = 'resumepilot_local_session_v1';

async function plantSession(page, email, password = 'password123') {
  const api = await request.newContext();
  const resp = await api.post(`${API}/api/auth/preview-login`, {
    headers: {'Content-Type':'application/json'},
    data: JSON.stringify({email, password}),
  });
  expect(resp.ok()).toBeTruthy();
  const data = await resp.json();
  await page.goto(BASE + '/login', {waitUntil:'domcontentloaded'});
  await page.waitForTimeout(300);
  const session = { token:data.token, uid:data.uid, email:data.email, displayName:data.email.split('@')[0], role:data.role, exp:0 };
  await page.evaluate(([k,v]) => localStorage.setItem(k, JSON.stringify(v)), [KEY, session]);
  await api.dispose();
}

const PAGES = [
  {name:'landing',path:'/',email:null},
  {name:'login',path:'/login',email:null},
  {name:'pricing',path:'/pricing',email:null},
  {name:'contact',path:'/contact',email:null},
  {name:'features',path:'/features',email:null},
  {name:'blog',path:'/blog',email:null},
  {name:'404',path:'/does-not-exist-xyz',email:null},
  {name:'user-dashboard',path:'/dashboard',email:'user@test.test'},
  {name:'user-billing',path:'/billing/plans',email:'user@test.test'},
  {name:'user-build-resume',path:'/build-resume/heading',email:'user@test.test'},
  {name:'admin-command-center',path:'/adm/dashboard',email:'superadmin@resumepilot.test'},
  {name:'admin-users',path:'/adm/users',email:'superadmin@resumepilot.test'},
  {name:'admin-audit',path:'/adm/audit-logs',email:'auditor@resumepilot.test'},
  {name:'admin-helpdesk',path:'/adm/help-desk',email:'support@resumepilot.test'},
];

for (const {name,path,email} of PAGES) {
  test(`a11y: ${name}`, async ({page}) => {
    if (email) await plantSession(page, email);
    await page.goto(BASE + path, {waitUntil:'domcontentloaded'});
    await page.waitForTimeout(2000);
    const results = await new AxeBuilder({page})
      .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','best-practice'])
      .disableRules(['color-contrast'])
      .analyze();
    const serious = results.violations.filter(v => ['serious','critical'].includes(v.impact));
    if (results.violations.length) {
      console.log(`\n[${name}] violations:`);
      for (const v of results.violations) {
        const targets = v.nodes.slice(0,2).map(n=>n.target.join(' ')).join('; ');
        console.log(`  [${v.impact}] ${v.id} — ${v.help} (nodes: ${v.nodes.length}) e.g. ${targets}`);
      }
    }
    console.log(`[${name}] serious=${serious.length}, other=${results.violations.length-serious.length}, passes=${results.passes.length}`);
    // Don't fail on moderate; but flag serious/critical
    expect(serious, `serious/critical a11y on ${name}`).toEqual([]);
  });
}
