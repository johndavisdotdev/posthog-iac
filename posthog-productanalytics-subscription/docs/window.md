# PostHog::ProductAnalytics::Subscription Window

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#mode" title="Mode">Mode</a>" : <i>String</i>,
    "<a href="#startdaysago" title="StartDaysAgo">StartDaysAgo</a>" : <i>Integer</i>,
    "<a href="#enddaysago" title="EndDaysAgo">EndDaysAgo</a>" : <i>Integer</i>
}
</pre>

### YAML

<pre>
<a href="#mode" title="Mode">Mode</a>: <i>String</i>
<a href="#startdaysago" title="StartDaysAgo">StartDaysAgo</a>: <i>Integer</i>
<a href="#enddaysago" title="EndDaysAgo">EndDaysAgo</a>: <i>Integer</i>
</pre>

## Properties

#### Mode

What the report analyzes each run: `since_last_sent` (default, everything since the previous scheduled delivery), `last_n_days` (a trailing window of StartDaysAgo days) or `days_ago_range` (from StartDaysAgo to EndDaysAgo days ago).

_Required_: No

_Type_: String

_Allowed Values_: <code>since_last_sent</code> | <code>last_n_days</code> | <code>days_ago_range</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### StartDaysAgo

Lower bound of the analysis window, in days before the run. Required for `last_n_days` and `days_ago_range`. 1-365.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### EndDaysAgo

Upper bound of the analysis window, in days before the run (0 = now). Required for `days_ago_range` and must be less than StartDaysAgo. 0-365.

_Required_: No

_Type_: Integer

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

