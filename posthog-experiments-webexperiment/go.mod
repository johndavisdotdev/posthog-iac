module github.com/johndavisdev/posthog-iac/posthog-experiments-webexperiment

go 1.26.5

require (
	github.com/aws-cloudformation/cloudformation-cli-go-plugin v1.2.0
	github.com/johndavisdev/posthog-iac/internal/posthogcfn v0.0.0-00010101000000-000000000000
)

require (
	github.com/aws/aws-lambda-go v1.37.0 // indirect
	github.com/aws/aws-sdk-go v1.44.197 // indirect
	github.com/jmespath/go-jmespath v0.4.0 // indirect
	github.com/segmentio/ksuid v1.0.4 // indirect
	gopkg.in/validator.v2 v2.0.1 // indirect
)

replace github.com/johndavisdev/posthog-iac/internal/posthogcfn => ../internal/posthogcfn
