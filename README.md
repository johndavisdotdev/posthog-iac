# posthog-iac

Infrastructure as code for [PostHog](https://posthog.com):

- **`posthog-*/`**: AWS CloudFormation registry resource types (`PostHog::<Service>::<Resource>`), written in Go with the [CloudFormation CLI Go plugin](https://github.com/aws-cloudformation/cloudformation-cli-go-plugin).
- **`internal/posthogcfn/`**: shared Go code. It holds a small PostHog REST API client (personal API key, pagination, retries), error mapping, progress-event helpers, JSON-property helpers, the Secrets Manager writer, and the `cfntest` fake-API test harness.
- **`constructs/`**: the projen-generated AWS CDK construct library (`@posthog/cdk-constructs`), with L1 (`Cfn*`) constructs generated from these schemas (`npx projen generate:l1`).
- **`infra/`**: a CDK app that registers every resource type in an AWS account, sets its default version and sets its type configuration. See [infra/README.md](infra/README.md).
- **`docs/resources.json`**: the catalog of resource types, their API endpoints and Linear issues. **`docs/RESOURCE_GUIDE.md`**: how to implement one.

`github.com/posthog/posthog-go` is PostHog's event-capture and flag-evaluation SDK. It has no management API, so the handlers call the REST API described by `posthog.openapi.json` directly.

## Prerequisites

- Go 1.26+
- Python 3 (for the CloudFormation CLI). `make venv` installs `cloudformation-cli` and `cloudformation-cli-go-plugin` into `.venv/`.
- For contract tests (`cfn test`) and submission: AWS credentials, plus SAM CLI and Docker for local contract tests.

## Common tasks

```bash
make test       # unit tests for the shared module and every resource type (fake PostHog API)
make validate   # cfn validate every schema
make build      # build every handler for Lambda (linux/amd64)
make package    # cfn submit --dry-run for every type
make new TYPE=PostHog::Service::Resource   # scaffold another type
```

`posthog-productanalytics-action` is the reference implementation.

## Registering a type in an AWS account

All types read the PostHog personal API key from their **type configuration**, so it never appears in templates.

1. Create a personal API key in PostHog with the scopes the types need, and store it: `aws ssm put-parameter --name /posthog/api-key --type SecureString --value phx_...`
2. Register the type:

   ```bash
   cd posthog-productanalytics-action
   ../.venv/bin/cfn submit --set-default --region us-east-1
   ```

3. Set its configuration. `BaseUrl` is optional; it defaults to PostHog Cloud US. Use `https://eu.posthog.com` for EU, or your self-hosted URL.

   ```bash
   aws cloudformation set-type-configuration \
     --type RESOURCE --type-name PostHog::ProductAnalytics::Action \
     --configuration '{"ApiKey": "{{resolve:ssm-secure:/posthog/api-key}}", "BaseUrl": "https://us.posthog.com"}'
   ```

4. Use the type in templates (see each directory's `examples/`).
