#!/usr/bin/env node

/**
 * Tattvora Org Bootstrap
 *
 * Run once to normalize all repos in the org:
 *   1. Labels             — create standard PR labels
 *   2. PR Template        — upsert PULL_REQUEST_TEMPLATE.md
 *   3. PR Labeler         — upsert caller workflow
 *   4. CI Workflow        — upsert lint/test/build workflow
 *   5. .gitignore         — upsert base .gitignore
 *   6. .editorconfig      — upsert base .editorconfig
 *   7. Repo Settings      — squash merge only, delete branch on merge, disable wiki
 *   8. Branch Protection  — protect main + develop
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_xxx ORG=your-org node bootstrap.js
 *
 * Options (env vars):
 *   WORKFLOW_BRANCH=main          Default branch for reusable workflow ref (default: main)
 *   SKIP_REPOS=repo1,repo2        Comma-separated repos to skip
 *   DRY_RUN=true                  Preview without making any changes
 *   TASKS=labels,template,...     Run specific tasks only (default: all)
 *                                 Options: labels, template, labeler, ci, gitignore, editorconfig, settings, protection
 */

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ORG = process.env.ORG;
const WORKFLOW_BRANCH = process.env.WORKFLOW_BRANCH || 'main';
const SKIP_REPOS = (process.env.SKIP_REPOS || '').split(',').filter(Boolean);
const DRY_RUN = process.env.DRY_RUN === 'true';
const TARGET_REPO = process.env.TARGET_REPO || null; // single repo mode
const TASKS = process.env.TASKS
    ? process.env.TASKS.split(',').map(t => t.trim())
    : ['labels', 'template', 'labeler', 'ci', 'gitignore', 'editorconfig', 'settings', 'protection'];

if (!GITHUB_TOKEN || !ORG) {
    console.error('ERROR: GITHUB_TOKEN and ORG env vars are required.');
    process.exit(1);
}

// ── Config ────────────────────────────────────────────────────────────────────

const LABELS = [
    { name: 'feature', color: '0075ca', description: 'New functionality' },
    { name: 'fix', color: 'd73a4a', description: 'Bug fix' },
    { name: 'hotfix', color: 'e4e669', description: 'Urgent production fix' },
    { name: 'refactor', color: 'cfd3d7', description: 'Code restructure, no behaviour change' },
    { name: 'perf', color: '0e8a16', description: 'Performance improvement' },
    { name: 'infra', color: 'f9d0c4', description: 'Infrastructure / config change' },
    { name: 'docs', color: '1d76db', description: 'Documentation only' },
    { name: 'chore', color: 'fef2c0', description: 'Maintenance, dependencies, tooling' },
    { name: 'release', color: '6f42c1', description: 'Release branch PR' },
];

const PR_TEMPLATE = `## 📌 Description
**What:**
**Why:**
**How (approach taken):**

---

## 🔧 Type
- [ ] **Feature** — New functionality
- [ ] **Fix** — Bug fix
- [ ] **Hotfix** — Urgent production fix
- [ ] **Refactor** — Code restructure, no behaviour change
- [ ] **Perf** — Performance improvement
- [ ] **Infra** — Infrastructure / config change
- [ ] **Docs** — Documentation only
- [ ] **Chore** — Maintenance, dependencies, tooling

---

## 🔗 Context
- **Issue/Ticket:** #
- **Branch:** \`feature/\` \`fix/\` \`hotfix/\` \`refactor/\` \`docs/\` \`chore/\`
- **Resources impacted:** EC2 / RDS / S3 / Lambda / etc.
- **Dependencies:** (other PRs, feature flags, migrations)

---

## 🧪 Testing
- [ ] Tested locally / staging
- [ ] Edge cases covered
- [ ] DB migration is backward-compatible (or N/A)
- [ ] No breaking changes to API contracts
- [ ] Rollback strategy: <!-- describe or mark N/A -->

---

## 📸 Evidence
<!-- Logs, curl output, screenshots, metric graphs — skip if N/A -->

---

## ✅ Checklist
- [ ] No hardcoded secrets/values
- [ ] Env vars documented (\`.env.example\` updated)
- [ ] Error handling + logging added
- [ ] Observability: metrics/alerts considered

---

## 👀 Review Focus
<!-- Tell reviewers where to concentrate: logic correctness / security / perf / schema design -->
`;

