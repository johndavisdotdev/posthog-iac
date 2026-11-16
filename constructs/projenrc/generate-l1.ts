/**
 * Generates the L1 (Cfn*) constructs for every PostHog::* CloudFormation
 * resource type from the resource schemas in ../posthog-* /.
 *
 *   npx projen generate:l1
 *
 * For each schema it runs `cdk-import cfn -l typescript -s <schema>`, then
 * post-processes the output so it is valid, collision-free jsii:
 *
 * - writes src/<service>/<resource>.generated.ts (one directory per PostHog
 *   service; each becomes a jsii submodule, e.g. `featureFlags`, `cdp`)
 * - prefixes nested definition types with the L1 class name
 *   (DomainData -> CfnOrganizationDomainData) so two resources in the same
 *   service can never export the same type name
 * - makes the toJson_* helpers module-private (jsii cannot export functions)
 * - types string-map properties (patternProperties of strings) as
 *   { [key: string]: string } instead of `any`
 * - writes src/<service>/index.ts and the root src/index.ts. Hand-written
 *   L2/L3 files in a service directory are exported too, if listed in that
 *   directory's `l2.ts` barrel (created empty when missing).
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '..', '..');
const SRC = path.resolve(__dirname, '..', 'src');
const CDK_IMPORT = path.resolve(__dirname, '..', 'node_modules', '.bin', 'cdk-import');

/** PostHog service segment -> [directory name, jsii submodule export name]. */
const SERVICES: Record<string, [string, string]> = {
  BatchExports: ['batch-exports', 'batchExports'],
  CDP: ['cdp', 'cdp'],
  DataWarehouse: ['data-warehouse', 'dataWarehouse'],
  ErrorTracking: ['error-tracking', 'errorTracking'],
  Experiments: ['experiments', 'experiments'],
  FeatureFlags: ['feature-flags', 'featureFlags'],
  LLMAnalytics: ['llm-analytics', 'llmAnalytics'],
  Logs: ['logs', 'logs'],
  Organizations: ['organizations', 'organizations'],
  ProductAnalytics: ['product-analytics', 'productAnalytics'],
  Projects: ['projects', 'projects'],
  SessionReplay: ['session-replay', 'sessionReplay'],
  Surveys: ['surveys', 'surveys'],
  Workflows: ['workflows', 'workflows'],
};

interface Schema {
  typeName: string;
  properties: Record<string, any>;
  definitions?: Record<string, any>;
  readOnlyProperties?: string[];
}

function kebab(s: string): string {
  return s.replace(/([a-z0-9])([A-Z])/g, '$1-$2').replace(/([A-Z])([A-Z][a-z])/g, '$1-$2').toLowerCase();
}

