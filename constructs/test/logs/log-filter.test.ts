import { PropertyOperator } from '../../src/core';
import { LogFilter, LogPropertyType } from '../../src/logs';

test('wraps a single condition in the two-level group shape', () => {
  expect(LogFilter.serviceName(PropertyOperator.EXACT, 'api').render()).toEqual({
    type: 'AND',
    values: [{ type: 'AND', values: [{ key: 'service.name', operator: 'exact', type: 'log_resource_attribute', value: 'api' }] }],
  });
});

test('wraps a group of conditions in an outer AND group', () => {
  const filter = LogFilter.all(
    LogFilter.serviceName(PropertyOperator.EXACT, 'api'),
    LogFilter.any(
      LogFilter.message(PropertyOperator.ICONTAINS, 'timeout'),
      LogFilter.attribute('http.route', PropertyOperator.EXACT, '/health'),
    ),
    LogFilter.resourceAttribute('k8s.namespace.name', PropertyOperator.IS_SET),
  );
  expect(filter.render()).toMatchInlineSnapshot(`
{
  "type": "AND",
  "values": [
    {
      "type": "AND",
      "values": [
        {
          "key": "service.name",
          "operator": "exact",
          "type": "log_resource_attribute",
          "value": "api",
        },
        {
          "type": "OR",
          "values": [
            {
              "key": "message",
              "operator": "icontains",
              "type": "log",
              "value": "timeout",
            },
            {
              "key": "http.route",
              "operator": "exact",
              "type": "log_attribute",
              "value": "/health",
            },
          ],
        },
        {
          "key": "k8s.namespace.name",
          "operator": "is_set",
          "type": "log_resource_attribute",
        },
      ],
    },
  ],
}
`);
});

test('renders a group of groups as is', () => {
  const filter = LogFilter.any(
    LogFilter.all(LogFilter.condition('status_code', LogPropertyType.SPAN_ATTRIBUTE, PropertyOperator.GTE, 500)),
    LogFilter.all(LogFilter.message(PropertyOperator.REGEX, 'panic')),
  );
  expect(filter.render()).toEqual({
    type: 'OR',
    values: [
      { type: 'AND', values: [{ key: 'status_code', operator: 'gte', type: 'span_attribute', value: 500 }] },
      { type: 'AND', values: [{ key: 'message', operator: 'regex', type: 'log', value: 'panic' }] },
    ],
  });
});

test('rejects incomplete conditions and empty groups', () => {
  expect(() => LogFilter.message(PropertyOperator.EXACT)).toThrow(/value is required/);
  expect(() => LogFilter.all()).toThrow(/at least one condition/);
  expect(() => LogFilter.any()).toThrow(/at least one condition/);
});