const CALLER_WORKFLOW = `name: PR Labeler

on:
  pull_request:
    types: [opened, edited]

jobs:
  label:
    uses: ${ORG}/.github/.github/workflow/pr-labeler-reusable.yml@${WORKFLOW_BRANCH}
    permissions:
      pull-requests: write
`;

const CI_WORKFLOW = `name: CI

on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop]

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm

      - name: Install dependencies
        run: npm ci

      - name: Lint
        run: npm run lint --if-present

      - name: Type check
        run: npm run typecheck --if-present

      - name: Test
        run: npm test --if-present

      - name: Build
        run: npm run build --if-present
`;

const GITIGNORE = `# Dependencies
node_modules/
.pnp
.pnp.js

# Build outputs
dist/
build/
out/
.next/
.nuxt/

# Environment
.env
.env.local
.env.*.local
!.env.example

# Logs
logs/
*.log
npm-debug.log*

# OS
.DS_Store
Thumbs.db

# IDE
.idea/
.vscode/
*.swp
*.swo

# Prisma
prisma/migrations/dev/

# AWS
.aws-sam/
cdk.out/
`;

const EDITORCONFIG = `root = true

[*]
indent_style = space
indent_size = 2
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true

[*.md]
trim_trailing_whitespace = false

[Makefile]
indent_style = tab
`;

// ── GitHub API ────────────────────────────────────────────────────────────────

