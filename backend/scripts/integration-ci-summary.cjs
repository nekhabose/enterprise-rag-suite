#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const rootDir = __dirname ? path.resolve(__dirname, '..') : process.cwd();
const jestBin = path.join(rootDir, 'node_modules', '.bin', process.platform === 'win32' ? 'jest.cmd' : 'jest');
const reportFile = path.join(rootDir, '.tmp-integration-report.json');

if (!fs.existsSync(jestBin)) {
  console.error('Jest binary not found. Run `cd backend && npm install` first.');
  process.exit(1);
}

const run = spawnSync(
  jestBin,
  [
    '--config',
    'jest.integration.config.cjs',
    '--runInBand',
    '--bail=1',
    '--json',
    `--outputFile=${reportFile}`
  ],
  {
    cwd: rootDir,
    stdio: 'inherit',
    shell: false
  }
);

const printSummary = () => {
  if (!fs.existsSync(reportFile)) {
    console.log('\nIntegration Summary: report file not generated');
    return;
  }

  const raw = fs.readFileSync(reportFile, 'utf-8');
  const json = JSON.parse(raw);
  const sectionStats = new Map();

  for (const suite of json.testResults || []) {
    for (const assertion of suite.assertionResults || []) {
      const section = (assertion.ancestorTitles && assertion.ancestorTitles[0]) || 'Uncategorized';
      if (!sectionStats.has(section)) {
        sectionStats.set(section, { passed: 0, failed: 0, skipped: 0, total: 0 });
      }
      const stat = sectionStats.get(section);
      stat.total += 1;
      if (assertion.status === 'passed') stat.passed += 1;
      else if (assertion.status === 'failed') stat.failed += 1;
      else stat.skipped += 1;
    }
  }

  console.log('\n=== Integration Section Summary ===');
  for (const [section, stat] of sectionStats.entries()) {
    const status = stat.failed > 0 ? 'FAIL' : stat.passed > 0 ? 'PASS' : 'SKIP';
    console.log(
      `${status.padEnd(4)} | ${section} | ${stat.passed}/${stat.total} passed` +
      (stat.failed ? `, ${stat.failed} failed` : '') +
      (stat.skipped ? `, ${stat.skipped} skipped` : '')
    );
  }
  console.log(
    `TOTAL | ${json.numPassedTests}/${json.numTotalTests} passed` +
    (json.numFailedTests ? `, ${json.numFailedTests} failed` : '') +
    (json.numPendingTests ? `, ${json.numPendingTests} pending` : '')
  );
};

try {
  printSummary();
} finally {
  if (fs.existsSync(reportFile)) {
    fs.unlinkSync(reportFile);
  }
}

process.exit(run.status === null ? 1 : run.status);
