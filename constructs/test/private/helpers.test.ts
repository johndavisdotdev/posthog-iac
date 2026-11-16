import { App, SecretValue, Stack, Token } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import { FilterLogic, PropertyFilterType, PropertyOperator } from '../../src/core';
import { renderPropertyFilter, renderPropertyFilters, renderPropertyGroup } from '../../src/private/filters';
import {
  HANDLER_WRITABLE_SECRET_TAG,
  exactlyOne,
  jsonProp,
  mapOrUndefined,
  secretOrNew,
  secretProp,
  uniqueOrUndefined,
  validateLength,
  validatePattern,
  validateRange,
} from '../../src/private/helpers';

const stack = () => new Stack(new App(), 'Test');

describe('validation helpers', () => {
  test('validateLength checks concrete values and skips tokens', () => {
    expect(() => validateLength('Name', '', 1, 10)).toThrow(/between 1 and 10 characters, got 0/);
    expect(() => validateLength('Name', 'x'.repeat(11), 1, 10)).toThrow(/got 11/);
    expect(() => validateLength('Name', 'ok', 1, 10)).not.toThrow();
    expect(() => validateLength('Name', undefined, 1, 10)).not.toThrow();
    expect(() => validateLength('Name', Token.asString({ Ref: 'X' }), 50, 60)).not.toThrow();
  });

  test('validatePattern and validateRange', () => {
    expect(() => validatePattern('Color', 'red', /^#[0-9a-f]{6}$/i, 'use #rrggbb')).toThrow(/Color 'red' is invalid: use #rrggbb/);
    expect(() => validatePattern('Color', '#00ff00', /^#[0-9a-f]{6}$/i, '')).not.toThrow();
    expect(() => validateRange('Rate', 1.5, 0, 1)).toThrow(/between 0 and 1, got 1.5/);
    expect(() => validateRange('Rate', Token.asNumber({ Ref: 'X' }), 0, 1)).not.toThrow();
  });

  test('exactlyOne', () => {
    expect(() => exactlyOne('Target', { insight: 'a', dashboard: undefined })).not.toThrow();
    expect(() => exactlyOne('Target', { insight: undefined, dashboard: undefined })).toThrow(/exactly one of insight, dashboard \(got none\)/);
    expect(() => exactlyOne('Target', { insight: 'a', dashboard: 'b' })).toThrow(/got insight, dashboard/);
  });

  test('collection helpers', () => {
    expect(uniqueOrUndefined(['a', 'b', 'a'])).toEqual(['a', 'b']);
    expect(uniqueOrUndefined([])).toBeUndefined();
    expect(mapOrUndefined({})).toBeUndefined();
    expect(mapOrUndefined({ a: 'b' })).toEqual({ a: 'b' });
  });
});

describe('jsonProp', () => {
  test('stringifies plain values and passes undefined through', () => {
    const s = stack();
    expect(s.resolve(jsonProp(s, { a: [1, 'x'] }))).toBe('{"a":[1,"x"]}');
    expect(jsonProp(s, undefined)).toBeUndefined();
  });

  test('keeps tokens resolvable', () => {
    const s = stack();
    const rendered = s.resolve(jsonProp(s, { id: Token.asString({ 'Fn::GetAtt': ['Flag', 'Id'] }) }));
    expect(JSON.stringify(rendered)).toContain('Fn::GetAtt');
  });
});

describe('secrets', () => {
  test('secretOrNew creates a handler-writable secret only when none is given', () => {
    const s = stack();
    const created = secretOrNew(s, 'KeySecret', undefined, 'PostHog secret API key');
    const existing = secretsmanager.Secret.fromSecretNameV2(s, 'Existing', 'existing');
    expect(secretOrNew(s, 'Other', existing, 'x')).toBe(existing);
    expect(created).toBeDefined();
    Template.fromStack(s).hasResourceProperties('AWS::SecretsManager::Secret', {
      Description: 'PostHog secret API key',
      Tags: [{ Key: HANDLER_WRITABLE_SECRET_TAG, Value: 'true' }],
    });
  });

  test('secretProp renders a dynamic reference', () => {
    const s = stack();
    const rendered = s.resolve(secretProp(SecretValue.secretsManager('posthog/openai')));
    expect(rendered).toBe('{{resolve:secretsmanager:posthog/openai:SecretString:::}}');
    expect(secretProp(undefined)).toBeUndefined();
  });
});

describe('property filters', () => {
  test('renders defaults and options', () => {
    expect(renderPropertyFilter({ key: 'plan', value: 'pro' })).toEqual({ key: 'plan', value: 'pro', operator: 'exact', type: 'event' });
    expect(renderPropertyFilter({ key: 'email', operator: PropertyOperator.IS_SET, type: PropertyFilterType.PERSON }))
      .toEqual({ key: 'email', operator: 'is_set', type: 'person' });
    expect(renderPropertyFilter({ key: 'industry', value: 'saas', type: PropertyFilterType.GROUP, groupTypeIndex: 0 }))
      .toEqual({ key: 'industry', value: 'saas', operator: 'exact', type: 'group', group_type_index: 0 });
    expect(renderPropertyFilters([])).toBeUndefined();
  });

  test('rejects incomplete filters', () => {
    expect(() => renderPropertyFilter({ key: 'plan' })).toThrow(/value is required for operator 'exact'/);
    expect(() => renderPropertyFilter({ key: 'industry', value: 'x', type: PropertyFilterType.GROUP })).toThrow(/groupTypeIndex is required/);
  });

  test('renders nested groups', () => {
    expect(renderPropertyGroup({
      logic: FilterLogic.OR,
      filters: [{ key: 'plan', value: 'pro', type: PropertyFilterType.PERSON }],
      groups: [{ filters: [{ key: '$browser', value: 'Chrome' }] }],
    })).toEqual({
      type: 'OR',
      values: [
        { key: 'plan', value: 'pro', operator: 'exact', type: 'person' },
        { type: 'AND', values: [{ key: '$browser', value: 'Chrome', operator: 'exact', type: 'event' }] },
      ],
    });
  });
});
