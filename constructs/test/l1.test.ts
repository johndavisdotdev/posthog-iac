import * as fs from 'fs';
import * as path from 'path';
import { App, CfnResource, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as lib from '../src';

/**
 * Data-driven tests for every generated L1. For each PostHog::* schema the
 * test builds the matching Cfn* construct with sample values for all
 * required properties (plus every optional top-level scalar), synthesizes it,
 * and checks the CloudFormation type, the PascalCase property names, and
 * that every read-only property is exposed as an attr* token.
 */

const ROOT = path.resolve(__dirname, '..', '..');
const SUBMODULES: Record<string, string> = {
  BatchExports: 'batchExports',
  CDP: 'cdp',
  DataWarehouse: 'dataWarehouse',
  ErrorTracking: 'errorTracking',
  Experiments: 'experiments',
  FeatureFlags: 'featureFlags',
  LLMAnalytics: 'llmAnalytics',
  Logs: 'logs',
  Organizations: 'organizations',
  ProductAnalytics: 'productAnalytics',
  Projects: 'projects',
  SessionReplay: 'sessionReplay',
  Surveys: 'surveys',
  Workflows: 'workflows',
};

interface Schema {
  typeName: string;
  properties: Record<string, any>;
  definitions?: Record<string, any>;
  required?: string[];
  readOnlyProperties?: string[];
}

const schemas: Schema[] = fs
  .readdirSync(ROOT)
  .filter(d => d.startsWith('posthog-') && fs.existsSync(path.join(ROOT, d, '.rpdk-config')))
  .map(d => JSON.parse(fs.readFileSync(path.join(ROOT, d, `${d}.json`), 'utf8')));

const camel = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

function resolveRef(schema: Schema, prop: any): any {
  if (prop && prop.$ref) {
    const name = prop.$ref.split('/').pop();
    return schema.definitions![name];
  }
  return prop;
}

/** Sample value in L1 (camelCase) form, and its expected CFN (PascalCase) form. */
function sample(schema: Schema, prop: any, depth = 0): [any, any] | undefined {
  prop = resolveRef(schema, prop);
  if (!prop || depth > 4) return undefined;
  if (prop.enum) return [prop.enum[0], prop.enum[0]];
  switch (prop.type) {
    case 'string': return ['sample', 'sample'];
    case 'boolean': return [true, true];
    case 'integer':
    case 'number': return [prop.minimum ?? 1, prop.minimum ?? 1];
    case 'array': {
      const item = sample(schema, prop.items, depth + 1);
      return item ? [[item[0]], [item[1]]] : undefined;
    }
    case 'object': {
      if (prop.patternProperties) return [{ key: 'value' }, { key: 'value' }];
      const l1: Record<string, any> = {};
      const cfn: Record<string, any> = {};
      for (const name of prop.required ?? []) {
        const s = sample(schema, prop.properties[name], depth + 1);
        if (!s) return undefined;
        l1[camel(name)] = s[0];
        cfn[name] = s[1];
      }
      return [l1, cfn];
    }
  }
  return undefined;
}

describe.each(schemas.map(s => [s.typeName, s] as [string, Schema]))('%s', (typeName, schema) => {
  const [, service] = typeName.split('::');
  const submodule = (lib as any)[SUBMODULES[service]];
  const L1 = Object.values(submodule ?? {}).find((v: any) => v?.CFN_RESOURCE_TYPE_NAME === typeName) as any;

  test('is exported from its service submodule', () => {
    expect(submodule).toBeDefined();
    expect(L1).toBeDefined();
    expect(L1.CFN_RESOURCE_TYPE_NAME).toBe(typeName);
  });

  test('synthesizes properties and exposes read-only attributes', () => {
    const readOnly = new Set((schema.readOnlyProperties ?? []).map(p => p.split('/').pop()!));
    const props: Record<string, any> = {};
    const expected: Record<string, any> = {};
    for (const [name, prop] of Object.entries(schema.properties)) {
      if (readOnly.has(name)) continue;
      const required = (schema.required ?? []).includes(name);
      const resolved = resolveRef(schema, prop);
      const scalar = ['string', 'boolean', 'integer', 'number'].includes(resolved?.type) || resolved?.enum;
      if (!required && !scalar) continue;
      const s = sample(schema, prop);
      if (!s) continue;
      props[camel(name)] = s[0];
      expected[name] = s[1];
    }

    const stack = new Stack(new App(), 'Test');
    const construct = new L1(stack, 'Resource', props);
    expect(construct).toBeInstanceOf(CfnResource);

    const template = Template.fromStack(stack);
    template.resourceCountIs(typeName, 1);
    template.hasResourceProperties(typeName, expected);

    for (const attr of readOnly) {
      // Attributes are string, number or IResolvable tokens depending on the schema type.
      const value = construct[`attr${attr}`];
      expect(value).toBeDefined();
      expect(stack.resolve(value)).toEqual({ 'Fn::GetAtt': [expect.any(String), attr] });
    }
  });
});

test('every resource type directory has an L1', () => {
  // Matches docs/resources.json; a new posthog-* directory must be added there too.
  const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'docs', 'resources.json'), 'utf8'));
  expect(schemas).toHaveLength(catalog.length);
  expect(schemas.map(s => s.typeName).sort()).toEqual(catalog.map((r: any) => r.type).sort());
});
