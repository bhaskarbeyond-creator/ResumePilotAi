# Installing the security workflows

## Current status

The workflows in this repository are **templates only**. They are not active GitHub Actions workflows because the Arena GitHub App used for this hardening session was refused permission to create or modify `.github/workflows/*`.

Do not treat any check described below as active until a repository administrator installs the files and observes a successful run in GitHub Actions.

## Files to install

From a trusted administrative checkout of the protected target branch:

```bash
mkdir -p .github/workflows
cp docs/ci-templates/security-ci.yml .github/workflows/security-ci.yml
cp docs/ci-templates/codeql.yml .github/workflows/codeql.yml
git add .github/workflows/security-ci.yml .github/workflows/codeql.yml
git commit -m "Install security validation workflows"
git push
```

The administrator performing this operation needs GitHub's workflow permission. If organization policy requires actions to be pinned by immutable commit SHA, replace the version tags in both files with organization-approved SHAs before committing.

## What `security-ci.yml` runs

1. Checks out code without persisting Git credentials.
2. Installs Node.js 22 and Java 21.
3. Uses `npm ci --ignore-scripts` for both root and backend dependencies.
4. Runs ESLint.
5. Runs static security, XSS, MFA, OAuth, payment, password-reset, authorization, rate-limit, SSRF, secret-scanning, and HTTP integration tests.
6. Starts Firestore and Realtime Database Emulators and executes both adversarial rules suites.
7. Produces the Vite production build.
8. Blocks production and development dependency findings at `moderate` or higher.
9. Performs an additional tracked-token/private-key grep.

## What `codeql.yml` runs

- JavaScript/TypeScript CodeQL with the `security-extended` query pack.
- Pull request and branch analysis.
- Weekly scheduled analysis.
- SARIF upload under the minimal `security-events: write` permission.

## Required GitHub configuration

After the first successful runs, configure branch protection or a ruleset for the production branch and require these checks:

- `Security CI / validate`
- `CodeQL / analyze (javascript-typescript)` (the displayed name can vary slightly; select the check produced by the installed workflow)

Also configure:

- Require pull requests and at least one independent approving reviewer.
- Dismiss approvals after new commits.
- Require conversation resolution.
- Prevent force pushes and branch deletion.
- Limit who can bypass the ruleset.
- Enable GitHub secret scanning and push protection where the repository plan supports them.
- Enable Dependabot security updates; `.github/dependabot.yml` is already present.

## First-run acceptance procedure

1. Open a test pull request changing only documentation.
2. Confirm both workflows start automatically.
3. Confirm Java 21 starts both Firebase Emulators.
4. Confirm `tests/firestore.rules.test.mjs` and `tests/database.rules.test.mjs` execute, rather than being skipped.
5. Confirm CodeQL uploads results to the Security tab.
6. Confirm branch protection blocks merge while either workflow is pending or failed.
7. Deliberately introduce a temporary test-only secret-shaped string and an expected-failing rules assertion on a disposable branch; confirm the gates block it, then remove the changes.
8. Record links to the successful and intentionally failed runs in the production security evidence package.

## Local equivalent

```bash
npm ci --ignore-scripts
npm --prefix backend ci --ignore-scripts
npm run ci:security
npm run test:firebase-rules  # requires Java 21
```

The local sandbox used during hardening could not execute the last command because no Java runtime was installed and JRE download access was blocked. This limitation does not count as a passing Emulator result.
