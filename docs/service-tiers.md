# Service-tier integration status

The plugin can validate and persist either of these choices on the server:

| UI choice | OpenAI request value |
| --- | --- |
| Normal | `default` |
| Priority | `priority` |

`POST /service-tier-preference` accepts JSON shaped as
`{"selection":"normal"}` or `{"selection":"priority"}`. It has the same
local-origin and CSRF protections as logout, rejects other values, limits the
request body to 4 KiB, and stores the preference in a mode-`0600` file. Status
responses return both the selection and mapped request value with
`forwardingSupported: false`.

There is deliberately no enabled selector yet. DeepSeek Harness 0.1.0-rc.6
cannot carry the preference to a model request without unsafe interception:

1. `@deepseek-ai/dsh-llm` has no service-tier field in `GenerateOptions` or
   `LlmCallConfig`. Loop-built requests are deep-frozen, and the `llm/stream`
   waterfall's `next()` closes over the original request.
2. `@deepseek-ai/dsh-llm-pi-ai` has no service-tier profile field and does not
   pass one to `Models.streamSimple()`.
3. The installed `@earendil-works/pi-ai` Codex transport supports
   `serviceTier` in its low-level `stream()` API, but its `streamSimple()` API
   neither declares nor forwards the option. DSH uses `streamSimple()`.

## Smallest safe companion changes

The upstream packages need these changes before the plugin should enable its
selector:

1. In pi-ai, add a validated service-tier option to `SimpleStreamOptions` and
   forward it from the OpenAI and OpenAI Codex `streamSimple()` functions into
   their existing low-level `stream()` calls. Test that the serialized Responses
   payload contains `service_tier: "default"` or `"priority"`.
2. In `dsh-llm-pi-ai`, add `serviceTier` to `PiAiProviderProfile`, validate the
   allowed values, and include it in `profileOptions()`. Test profile validation
   and the options passed to `Models.streamSimple()`.
3. Once those releases are installed, have this plugin update the
   `openai-codex` provider profile through DSH's public settings mutation API and
   set `forwardingSupported: true`. Only then render the Normal/Priority selector.

This avoids patching global `fetch`, mutating frozen request objects, or copying
DSH's private adapter.
