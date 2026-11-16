import * as path from 'node:path';
import * as cdk from 'aws-cdk-lib';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { patterns } from '@posthog/cdk-constructs';
import { Construct } from 'constructs';

export interface CustomResourceEnablementStackProps extends cdk.StackProps {
    /**
     * Name of the Secrets Manager secret holding the PostHog personal API key
     * (`phx_...`). Every type's configuration gets it as a
     * `{{resolve:secretsmanager:...}}` dynamic reference, never the value.
     * @default 'posthog/api-key'
     */
    readonly apiKeySecretName?: string;

    /**
     * PostHog API host: `https://eu.posthog.com` for PostHog Cloud EU, or your
     * instance URL when self-hosting.
     * @default - PostHog Cloud US (https://us.posthog.com)
     */
    readonly baseUrl?: string;

    /**
     * Directory containing the `posthog-*` resource type projects, each with its
     * handler package at `<dir>/<dir>.zip` (`make package` at the repository root).
     * @default - the repository root (the parent of this CDK app)
     */
    readonly resourceTypesDirectory?: string;
}

/**
 * Registers every PostHog resource type in this account and region, makes it
 * the default version and sets its type configuration (API key, base URL).
 *
 * Stacks that use PostHog resources must deploy after this one:
 * `stack.addDependency(enablementStack)`.
 */
export class CustomResourceEnablementStack extends cdk.Stack {
    public readonly resourceTypes: patterns.PostHogResourceTypes;

    constructor(parent: Construct, name: string, props: CustomResourceEnablementStackProps = {}) {
        super(parent, name, props);

        this.resourceTypes = new patterns.PostHogResourceTypes(this, 'PostHogResourceTypes', {
            apiKeySecret: secretsmanager.Secret.fromSecretNameV2(this, 'ApiKey', props.apiKeySecretName ?? 'posthog/api-key'),
            baseUrl: props.baseUrl,
            handlerPackageDirectory: props.resourceTypesDirectory ?? path.resolve(__dirname, '..', '..'),
        });
    }
}
