# PostHog::Experiments::Experiment

A PostHog experiment (A/B test): a feature flag with variants plus the metrics used to compare them.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::Experiments::Experiment",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#description" title="Description">Description</a>" : <i>String</i>,
        "<a href="#featureflagkey" title="FeatureFlagKey">FeatureFlagKey</a>" : <i>String</i>,
        "<a href="#featureflag" title="FeatureFlag">FeatureFlag</a>" : <i>String</i>,
        "<a href="#featureflagruleid" title="FeatureFlagRuleId">FeatureFlagRuleId</a>" : <i>String</i>,
        "<a href="#holdoutid" title="HoldoutId">HoldoutId</a>" : <i>String</i>,
        "<a href="#type" title="Type">Type</a>" : <i>String</i>,
        "<a href="#startdate" title="StartDate">StartDate</a>" : <i>String</i>,
        "<a href="#enddate" title="EndDate">EndDate</a>" : <i>String</i>,
        "<a href="#parameters" title="Parameters">Parameters</a>" : <i>String</i>,
        "<a href="#exposurecriteria" title="ExposureCriteria">ExposureCriteria</a>" : <i>String</i>,
        "<a href="#metrics" title="Metrics">Metrics</a>" : <i>String</i>,
        "<a href="#metricssecondary" title="MetricsSecondary">MetricsSecondary</a>" : <i>String</i>,
        "<a href="#statsconfig" title="StatsConfig">StatsConfig</a>" : <i>String</i>,
        "<a href="#savedmetrics" title="SavedMetrics">SavedMetrics</a>" : <i>[ <a href="savedmetriclink.md">SavedMetricLink</a>, ... ]</i>,
        "<a href="#excludedvariants" title="ExcludedVariants">ExcludedVariants</a>" : <i>[ String, ... ]</i>,
        "<a href="#archived" title="Archived">Archived</a>" : <i>Boolean</i>,
        "<a href="#conclusion" title="Conclusion">Conclusion</a>" : <i>String</i>,
        "<a href="#conclusioncomment" title="ConclusionComment">ConclusionComment</a>" : <i>String</i>,
        "<a href="#repository" title="Repository">Repository</a>" : <i>String</i>,
        "<a href="#onlycountmaturedusers" title="OnlyCountMaturedUsers">OnlyCountMaturedUsers</a>" : <i>Boolean</i>,
        "<a href="#allowunknownevents" title="AllowUnknownEvents">AllowUnknownEvents</a>" : <i>Boolean</i>,
        "<a href="#tags" title="Tags">Tags</a>" : <i>[ String, ... ]</i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::Experiments::Experiment
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#description" title="Description">Description</a>: <i>String</i>
    <a href="#featureflagkey" title="FeatureFlagKey">FeatureFlagKey</a>: <i>String</i>
    <a href="#featureflag" title="FeatureFlag">FeatureFlag</a>: <i>String</i>
    <a href="#featureflagruleid" title="FeatureFlagRuleId">FeatureFlagRuleId</a>: <i>String</i>
    <a href="#holdoutid" title="HoldoutId">HoldoutId</a>: <i>String</i>
    <a href="#type" title="Type">Type</a>: <i>String</i>
    <a href="#startdate" title="StartDate">StartDate</a>: <i>String</i>
    <a href="#enddate" title="EndDate">EndDate</a>: <i>String</i>
    <a href="#parameters" title="Parameters">Parameters</a>: <i>String</i>
    <a href="#exposurecriteria" title="ExposureCriteria">ExposureCriteria</a>: <i>String</i>
    <a href="#metrics" title="Metrics">Metrics</a>: <i>String</i>
    <a href="#metricssecondary" title="MetricsSecondary">MetricsSecondary</a>: <i>String</i>
    <a href="#statsconfig" title="StatsConfig">StatsConfig</a>: <i>String</i>
    <a href="#savedmetrics" title="SavedMetrics">SavedMetrics</a>: <i>
      - <a href="savedmetriclink.md">SavedMetricLink</a></i>
    <a href="#excludedvariants" title="ExcludedVariants">ExcludedVariants</a>: <i>
      - String</i>
    <a href="#archived" title="Archived">Archived</a>: <i>Boolean</i>
    <a href="#conclusion" title="Conclusion">Conclusion</a>: <i>String</i>
    <a href="#conclusioncomment" title="ConclusionComment">ConclusionComment</a>: <i>String</i>
    <a href="#repository" title="Repository">Repository</a>: <i>String</i>
    <a href="#onlycountmaturedusers" title="OnlyCountMaturedUsers">OnlyCountMaturedUsers</a>: <i>Boolean</i>
    <a href="#allowunknownevents" title="AllowUnknownEvents">AllowUnknownEvents</a>: <i>Boolean</i>
    <a href="#tags" title="Tags">Tags</a>: <i>
      - String</i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the experiment belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name of the experiment.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Description

