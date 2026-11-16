# PostHog::FeatureFlags::EarlyAccessFeature

A PostHog early access feature: a feature users can opt in to from your app, backed by a feature flag that is enabled for opted-in users once the feature reaches an active stage.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::FeatureFlags::EarlyAccessFeature",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#stage" title="Stage">Stage</a>" : <i>String</i>,
        "<a href="#documentationurl" title="DocumentationUrl">DocumentationUrl</a>" : <i>String</i>,
        "<a href="#imageurl" title="ImageUrl">ImageUrl</a>" : <i>String</i>,
        "<a href="#featureflagid" title="FeatureFlagId">FeatureFlagId</a>" : <i>String</i>,
        "<a href="#payload" title="Payload">Payload</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::FeatureFlags::EarlyAccessFeature
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#stage" title="Stage">Stage</a>: <i>String</i>
    <a href="#documentationurl" title="DocumentationUrl">DocumentationUrl</a>: <i>String</i>
    <a href="#imageurl" title="ImageUrl">ImageUrl</a>: <i>String</i>
    <a href="#featureflagid" title="FeatureFlagId">FeatureFlagId</a>: <i>String</i>
    <a href="#payload" title="Payload">Payload</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the early access feature belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the early access feature.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>200</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

A longer description of what the feature does, shown to users in the opt-in UI.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Stage

Lifecycle stage. Moving to an active stage (alpha, beta, general-availability) enables the feature flag for opted-in users.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>draft</code> | <code>concept</code> | <code>alpha</code> | <code>beta</code> | <code>general-availability</code> | <code>archived</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### DocumentationUrl

URL of external documentation for the feature, shown to users in the opt-in UI.

_Required_: No

_Type_: String

_Maximum Length_: <code>800</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ImageUrl

URL of an image that shows the feature, such as a screenshot, shown to users in the opt-in UI.

_Required_: No

_Type_: String

_Maximum Length_: <code>800</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### FeatureFlagId

ID of an existing feature flag to link. If omitted, PostHog creates a new flag from the feature name. The flag must not already be linked to another feature, must not belong to another product such as a survey or experiment, and must not be group-based or multivariate. Only accepted on create.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Payload

JSON metadata for the feature's flag payload (use Fn::ToJsonString). Only accepted on create, and not read back.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog early access feature ID (a UUID).

#### LinkedFeatureFlagId

ID of the feature flag backing this feature (the one given in FeatureFlagId, or the one PostHog created).

#### FeatureFlagKey

Key of the feature flag backing this feature.

#### CreatedAt

ISO 8601 creation timestamp.

