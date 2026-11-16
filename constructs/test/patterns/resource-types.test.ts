import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { App, Stack } from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as patterns from '../../src/patterns';

const { PostHogResourceType, PostHogResourceTypes } = patterns;

const REPO_ROOT = path.join(__dirname, '..', '..', '..');
const ALL = PostHogResourceType.all();
const SECRET_ARN = 'arn:aws:secretsmanager:us-east-1:111111111111:secret:posthog-api-key-AbCdEf';

let tmp: string;

/** A directory with a fake zip for every type (no real handler packages needed). */
function fakePackages(types = ALL, layout: 'flat' | 'nested' = 'flat'): string {
  const dir = fs.mkdtempSync(path.join(tmp, 'pkgs-'));
  for (const t of types) {
    const target = layout === 'flat' ? dir : path.join(dir, t.packageName);
    fs.mkdirSync(target, { recursive: true });
    fs.writeFileSync(path.join(target, `${t.packageName}.zip`), `fake ${t.typeName}`);
  }
  return dir;
}

function stack() {
  return new Stack(new App({ outdir: fs.mkdtempSync(path.join(tmp, 'out-')) }), 'Test', {
    env: { account: '111111111111', region: 'us-east-1' },
  });
}

function importedSecret(s: Stack) {
  return secretsmanager.Secret.fromSecretCompleteArn(s, 'ApiKey', SECRET_ARN);
}

/** Turns a resolved Create/Update value back into the call object the Lambda handler sees. */
function decodeCall(value: unknown, refs: (ref: unknown) => string = r => `<${JSON.stringify(r)}>`): any {
  let raw: string;
  if (typeof value === 'string') {
    raw = value;
  } else {
    const [delim, parts] = (value as any)['Fn::Join'];
    raw = (parts as unknown[]).map(p => (typeof p === 'string' ? p : refs(p))).join(delim);
  }
  return JSON.parse(raw);
}

function configResources(t: Template) {
  return Object.values(t.findResources('Custom::PostHogTypeConfiguration'));
}

function roleStatements(t: Template): any[] {
  return Object.values(t.findResources('AWS::IAM::Role'))
    .flatMap((r: any) => (r.Properties.Policies ?? []).flatMap((p: any) => p.PolicyDocument.Statement));
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'posthog-resource-types-'));
});
afterAll(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

describe('PostHogResourceType catalog', () => {
  test('has 49 distinct types and lookups', () => {
    expect(ALL).toHaveLength(49);
    expect(new Set(ALL.map(t => t.typeName)).size).toBe(49);
    expect(PostHogResourceType.fromTypeName('PostHog::FeatureFlags::FeatureFlag')).toBe(PostHogResourceType.FEATURE_FLAGS_FEATURE_FLAG);
    expect(PostHogResourceType.FEATURE_FLAGS_FEATURE_FLAG.packageName).toBe('posthog-featureflags-featureflag');
    expect(() => PostHogResourceType.fromTypeName('PostHog::Nope::Nope')).toThrow(/Unknown PostHog resource type/);
  });

  test('matches docs/resources.json and the schemas handler permissions (no drift)', () => {
    const resources: Array<{ type: string; dir: string }> = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs', 'resources.json'), 'utf-8'));
    const expected = resources.map(r => {
      const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, r.dir, `${r.dir}.json`), 'utf-8'));
      expect(schema.typeName).toBe(r.type);
      const perms = new Set<string>();
      for (const h of Object.values<any>(schema.handlers ?? {})) {
        for (const p of h.permissions ?? []) perms.add(p);
      }
      return { typeName: r.type, packageName: r.dir, permissions: [...perms].sort() };
    });
    const actual = ALL.map(t => ({ typeName: t.typeName, packageName: t.packageName, permissions: [...t.handlerPermissions].sort() }));
    expect(actual).toEqual(expected);

    // Constant names follow the type name, e.g. FEATURE_FLAGS_FEATURE_FLAG.
    const snake = (s: string) => s.replace(/(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])/g, '_').toUpperCase();
    for (const t of ALL) {
      const [, service, resource] = t.typeName.split('::');
      expect((PostHogResourceType as any)[`${snake(service)}_${snake(resource)}`]).toBe(t);
    }
  });

  test('Secrets Manager writers carry PutSecretValue', () => {
    const writers = ALL.filter(t => t.handlerPermissions.includes('secretsmanager:PutSecretValue'));
    expect(writers).toEqual(expect.arrayContaining([
      PostHogResourceType.PROJECTS_SECRET_API_KEY,
      PostHogResourceType.ORGANIZATIONS_IDENTITY_PROVIDER_CONFIG,
    ]));
  });

  test('every schema takes ApiKey and BaseUrl type configuration', () => {
    for (const t of ALL) {
      const schema = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, t.packageName, `${t.packageName}.json`), 'utf-8'));
      expect(Object.keys(schema.typeConfiguration.properties).sort()).toEqual(['ApiKey', 'BaseUrl']);
    }
  });
});

