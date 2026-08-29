/**
 * Product UX regression checks for the P0 final release pass.
 * These intentionally cover user-visible routes and semantics that backend
 * contract tests cannot exercise on their own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (file) => fs.readFileSync(file, 'utf8');

test('homepage exposes only supported document workflows and removes the obsolete Quick entry point', () => {
  const hero = read('src/components/Dashboard2/elements/HomepageHero.jsx');
  const shell = read('src/components/Dashboard2/dashboard2.jsx');
  const routes = read('src/main.jsx');
  assert.doesNotMatch(hero, /quickBuilder|goToResumeSelectionStep|goToCoverSelection|>Quick</i);
  assert.match(hero, /to="\/build-resume\/heading"/);
  assert.match(hero, /to="\/cover-letter"/);
  assert.match(hero, /navigate\('\/portfolio\/builder'\)/);
  assert.doesNotMatch(shell, /goToResumeSelectionStep|goToCoverSelection/);
  assert.match(routes, /<Route path="\/resume\/:step" element=\{<Navigate to="\/build-resume\/heading" replace \/>\}/);
  assert.doesNotMatch(routes, /<Route path="\/resume\/:step" element=\{<Welcome/);
});

test('authenticated Dashboard navigation is a labelled link with active, mobile, focus and meaningful-icon states', () => {
  const navbar = read('src/components/Dashboard2/elements/HomepageNavbar.jsx');
  const globalCss = read('src/index.css');
  assert.match(navbar, /import \{ Link, useLocation \} from 'react-router-dom'/);
  assert.match(navbar, /const isDashboardActive = location\.pathname === '\/dashboard'/);
  assert.match(navbar, /to="\/dashboard"/);
  assert.match(navbar, /aria-current=\{isDashboardActive \? 'page' : undefined\}/);
  assert.match(navbar, /<FiGrid/);
  assert.match(navbar, /aria-expanded=\{isOpen\}/);
  assert.match(navbar, /aria-controls="mobile-navigation"/);
  assert.match(globalCss, /a\[href\]:focus-visible/);
});

test('features menu is keyboard-operable and its feature cards actually navigate', () => {
  const navbar = read('src/components/Dashboard2/elements/HomepageNavbar.jsx');
  assert.match(navbar, /id="features-menu-button"/);
  assert.match(navbar, /aria-expanded=\{featuresOpen\}/);
  assert.match(navbar, /onClick=\{\(\) => setFeaturesOpen\(\(open\) => !open\)\}/);
  assert.match(navbar, /id="features-menu"/);
  assert.match(navbar, /<Link\s+key=\{index\}\s+to=\{feature\.href\}/m);
  assert.match(navbar, /href: '\/features#ats-optimization'/);
  const features = read('src/components/Features/Features.jsx');
  assert.match(features, /id: "ats-optimization"/);
  assert.match(features, /id: "ai-builder"/);
  assert.match(features, /id: "templates"/);
  assert.match(features, /id: "security"/);
  assert.match(features, /scrollIntoView/);
});

test('resume builder has a real final review route and protects authenticated navigation after failed persistence', () => {
  const builder = read('src/components/BuildResume/BuildResume.jsx');
  const review = read('src/components/BuildResume/steps/ReviewStep.jsx');
  assert.match(builder, /import ReviewStep/);
  assert.match(builder, /path: 'review'/);
  assert.match(builder, /<Route path="review" element=\{<ReviewStep/);
  assert.match(builder, /const persistBeforeNavigation = async \(\) =>/);
  assert.match(builder, /if \(!await persistBeforeNavigation\(\)\) return;/);
  assert.match(builder, /if \(userIdRef\.current && changeVersionRef\.current > savedVersionRef\.current/);
  assert.match(builder, /Complete your required personal details before finishing\./);
  assert.match(builder, /const contentSteps = orderedSteps\.filter\(\(step\) => step\.path !== 'review'\)/);
  assert.match(review, /Review and export/);
  assert.match(review, /onChooseTemplate/);
  assert.match(review, /onPreview/);
  assert.match(review, /onDownload/);
  assert.doesNotMatch(review, /placeholder|services\/firebase|window\.prompt/);
});

test('dashboard resume actions and preview are keyboard-accessible, and the blank job-matching route no longer renders', () => {
  const dashboard = read('src/components/Dashboard/DashboardMain/DashboardMain.jsx');
  const homepage = read('src/components/Dashboard/DashboardHomepage/DashboardHomepage.jsx');
  assert.match(dashboard, /Navigate to="\/dashboard\/job-tracker" replace/);
  assert.doesNotMatch(dashboard, /DashboardJobMatching/);
  assert.match(homepage, /aria-label=\{`More actions for/);
  assert.match(homepage, /role="menu"/);
  assert.match(homepage, /aria-label=\{`Open full preview for/);
  assert.match(homepage, /group-focus-within\/preview:scale-100/);
});
