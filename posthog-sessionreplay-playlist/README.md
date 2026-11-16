# PostHog::SessionReplay::Playlist

Manages a PostHog [session replay playlist](https://posthog.com/docs/session-replay/how-to-watch-recordings): a manually curated collection of recordings, or a saved filter view.

| Property | Notes |
|---|---|
| `ProjectId` | Required, create-only. Part of the primary identifier. |
| `Type` | Required, create-only. `collection` (curated recordings) or `filters` (saved filter view). |
| `Name`, `Description` | Removing them from the template clears them (PostHog then shows a derived name). |
| `Pinned` | Defaults to false. |
| `Filters` | Recording filter criteria as a JSON object; pass it with `Fn::ToJsonString`. Only used by `filters` playlists. Removing it from a `filters` playlist clears the filters. |

The primary identifier is `ProjectId` + `ShortId`, because PostHog addresses playlists by short ID. `Fn::GetAtt`: `ShortId`, `Id` (numeric), `CreatedAt`.

Which recordings are in a `collection` playlist is not managed by this type. Delete soft-deletes the playlist (PostHog does not allow a hard delete); a soft-deleted playlist is reported as not found. List skips PostHog's synthetic playlists (such as watch history), which have no stored row.

See [examples/playlist.yaml](examples/playlist.yaml) and the repository README for registration.

## Development

```bash
go test ./...          # unit tests against a fake PostHog API
make build             # cfn generate + linux/amd64 handler binary
../.venv/bin/cfn validate
```