describe('PostHogResourceTypes', () => {
  test('registers every type by default with one asset, version and default version each', () => {
    const s = stack();
    const reg = new PostHogResourceTypes(s, 'Types', { handlerPackageDirectory: fakePackages(), apiKeySecret: importedSecret(s) });
    const t = Template.fromStack(s);

    t.resourceCountIs('AWS::CloudFormation::ResourceVersion', 49);
    t.resourceCountIs('AWS::CloudFormation::ResourceDefaultVersion', 49);
    t.resourceCountIs('Custom::PostHogTypeConfiguration', 49);
    for (const type of ALL) {
      t.hasResourceProperties('AWS::CloudFormation::ResourceVersion', {
        TypeName: type.typeName,
        SchemaHandlerPackage: Match.anyValue(),
        ExecutionRoleArn: Match.anyValue(),
        LoggingConfig: { LogGroupName: Match.anyValue(), LogRoleArn: Match.anyValue() },
      });
      const asset = reg.registration(type).handlerPackage;
      expect(asset.isFile && asset.isZipArchive).toBe(true);
    }
    expect(reg.types).toHaveLength(49);
    const urls = Object.values(t.findResources('AWS::CloudFormation::ResourceVersion')).map(r => r.Properties.SchemaHandlerPackage);
    expect(new Set(urls.map(u => JSON.stringify(u))).size).toBe(49);
  });

  test('default version points at the registered version; lookups expose ARNs', () => {
    const s = stack();
    const type = PostHogResourceType.PRODUCT_ANALYTICS_ACTION;
    const reg = new PostHogResourceTypes(s, 'Types', { handlerPackageDirectory: fakePackages([type]), types: [type], apiKeySecret: importedSecret(s) });
    const t = Template.fromStack(s);

    const versionId = Object.keys(t.findResources('AWS::CloudFormation::ResourceVersion'))[0];
    t.hasResourceProperties('AWS::CloudFormation::ResourceDefaultVersion', { TypeVersionArn: { 'Fn::GetAtt': [versionId, 'Arn'] } });
    const defaultId = Object.keys(t.findResources('AWS::CloudFormation::ResourceDefaultVersion'))[0];
    expect(s.resolve(reg.versionArn(type))).toEqual({ 'Fn::GetAtt': [versionId, 'Arn'] });
    expect(s.resolve(reg.typeArn(type))).toEqual({ 'Fn::GetAtt': [defaultId, 'Arn'] });
    expect(() => reg.typeArn(PostHogResourceType.SURVEYS_SURVEY)).toThrow(/not registered/);
  });

  test('a subset of types registers only those, de-duplicated', () => {
    const s = stack();
    const { FEATURE_FLAGS_FEATURE_FLAG: flag, CDP_HOG_FUNCTION: hog } = PostHogResourceType;
    const types = [flag, hog, flag];
    const reg = new PostHogResourceTypes(s, 'Types', { handlerPackageDirectory: fakePackages(types), types, apiKeySecret: importedSecret(s) });
    const t = Template.fromStack(s);

    t.resourceCountIs('AWS::CloudFormation::ResourceVersion', 2);
    t.resourceCountIs('AWS::CloudFormation::ResourceDefaultVersion', 2);
    const names = Object.values(t.findResources('AWS::CloudFormation::ResourceVersion')).map(r => r.Properties.TypeName).sort();
    expect(names).toEqual(['PostHog::CDP::HogFunction', 'PostHog::FeatureFlags::FeatureFlag']);
    expect(reg.types).toEqual([flag, hog]);
  });

  test('finds packages in <dir>/<package>/<package>.zip (repository layout) and per-type overrides', () => {
    const s = stack();
    const nested = PostHogResourceType.LOGS_ALERT;
    const override = PostHogResourceType.SURVEYS_SURVEY;
    const zip = path.join(fakePackages([override]), `${override.packageName}.zip`);
    new PostHogResourceTypes(s, 'Types', {
      handlerPackageDirectory: fakePackages([nested], 'nested'),
      handlerPackages: [{ type: override, path: zip }],
      types: [nested, override],
      apiKeySecret: importedSecret(s),
    });
    Template.fromStack(s).resourceCountIs('AWS::CloudFormation::ResourceVersion', 2);
  });

  test('defaults to the repository root and errors on missing packages', () => {
    const type = PostHogResourceType.PRODUCT_ANALYTICS_ACTION;
    const zipInRepo = path.join(REPO_ROOT, type.packageName, `${type.packageName}.zip`);
    if (!fs.existsSync(zipInRepo)) {
      const s = stack();
      expect(() => new PostHogResourceTypes(s, 'Types', { types: [type], apiKeySecret: importedSecret(s) }))
        .toThrow(new RegExp(`looked for .*${path.join(path.basename(REPO_ROOT), type.packageName, type.packageName)}\\.zip`));
    }

    const dir = fakePackages([PostHogResourceType.SURVEYS_SURVEY]);
    const s2 = stack();
    expect(() => new PostHogResourceTypes(s2, 'Types', {
      handlerPackageDirectory: dir,
      types: [PostHogResourceType.SURVEYS_SURVEY, PostHogResourceType.LOGS_ALERT],
      apiKeySecret: importedSecret(s2),
    })).toThrow(/Handler package for PostHog::Logs::Alert not found.*posthog-logs-alert\.zip/);

    const s3 = stack();
    expect(() => new PostHogResourceTypes(s3, 'Types', {
      handlerPackages: [{ type: PostHogResourceType.SURVEYS_SURVEY, path: path.join(dir, 'missing.zip') }],
      types: [PostHogResourceType.SURVEYS_SURVEY],
      apiKeySecret: importedSecret(s3),
    })).toThrow(/Handler package for PostHog::Surveys::Survey not found at .*missing\.zip/);

    const s4 = stack();
    expect(() => new PostHogResourceTypes(s4, 'Types', { handlerPackageDirectory: dir, types: [], apiKeySecret: importedSecret(s4) }))
      .toThrow(/types must not be empty/);
  });

  test('execution roles mirror resource-role.yaml; PutSecretValue is limited to tagged secrets', () => {
    const s = stack();
    const types = [PostHogResourceType.PROJECTS_SECRET_API_KEY, PostHogResourceType.PRODUCT_ANALYTICS_ACTION];
    const reg = new PostHogResourceTypes(s, 'Types', { handlerPackageDirectory: fakePackages(types), types, apiKeySecret: importedSecret(s) });
    const t = Template.fromStack(s);

    const roleId = (type: patterns.PostHogResourceType) => s.resolve(reg.registration(type).executionRole.roleArn)['Fn::GetAtt'][0];
    const roles = t.findResources('AWS::IAM::Role');

    const writerRole = roles[roleId(PostHogResourceType.PROJECTS_SECRET_API_KEY)].Properties;
    expect(writerRole.MaxSessionDuration).toBe(8400);
    expect(writerRole.AssumeRolePolicyDocument.Statement).toEqual([{
      Effect: 'Allow',
      Action: 'sts:AssumeRole',
      Principal: { Service: 'resources.cloudformation.amazonaws.com' },
      Condition: {
        StringEquals: { 'aws:SourceAccount': '111111111111' },
        StringLike: {
          'aws:SourceArn': { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':cloudformation:us-east-1:111111111111:type/resource/PostHog-Projects-SecretApiKey/*']] },
        },
      },
    }]);
    expect(writerRole.Policies).toEqual([{
      PolicyName: 'ResourceTypePolicy',
      PolicyDocument: {
        Version: '2012-10-17',
        Statement: [{
          Effect: 'Allow',
          Action: 'secretsmanager:PutSecretValue',
          Resource: { 'Fn::Join': ['', ['arn:', { Ref: 'AWS::Partition' }, ':secretsmanager:us-east-1:111111111111:secret:*']] },
          Condition: { StringEquals: { 'secretsmanager:ResourceTag/posthog-cdk:handler-writable': 'true' } },
        }],
      },
    }]);

    // Types without handler permissions get the generated template's deny-all policy.
    const actionRole = roles[roleId(PostHogResourceType.PRODUCT_ANALYTICS_ACTION)].Properties;
    expect(actionRole.Policies[0].PolicyDocument.Statement).toEqual([{ Effect: 'Deny', Action: '*', Resource: '*' }]);
  });

  test('handlerSecretArns scopes PutSecretValue to the given ARNs, without the tag condition', () => {
    const s = stack();
    const types = [PostHogResourceType.ORGANIZATIONS_IDENTITY_PROVIDER_CONFIG];
    new PostHogResourceTypes(s, 'Types', {
      handlerPackageDirectory: fakePackages(types),
      types,
      apiKeySecret: importedSecret(s),
      handlerSecretArns: ['arn:aws:secretsmanager:us-east-1:111111111111:secret:posthog/scim-*'],
    });
    const statements = roleStatements(Template.fromStack(s)).filter(st => JSON.stringify(st.Action).includes('secretsmanager:'));
    expect(statements).toEqual([{
      Effect: 'Allow',
      Action: 'secretsmanager:PutSecretValue',
      Resource: 'arn:aws:secretsmanager:us-east-1:111111111111:secret:posthog/scim-*',
    }]);
  });

  test('creates a log group per type and a shared logging role', () => {
    const s = stack();
    const types = [PostHogResourceType.SURVEYS_SURVEY, PostHogResourceType.LOGS_ALERT];
    new PostHogResourceTypes(s, 'Types', {
      handlerPackageDirectory: fakePackages(types), types, apiKeySecret: importedSecret(s), logRetention: logs.RetentionDays.ONE_WEEK,
    });
    const t = Template.fromStack(s);
    t.resourceCountIs('AWS::Logs::LogGroup', 2);
    t.allResourcesProperties('AWS::Logs::LogGroup', { RetentionInDays: 7 });
    const loggingRoles = Object.values(t.findResources('AWS::IAM::Role'))
      .filter(r => JSON.stringify(r.Properties.AssumeRolePolicyDocument).includes('type/resource/PostHog-*/*'));
    expect(loggingRoles).toHaveLength(1);
    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({ Action: 'cloudwatch:PutMetricData', Condition: { StringLike: { 'cloudwatch:namespace': 'AWS/CloudFormation/PostHog/*' } } }),
          Match.objectLike({ Action: ['logs:CreateLogStream', 'logs:DescribeLogStreams', 'logs:PutLogEvents'] }),
        ]),
      },
    });
  });

  test('uses a supplied log group', () => {
    const s = stack();
    const logGroup = new logs.LogGroup(s, 'Shared');
    const types = [PostHogResourceType.SURVEYS_SURVEY, PostHogResourceType.LOGS_ALERT];
    new PostHogResourceTypes(s, 'Types', { handlerPackageDirectory: fakePackages(types), types, apiKeySecret: importedSecret(s), logGroup });
    const t = Template.fromStack(s);
    t.resourceCountIs('AWS::Logs::LogGroup', 1);
    const groupId = Object.keys(t.findResources('AWS::Logs::LogGroup'))[0];
    t.allResourcesProperties('AWS::CloudFormation::ResourceVersion', { LoggingConfig: Match.objectLike({ LogGroupName: { Ref: groupId } }) });
  });

  test('SetTypeConfiguration passes the API key only as an unresolved Secrets Manager dynamic reference', () => {
    const s = stack();
    const type = PostHogResourceType.PRODUCT_ANALYTICS_ACTION;
    const reg = new PostHogResourceTypes(s, 'Types', {
      handlerPackageDirectory: fakePackages([type]),
      types: [type],
      apiKeySecret: importedSecret(s),
      baseUrl: 'https://eu.posthog.com',
    });
    const t = Template.fromStack(s);
    const [cr] = configResources(t);
    const template = JSON.stringify(t.toJSON());

    // CloudFormation never sees a raw dynamic reference, and no API key value is in the template.
    expect(template).not.toContain('{{resolve:');
    expect(template).not.toMatch(/phx_/);
    expect(cr.Properties.Create).toEqual(cr.Properties.Update);

    const typeArnRef = s.resolve(reg.typeArn(type));
    const call = decodeCall(cr.Properties.Create, ref => (JSON.stringify(ref) === JSON.stringify(typeArnRef) ? 'TYPE_ARN' : '?'));
    expect(call).toEqual({
      service: 'CloudFormation',
      action: 'SetTypeConfiguration',
      parameters: { TypeArn: 'TYPE_ARN', Type: 'RESOURCE', Configuration: expect.any(String) },
      physicalResourceId: { responsePath: 'ConfigurationArn' },
      logApiResponseData: false,
    });
    expect(JSON.parse(call.parameters.Configuration)).toEqual({
      ApiKey: `{{resolve:secretsmanager:${SECRET_ARN}:SecretString:::}}`,
      BaseUrl: 'https://eu.posthog.com',
    });

    // The secret ARN appears only inside the (escaped) dynamic reference.
    const all = template.split(SECRET_ARN).length - 1;
    const inRef = template.split(`resolve:secretsmanager:${SECRET_ARN}:SecretString:::}}`).length - 1;
    expect(all).toBeGreaterThan(0);
    expect(inRef).toBe(all);
  });

  test('a secret created in the stack with a JSON field; BaseUrl omitted by default', () => {
    const s = stack();
    const secret = new secretsmanager.Secret(s, 'ApiKeySecret');
    const type = PostHogResourceType.SURVEYS_SURVEY;
    new PostHogResourceTypes(s, 'Types', {
      handlerPackageDirectory: fakePackages([type]), types: [type], apiKeySecret: secret, apiKeySecretJsonField: 'apiKey',
    });
    const t = Template.fromStack(s);
    const secretId = Object.keys(t.findResources('AWS::SecretsManager::Secret'))[0];
    const [cr] = configResources(t);

    expect(JSON.stringify(t.toJSON())).not.toContain('{{resolve:');
    const call = decodeCall(cr.Properties.Create, ref => (JSON.stringify(ref) === JSON.stringify({ Ref: secretId }) ? 'SECRET_ARN' : 'OTHER'));
    expect(JSON.parse(call.parameters.Configuration)).toEqual({ ApiKey: '{{resolve:secretsmanager:SECRET_ARN:SecretString:apiKey::}}' });

    const parts: unknown[] = cr.Properties.Create['Fn::Join'][1];
    const refIdx = parts.flatMap((p, i) => (JSON.stringify(p) === JSON.stringify({ Ref: secretId }) ? [i] : []));
    expect(refIdx.length).toBeGreaterThan(0);
    for (const i of refIdx) expect(parts[i - 1]).toMatch(/resolve:secretsmanager:$/);
  });

  test('SetTypeConfiguration custom resource has a least-privilege policy and depends on the default version', () => {
    const s = stack();
    const type = PostHogResourceType.PRODUCT_ANALYTICS_ACTION;
    new PostHogResourceTypes(s, 'Types', { handlerPackageDirectory: fakePackages([type]), types: [type], apiKeySecret: importedSecret(s) });
    const t = Template.fromStack(s);

    t.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: { Statement: [{ Effect: 'Allow', Action: 'cloudformation:SetTypeConfiguration', Resource: '*' }] },
    });
    const defaultId = Object.keys(t.findResources('AWS::CloudFormation::ResourceDefaultVersion'))[0];
    const [cr] = configResources(t);
    expect(cr.DependsOn).toEqual(expect.arrayContaining([defaultId]));
    expect(cr.Properties.InstallLatestAwsSdk).toBe(false);
  });

  test('addDependent and ready order consumers after registration and configuration', () => {
    const app = new App({ outdir: fs.mkdtempSync(path.join(tmp, 'out-')) });
    const env = { account: '111111111111', region: 'us-east-1' };
    const regStack = new Stack(app, 'Registry', { env });
    const type = PostHogResourceType.PRODUCT_ANALYTICS_ACTION;
    const reg = new PostHogResourceTypes(regStack, 'Types', {
      handlerPackageDirectory: fakePackages([type]), types: [type], apiKeySecret: importedSecret(regStack),
    });

    const consumer = new logs.LogGroup(regStack, 'Consumer');
    reg.addDependent(consumer);
    const other = new logs.LogGroup(regStack, 'Other');
    other.node.addDependency(reg.ready);
    const appStack = new Stack(app, 'App', { env });
    new logs.LogGroup(appStack, 'Consumer');
    reg.addDependent(appStack);

    const t = Template.fromStack(regStack);
    const defaultId = Object.keys(t.findResources('AWS::CloudFormation::ResourceDefaultVersion'))[0];
    const crId = Object.keys(t.findResources('Custom::PostHogTypeConfiguration'))[0];
    for (const c of [consumer, other]) {
      const id = regStack.getLogicalId(c.node.defaultChild as any);
      expect(t.toJSON().Resources[id].DependsOn).toEqual(expect.arrayContaining([defaultId, crId]));
    }
    expect(appStack.dependencies).toContain(regStack);
  });
});
