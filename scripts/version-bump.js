#!/usr/bin/env node

/**
 * Version Bump Script
 *
 * Usage:
 *   npm run version:patch  - Bump patch version (0.0.X)
 *   npm run version:minor  - Bump minor version (0.X.0)
 *   npm run version:major  - Bump major version (X.0.0)
 *
 * This script:
 * 1. Updates package.json version
 * 2. Updates CHANGELOG.md with new version section
 * 3. Commits changes
 * 4. Creates git tag
 */

const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const bumpType = process.argv[2]; // 'patch', 'minor', or 'major'

if (!['patch', 'minor', 'major'].includes(bumpType)) {
  console.error('Usage: node version-bump.js [patch|minor|major]');
  process.exit(1);
}

// Read package.json
const packagePath = path.join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
const currentVersion = packageJson.version;

// Calculate new version
const [major, minor, patch] = currentVersion.split('.').map(Number);
let newVersion;

switch (bumpType) {
  case 'major':
    newVersion = `${major + 1}.0.0`;
    break;
  case 'minor':
    newVersion = `${major}.${minor + 1}.0`;
    break;
  case 'patch':
    newVersion = `${major}.${minor}.${patch + 1}`;
    break;
}

console.log(`Bumping version from ${currentVersion} to ${newVersion}`);

// Update package.json
packageJson.version = newVersion;
fs.writeFileSync(packagePath, JSON.stringify(packageJson, null, 2) + '\n');
console.log('✓ Updated package.json');

// Update CHANGELOG.md
const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');
const changelog = fs.readFileSync(changelogPath, 'utf8');

const today = new Date().toISOString().split('T')[0];
const newChangelogEntry = `## [${newVersion}] - ${today}`;

// Replace [Unreleased] section with new version
const updatedChangelog = changelog.replace(
  '## [Unreleased]',
  `## [Unreleased]

### Added
-

### Changed
-

### Fixed
-

${newChangelogEntry}`
);

fs.writeFileSync(changelogPath, updatedChangelog);
console.log('✓ Updated CHANGELOG.md');

// Git operations
try {
  // Check if there are uncommitted changes
  const status = execSync('git status --porcelain').toString().trim();

  if (status && !status.includes('package.json') && !status.includes('CHANGELOG.md')) {
    console.warn('⚠️  Warning: You have uncommitted changes besides version files');
    console.warn('   Commit or stash them before continuing');
  }

  // Add version files
  execSync('git add package.json CHANGELOG.md');

  // Commit
  execSync(`git commit -m "chore: bump version to ${newVersion}"`);
  console.log('✓ Committed version changes');

  // Create tag
  execSync(`git tag -a v${newVersion} -m "Release v${newVersion}"`);
  console.log(`✓ Created tag v${newVersion}`);

  console.log('\n✅ Version bump complete!');
  console.log('\nNext steps:');
  console.log(`  1. Update CHANGELOG.md [Unreleased] section with your changes`);
  console.log(`  2. Commit the CHANGELOG updates if needed`);
  console.log(`  3. Push changes: git push origin master`);
  console.log(`  4. Push tag: git push origin v${newVersion}`);
  console.log(`  5. Merge to master to trigger deployment`);

} catch (error) {
  console.error('❌ Git operations failed:', error.message);
  console.log('\nYou can manually commit and tag:');
  console.log(`  git add package.json CHANGELOG.md`);
  console.log(`  git commit -m "chore: bump version to ${newVersion}"`);
  console.log(`  git tag -a v${newVersion} -m "Release v${newVersion}"`);
  process.exit(1);
}
