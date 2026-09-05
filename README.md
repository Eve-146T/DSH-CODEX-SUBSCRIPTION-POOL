<p align="center">
  <img src="./assets/readme/accounts-demo.png" width="100%" alt="DeepSeek Harness OpenAI Codex settings showing four pooled accounts, weekly usage, account controls, and privacy settings">
</p>

# OpenAI Codex Plugin for the DeepSeek Harness

Lets you manage your pool of OpenAI subscriptions in DSH.

## Features

- Multi-account OpenAI Codex OAuth and usage controls
- Web search and image generation
- Chinese UI follows the language selected in DSH
- Model identity and routing guidance for agents
- The official OpenAI Docs skill, vendored from
  [openai/skills](https://github.com/openai/skills/tree/main/skills/.curated/openai-docs)

The plugin adds a durable runtime-context snapshot that tells an agent its
active provider/model, the models advertised by the `openai-codex` adapter,
what Sol, Terra, and Luna are for, and which orchestration tools accept an
explicit model. DSH writes this snapshot at session start and replaces it only
when the active model or advertised catalogue changes; it is not repeated on
every request.

## Install the DeepSeek Harness Codex plugin

Add it to your DSH Web profile:

```sh
dsh plugin --profile web add github:Eve-146T/DSH-CODEX-SUBSCRIPTION-POOL
```

## Tutorial

```sh
# install the plugin
dsh plugin --profile web add github:Eve-146T/DSH-CODEX-SUBSCRIPTION-POOL
# restart dsh
dsh --profile web
```

Then:

1. Open Settings
2. Click OpenAI Codex in the sidebar and login
3. Choose OpenAI Codex as the provider in the Models tab

The optional model filter recognizes GPT-6 and Astra rollout entries while
keeping the current model selection unchanged.

## Development

```sh
pnpm install
pnpm run build
pnpm test
dsh plugin --profile web add ./openai-codex-auth
```

## License

This project is distributed under [GPL-3.0-only](./LICENSE).
The vendored OpenAI Docs skill retains its upstream
[license](./skills/openai-docs/LICENSE.txt).
