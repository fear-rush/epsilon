# A model list's supported_endpoints is a gateway hint

## Symptom

`claude-sonnet-5-5` was fetched from commandcode and saved with the provider's
OpenAI API. Every request answered `400 … must be called via /provider/v1/messages`.
The same model with Anthropic legacy thinking answered `400 "thinking.type.enabled"
is not supported … use "thinking.type.adaptive" and "output_config.effort"`.

## Cause

commandcode's `/models` response carries `supported_endpoints`. The importer kept
only `id` and `name`, so the provider-level OpenAI shape was applied to a model that
only accepts `/messages`. The Anthropic shape was not enough either: newer Claude
models need adaptive thinking, which is model metadata, not a gateway setting.

## Fix

`import-models.ts` reads `supported_endpoints`: a `/messages`-only model gets the
Anthropic API and the base above its `/v1`; a `/responses`-only model gets the
Responses API. An exact id and API in pi's catalog also supplies `reasoning`,
`thinkingLevelMap` and `forceAdaptiveThinking`. The rest of the gateway's compat is
left alone.

## Check

`server/src/settings/import-models.test.ts` runs a loopback model list and asserts
the per-model shape and the copied Claude metadata. Against the real commandcode
list, `claude-sonnet-5-5` imports as `anthropic-messages`,
`https://api.commandcode.ai/provider`, `reasoning: true`, adaptive.
