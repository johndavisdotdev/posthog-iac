# PostHog::DataWarehouse::Table Options

Per-format read options.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "<a href="#csvallowdoublequotes" title="CsvAllowDoubleQuotes">CsvAllowDoubleQuotes</a>" : <i>Boolean</i>
}
</pre>

### YAML

<pre>
<a href="#csvallowdoublequotes" title="CsvAllowDoubleQuotes">CsvAllowDoubleQuotes</a>: <i>Boolean</i>
</pre>

## Properties

#### CsvAllowDoubleQuotes

For CSV files that quote fields with doubled quotes.

_Required_: No

_Type_: Boolean

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

