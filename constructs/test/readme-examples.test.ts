// The code in README.md is copied from these tests, so the examples there
// always compile and synthesize. Keep the two in sync.
import { App, CfnOutput, CfnWaitConditionHandle, Duration, SecretValue, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as kms from 'aws-cdk-lib/aws-kms';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { batchExports, cdp, core, experiments, featureFlags, logs, organizations, patterns, productAnalytics, projects } from '../src';

test('L1 example', () => {
  const app = new App();
  // README: L1
  const stack = new Stack(app, 'PostHog');

  const flag = new featureFlags.CfnFeatureFlag(stack, 'NewCheckout', {
    projectId: '12345',
    key: 'new-checkout',
    name: 'New checkout flow',
    // Arbitrary JSON properties are strings: pass JSON.stringify(...).
    filters: JSON.stringify({ groups: [{ properties: [], rollout_percentage: 25 }] }),
  });

  new productAnalytics.CfnAction(stack, 'SignedUp', {
    projectId: '12345',
    name: 'Signed up',
    steps: [{ event: 'signed_up' }],
  });

  // Read-only properties are available as attributes (Fn::GetAtt).
  flag.attrId;
  // END
  const t = Template.fromStack(stack);
  t.resourceCountIs('PostHog::FeatureFlags::FeatureFlag', 1);
  t.resourceCountIs('PostHog::ProductAnalytics::Action', 1);
});

test('L2 example', () => {
  const stack = new Stack(new App(), 'PostHog');
  // README: L2
  const project = organizations.Project.fromProjectId(stack, 'Project', '12345');

  const signedUp = project.addAction('SignedUp', {
    name: 'Signed up',
    steps: [{ event: 'signed_up', properties: [{ key: 'plan', value: 'pro', type: core.PropertyFilterType.PERSON }] }],
  });

  const flag = project.addFeatureFlag('NewCheckout', {
    key: 'new-checkout',
    releaseConditions: [{ rolloutPercentage: 25 }],
  });

  const dashboard = project.addDashboard('Growth', { name: 'Growth', pinned: true });
  dashboard.addInsight('Signups', {
    name: 'Sign-ups per week',
    query: productAnalytics.InsightQuery.trends({
      series: [productAnalytics.InsightSeries.action(signedUp)],
      interval: productAnalytics.InsightInterval.WEEK,
    }),
  });

  project.addHogFunction('OrdersWebhook', {
    type: cdp.HogFunctionType.DESTINATION,
    name: 'Orders to fulfilment',
    code: cdp.HogCode.fromInline('fetch(inputs.url, { method: "POST", body: event })'),
    inputs: { url: 'https://fulfilment.example.com/posthog' },
    secretInputs: { token: SecretValue.secretsManager('posthog/fulfilment-token') }, // dynamic reference only
    events: ['order_placed'],
  });

  project.addLogsRetentionRule('KeepAudit', {
    name: 'Audit logs',
    retention: Duration.days(90),
    filters: logs.LogFilter.serviceName(core.PropertyOperator.EXACT, 'audit'),
    enabled: true,
  });
  flag.flagKey;
  // END
  const t = Template.fromStack(stack);
  for (const type of ['PostHog::ProductAnalytics::Action', 'PostHog::FeatureFlags::FeatureFlag', 'PostHog::ProductAnalytics::Dashboard',
    'PostHog::ProductAnalytics::Insight', 'PostHog::CDP::HogFunction', 'PostHog::Logs::RetentionRule']) {
    t.resourceCountIs(type, 1);
  }
  expect(JSON.stringify(t.toJSON())).not.toContain('fulfilment-token-value');
});

test('resource type registration example', () => {
  const app = new App();
  const registryStack = new Stack(app, 'Registry');
  const appStack = new Stack(app, 'App');
  new CfnWaitConditionHandle(appStack, 'Placeholder');
  // README: registration
  const types = new patterns.PostHogResourceTypes(registryStack, 'PostHog', {
    apiKeySecret: secretsmanager.Secret.fromSecretNameV2(registryStack, 'Key', 'posthog/api-key'),
    baseUrl: 'https://eu.posthog.com', // optional; default is PostHog Cloud US
    types: [patterns.PostHogResourceType.FEATURE_FLAGS_FEATURE_FLAG],
    handlerPackages: [{ type: patterns.PostHogResourceType.FEATURE_FLAGS_FEATURE_FLAG, path: __filename }],
  });
  types.addDependent(appStack); // register the types before stacks that use PostHog::* resources
  // END
  Template.fromStack(registryStack).resourceCountIs('AWS::CloudFormation::ResourceVersion', 1);
});

test('PostHogProject example', () => {
  const stack = new Stack(new App(), 'PostHog');
  const backendRole = new iam.Role(stack, 'Backend', { assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com') });
  // README: PostHogProject
  const org = organizations.Organization.fromOrganizationId(stack, 'Org', '0190f0a3-0000-7000-8000-000000000000');
  const zone = route53.HostedZone.fromHostedZoneAttributes(stack, 'Zone', { hostedZoneId: 'Z123', zoneName: 'example.com' });

  const posthog = new patterns.PostHogProject(stack, 'WebApp', {
    organization: org,
    name: 'Web app',
    timezone: 'Europe/Berlin',
    internalEmailDomain: 'example.com', // exclude your own team from insights
    proxy: { domainName: 'e.example.com', hostedZone: zone }, // managed reverse proxy + CNAME
    verifiedDomain: { domainName: 'example.com', hostedZone: zone }, // TXT verification record
    secretApiKey: { scopes: [projects.SecretApiKeyScope.FEATURE_FLAG_READ] },
    ssmPrefix: '/webapp/posthog', // project ID, token and hosts as SSM parameters
  });

  posthog.grantReadParameters(backendRole);
  posthog.grantReadSecretApiKey(backendRole);
  new CfnOutput(stack, 'IngestionHost', { value: posthog.ingestionHost });
  // END
  const t = Template.fromStack(stack);
  t.resourceCountIs('PostHog::Organizations::Project', 1);
  t.resourceCountIs('PostHog::Organizations::ProxyRecord', 1);
  t.resourceCountIs('PostHog::Projects::SecretApiKey', 1);
});

test('FeatureExperiment example', () => {
  const stack = new Stack(new App(), 'PostHog');
  const project = organizations.Project.fromProjectId(stack, 'Project', '12345');
  // README: FeatureExperiment
  new patterns.FeatureExperiment(stack, 'Checkout', {
    project,
    name: 'One-page checkout',
    featureFlagKey: 'new-checkout',
    variants: [
      { key: 'control', rolloutPercentage: 50 },
      { key: 'test', rolloutPercentage: 50 },
    ],
    rolloutPercentage: 20,
    metrics: [
      experiments.ExperimentMetric.funnel({
        name: 'Checkout conversion',
        steps: [{ event: 'checkout_started' }, { event: 'purchase' }],
      }),
    ],
    secondaryMetrics: [
      experiments.ExperimentMetric.mean({
        name: 'Revenue', event: 'purchase', math: experiments.MetricMath.SUM, mathProperty: 'revenue',
      }),
    ],
    earlyAccess: { name: 'New checkout', stage: featureFlags.EarlyAccessStage.BETA }, // opt-in enrolment
    resultsDashboard: { name: 'Checkout A/B results' }, // one insight per metric, by variant
  });
  // END
  const t = Template.fromStack(stack);
  t.resourceCountIs('PostHog::Experiments::Experiment', 1);
  t.resourceCountIs('PostHog::ProductAnalytics::Dashboard', 1);
});

test('S3BatchExport example', () => {
  const stack = new Stack(new App(), 'PostHog');
  const project = organizations.Project.fromProjectId(stack, 'Project', '12345');
  // README: S3BatchExport
  const key = new kms.Key(stack, 'ExportKey', { enableKeyRotation: true });

  new patterns.S3BatchExport(stack, 'EventsToS3', {
    project,
    name: 'Events to S3',
    model: batchExports.BatchExportModel.EVENTS,
    interval: batchExports.BatchExportInterval.HOUR,
    prefix: 'events/{year}/{month}/{day}/',
    fileFormat: batchExports.ExportFileFormat.PARQUET,
    encryptionKey: key, // bucket is created with SSE-KMS and blocked public access
    expiration: Duration.days(365),
    readBack: { tableName: 'exported_events' }, // query the files from PostHog's data warehouse
    keySerial: 0, // raise to rotate the IAM access keys on the next deploy
  });
  // END
  const t = Template.fromStack(stack);
  t.resourceCountIs('PostHog::BatchExports::BatchExport', 1);
  t.resourceCountIs('PostHog::DataWarehouse::Table', 1);
});

test('MonitoredDashboard example', () => {
  const stack = new Stack(new App(), 'PostHog');
  const project = organizations.Project.fromProjectId(stack, 'Project', '12345');
  // README: MonitoredDashboard
  const kpis = new patterns.MonitoredDashboard(stack, 'GrowthKpis', {
    project,
    name: 'Growth KPIs',
    insights: [
      {
        name: 'Daily sign-ups',
        query: productAnalytics.InsightQuery.trends({ series: [productAnalytics.InsightSeries.event('signed_up')] }),
        alert: { lower: 10, calculationInterval: productAnalytics.AlertCalculationInterval.DAILY, subscribedUsers: ['42'] },
      },
      {
        name: 'Activation funnel',
        query: productAnalytics.InsightQuery.funnel({
          steps: [productAnalytics.InsightSeries.event('signed_up'), productAnalytics.InsightSeries.event('activated')],
        }),
      },
    ],
    subscription: {
      target: productAnalytics.SubscriptionTarget.email(['growth@example.com']),
      frequency: productAnalytics.SubscriptionFrequency.WEEKLY,
      startDate: '2026-01-05T09:00:00Z',
    },
  });
  kpis.annotateRelease('V23', '2026-05-01T12:00:00Z', 'Released v2.3');
  // END
  const t = Template.fromStack(stack);
  t.resourceCountIs('PostHog::ProductAnalytics::Insight', 2);
  t.resourceCountIs('PostHog::ProductAnalytics::Alert', 1);
  t.resourceCountIs('PostHog::ProductAnalytics::Subscription', 1);
});
