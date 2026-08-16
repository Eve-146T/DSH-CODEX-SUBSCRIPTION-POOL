<p align="center">
  <img src="./assets/readme/hero.svg" width="100%" alt="DeepSeek Harness Codex plugin for ChatGPT subscription login and usage tracking">
</p>

# OpenAI Codex Plugin for DeepSeek Harness

`dsh-openai-codex-auth` lets DeepSeek Harness (DSH) use an OpenAI Codex
subscription. Sign in with OpenAI OAuth, view Codex usage in DSH, and use the
`openai-codex` model provider without copying tokens into the web interface.

It also **fixes web search when using Codex in DSH**: the `web_search` tool is
routed through OpenAI's native web search instead of making a separate DeepSeek
API request.

This is an independent community plugin. It is not made or endorsed by OpenAI
or DeepSeek.

## Install the DeepSeek Harness Codex plugin

Add it to your DSH Web profile:

```sh
dsh plugin --profile web add github:Eve-146T/deepseek-harness-openai-codex-auth
```

## Sign in with OpenAI

Restart DSH Web:

```sh
dsh --profile web
```

Then:

1. Open **Settings → OpenAI Codex**.
2. Select **Sign in** and finish signing in.
3. Open **Settings → Model Providers** and choose `openai-codex`.

That is all you need for a normal local installation.

## Security

- Access and refresh tokens stay on the machine running DSH.
- The browser settings page never receives the tokens.
- Login uses OAuth PKCE and validates a random callback state.
- Credential files use owner-only permissions and atomic updates.
- The callback and status services bind only to `127.0.0.1`.

The plugin uses OpenAI's Codex OAuth flow and usage endpoint. Those interfaces
are not documented as a public third-party integration, so they may change.

## Troubleshooting

- **The sign-in window does not open:** allow pop-ups for DSH Web and try again.
- **The plugin service is unreachable:** restart the `web` profile and open DSH
  Web on the same machine.
- **No usage limit appears:** select the refresh icon. OpenAI may temporarily
  return no displayable usage window even while the account remains connected.

## Optional credential path

Credentials normally live at `$DSH_HOME/openai-codex-auth.json`. To use another
location:

```yaml
- insert:
    - id: openai-codex-auth
      name: dsh-openai-codex-auth
      config:
        path: /secure/path/openai-codex-auth.json
```

## Development

```sh
pnpm install
pnpm run build
pnpm test
dsh plugin --profile web add ./openai-codex-auth
```

## License

This project is distributed under [GPL-3.0-only](./LICENSE).
