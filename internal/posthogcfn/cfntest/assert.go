package cfntest

import (
	"testing"

	"github.com/aws-cloudformation/cloudformation-cli-go-plugin/cfn/handler"
)

// RequireSuccess fails the test unless ev succeeded and err is nil.
func RequireSuccess(t testing.TB, ev handler.ProgressEvent, err error) {
	t.Helper()
	if err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if ev.OperationStatus != handler.Success {
		t.Fatalf("status = %s (%s: %s), want SUCCESS", ev.OperationStatus, ev.HandlerErrorCode, ev.Message)
	}
}

// RequireFailed fails the test unless ev failed with the given error code.
func RequireFailed(t testing.TB, ev handler.ProgressEvent, err error, code string) {
	t.Helper()
	if err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if ev.OperationStatus != handler.Failed {
		t.Fatalf("status = %s, want FAILED with %s", ev.OperationStatus, code)
	}
	if ev.HandlerErrorCode != code {
		t.Fatalf("error code = %s (%s), want %s", ev.HandlerErrorCode, ev.Message, code)
	}
}

// RequireNotFound is RequireFailed with the NotFound code.
func RequireNotFound(t testing.TB, ev handler.ProgressEvent, err error) {
	t.Helper()
	RequireFailed(t, ev, err, "NotFound")
}
