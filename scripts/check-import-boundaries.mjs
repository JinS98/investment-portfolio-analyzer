import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

const root = process.cwd();
const sourceRoot = path.join(root, 'src');
const configPath = path.join(root, 'tsconfig.app.json');
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
if (configFile.error)
  throw new Error(ts.flattenDiagnosticMessageText(configFile.error.messageText, '\n'));
const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
const issues = [];
const edges = new Map();
const ranks = new Map([
  ['shared', 0],
  ['entities', 1],
  ['features', 2],
  ['widgets', 3],
  ['pages', 4],
  ['app', 5],
]);

const relative = (file) => path.relative(root, file).replaceAll('\\', '/');
const location = (file) => {
  const parts = relative(file).split('/');
  if (parts[0] !== 'src') return null;
  if (parts[1] === 'App.tsx') return { layer: 'app' };
  if (!ranks.has(parts[1])) return null;
  return { layer: parts[1], unit: parts[2] };
};

for (const file of config.fileNames.filter((name) => /\.tsx?$/.test(name))) {
  const source = ts.createSourceFile(
    file,
    fs.readFileSync(file, 'utf8'),
    ts.ScriptTarget.Latest,
    true,
  );
  const from = location(file);
  const dependencies = [];
  for (const node of source.statements) {
    if (!ts.isImportDeclaration(node) && !ts.isExportDeclaration(node)) continue;
    if (!node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) continue;
    const specifier = node.moduleSpecifier.text;
    const resolved = ts.resolveModuleName(specifier, file, config.options, ts.sys).resolvedModule;
    if (!resolved) continue;
    const targetFile = path.normalize(resolved.resolvedFileName);
    if (!targetFile.startsWith(sourceRoot + path.sep)) continue;
    const to = location(targetFile);
    if (!from || !to) continue;

    if (ranks.get(from.layer) < ranks.get(to.layer)) {
      issues.push(`${relative(file)}: ${specifier} imports higher layer ${to.layer}`);
    }
    for (const layer of ['features', 'widgets']) {
      if (to.layer !== layer) continue;
      if (from.layer === layer && from.unit === to.unit) {
        if (targetFile === path.join(sourceRoot, layer, to.unit, 'index.ts')) {
          issues.push(`${relative(file)}: imports its own public API`);
        }
      } else if (targetFile !== path.join(sourceRoot, layer, to.unit, 'index.ts')) {
        issues.push(`${relative(file)}: import ${layer}/${to.unit} through its index.ts`);
      }
    }

    const isTypeOnly = ts.isImportDeclaration(node)
      ? node.importClause?.isTypeOnly
      : node.isTypeOnly;
    if (!isTypeOnly) dependencies.push(targetFile);
  }
  edges.set(path.normalize(file), dependencies);
}

const visited = new Set();
const active = new Set();
const stack = [];
function visit(file) {
  if (active.has(file)) {
    const start = stack.indexOf(file);
    issues.push(
      `runtime import cycle: ${[...stack.slice(start), file].map(relative).join(' -> ')}`,
    );
    return;
  }
  if (visited.has(file)) return;
  visited.add(file);
  active.add(file);
  stack.push(file);
  for (const dependency of edges.get(file) ?? []) visit(dependency);
  stack.pop();
  active.delete(file);
}
for (const file of edges.keys()) visit(file);

if (issues.length) {
  for (const issue of issues) console.error(issue);
  process.exitCode = 1;
} else {
  console.log(`Import boundaries and runtime cycles: ${edges.size} modules checked.`);
}
