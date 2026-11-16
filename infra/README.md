# PostHog custom resource enablement

A CDK app that turns on every `PostHog::*` CloudFormation resource type in one AWS account and region. It deploys one stack, `EnablePostHogCustomResources`, which uses `patterns.PostHogResourceTypes` from [`@posthog/cdk-constructs`](../constructs). For each of the 49 types, the stack:

1. uploads the handler package and registers a new version of the type (`AWS::CloudFormation::ResourceVersion`), with its execution role and log group;
2. makes that version the default (`AWS::CloudFormation::ResourceDefaultVersion`);
3. sets the type configuration (`SetTypeConfiguration`). `ApiKey` is a `{{resolve:secretsmanager:...}}` reference to your PostHog personal API key, and `BaseUrl` is optional.

The API key never appears in the template or the type configuration. The two types that write one-time values to Secrets Manager (`Projects::SecretApiKey`, and the SCIM token of `Organizations::IdentityProviderConfig`) can only write to secrets tagged `posthog-cdk:handler-writable=true`.

## Prerequisites

1. Build the handler packages at the repository root. This writes `posthog-*/posthog-*.zip`, which the stack uploads:

   ```bash
   make package
   ```

2. Build the construct library this app depends on (`file:../constructs`):

   ```bash
   cd constructs && npx projen build
   ```

3. Store a PostHog personal API key in Secrets Manager. The secret string should be the key itself, not a JSON object:

   ```bash
   aws secretsmanager create-secret --name posthog/api-key --secret-string phx_...
   ```

4. Bootstrap the target account and region (`npx cdk bootstrap`) and install dependencies (`pnpm install`).

## Deploy

```bash
npx cdk deploy                       # account and region from your current AWS credentials
npx cdk deploy -c account=123456789012 -c region=us-east-2
npx cdk deploy -c baseUrl=https://eu.posthog.com -c apiKeySecretName=prod/posthog/api-key
```

| Context key | Default | Purpose |
|---|---|---|
| `account`, `region` | from your current credentials | Where the types are registered. Types are private to that account and region. |
| `apiKeySecretName` | `posthog/api-key` | Secrets Manager secret holding the personal API key |
| `baseUrl` | PostHog Cloud US | `https://eu.posthog.com` for EU, or your self-hosted URL |

The first deployment registers 49 types and takes a while, because each registration takes a few minutes. Later deployments only register new versions of types whose handler package changed.

To rotate the API key, update the secret's value. Handlers resolve the reference each time they run, so no redeploy is needed.

## Using the types

Stacks that create PostHog resources must deploy after this one. In the same app, use `stack.addDependency(enablementStack)`. In separate apps, deploy this stack first.

## Commands

- `pnpm run typecheck`: type-check the app.
- `pnpm run build`: type-check and synthesize to `cdk.out`.
- `npx cdk diff` / `npx cdk deploy`: compare with, or deploy to, the target account.
