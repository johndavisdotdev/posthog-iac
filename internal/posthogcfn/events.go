package posthogcfn

import (
	"fmt"
	"log"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
	"github.com/aws/aws-sdk-go/service/cloudformation"
)

// Success returns a successful progress event carrying model.
func Success(model interface{}) handler.ProgressEvent {
	return handler.ProgressEvent{
		OperationStatus: handler.Success,
		ResourceModel:   model,
	}
}

// DeleteSuccess returns a successful delete event. CloudFormation requires a
// delete success event to carry no resource model.
func DeleteSuccess() handler.ProgressEvent {
	return handler.ProgressEvent{OperationStatus: handler.Success}
}

// ListSuccess returns a successful list event. nil models become an empty
// slice, as the contract requires.
func ListSuccess[T any](models []T, nextToken string) handler.ProgressEvent {
	out := make([]interface{}, 0, len(models))
	for i := range models {
		out = append(out, models[i])
	}
	return handler.ProgressEvent{
		OperationStatus: handler.Success,
		ResourceModels:  out,
		NextToken:       nextToken,
	}
}

// Failed returns a failed progress event with the given handler error code.
func Failed(code, format string, args ...interface{}) handler.ProgressEvent {
	return handler.ProgressEvent{
		OperationStatus:  handler.Failed,
		HandlerErrorCode: code,
		Message:          fmt.Sprintf(format, args...),
	}
}

// NotFound returns a NotFound failure. Read, Update and Delete must return
// this when the resource no longer exists (including soft-deleted objects).
func NotFound(format string, args ...interface{}) handler.ProgressEvent {
	return Failed(cloudformation.HandlerErrorCodeNotFound, format, args...)
}

// InvalidRequest returns an InvalidRequest failure for bad input.
func InvalidRequest(format string, args ...interface{}) handler.ProgressEvent {
	return Failed(cloudformation.HandlerErrorCodeInvalidRequest, format, args...)
}

// AlreadyExists returns an AlreadyExists failure.
func AlreadyExists(format string, args ...interface{}) handler.ProgressEvent {
	return Failed(cloudformation.HandlerErrorCodeAlreadyExists, format, args...)
}

// NotUpdatable returns a NotUpdatable failure, for attempts to change a
// create-only property that CloudFormation did not catch.
func NotUpdatable(format string, args ...interface{}) handler.ProgressEvent {
	return Failed(cloudformation.HandlerErrorCodeNotUpdatable, format, args...)
}

// ConfigError returns the failure used when the client cannot be built from
// the type configuration.
func ConfigError(err error) handler.ProgressEvent {
	return Failed(cloudformation.HandlerErrorCodeInvalidTypeConfiguration, "%v", err)
}

// FromError maps an error returned by Client to a failed progress event with
// the most specific CloudFormation handler error code. action is a short
// description such as "creating action" used in the message. The message
// contains PostHog's error detail only, never the API key or request bodies.
func FromError(action string, err error) handler.ProgressEvent {
	code := ErrorCode(err)
	log.Printf("posthog: %s failed (%s): %v", action, code, err)
	return Failed(code, "%s: %v", action, err)
}