const BASE = 'https://api.github.com';
const headers = {
    Authorization: `Bearer ${GITHUB_TOKEN}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'Content-Type': 'application/json',
};

/**
 * GitHub API wrapper.
 * Throws on 4xx/5xx (except 404 which returns null).
 *
 * @param {'GET'|'POST'|'PUT'|'PATCH'|'DELETE'} method - HTTP method
 * @param {string} path - GitHub API path e.g. `/repos/org/repo/labels`
 * @param {Object} [body] - Request payload
 * @returns {Promise<Object|null>} Parsed response or null on 204/404
 */
async function gh(method, path, body) {
    const res = await fetch(`${BASE}${path}`, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return null;
    const data = await res.json();
    if (res.status >= 400 && res.status !== 404) {
        throw new Error(`${method} ${path} → ${res.status}: ${JSON.stringify(data?.message || data)}`);
    }
    return res.status === 404 ? null : data;
}

/**
 * Fetches all non-archived repos in the org (paginated).
 *
 * @returns {Promise<Array<{name: string, default_branch: string, archived: boolean}>>}
 */
async function getAllRepos() {
    const repos = [];
    let page = 1;
    while (true) {
        const data = await gh('GET', `/orgs/${ORG}/repos?per_page=100&page=${page}&type=all`);
        if (!data || data.length === 0) break;
        // Skip archived repos automatically
        repos.push(...data.filter(r => !r.archived));
        page++;
    }
    return repos;
}

/**
 * Fetches metadata for a file in a repo.
 * Returns null if the file does not exist (404).
 *
 * @param {string} repo - Repo name
 * @param {string} path - File path e.g. `.github/PULL_REQUEST_TEMPLATE.md`
 * @returns {Promise<{sha: string}|null>}
 */
async function getFileInfo(repo, path) {
    return gh('GET', `/repos/${ORG}/${repo}/contents/${path}`);
}

/**
 * Creates or updates a file in a repo.
 * Automatically fetches the existing SHA if the file already exists.
 *
 * @param {string} repo - Repo name
 * @param {string} path - File path e.g. `.gitignore`
 * @param {string} content - File content (plain text, base64-encoded internally)
 * @param {string} commitMessage - Commit message for the change
 * @returns {Promise<Object>} GitHub API response
 */
async function upsertFile(repo, path, content, commitMessage) {
    const existing = await getFileInfo(repo, path);
    const body = {
        message: commitMessage,
        content: Buffer.from(content).toString('base64'),
    };
    if (existing?.sha) body.sha = existing.sha;
    return gh('PUT', `/repos/${ORG}/${repo}/contents/${path}`, body);
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

/**
 * Creates missing PR labels in a repo.
 * Skips labels that already exist — does not update colors or descriptions.
 *
 * @param {string} repo - Repo name
 * @returns {Promise<string[]>} Log lines for each label (created / skipped / dry-run)
 */
async function bootstrapLabels(repo) {
    const existing = await gh('GET', `/repos/${ORG}/${repo}/labels?per_page=100`);
    const existingNames = existing?.map(l => l.name) || [];
    const results = [];

    for (const label of LABELS) {
        if (existingNames.includes(label.name)) {
            results.push(`  ✓ label:${label.name}`);
            continue;
        }
        if (DRY_RUN) { results.push(`  ~ label:${label.name} (would create)`); continue; }
        await gh('POST', `/repos/${ORG}/${repo}/labels`, label);
        results.push(`  + label:${label.name}`);
    }
    return results;
}

/**
 * Upserts a single file into a repo.
 * Creates the file if missing, updates it if already present.
 *
 * @param {string} repo - Repo name
 * @param {string} filePath - Target file path in the repo
 * @param {string} content - File content
 * @param {string} commitMessage - Commit message
 * @returns {Promise<string[]>} Single-element log line array
 */
async function bootstrapFile(repo, filePath, content, commitMessage) {
    const existing = await getFileInfo(repo, filePath);
    const label = filePath.split('/').pop();

    if (DRY_RUN) return [`  ~ ${label} (would ${existing ? 'update' : 'create'})`];
    await upsertFile(repo, filePath, content, commitMessage);
    return [`  + ${label} (${existing ? 'updated' : 'created'})`];
}

/**
 * Applies standard repo settings via GitHub PATCH API:
 * - Squash merge only (no merge commits, no rebase)
 * - Auto-delete head branch after merge
 * - Disable wiki and projects
 * - Enable "always suggest updating PR branches"
 *
 * @param {string} repo - Repo name
 * @returns {Promise<string[]>} Log line array
 */
async function bootstrapRepoSettings(repo) {
    if (DRY_RUN) return ['  ~ settings (would update)'];

    await gh('PATCH', `/repos/${ORG}/${repo}`, {
        // Merge strategy: squash only — keeps develop history clean
        allow_squash_merge: true,
        allow_merge_commit: false,
        allow_rebase_merge: false,
        // Auto-delete head branch after merge — enforces short-lived branches
        delete_branch_on_merge: true,
        // Disable unused features
        has_wiki: false,
        has_projects: false,
        // Always suggest updating PR branches
        allow_update_branch: true,
    });
    return ['  + settings updated'];
}

/**
 * Applies branch protection rules to `main` and `develop`.
 *
 * main:    2 approvals, enforce_admins, CI status check required
 * develop: 1 approval, dismiss stale reviews
 *
 * Skips gracefully if a branch doesn't exist yet (e.g. fresh repo without develop).
 *
 * @param {string} repo - Repo name
 * @param {string} defaultBranch - Repo default branch (unused currently, reserved for future)
 * @returns {Promise<string[]>} Log lines per branch
 */
async function bootstrapBranchProtection(repo, defaultBranch) {
    const results = [];
    const branches = ['main', 'develop'];

    // Skip develop protection if it's the default branch and doesn't exist yet
    for (const branch of branches) {
        if (DRY_RUN) {
            results.push(`  ~ protection:${branch} (would apply)`);
            continue;
        }

        const isMain = branch === 'main';
        try {
            await gh('PUT', `/repos/${ORG}/${repo}/branches/${branch}/protection`, {
                required_status_checks: {
                    strict: true,              // Require branch to be up to date before merge
                    contexts: isMain ? ['CI'] : [],
                },
                enforce_admins: isMain,      // Stricter on main
                required_pull_request_reviews: {
                    required_approving_review_count: isMain ? 2 : 1,
                    dismiss_stale_reviews: true,
                    require_code_owner_reviews: false,
                },
                restrictions: null,          // No push restrictions beyond rules
                allow_force_pushes: false,
                allow_deletions: false,
            });
            results.push(`  + protection:${branch}`);
        } catch (err) {
            // Branch may not exist yet (e.g. develop on a brand new repo)
            results.push(`  ✗ protection:${branch} — ${err.message}`);
        }
    }
    return results;
}

// ── Main ──────────────────────────────────────────────────────────────────────

/**
 * Runs all enabled bootstrap tasks against a single repo.
 * Each task is isolated — failure in one does not block others.
 *
 * @param {{ name: string, default_branch: string }} repo - Repo object
 * @returns {Promise<string[]>} Aggregated log lines from all tasks
 */
async function processRepo(repo) {
    const log = [];

    const taskMap = {
        labels: () => bootstrapLabels(repo.name),
        template: () => bootstrapFile(repo.name, '.github/PULL_REQUEST_TEMPLATE.md', PR_TEMPLATE, 'chore: add PR template'),
        labeler: () => bootstrapFile(repo.name, '.github/workflows/pr-labeler.yml', CALLER_WORKFLOW, 'chore: add PR labeler workflow'),
        ci: () => bootstrapFile(repo.name, '.github/workflows/ci.yml', CI_WORKFLOW, 'chore: add CI workflow'),
        gitignore: () => bootstrapFile(repo.name, '.gitignore', GITIGNORE, 'chore: add .gitignore'),
        editorconfig: () => bootstrapFile(repo.name, '.editorconfig', EDITORCONFIG, 'chore: add .editorconfig'),
        settings: () => bootstrapRepoSettings(repo.name),
        protection: () => bootstrapBranchProtection(repo.name, repo.default_branch),
    };

    for (const task of TASKS) {
        if (!taskMap[task]) { log.push(`  ✗ unknown task: ${task}`); continue; }
        try {
            const results = await taskMap[task]();
            log.push(...results);
        } catch (err) {
            log.push(`  ✗ ${task}: ${err.message}`);
        }
    }

    return log;
}

/**
 * Entry point.
 *
 * Resolves repo list (single via TARGET_REPO or all org repos),
 * runs processRepo() for each, and prints a summary report.
 *
 * @returns {Promise<void>}
 */
async function main() {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' Tattvora Org Bootstrap');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`Org:         ${ORG}`);
    console.log(`Tasks:       ${TASKS.join(', ')}`);
    console.log(`Dry run:     ${DRY_RUN}`);
    console.log(`Skip repos:  ${SKIP_REPOS.join(', ') || 'none'}`);

    const repos = TARGET_REPO
        ? [{ name: TARGET_REPO, default_branch: 'main', archived: false }]
        : await getAllRepos();

    console.log(`Mode:        ${TARGET_REPO ? `single → ${TARGET_REPO}` : 'all repos'}`);
    console.log(`Repos found: ${repos.length} (archived excluded)\n`);

    const summary = { success: [], skipped: [], failed: [] };

    for (const repo of repos) {
        if (SKIP_REPOS.includes(repo.name)) {
            console.log(`── ${repo.name} — skipped`);
            summary.skipped.push(repo.name);
            continue;
        }

        console.log(`\n── ${repo.name} ──`);
        const log = await processRepo(repo);
        log.forEach(l => console.log(l));

        const hasFail = log.some(l => l.includes('✗'));
        hasFail ? summary.failed.push(repo.name) : summary.success.push(repo.name);
    }

    console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(' Summary');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`✓ Success: ${summary.success.length} repos`);
    console.log(`~ Skipped: ${summary.skipped.length} repos`);
    console.log(`✗ Failed:  ${summary.failed.length} repos${summary.failed.length ? ' → ' + summary.failed.join(', ') : ''}`);
}

main().catch(err => {
    console.error('\nFATAL:', err.message);
    process.exit(1);
});