import { App, CfnParameter, Duration, RemovalPolicy, Stack } from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import { FilterLogic, PropertyFilterType, PropertyOperator } from '../../src/core';
import { Project } from '../../src/organizations';
import { Playlist, PlaylistType, RecordingDurationOperator, RecordingDurationType } from '../../src/session-replay';

function setup() {
  const stack = new Stack(new App(), 'Test');
  const project = Project.fromProjectId(stack, 'Project', '12345');
  return { stack, project };
}

function props(stack: Stack): Record<string, any> {
  return Object.values(Template.fromStack(stack).findResources('PostHog::SessionReplay::Playlist'))[0].Properties;
}

test('creates a filters playlist with typed recording filters', () => {
  const { stack, project } = setup();
  const playlist = new Playlist(stack, 'Long', {
    project,
    name: 'Long sessions',
    description: 'Over a minute',
    pinned: true,
    filters: {
      properties: [
        { key: '$browser', value: 'Chrome', type: PropertyFilterType.EVENT },
        { key: 'email', operator: PropertyOperator.IS_SET, type: PropertyFilterType.PERSON },
      ],
      logic: FilterLogic.OR,
      duration: { value: Duration.minutes(1) },
      dateRange: { from: '-7d' },
      filterTestAccounts: true,
    },
  });
  Template.fromStack(stack).hasResource('PostHog::SessionReplay::Playlist', { DeletionPolicy: 'Delete' });
  const p = props(stack);
  expect(p).toMatchObject({ ProjectId: '12345', Type: 'filters', Name: 'Long sessions', Description: 'Over a minute', Pinned: true });
  expect(JSON.parse(p.Filters)).toEqual({
    date_from: '-7d',
    duration: [{ key: 'duration', type: 'recording', value: 60, operator: 'gt' }],
    filter_group: {
      type: 'OR',
      values: [{
        type: 'OR',
        values: [
          { key: '$browser', operator: 'exact', type: 'event', value: 'Chrome' },
          { key: 'email', operator: 'is_set', type: 'person' },
        ],
      }],
    },
    filter_test_accounts: true,
  });
  expect(stack.resolve(playlist.playlistShortId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Long/), 'ShortId'] });
  expect(stack.resolve(playlist.playlistId)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Long/), 'Id'] });
  expect(stack.resolve(playlist.playlistCreatedAt)).toEqual({ 'Fn::GetAtt': [expect.stringMatching(/^Long/), 'CreatedAt'] });
});

test('duration types, absolute dates and raw filters', () => {
  const { stack, project } = setup();
  new Playlist(stack, 'P', {
    project,
    type: PlaylistType.FILTERS,
    filters: {
      duration: { value: Duration.seconds(30), operator: RecordingDurationOperator.LESS_THAN, durationType: RecordingDurationType.ACTIVE },
      dateRange: { from: new Date('2026-11-01T00:00:00Z'), to: '2026-11-15T00:00:00Z' },
      rawFilters: { order: 'start_time' },
    },
  });
  expect(JSON.parse(props(stack).Filters)).toEqual({
    date_from: '2026-11-01T00:00:00.000Z',
    date_to: '2026-11-15T00:00:00Z',
    duration: [{ key: 'active_seconds', type: 'recording', value: 30, operator: 'lt' }],
    order: 'start_time',
  });
});

test('defaults to a collection, leaves optional properties out and honours the removal policy', () => {
  const { stack, project } = setup();
  new Playlist(stack, 'Bugs', { project, removalPolicy: RemovalPolicy.RETAIN });
  Template.fromStack(stack).hasResource('PostHog::SessionReplay::Playlist', { DeletionPolicy: 'Retain' });
  expect(props(stack)).toEqual({ ProjectId: '12345', Type: 'collection' });
});

test('validates concrete values and skips tokens', () => {
  const { stack, project } = setup();
  expect(() => new Playlist(stack, 'E1', { project, name: 'x'.repeat(401) })).toThrow(/Playlist name/);
  expect(() => new Playlist(stack, 'E2', { project, type: PlaylistType.COLLECTION, filters: {} })).toThrow(/FILTERS/);
  expect(() => new Playlist(stack, 'E3', { project, filters: { dateRange: { from: 'last week' } } })).toThrow(/relative date/);
  const name = new CfnParameter(stack, 'Name', { type: 'String' });
  expect(() => new Playlist(stack, 'Token', { project, name: name.valueAsString, filters: { dateRange: { from: name.valueAsString } } }))
    .not.toThrow();
});

test('imports existing playlists by short ID', () => {
  const { stack, project } = setup();
  const playlist = Playlist.fromPlaylistShortId(stack, 'Existing', project, 'AbC123');
  expect(playlist.playlistShortId).toBe('AbC123');
  expect(playlist.project).toBe(project);
});
