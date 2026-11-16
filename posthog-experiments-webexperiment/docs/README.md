# PostHog::Experiments::WebExperiment

A PostHog no-code web experiment: page changes (DOM transforms) per variant, served by posthog-js through an automatically created feature flag.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Experiments::WebExperiment",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#variants" title="Variants">Variants</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Experiments::WebExperiment
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#variants" title="Variants">Variants</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the web experiment belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the web experiment.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Variants

Variants as a JSON object keyed by variant key (use Fn::ToJsonString). Each variant has `transforms` (a list of {selector, text, html, css} changes), optional `conditions` and a `rollout_percentage`, e.g. {"control": {"transforms": [], "rollout_percentage": 50}, "test": {"transforms": [{"selector": "#hero h1", "text": "Here comes Superman!"}], "rollout_percentage": 50}}.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog web experiment ID (an experiment ID).

#### FeatureFlagKey

Key of the feature flag PostHog created for the web experiment.

#### CreatedAt

ISO 8601 creation timestamp.

