# PostHog::FeatureFlags::FeatureFlag

A PostHog feature flag: a key that SDKs evaluate to roll features out to a percentage of users, to specific users or groups, or to serve multivariate variants and payloads.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::FeatureFlags::FeatureFlag",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#key" title="Key">Key</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#filters" title="Filters">Filters</a>" : <i>String</i>,
        "<a href="#active" title="Active">Active</a>" : <i>Boolean</i>,
        "<a href="#archived" title="Archived">Archived</a>" : <i>Boolean</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
        "<a href="#evaluationcontexts" title="EvaluationContexts">EvaluationContexts</a>" : <i>[ String, ... ]</i>,
        "<a href="#isremoteconfiguration" title="IsRemoteConfiguration">IsRemoteConfiguration</a>" : <i>Boolean</i>,
        "<a href="#ensureexperiencecontinuity" title="EnsureExperienceContinuity">EnsureExperienceContinuity</a>" : <i>Boolean</i>,
        "<a href="#evaluationruntime" title="EvaluationRuntime">EvaluationRuntime</a>" : <i>String</i>,
        "<a href="#bucketingidentifier" title="BucketingIdentifier">BucketingIdentifier</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::FeatureFlags::FeatureFlag
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#key" title="Key">Key</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#filters" title="Filters">Filters</a>: <i>String</i>
    <a href="#active" title="Active">Active</a>: <i>Boolean</i>
    <a href="#archived" title="Archived">Archived</a>: <i>Boolean</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
    <a href="#evaluationcontexts" title="EvaluationContexts">EvaluationContexts</a>: <i>
      - String</i>
    <a href="#isremoteconfiguration" title="IsRemoteConfiguration">IsRemoteConfiguration</a>: <i>Boolean</i>
    <a href="#ensureexperiencecontinuity" title="EnsureExperienceContinuity">EnsureExperienceContinuity</a>: <i>Boolean</i>
    <a href="#evaluationruntime" title="EvaluationRuntime">EvaluationRuntime</a>: <i>String</i>
    <a href="#bucketingidentifier" title="BucketingIdentifier">BucketingIdentifier</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the feature flag belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Key

Feature flag key that SDKs evaluate, e.g. new-checkout. Must be unique within the project.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Name

Description of the feature flag (PostHog stores it in the `name` field for backwards compatibility).

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Filters

Targeting configuration as a JSON object (use Fn::ToJsonString): `groups` (release condition groups with `properties`, `rollout_percentage` and optional `variant`), `multivariate` (`variants` with `key` and `rollout_percentage`), `payloads` (payload values keyed by variant key, or `true` for boolean flags), `aggregation_group_type_index` and `early_exit`. Leave unset for a flag with no release conditions.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Active

Whether the feature flag is enabled. Defaults to true.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Archived

Whether the flag is archived. Archived flags are hidden from the flag list by default and must be disabled (Active: false).

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Organizational tags for the feature flag.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EvaluationContexts

Evaluation contexts that control where the flag evaluates at runtime. PostHog does not return this field, so it is write-only.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### IsRemoteConfiguration

Whether this flag is a remote configuration flag that delivers a payload rather than gating a feature.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EnsureExperienceContinuity

Whether to persist a user's flag value across the anonymous-to-identified transition. Incompatible with device_id bucketing.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EvaluationRuntime

Where the flag is allowed to evaluate: `server` (server-side SDKs only), `client` (client-side SDKs only) or `all` (both, the default).

_Required_: No

_Type_: String

_Allowed Values_: <code>server</code> | <code>client</code> | <code>all</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### BucketingIdentifier

Identifier used to bucket users into rollout percentages and variants: `distinct_id` (the default) or `device_id`. `device_id` is incompatible with EnsureExperienceContinuity.

_Required_: No

_Type_: String

_Allowed Values_: <code>distinct_id</code> | <code>device_id</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog feature flag ID.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last update.

