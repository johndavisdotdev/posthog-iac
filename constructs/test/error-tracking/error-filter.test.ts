import { PropertyFilterType, PropertyOperator } from '../../src/core';
import { ErrorFilter, ExceptionProperty } from '../../src/error-tracking';

test('renders a single condition as an AND group', () => {
  expect(ErrorFilter.exceptionType(PropertyOperator.EXACT, ['TypeError']).render()).toEqual({
    type: 'AND',
    values: [{ key: '$exception_types', operator: 'exact', type: 'event', value: ['TypeError'] }],
  });
});

test('renders nested AND/OR groups of every condition kind', () => {
  const filter = ErrorFilter.all(
    ErrorFilter.exceptionType(PropertyOperator.EXACT, ['TypeError', 'RangeError']),
    ErrorFilter.any(
      ErrorFilter.exceptionMessage(PropertyOperator.ICONTAINS, 'timeout'),
      ErrorFilter.stackFrameSource(PropertyOperator.REGEX, '^src/payments/'),
      ErrorFilter.stackFrameFunction(PropertyOperator.EXACT, ['charge']),
    ),
    ErrorFilter.property({ key: '$lib', value: 'web' }),
    ErrorFilter.property({ key: 'plan', operator: PropertyOperator.IS_SET, type: PropertyFilterType.PERSON }),
  );
  expect(filter.isEmpty).toBe(false);
  expect(filter.render()).toMatchInlineSnapshot(`
{
  "type": "AND",
  "values": [
    {
      "key": "$exception_types",
      "operator": "exact",
      "type": "event",
      "value": [
        "TypeError",
        "RangeError",
      ],
    },
    {
      "type": "OR",
      "values": [
        {
          "key": "$exception_values",
          "operator": "icontains",
          "type": "event",
          "value": "timeout",
        },
        {
          "key": "$exception_sources",
          "operator": "regex",
          "type": "event",
          "value": "^src/payments/",
        },
        {
          "key": "$exception_functions",
          "operator": "exact",
          "type": "event",
          "value": [
            "charge",
          ],
        },
      ],
    },
    {
      "key": "$lib",
      "operator": "exact",
      "type": "event",
      "value": "web",
    },
    {
      "key": "plan",
      "operator": "is_set",
      "type": "person",
    },
  ],
}
`);
});

test('exceptionProperty matches any exception property', () => {
  expect(ErrorFilter.exceptionProperty(ExceptionProperty.MESSAGES, PropertyOperator.IS_NOT_SET).render().values)
    .toEqual([{ key: '$exception_values', operator: 'is_not_set', type: 'event' }]);
});

test('an empty all() matches everything', () => {
  expect(ErrorFilter.all().isEmpty).toBe(true);
  expect(ErrorFilter.all(ErrorFilter.all()).isEmpty).toBe(true);
  expect(ErrorFilter.all().render()).toEqual({ type: 'AND', values: [] });
});

test('rejects incomplete conditions and an empty any()', () => {
  expect(() => ErrorFilter.exceptionType(PropertyOperator.EXACT)).toThrow(/value is required/);
  expect(() => ErrorFilter.any()).toThrow(/at least one condition/);
});
