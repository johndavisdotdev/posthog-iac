# PostHog::ProductAnalytics::Action Step

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#event" title="Event">Event</a>" : <i>String</i>,
    "<a href="#selector" title="Selector">Selector</a>" : <i>String</i>,
    "<a href="#tagname" title="TagName">TagName</a>" : <i>String</i>,
    "<a href="#text" title="Text">Text</a>" : <i>String</i>,
    "<a href="#textmatching" title="TextMatching">TextMatching</a>" : <i>String</i>,
    "<a href="#href" title="Href">Href</a>" : <i>String</i>,
    "<a href="#hrefmatching" title="HrefMatching">HrefMatching</a>" : <i>String</i>,
    "<a href="#url" title="Url">Url</a>" : <i>String</i>,
    "<a href="#urlmatching" title="UrlMatching">UrlMatching</a>" : <i>String</i>,
    "<a href="#properties" title="Properties">Properties</a>" : <i>String</i>
}
</pre>

### YAML

<pre>
<a href="#event" title="Event">Event</a>: <i>String</i>
<a href="#selector" title="Selector">Selector</a>: <i>String</i>
<a href="#tagname" title="TagName">TagName</a>: <i>String</i>
<a href="#text" title="Text">Text</a>: <i>String</i>
<a href="#textmatching" title="TextMatching">TextMatching</a>: <i>String</i>
<a href="#href" title="Href">Href</a>: <i>String</i>
<a href="#hrefmatching" title="HrefMatching">HrefMatching</a>: <i>String</i>
<a href="#url" title="Url">Url</a>: <i>String</i>
<a href="#urlmatching" title="UrlMatching">UrlMatching</a>: <i>String</i>
<a href="#properties" title="Properties">Properties</a>: <i>String</i>
</pre>

## Properties

#### Event

Event name to match, e.g. $pageview, $autocapture or a custom event.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Selector

CSS selector of the target element, e.g. div > button.cta.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TagName

HTML tag name to match, e.g. button.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Text

Element text to match.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### TextMatching

How to match the value. `exact`, `contains` or `regex`.

_Required_: No

_Type_: String

_Allowed Values_: <code>exact</code> | <code>contains</code> | <code>regex</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Href

Link href to match.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### HrefMatching

How to match the value. `exact`, `contains` or `regex`.

_Required_: No

_Type_: String

_Allowed Values_: <code>exact</code> | <code>contains</code> | <code>regex</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Url

Page URL to match.

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### UrlMatching

How to match the value. `exact`, `contains` or `regex`.

_Required_: No

_Type_: String

_Allowed Values_: <code>exact</code> | <code>contains</code> | <code>regex</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Properties

Event or person property filters as a JSON array (use Fn::ToJsonString), e.g. [{"key": "plan", "value": "pro", "operator": "exact", "type": "person"}].

_Required_: No

_Type_: String

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

