#!/usr/bin/env node
// Print the CHANGELOG.md entry for one version (the release notes). Exits 1 if missing.
import { readFileSync } from 'node:fs';
const version = process.argv[2];
if (!version) { console.error('Usage: node scripts/changelog-section.mjs <version>'); process.exit(2); }
const src = readFileSync(new URL('../CHANGELOG.md', import.meta.url), 'utf8');
const re = new RegExp(`^## ${version.replace(/\./g, '\\.')}\\b[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm');
const m = src.match(re);
if (!m) { console.error(`CHANGELOG.md has no "## ${version}" section`); process.exit(1); }
process.stdout.write(m[1].trim() + '\n');