function camel(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function isStringMap(prop: any): boolean {
  if (!prop || prop.type !== 'object' || !prop.patternProperties) return false;
  return Object.values(prop.patternProperties).every((v: any) => v && v.type === 'string');
}

/** Replace `readonly name?: any;` with a string map inside one interface block. */
function typeStringMaps(code: string, iface: string, props: Record<string, any>): string {
  const start = code.indexOf(`export interface ${iface} {`);
  if (start < 0) return code;
  const end = code.indexOf('\n}\n', start);
  let block = code.slice(start, end);
  for (const [name, prop] of Object.entries(props ?? {})) {
    if (!isStringMap(prop)) continue;
    const re = new RegExp(`readonly ${camel(name)}(\\??): any;`);
    block = block.replace(re, `readonly ${camel(name)}$1: { [key: string]: string };`);
  }
  return code.slice(0, start) + block + code.slice(end);
}

function generate(schemaPath: string, tmp: string): { service: string; file: string; className: string } {
  const schema: Schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  const [, service, resource] = schema.typeName.split('::');
  const svc = SERVICES[service];
  if (!svc) throw new Error(`no service mapping for ${schema.typeName}`);
  const out = fs.mkdtempSync(path.join(tmp, 'gen-'));
  execFileSync(CDK_IMPORT, ['cfn', '-l', 'typescript', '-s', schemaPath, '-o', out, schema.typeName], {
    stdio: ['ignore', 'ignore', 'pipe'],
    env: { ...process.env, AWS_SDK_JS_SUPPRESS_MAINTENANCE_MODE_MESSAGE: '1' },
  });
  const generatedFile = fs.readdirSync(out).find(f => f.endsWith('.ts'));
  if (!generatedFile) throw new Error(`cdk-import produced no output for ${schema.typeName}`);
  let code = fs.readFileSync(path.join(out, generatedFile), 'utf8');
  // cdk-import normalises the class name (e.g. ITContact -> CfnItContact).
  const className = /export class (\w+) extends cdk\.CfnResource/.exec(code)?.[1];
  if (!className) throw new Error(`no L1 class found for ${schema.typeName}`);

  // 1. Type string maps (before renaming, while definition names are original).
  code = typeStringMaps(code, `${className}Props`, schema.properties);
  for (const [defName, def] of Object.entries(schema.definitions ?? {})) {
    code = typeStringMaps(code, defName, def.properties);
  }

  // 2. Prefix definition types with the class name.
  const defs = Object.keys(schema.definitions ?? {}).sort((a, b) => b.length - a.length);
  for (const def of defs) {
    const prefixed = def.startsWith(className) ? def : `${className}${def}`;
    if (prefixed === def) continue;
    code = code
      .replace(new RegExp(`\\binterface ${def}\\b`, 'g'), `interface ${prefixed}`)
      .replace(new RegExp(`\\benum ${def}\\b`, 'g'), `enum ${prefixed}`)
      .replace(new RegExp(`toJson_${def}\\b`, 'g'), `toJson_${prefixed}`)
      .replace(new RegExp(`([:<(|,]\\s*)${def}\\b`, 'g'), `$1${prefixed}`)
      .replace(new RegExp(`\\b${def}(\\[\\])`, 'g'), `${prefixed}$1`)
      .replace(new RegExp(`@schema ${def}\\b`, 'g'), `@schema ${prefixed}`)
      .replace(new RegExp(`type '${def}'`, 'g'), `type '${prefixed}'`);
  }

  // 2b. Prefix generated enums (cdk-import names them <Definition><Property>).
  const enums = [...code.matchAll(/export enum (\w+)/g)].map(m => m[1]).filter(e => !e.startsWith(className));
  for (const e of enums.sort((a, b) => b.length - a.length)) {
    code = code.replace(new RegExp(`\\b${e}\\b`, 'g'), `${className}${e}`);
  }

  // 3. jsii cannot export free functions.
  code = code.replace(/^export function toJson_/gm, 'function toJson_');

  // 4. Header.
  code = code.replace(
    '// Generated by cdk-import',
    `// Generated by projenrc/generate-l1.ts from ${path.relative(path.dirname(SRC), schemaPath)}. DO NOT EDIT.`,
  );

  const dir = path.join(SRC, svc[0]);
  fs.mkdirSync(dir, { recursive: true });
  const file = `${kebab(resource)}.generated.ts`;
  fs.writeFileSync(path.join(dir, file), code);
  return { service, file, className };
}

function main(): void {
  if (!fs.existsSync(CDK_IMPORT)) throw new Error('cdk-import is not installed; run npx projen install');
  const schemas = fs
    .readdirSync(ROOT)
    .filter(d => d.startsWith('posthog-') && fs.existsSync(path.join(ROOT, d, '.rpdk-config')))
    .map(d => path.join(ROOT, d, `${d}.json`))
    .sort();

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'posthog-l1-'));
  const byService = new Map<string, string[]>();
  try {
    for (const schema of schemas) {
      const { service, file, className } = generate(schema, tmp);
      console.log(`${className.padEnd(48)} -> src/${SERVICES[service][0]}/${file}`);
      byService.set(service, [...(byService.get(service) ?? []), file]);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  // Per-service barrels.
  const services = [...byService.keys()].sort();
  for (const service of services) {
    const [dir] = SERVICES[service];
    const files = byService.get(service)!.sort();
    const l2 = path.join(SRC, dir, 'l2.ts');
    if (!fs.existsSync(l2)) {
      fs.writeFileSync(l2, '// Hand-written L2/L3 constructs for this service are exported from here.\nexport {};\n');
    }
    const lines = [
      '// Generated by projenrc/generate-l1.ts. DO NOT EDIT.',
      ...files.map(f => `export * from './${f.replace(/\.ts$/, '')}';`),
      "export * from './l2';",
      '',
    ];
    fs.writeFileSync(path.join(SRC, dir, 'index.ts'), lines.join('\n'));
  }

  // Root index: one jsii submodule per service, plus shared code in src/core.
  const root = [
    '// Generated by projenrc/generate-l1.ts. DO NOT EDIT.',
    // Shared models (property filters, ...) used across services.
    ...(fs.existsSync(path.join(SRC, 'core', 'index.ts')) ? ["export * as core from './core';"] : []),
    ...services.map(s => `export * as ${SERVICES[s][1]} from './${SERVICES[s][0]}';`),
    // Cross-service L3 patterns.
    ...(fs.existsSync(path.join(SRC, 'patterns', 'index.ts')) ? ["export * as patterns from './patterns';"] : []),
    '',
  ];
  fs.writeFileSync(path.join(SRC, 'index.ts'), root.join('\n'));
  console.log(`\nGenerated ${schemas.length} L1 constructs in ${services.length} submodules.`);
}

main();
