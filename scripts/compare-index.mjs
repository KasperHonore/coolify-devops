#!/usr/bin/env node
// Compare two discovery indexes by skill name and digest. Exit 0 when the skill
// content is identical, 1 when it differs (with the differing names), 2 on usage.
import { readFileSync } from 'node:fs';
const [a, b] = process.argv.slice(2);
if (!a || !b) { console.error('Usage: node scripts/compare-index.mjs <index.json> <index.json>'); process.exit(2); }
const load = (f) => new Map(JSON.parse(readFileSync(f, 'utf8')).skills.map((s) => [s.name, s.digest]));
const [x, y] = [load(a), load(b)];
const names = new Set([...x.keys(), ...y.keys()]);
const diff = [...names].filter((n) => x.get(n) !== y.get(n));
if (diff.length) { console.error(`Skill content differs: ${diff.join(', ')}`); process.exit(1); }
console.log('Skill content identical');
