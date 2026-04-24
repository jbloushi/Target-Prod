import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const targets = ['src'];
const markerRegex = /^(<<<<<<<|=======|>>>>>>>)/m;
const skipExt = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf']);

const failures = [];

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (skipExt.has(ext)) continue;
    const content = fs.readFileSync(full, 'utf8');
    if (markerRegex.test(content)) failures.push(path.relative(root, full));
  }
}

for (const target of targets) {
  const full = path.join(root, target);
  if (fs.existsSync(full)) walk(full);
}

if (failures.length > 0) {
  console.error('❌ Merge conflict markers found in:');
  failures.forEach((f) => console.error(` - ${f}`));
  process.exit(1);
}

console.log('✅ No merge conflict markers detected.');
