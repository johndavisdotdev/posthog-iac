# PostHog::Logs::SamplingRule

A PostHog Logs sampling rule: reduces ingested log or span volume by sampling by severity, dropping matching records, or rate-limiting them. Rules are evaluated in priority order and the first match wins.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Logs::SamplingRule",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#enabled" title="Enabled">Enabled</a>" : <i>Boolean</i>,
        "<a href="#priority" title="Priority">Priority</a>" : <i>Integer</i>,
        "<a href="#ruletype" title="RuleType">RuleType</a>" : <i>String</i>,
        "<a href="#source" title="Source">Source</a>" : <i>String</i>,
        "<a href="#scopeservice" title="ScopeService">ScopeService</a>" : <i>String</i>,
        "<a href="#scopepathpattern" title="ScopePathPattern">ScopePathPattern</a>" : <i>String</i>,
        "<a href="#scopeattributefilters" title="ScopeAttributeFilters">ScopeAttributeFilters</a>" : <i>String</i>,
        "<a href="#config" title="Config">Config</a>" : <i>String</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Logs::SamplingRule
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#enabled" title="Enabled">Enabled</a>: <i>Boolean</i>
    <a href="#priority" title="Priority">Priority</a>: <i>Integer</i>
    <a href="#ruletype" title="RuleType">RuleType</a>: <i>String</i>
    <a href="#source" title="Source">Source</a>: <i>String</i>
    <a href="#scopeservice" title="ScopeService">ScopeService</a>: <i>String</i>
    <a href="#scopepathpattern" title="ScopePathPattern">ScopePathPattern</a>: <i>String</i>
    <a href="#scopeattributefilters" title="ScopeAttributeFilters">ScopeAttributeFilters</a>: <i>String</i>
    <a href="#config" title="Config">Config</a>: <i>String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the sampling rule belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

User-visible label for this rule.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>255</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Enabled

Whether the rule is active. Disabled rules are ignored by ingestion. Defaults to false.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Priority

Evaluation order: lower numbers are evaluated first and the first matching rule wins. Logs and span rules have separate orders. Omit to append after existing rules (PostHog assigns the next priority).

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### RuleType

Rule kind: `severity_sampling` (severity-based reduction), `path_drop` (drop matching records) or `rate_limit` (cap matching volume at ingestion). Span rules support `path_drop` and `rate_limit` only.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>severity_sampling</code> | <code>path_drop</code> | <code>rate_limit</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Source

Record source the rule filters: `logs` (default) runs in the logs pipeline, `spans` in the traces pipeline. Cannot be changed after creation.

_Required_: No

_Type_: String

_Allowed Values_: <code>logs</code> | <code>spans</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### ScopeService

Optional legacy service-name scope. New rules should match with `filter_group` in Config instead.

_Required_: No

_Type_: String

_Maximum Length_: <code>512</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ScopePathPattern

Optional regex matched against a path-like log attribute when present.

_Required_: No

_Type_: String

_Maximum Length_: <code>1024</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ScopeAttributeFilters

Optional predicates over string attributes as a JSON array (use Fn::ToJsonString), e.g. [{"key": "http.route", "op": "eq", "value": "/api"}].

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Config

Type-specific configuration as a JSON object (use Fn::ToJsonString). path_drop: optional `filter_group` (AND/OR tree of property filters; every group needs at least one filter) and/or legacy `patterns` (regex list) with `match_attribute_key`. severity_sampling: `actions` per severity level and optional `always_keep`. rate_limit: either `logs_per_second` (1-1000000, optional `burst_logs`) or `kb_per_second` (1-1000000, optional `burst_kb`), not both, plus an optional `filter_group`.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog sampling rule ID (UUID).

#### Version

Incremented by PostHog on each update.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 timestamp of the last update.

