# PostHog::ProductAnalytics::Alert ScheduleRestriction

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#blockedwindows" title="BlockedWindows">BlockedWindows</a>" : <i>[ <a href="blockedwindow.md">BlockedWindow</a>, ... ]</i>
}
</pre>

### YAML

<pre>
<a href="#blockedwindows" title="BlockedWindows">BlockedWindows</a>: <i>
      - <a href="blockedwindow.md">BlockedWindow</a></i>
</pre>

## Properties

#### BlockedWindows

Local time windows (project timezone) when the alert must not run. At most five.

_Required_: Yes

_Type_: List of <a href="blockedwindow.md">BlockedWindow</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

