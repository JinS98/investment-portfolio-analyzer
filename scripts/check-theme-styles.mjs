import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const stylesRoot = path.join(root, 'src');
const tokens = fs.readFileSync(path.join(stylesRoot, 'shared/styles/_tokens.scss'), 'utf8');
const [light, dark] = tokens.split(":root[data-theme='dark'] {");
if (!dark) throw new Error('Missing dark theme tokens');

const definitions = (content) =>
  new Set([...content.matchAll(/--([a-z-]+):/g)].map((match) => match[1]));
const lightTokens = definitions(light);
const darkTokens = definitions(dark);
const issues = [];
for (const name of lightTokens) {
  if (!darkTokens.has(name)) issues.push(`Missing dark token: --${name}`);
}
for (const name of darkTokens) {
  if (!lightTokens.has(name)) issues.push(`Missing light token: --${name}`);
}

function* walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) yield* walk(file);
    else if (file.endsWith('.scss')) yield file;
  }
}

let checked = 0;
for (const file of walk(stylesRoot)) {
  checked++;
  const content = fs.readFileSync(file, 'utf8');
  const label = path.relative(root, file).replaceAll('\\', '/');
  if (/\[class\s*\*=/.test(content)) issues.push(`${label}: partial CSS class selector`);
  if (/\$color-[a-z-]+/.test(content)) issues.push(`${label}: legacy Sass color`);
  for (const [, name] of content.matchAll(/var\(--([a-z-]+)/g)) {
    if (!lightTokens.has(name)) issues.push(`${label}: undefined token --${name}`);
  }
}

if (issues.length) {
  for (const issue of [...new Set(issues)]) console.error(issue);
  process.exitCode = 1;
} else {
  console.log(`Theme tokens and selectors: ${checked} stylesheets checked.`);
}
