import { App } from 'aws-cdk-lib';
import { CustomResourceEnablementStack } from './CustomResourceEnablementStack';

// Deploys to the account and region of the current AWS credentials, unless
// overridden: `cdk deploy -c account=123456789012 -c region=us-east-2`.
// Optional: `-c apiKeySecretName=...` and `-c baseUrl=https://eu.posthog.com`.
const app = new App();
const context = (key: string): string | undefined => app.node.tryGetContext(key);

new CustomResourceEnablementStack(app, 'EnablePostHogCustomResources', {
    env: {
        account: '658021051251',
        region: 'us-east-1',
    },
    apiKeySecretName: '/posthog/api-key',
    baseUrl: 'https://us.posthog.com',
});
app.synth();
