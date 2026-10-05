import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import {
  CONTACT_FIELD_LIMITS,
  CONTACT_EMAIL_PATTERN,
  sanitizeContactInput,
  validateContactForm,
} from '../src/utils/contactFormValidation.js';

const backend = fs.readFileSync('backend/index.js', 'utf8');
const contactComponent = fs.readFileSync('src/components/Contact/Contact.jsx', 'utf8');
const enLocale = JSON.parse(fs.readFileSync('src/locales/en/en.json', 'utf8'));

/** The server route body, so assertions cannot drift onto an unrelated handler. */
function serverContactRoute() {
  const start = backend.indexOf("app.post('/api/contact'");
  assert.notEqual(start, -1, 'the /api/contact route must exist');
  const end = backend.indexOf("\n});", start);
  assert.notEqual(end, -1, 'the /api/contact route must be closed');
  return backend.slice(start, end);
}

test('DIR-031: client-side bounds are exactly the bounds the server enforces', () => {
  const route = serverContactRoute();

  // name: trimmed, 2 <= length <= 100
  assert.match(route, /name\.length < 2 \|\| name\.length > 100/);
  assert.equal(CONTACT_FIELD_LIMITS.NAME_MIN, 2);
  assert.equal(CONTACT_FIELD_LIMITS.NAME_MAX, 100);

  // message: trimmed, 10 <= length <= 5000
  assert.match(route, /message\.length < 10 \|\| message\.length > 5000/);
  assert.equal(CONTACT_FIELD_LIMITS.MESSAGE_MIN, 10);
  assert.equal(CONTACT_FIELD_LIMITS.MESSAGE_MAX, 5000);

  // email: same character class, same local/domain caps, same total cap
  assert.match(route, /\/\^\[\^\\s@,;<>\]\{1,64\}@\[\^\\s@,;<>\]\{1,190\}\$\//);
  assert.equal(CONTACT_FIELD_LIMITS.EMAIL_LOCAL_MAX, 64);
  assert.equal(CONTACT_FIELD_LIMITS.EMAIL_DOMAIN_MAX, 190);
  assert.match(route, /email\.length > 254/);
  assert.equal(CONTACT_FIELD_LIMITS.EMAIL_MAX, 254);

  // The server lowercases the email before persisting, so the client must too —
  // otherwise the value the visitor sees validated differs from the value stored.
  assert.match(route, /toLowerCase\(\)/);
});

test('DIR-031: the contact form actually enforces the shared contract', () => {
  assert.match(contactComponent, /validateContactForm/);
  assert.match(contactComponent, /maxLength=\{CONTACT_FIELD_LIMITS\.MESSAGE_MAX\}/);
  assert.match(contactComponent, /maxLength=\{CONTACT_FIELD_LIMITS\.NAME_MAX\}/);
  assert.match(contactComponent, /maxLength=\{CONTACT_FIELD_LIMITS\.EMAIL_MAX\}/);
  // The transmitted values must be the validated ones, never the raw state.
  assert.match(contactComponent, /addContactMessage\(values\.email, values\.name, values\.message\)/);
});

test('DIR-031: the lead form no longer blocks on alert() or simulated latency', () => {
  // alert() steals focus, is unannounceable for many screen readers, and is silently
  // dropped by assistive tech that suppresses modal dialogs (WCAG 2.1 AA).
  // Comments legitimately discuss the removed alert(); assert on executable code only.
  const contactLogic = contactComponent.replace(/\/\*[\s\S]*?\*\//g, '//').replace(/\/\/[^\r\n]*/g, '');
  assert.doesNotMatch(contactLogic, /\balert\(/);
  assert.match(contactComponent, /role="alert"/);
  // A hardcoded delay is fabricated telemetry: the user waits for nothing.
  assert.doesNotMatch(contactComponent, /setTimeout\(\(\) => \{[\s\S]{0,400}isSuccessShowed/);
});

test('DIR-031: the contact form restores the document styles it mutates', () => {
  // These inline styles used to leak into every route rendered after /contact.
  assert.match(contactComponent, /return \(\) => \{/);
  assert.match(contactComponent, /element\.style\[property\] = value/);
  // And it must null-check the elements rather than assuming they exist.
  assert.match(contactComponent, /if \(root\)/);
  assert.match(contactComponent, /if \(html\)/);
});

test('DIR-031: every error key the validator can emit has an English string', () => {
  const codes = new Set();
  // Drive the validator across the whole state space rather than hard-coding a list,
  // so a newly added branch cannot ship without a translation.
  const probes = [
    {}, { name: '' }, { name: 'x' }, { name: 'x'.repeat(101) },
    { name: 'Ada', email: '' }, { name: 'Ada', email: 'not-an-email' },
    { name: 'Ada', email: 'a@b.co', message: '' }, { name: 'Ada', email: 'a@b.co', message: 'short' },
    { name: 'Ada', email: 'a@b.co', message: 'm'.repeat(5001) },
  ];
  for (const probe of probes) {
    for (const code of Object.values(validateContactForm(probe).errors)) codes.add(code);
  }
  assert.ok(codes.size >= 6, `expected every field branch to be covered, saw ${codes.size}`);
  for (const code of codes) {
    const leaf = code.split('.').pop();
    assert.equal(typeof enLocale.contact.error[leaf], 'string', `missing en translation for ${code}`);
  }
});

test('DIR-031: the sanitizer neutralizes script URIs without eating real prose', () => {
  assert.equal(sanitizeContactInput('javascript:alert(1)'), 'alert(1)');
  assert.equal(sanitizeContactInput('click vbscript:msgbox'), 'click msgbox');
  assert.equal(sanitizeContactInput('data:text/html;base64,PHN2Zz4='), ';base64,PHN2Zz4=');
  assert.equal(sanitizeContactInput('livescript:x'), 'x');

  // Legitimate text must survive byte-for-byte. Corrupting a real enquiry is its own
  // defect, and the DIR-040 invariant already requires valid prose to survive intact.
  const prose = 'I use C++ and Rust <3. Salary: data science, from 2024 (see https://example.com)';
  assert.equal(sanitizeContactInput(prose), prose);
  assert.equal(sanitizeContactInput('Ada O\'Brien-Anderson'), 'Ada O\'Brien-Anderson');
  assert.equal(sanitizeContactInput('  padded  '), 'padded');

  // Control characters become a space rather than fusing the neighbouring words.
  assert.equal(sanitizeContactInput('tab\there'), 'tab here');
  assert.equal(sanitizeContactInput('a\u0000b'), 'a b');
});

test('DIR-031: validation normalizes and bounds exactly like the server', () => {
  const ok = validateContactForm({
    email: '  Ada.Lovelace+ATS@Example.COM ',
    name: '  Ada Lovelace  ',
    message: '  My ATS score says 42%, why?  ',
  });
  assert.equal(ok.valid, true);
  assert.equal(ok.values.email, 'ada.lovelace+ats@example.com');
  assert.equal(ok.values.name, 'Ada Lovelace');
  assert.equal(ok.values.message, 'My ATS score says 42%, why?');

  const oversize = validateContactForm({
    email: 'a@b.co', name: 'Ada', message: 'm'.repeat(CONTACT_FIELD_LIMITS.MESSAGE_MAX + 1),
  });
  assert.equal(oversize.valid, false);
  assert.equal(oversize.errors.message, 'contact.error.messageLength');

  const shortName = validateContactForm({ name: 'A', email: 'a@b.co', message: 'a perfectly long message' });
  assert.equal(shortName.errors.name, 'contact.error.nameLength');

  // The server rejects these characters in an address outright, so the client must too.
  for (const email of ['a,b@c.co', 'a;b@c.co', 'a<b@c.co', 'a b@c.co']) {
    assert.equal(
      validateContactForm({ name: 'Ada', email, message: 'a perfectly long message' }).errors.email,
      'contact.error.emailInvalid',
      `expected ${email} to be rejected`,
    );
  }
  assert.ok(CONTACT_EMAIL_PATTERN.test('a.b+tag@sub.example.co.uk'));
  // Parity, not aspiration: the server's own character class accepts 'a@b' (the domain
  // group is 1-190 of any non-space, non-delimiter characters). The client must NOT be
  // stricter than the authoritative contract, or a message the server would store would
  // be rejected in the browser with no way for the visitor to recover.
  assert.equal(CONTACT_EMAIL_PATTERN.test('a@b'), true);
  assert.equal(CONTACT_EMAIL_PATTERN.test('no-at-sign'), false);
});
