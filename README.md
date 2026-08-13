# dsh-openai-codex-auth

为 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) 提供 OpenAI Codex 订阅登录与用量展示。

## 功能

- 通过 OpenAI OAuth 登录 ChatGPT Plus、Pro、Team 或 Enterprise 账号
- 在“设置 → OpenAI Codex”中管理登录状态
- 展示 Codex 短周期和周用量、剩余额度及重置时间
- 自动刷新 OAuth token，并将有效凭据提供给 `openai-codex` 模型提供方
- 提供 `/login-openai` 和 `/logout-openai` 命令

## 安装

安装到 DSH 的 `web` profile：

```sh
dsh plugin --profile web add github:yoke233/dsh-openai-codex-auth
```

安装完成后重启 DSH：

```sh
dsh --profile web
```

## 使用

1. 打开 DSH Web。
2. 进入“设置 → OpenAI Codex”。
3. 点击“登录 OpenAI”，在浏览器中完成授权。
4. 在“设置 → 模型提供方”中选择 `openai-codex`。

也可以在对话中使用命令：

```text
/login-openai
/logout-openai
```

## 配置

插件通常不需要额外配置。默认凭据文件位于：

```text
$DSH_HOME/openai-codex-auth.json
```

如需自定义存储位置，可在 Cordis 配置中指定：

```yaml
- insert:
    - id: openai-codex-auth
      name: dsh-openai-codex-auth
      config:
        path: /secure/path/openai-codex-auth.json
```

`path` 的优先级高于 `dshHome`。

## 安全

- OAuth 使用 PKCE 和随机 `state` 校验。
- 凭据以 owner-only 权限原子写入本地文件。
- Web 页面不会读取或保存 access token、refresh token。
- Web 管理接口仅监听 `127.0.0.1`，状态变更请求带有 CSRF 校验。

## 本地开发

```sh
pnpm install
pnpm run build
pnpm test
dsh plugin --profile web add ./openai-codex-auth
```

## License

[MIT](./LICENSE)
