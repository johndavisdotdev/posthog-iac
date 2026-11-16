# PostHog::DataWarehouse::Table

A PostHog self-managed data warehouse table: files in an S3-compatible bucket (CSV, Parquet, JSON or Delta) that PostHog reads as one table queryable with HogQL.

## Syntax

To declare this entity in your AWS CloudFormation template, use the following syntax:

### JSON

<pre>
{
    "Type" : "PostHog::DataWarehouse::Table",
    "Properties" : {
        "<a href="#projectid" title="ProjectId">ProjectId</a>" : <i>String</i>,
        "<a href="#name" title="Name">Name</a>" : <i>String</i>,
        "<a href="#format" title="Format">Format</a>" : <i>String</i>,
        "<a href="#urlpattern" title="UrlPattern">UrlPattern</a>" : <i>String</i>,
        "<a href="#credential" title="Credential">Credential</a>" : <i><a href="credential.md">Credential</a></i>,
        "<a href="#options" title="Options">Options</a>" : <i><a href="options.md">Options</a></i>,
    }
}
</pre>

### YAML

<pre>
Type: PostHog::DataWarehouse::Table
Properties:
    <a href="#projectid" title="ProjectId">ProjectId</a>: <i>String</i>
    <a href="#name" title="Name">Name</a>: <i>String</i>
    <a href="#format" title="Format">Format</a>: <i>String</i>
    <a href="#urlpattern" title="UrlPattern">UrlPattern</a>: <i>String</i>
    <a href="#credential" title="Credential">Credential</a>: <i><a href="credential.md">Credential</a></i>
    <a href="#options" title="Options">Options</a>: <i><a href="options.md">Options</a></i>
</pre>

## Properties

#### ProjectId

ID of the PostHog project the table belongs to.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Update requires_: [Replacement](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-replacement)

#### Name

Name the table is queried by in HogQL. Must be unique within the project, start with a letter or underscore and contain only letters, numbers and underscores.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>128</code>

_Pattern_: <code>^[A-Za-z_][A-Za-z0-9_]*$</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Format

File format of the objects the pattern matches. Every matched file must share this format.

_Required_: Yes

_Type_: String

_Allowed Values_: <code>CSV</code> | <code>CSVWithNames</code> | <code>Parquet</code> | <code>JSONEachRow</code> | <code>Delta</code> | <code>DeltaS3Wrapper</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### UrlPattern

HTTPS URL of the files to read, with `*` matching any part of a path segment (e.g. https://your-bucket.s3.amazonaws.com/orders/*.parquet). All matched files are read as one table.

_Required_: Yes

_Type_: String

_Minimum Length_: <code>1</code>

_Maximum Length_: <code>500</code>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Credential

Access key for the bucket the files live in.

_Required_: Yes

_Type_: <a href="credential.md">Credential</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

#### Options

Per-format read options.

_Required_: No

_Type_: <a href="options.md">Options</a>

_Update requires_: [No interruption](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/using-cfn-updating-stacks-update-behaviors.html#update-no-interrupt)

## Return Values

### Fn::GetAtt

The `Fn::GetAtt` intrinsic function returns a value for a specified attribute of this type. The following are the available attributes and sample return values.

For more information about using the `Fn::GetAtt` intrinsic function, see [Fn::GetAtt](https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/intrinsic-function-reference-getatt.html).

#### Id

The PostHog table ID (UUID).

#### HogqlName

Dotted name the table is queried by in HogQL.

#### CreatedAt

ISO 8601 creation timestamp.