Description of the experiment hypothesis and expected outcomes.

_Required_: No

_Type_: String

_Maximum Length_: <code>3000</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### FeatureFlagKey

Key of the experiment's feature flag. Letters, numbers, hyphens and underscores only. PostHog creates the flag when no flag with this key exists; otherwise the experiment links to the existing flag as-is. Cannot be changed after creation.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>400</code>

_Pattern_: <code>^[a-zA-Z0-9_-]+$</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### FeatureFlag

Feature-flag config for the new flag, as a JSON object in the flag's filters shape (use Fn::ToJsonString), e.g. {"filters": {"multivariate": {"variants": [{"key": "control", "rollout_percentage": 50}, {"key": "test", "rollout_percentage": 50}]}}, "ensure_experience_continuity": false}. Applied only on create and cannot be combined with the key of a pre-existing flag. After creation, manage the flag with PostHog::FeatureFlags::FeatureFlag. Write-only.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### FeatureFlagRuleId

UUID of the experiment rule on an existing feature flag with rules that this experiment runs on. Set only on create, together with the FeatureFlagKey of that flag.

_Required_: No

_Type_: String

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### HoldoutId

ID of a holdout group (PostHog::Experiments::Holdout) to exclude from the experiment.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Type

Experiment type: `web` for frontend UI changes, `product` for backend/API changes.

_Required_: No

_Type_: String

_Allowed Values_: <code>web</code> | <code>product</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### StartDate

ISO 8601 launch time. Setting it launches the experiment.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EndDate

ISO 8601 end time. Setting it stops the experiment.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Parameters

Experiment parameters as a JSON object (use Fn::ToJsonString). Supported keys include `variant_notes` (notes per variant key) and `minimum_detectable_effect`. Flag config belongs on FeatureFlag.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ExposureCriteria

Exposure configuration as a JSON object (use Fn::ToJsonString), e.g. {"filterTestAccounts": true, "exposure_config": {"kind": "ExperimentEventExposureConfig", "event": "$pageview", "properties": []}}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Metrics

Primary metrics as a JSON array of ExperimentMetric objects (use Fn::ToJsonString). Each metric has kind `ExperimentMetric` and a metric_type: `mean`, `funnel`, `ratio`, `quantile` or `retention`.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### MetricsSecondary

Secondary metrics as a JSON array of ExperimentMetric objects (use Fn::ToJsonString). Same format as Metrics.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### StatsConfig

Statistics configuration as a JSON object (use Fn::ToJsonString), e.g. {"method": "bayesian"}.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### SavedMetrics

Shared metrics (PostHog::Experiments::SavedMetric) attached to the experiment.

_Required_: No

_Type_: List of <a href="savedmetriclink.md">SavedMetricLink</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ExcludedVariants

Variant keys to exclude from metric result calculations. Excluded variants are still served but omitted from analysis. The baseline variant cannot be excluded.

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Archived

Whether the experiment is archived.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Conclusion

Experiment conclusion.

_Required_: No

_Type_: String

_Allowed Values_: <code>won</code> | <code>lost</code> | <code>inconclusive</code> | <code>stopped_early</code> | <code>invalid</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### ConclusionComment

Comment about the experiment conclusion.

_Required_: No

_Type_: String

_Maximum Length_: <code>4000</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Repository

GitHub repository holding the experiment's feature-flag code, in `organization/repository` format.

_Required_: No

_Type_: String

_Maximum Length_: <code>255</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### OnlyCountMaturedUsers

Whether to only count users whose exposure window has fully matured.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### AllowUnknownEvents

Skip the validation that rejects metrics referencing events not yet ingested by the project. Write-only.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Tags

Tags on the experiment (up to 100, 255 characters each).

_Required_: No

_Type_: List of String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog experiment ID.

#### FeatureFlagId

ID of the linked feature flag.

#### Status

Lifecycle state: `draft`, `running`, `paused`, `exposure_frozen` or `stopped`.

#### CreatedAt

ISO 8601 creation timestamp.

#### UpdatedAt

ISO 8601 last-update timestamp.

