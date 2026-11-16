# @posthog/cdk-constructs

AWS CDK constructs for [PostHog](https://posthog.com), built on the `PostHog::*` CloudFormation registry resource types in this repository (`../posthog-*/`).

It contains **L1 constructs** (`Cfn*`), one per resource type, generated from the resource type schemas so they map 1:1 to the CloudFormation properties, hand-written **L2 constructs** with typed props for every resource type, and **L3 patterns** that combine several resources into a common setup.

## Installation

```bash
npm install @posthog/cdk-constructs aws-cdk-lib constructs
```

## Before you deploy: register the resource types

The constructs synthesize `PostHog::*` resources, so each type you use must be registered in the target account and region, with its type configuration set. See the [repository README](../README.md) for the full steps:

1. Store a PostHog personal API key, e.g. `aws ssm put-parameter --name /posthog/api-key --type SecureString --value phx_...`
2. Register the type: `cd ../posthog-productanalytics-action && ../.venv/bin/cfn submit --set-default --region us-east-1`
3. Set its configuration. `BaseUrl` is optional and defaults to PostHog Cloud US; use `https://eu.posthog.com` for EU.

   ```bash
   aws cloudformation set-type-configuration \
     --type RESOURCE --type-name PostHog::ProductAnalytics::Action \
     --configuration '{"ApiKey": "{{resolve:ssm-secure:/posthog/api-key}}"}'
   ```

### Registering the resource types from CDK

Instead of running `cfn submit` and `set-type-configuration` by hand, register the types with `patterns.PostHogResourceTypes`. First build the handler packages at the repository root:

```bash
make package   # builds each handler, writes posthog-*/posthog-*.zip, checks all 49
```

```ts
const types = new patterns.PostHogResourceTypes(registryStack, 'PostHog', {
  apiKeySecret: secretsmanager.Secret.fromSecretNameV2(registryStack, 'Key', 'posthog/api-key'),
  baseUrl: 'https://eu.posthog.com', // optional; default is PostHog Cloud US
  // types: [patterns.PostHogResourceType.FEATURE_FLAGS_FEATURE_FLAG], // default: all 49
});
types.addDependent(appStack); // register the types before stacks that use PostHog::* resources
```

The API key reaches the type configuration only as a `{{resolve:secretsmanager:...}}` dynamic reference. Two types write one-time values to Secrets Manager: `Projects::SecretApiKey` and the SCIM token of `Organizations::IdentityProviderConfig`. Their handlers may only write to secrets tagged `posthog-cdk:handler-writable=true` (secrets this library creates are already tagged) or listed in `handlerSecretArns`. If your CDK app lives outside this repository, run `make collect-packages PACKAGE_DIR=...` and pass that folder as `handlerPackageDirectory`.

## Usage

The library has one submodule per PostHog service: `organizations`, `projects`, `productAnalytics`, `sessionReplay`, `featureFlags`, `experiments`, `surveys`, `cdp`, `workflows`, `batchExports`, `dataWarehouse`, `errorTracking`, `logs` and `llmAnalytics`.

```ts
import { App, Stack } from 'aws-cdk-lib';
import { featureFlags, productAnalytics } from '@posthog/cdk-constructs';

const app = new App();
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
```

### L2 constructs

L2 constructs take typed props instead of JSON strings, reference other resources by construct, take secrets as `SecretValue`, and validate inputs at synth time. Project-scoped constructs take an `IProject`: create a project with `organizations.Project`, or reference an existing one with `organizations.Project.fromProjectId()`. Every project-scoped construct also has an `add*()` helper on the project:

```ts
import { Duration, SecretValue } from 'aws-cdk-lib';
import { cdp, core, logs, organizations, productAnalytics } from '@posthog/cdk-constructs';

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
```

| Submodule | L2 constructs |
|---|---|
| `organizations` | `Project`, `Domain`, `Role`, `RoleMembership`, `ProxyRecord`, `IdentityProviderConfig`, `Organization` (import only) |
| `projects` | `SecretApiKey`, `ApprovalPolicy` |
| `productAnalytics` | `Action`, `Annotation`, `Cohort`, `EventDefinition`, `SchemaPropertyGroup`, `DataColorTheme`, `Insight` / `InsightQuery`, `Dashboard`, `DashboardTemplate`, `InsightVariable`, `Alert`, `Subscription` |
| `featureFlags` | `FeatureFlag`, `EarlyAccessFeature`, `ScheduledChange` |
| `experiments` | `Experiment` / `ExperimentMetric`, `Holdout`, `SavedMetric`, `WebExperiment` |
| `surveys`, `sessionReplay` | `Survey` / `SurveyQuestion`, `ProductTour`, `Playlist` |
| `cdp`, `workflows` | `HogFunction`, `HogFlow`, `MessageTemplate`, `MessageCategory` |
| `batchExports`, `dataWarehouse` | `BatchExport` / `BatchExportDestination`, `Source`, `SavedQuery`, `Table`, `ViewLink`, `Endpoint` |
| `errorTracking`, `logs` | `AssignmentRule`, `GroupingRule`, `SuppressionRule`, `Alert` (both), `RetentionRule`, `SamplingRule` |
| `llmAnalytics` | `ProviderKey`, `Evaluation` |
| `patterns` (L3) | `PostHogResourceTypes`, `PostHogProject`, `FeatureExperiment`, `S3BatchExport`, `MonitoredDashboard` |

Removal policies default to `DESTROY`, except `Project`, which defaults to `RETAIN` because deleting a project deletes all its data. Shared filter models (`core.PropertyFilter`, `core.PropertyGroup`) are used by every construct that filters events or people. See [CONTRIBUTING.md](CONTRIBUTING.md) for the conventions L2/L3 constructs follow, and each resource type's README (`../posthog-*/README.md`) for assumptions about PostHog behaviour that are not yet verified against a live project.

### L3 patterns

The `patterns` submodule combines several L2 constructs into common setups. Each pattern exposes the constructs it creates, so you can still change or extend them.

#### `PostHogProject`

A project with production defaults: retained on stack deletion, test-account filters for your own email domain and localhost, plus an optional managed reverse proxy (with its Route 53 CNAME), a verified domain (with its TXT record) and a secret API key in Secrets Manager. The project ID, public API token, API host and ingestion host become stack outputs and, with `ssmPrefix`, SSM parameters.

```ts
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
```

Test-account filters list what an event must match to be *kept*, so the internal email filter is `email does not contain @example.com`. The secret API key's value never appears in the template or outputs.

#### `FeatureExperiment`

An A/B test from one definition: a multivariate feature flag, the experiment linked to it, and a results dashboard with an exposures insight plus one insight per metric, broken down by variant. The experiment is created after the flag, and the flag holds the variants.

```ts
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
```

PostHog won't attach an early access feature to a flag that an experiment uses, so `earlyAccess` creates the early access feature with its own flag. By default only users who opted in enter the experiment (`enrolledUsersOnly`). Shared metrics created in the app also get a dashboard insight; imported ones (`SavedMetric.fromSavedMetricId`) don't, because their query is unknown.

#### `S3BatchExport`

A batch export to an S3 bucket, without copying credentials by hand. It creates (or takes) an encrypted bucket and an IAM user that can only write under the export prefix. The access key is stored in Secrets Manager and reaches PostHog only as a dynamic reference. With `readBack`, a second read-only user and a `dataWarehouse.Table` make the exported files queryable in PostHog.

```ts
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
```

To rotate the access keys, raise `keySerial` and deploy. That creates new keys and secrets, so PostHog receives the new credentials before CloudFormation deletes the old keys. Updating the existing secret alone would not reach PostHog.

#### `MonitoredDashboard`

A KPI dashboard as code: insights in order, an optional alert per trends insight, an optional scheduled subscription by email or Slack, and `annotateRelease()` for release markers.

```ts
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
```

Construct IDs come from insight names, so reordering insights doesn't replace them but renaming one does.

### Notes

- **JSON-string properties.** PostHog filters, queries, steps, payloads and similar free-form objects are modelled as JSON strings, because CloudFormation registry handlers can't accept untyped objects. Build them as objects and pass `JSON.stringify(...)`.
- **Secrets.** Write-only properties such as `llmAnalytics.CfnProviderKey.apiKey`, `cdp.CfnHogFunction.secretInputs` and `batchExports.CfnBatchExport.destinationSecretConfig` are sent to PostHog but never read back. Don't put plain-text secrets in source code; pass them in with a dynamic reference such as `{{resolve:secretsmanager:...}}`.
- **IDs are strings**, including numeric PostHog IDs (`projectId: '12345'`).
- Each resource type's own README (`../posthog-*/README.md`) documents its properties and behaviour, for example soft deletes and create-only properties.

## Development

```bash
npx projen generate:l1   # regenerate src/**/*.generated.ts from ../posthog-*/posthog-*.json
npx projen build         # jsii compile, eslint, jest, API.md
```

`projenrc/generate-l1.ts` runs `cdk-import` for every schema and post-processes the output for jsii: it prefixes nested type names with the class name, makes helpers private, types string maps, and writes the per-service barrels. Don't edit `*.generated.ts` or the `index.ts` barrels by hand. Hand-written L2/L3 constructs go in a service's `l2.ts` barrel.
