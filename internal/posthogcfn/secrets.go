package posthogcfn

import (
	"errors"
	"fmt"

	"github.com/aws/aws-sdk-go/aws"
	"github.com/aws/aws-sdk-go/aws/client"
	"github.com/aws/aws-sdk-go/service/secretsmanager"
)

// SecretWriter stores a secret value that PostHog returns only once (project
// secret API keys and similar) in AWS Secrets Manager, so the value never has
// to appear in the CloudFormation resource model.
type SecretWriter interface {
	PutSecretValue(*secretsmanager.PutSecretValueInput) (*secretsmanager.PutSecretValueOutput, error)
}

// NewSecretWriter returns a Secrets Manager client for the handler session.
// Tests replace this variable with a fake.
var NewSecretWriter = func(sess client.ConfigProvider) SecretWriter {
	return secretsmanager.New(sess)
}

// PutSecret writes value as the current version of the secret identified by
// secretID (a name or ARN). The handler role needs
// secretsmanager:PutSecretValue on that secret, which each resource schema
// that uses this helper must list in its create handler permissions.
func PutSecret(sess client.ConfigProvider, secretID, value string) error {
	if secretID == "" {
		return errors.New("secret ID is empty")
	}
	if sess == nil {
		return errors.New("no AWS session available to the handler; check the resource type's execution role")
	}
	_, err := NewSecretWriter(sess).PutSecretValue(&secretsmanager.PutSecretValueInput{
		SecretId:     aws.String(secretID),
		SecretString: aws.String(value),
	})
	if err != nil {
		// Never include value in the message.
		return fmt.Errorf("writing secret to %s: %w", secretID, err)
	}
	return nil
}
