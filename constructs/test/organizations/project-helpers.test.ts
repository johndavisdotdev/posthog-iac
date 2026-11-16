import { App, Duration, SecretValue, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { cdp, featureFlags, llmAnalytics, logs, organizations, productAnalytics, projects } from '../../src';

function setup() {
  const stack = new Stack(new App(), 'Test');
  return { stack, project: organizations.Project.fromProjectId(stack, 'Project', '12345') };
}

test('project helpers create resources scoped to the project', () => {
  const { stack, project } = setup();

  const flag = project.addFeatureFlag('Flag', { key: 'new-checkout' });
  const dashboard = project.addDashboard('Dashboard', { name: 'Growth' });
  dashboard.addInsight('Signups', {
    name: 'Sign-ups',
    query: productAnalytics.InsightQuery.trends({ series: [productAnalytics.InsightSeries.event('signed_up')] }),
  });
  project.addSecretApiKey('Key', { label: 'backend', scopes: [projects.SecretApiKeyScope.FEATURE_FLAG_READ] });
  project.addWebhook('Hook', { url: 'https://example.com/hook', events: ['$pageview'] });
  project.addErrorTrackingSuppressionRule('Everything');
  project.addLogsAlert('ApiErrors', {
    name: 'API errors',
    severityLevels: [logs.LogSeverity.ERROR],
    threshold: logs.AlertThreshold.above(50),
    window: Duration.minutes(15),
  });
  const key = project.addProviderKey('OpenAI', {
    provider: llmAnalytics.Provider.OPENAI,
    name: 'OpenAI',
    apiKey: SecretValue.secretsManager('openai'),
  });
  project.addLlmJudgeEvaluation('Polite', {
    name: 'Polite',
    prompt: 'Is the answer polite?',
    model: { provider: llmAnalytics.Provider.OPENAI, model: 'gpt-4.1-mini', providerKey: key },
  });

  expect(flag).toBeInstanceOf(featureFlags.FeatureFlag);
  expect(flag.project).toBe(project);
  expect(flag.node.scope).toBe(project);

  const t = Template.fromStack(stack);
  for (const type of [
    'PostHog::FeatureFlags::FeatureFlag',
    'PostHog::ProductAnalytics::Dashboard',
    'PostHog::ProductAnalytics::Insight',
    'PostHog::CDP::HogFunction',
    'PostHog::ErrorTracking::SuppressionRule',
    'PostHog::Logs::Alert',
    'PostHog::LLMAnalytics::ProviderKey',
    'PostHog::LLMAnalytics::Evaluation',
  ]) {
    t.hasResourceProperties(type, { ProjectId: '12345' });
  }
  expect(cdp.HogFunction).toBeDefined();
});

test('every IProject add* helper is implemented by ProjectBase', () => {
  const { project } = setup();
  const names = Object.getOwnPropertyNames(organizations.ProjectBase.prototype).filter(n => n.startsWith('add'));
  expect(names.length).toBeGreaterThanOrEqual(40);
  for (const n of names) expect(typeof (project as any)[n]).toBe('function');
});
