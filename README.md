# Context Engine Reviewer

Context Engine Reviewer is a GitHub PR reviewer that runs as a standalone AI code reviewer and is designed for Context Engine workflows.

This repository starts from the reviewer shell we proved in the DOJ reviewer: GitHub PR plumbing, diff parsing, batching, LLM provider adapters, local dry-run CLI, inline review posting, comment upserts, and follow-up replies. Domain-specific reviewer logic has been removed so the product is useful for normal software repositories.

## What It Does

- Reviews pull requests and posts high-signal inline comments.
- Writes a compact PR overview with scope, highlights, and summary.
- Tracks reviewed commits so follow-up runs can review incrementally.
- Batches large diffs by context size instead of sending one oversized prompt.
- Supports local dry runs against real GitHub PRs.
- Supports OpenAI, Anthropic, Google, Z.AI, Kimi (Moonshot AI), DeepSeek, and AWS Bedrock through AI SDK adapters.
- Keeps the existing `custom_mode` review behavior for deeper senior-engineer analysis.

## Status

This repository currently works as a normal AI reviewer without requiring Context Engine credentials.

## GitHub Action Usage

Create `.github/workflows/context-engine-reviewer.yml`:

```yaml
name: context-engine-reviewer

permissions:
  contents: read
  pull-requests: write
  issues: write

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: Context-Engine-AI/context-engine-reviewer@v1
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          LLM_PROVIDER: ai-sdk
          LLM_MODEL: gpt-5-mini
          LLM_API_KEY: ${{ secrets.LLM_API_KEY }}
```

Add this event only if you want the reviewer to answer follow-up questions in existing review comment threads:

```yaml
on:
  pull_request_review_comment:
    types: [created]
```

For fork-heavy public repositories, review your event choice carefully. `pull_request` is safer by default. Use `pull_request_target` only when you understand the security tradeoffs and do not execute untrusted PR code.

## Configuration

Required:

- `GITHUB_TOKEN`: GitHub token with pull request comment permissions.
- `LLM_MODEL`: model name.
- `LLM_API_KEY`: model API key, unless using a provider-specific key or provider that authenticates another way.

Common optional settings:

- `LLM_PROVIDER`: `ai-sdk`. Defaults to `ai-sdk`.
- `ZAI_API_KEY`: Z.AI API key for `glm-*` models. Used when `LLM_API_KEY` is not set.
- `ZAI_BASE_URL`: Z.AI OpenAI-compatible base URL. Defaults to `https://api.z.ai/api/coding/paas/v4/`.
- `KIMI_API_KEY`: Kimi (Moonshot AI) platform API key for `kimi-*` and `moonshot-*` models. Used when `LLM_API_KEY` is not set.
- `KIMI_BASE_URL`: Kimi OpenAI-compatible base URL. Defaults to `https://api.moonshot.ai/v1`.
- `DEEPSEEK_API_KEY`: DeepSeek API key for `deepseek-*` models. Used when `LLM_API_KEY` is not set.
- `DEEPSEEK_BASE_URL`: DeepSeek OpenAI-compatible base URL. Defaults to `https://api.deepseek.com/v1`.
- `CONTEXT_ENGINE_TIMEOUT_MS`: per-request Context Engine MCP timeout in milliseconds. Defaults to `30000`.
- `LLM_MAX_OUTPUT_TOKENS`: maximum output tokens per LLM call. Defaults to `16384`. Set explicitly because some OpenAI-compatible endpoints default very low and truncate structured review output.
- `LLM_REASONING_EFFORT`: optional reasoning effort for models that support it, for example `low`, `medium`, or `high`. Maps to `reasoningEffort` for OpenAI, Z.AI, and Kimi models and to `effort` for Anthropic models. Claude Fable models only support medium effort, so the reviewer always pins them to `medium` regardless of this setting. Bedrock and Google models use numeric thinking budgets and are not affected. Only set values the chosen model supports.
- `CUSTOM_MODE`: `on`, `off`, or `auto`. Defaults to `auto`.
- `REVIEW_SCOPES`: comma-separated labels used by review configuration.
- `REVIEW_MAX_COMMENTS`: maximum inline comments per run. Defaults to `40`.
- `REVIEW_MAX_CODEBLOCK_LINES`: maximum lines retained in fenced code blocks. Defaults to `60`.
- `REVIEW_MAX_REVIEW_CHARS`: maximum diff characters per LLM review batch. Defaults to `725000`.
- `STYLE_GUIDE_RULES`: additional rules to enforce.
- `ALLOW_TITLE_UPDATE`: set to `true` to allow title rewriting when the PR title explicitly asks for it.
- `GITHUB_API_URL`: GitHub Enterprise API URL.
- `GITHUB_SERVER_URL`: GitHub Enterprise web URL.
- `CONTEXT_ENGINE_API_KEY` or `CTXCE_API_KEY`: optional Context Engine API key. When set, review prompts can call Context Engine MCP tools for repository context.
- `CONTEXT_ENGINE_MCP_URL` or `CTXCE_INDEXER_URL`: optional Context Engine MCP indexer URL. Defaults to `https://dev.context-engine.ai/indexer/mcp`.
- `CONTEXT_ENGINE_COLLECTION`: optional collection name to scope MCP searches.
- `CONTEXT_ENGINE_TOOLS`: optional comma-separated MCP tool allow-list. Defaults to `repo_search,batch_search,symbol_graph,batch_symbol_graph,graph_query,batch_graph_query,search_tests_for,search_config_for,search_commits_for,context_answer`.
- `CONTEXT_ENGINE_MAX_TOOLS`: maximum MCP tools exposed to reviewer LLMs. Defaults to `10`.
- `CONTEXT_ENGINE_MAX_STEPS`: maximum LLM steps (tool roundtrips plus the final structured output) per review batch when Context Engine tools are enabled. Defaults to `8`.

The action input names mirror the environment variables where applicable, for example `custom_mode`, `llm_model`, `llm_provider`, `github_api_url`, and `github_server_url`.

### Optional Context Engine MCP access

By default, the reviewer works from PR diffs only. This is the free/default mode and does not make Context Engine network calls.

Customers who want repository-aware review can opt in by providing a Context Engine API key. When enabled, the reviewer exposes a small allow-list of explicit Context Engine MCP tools to the LLM during review inference. If MCP setup or tool discovery fails, the reviewer logs a warning and falls back to the normal diff-only path for that run.

Reliability behavior when Context Engine is enabled:

- Each MCP request has a 30 second timeout (configurable via `CONTEXT_ENGINE_TIMEOUT_MS`), so a hung endpoint cannot stall the review job.
- A failed tool call returns a structured error to the LLM instead of aborting the review batch.
- Tool discovery runs once per review run and is reused across review batches.
- After each review batch, the reviewer logs a one-line tool usage summary (tool names, call counts, average latency) so you can see whether Context Engine context contributed to the review.
- If an allow-listed tool is not exposed by the MCP server, the reviewer logs a warning naming the missing tools.

The default SaaS MCP endpoint is:

```text
https://dev.context-engine.ai/indexer/mcp
```

The memory MCP endpoint is not used by this reviewer.

#### GitHub Action usage

You can enable Context Engine either with action inputs or environment variables. Supplying the API key is the opt-in switch; no separate boolean flag is required.

Using environment variables:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  LLM_PROVIDER: ai-sdk
  LLM_MODEL: gpt-5-mini
  LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
  CONTEXT_ENGINE_API_KEY: ${{ secrets.CONTEXT_ENGINE_API_KEY }}
  CONTEXT_ENGINE_COLLECTION: your-indexed-collection
```

Using action inputs:

```yaml
with:
  github_token: ${{ secrets.GITHUB_TOKEN }}
  llm_provider: ai-sdk
  llm_model: gpt-5-mini
  context_engine_api_key: ${{ secrets.CONTEXT_ENGINE_API_KEY }}
  context_engine_collection: your-indexed-collection
```

Optional action inputs:

- `context_engine_mcp_url`: defaults to `https://dev.context-engine.ai/indexer/mcp`.
- `context_engine_tools`: comma-separated MCP tool allow-list.
- `context_engine_max_tools`: maximum number of MCP tools exposed to the reviewer LLM. Defaults to `10`.
- `context_engine_max_steps`: maximum LLM steps per review batch when Context Engine tools are enabled. Defaults to `8`.

#### Default tool allow-list

The default allow-list intentionally exposes direct code/navigation tools only:

- `repo_search`
- `batch_search`
- `symbol_graph`
- `batch_symbol_graph`
- `graph_query`
- `batch_graph_query`
- `search_tests_for`
- `search_config_for`
- `search_commits_for`
- `context_answer`

The unified `search` router is excluded by default because it can be noisy for an autonomous reviewer. Memory tools are also excluded by default and the reviewer does not connect to the memory MCP endpoint. `search_commits_for` is included so the reviewer can inspect relevant commit history or historically co-changing files when that materially improves review quality. `context_answer` is included so the reviewer can ask conceptual questions about how the codebase works (for example, how auth is enforced) when raw search results are not enough.

You can override the allow-list if needed:

```yaml
env:
  CONTEXT_ENGINE_TOOLS: repo_search,batch_search,symbol_graph,search_tests_for
```

#### Review batching behavior

Context Engine tools are available only during PR review prompts, not during the PR summary prompt. The reviewer still uses the normal PR diff batching strategy:

1. Split changed files into review batches using `REVIEW_MAX_REVIEW_CHARS`.
2. Invoke the review prompt once per batch.
3. Expose Context Engine tools independently inside each batch inference.

This avoids prefetching repository context for the whole PR and keeps tool calls scoped to the batch being reviewed.

#### Local dry-run debugging

For local dry-run debugging, set the same variables in `.env` or pass them directly to the CLI. The dry-run path still uses the normal PR diff batching loop, so Context Engine tools are available independently to each review batch instead of prefetching repository context for the whole PR.

```bash
npm run review -- --pr 123 --dry-run \
  --context-engine-api-key "$CONTEXT_ENGINE_API_KEY" \
  --context-engine-collection your-indexed-collection
```

Optional dry-run flags:

- `--context-engine-mcp-url` / `--ce-url`
- `--context-engine-tools` / `--ce-tools`
- `--context-engine-max-tools` / `--ce-max-tools`
- `--context-engine-max-steps` / `--ce-max-steps`

## Providers

The reviewer uses the AI SDK provider surface. Direct API providers use `LLM_API_KEY`, Z.AI can use `ZAI_API_KEY`, and AWS Bedrock can use AWS credentials instead.

Model names not in the built-in catalog are routed by prefix, so newly released models work without a reviewer update: `claude-*` to Anthropic, `gpt-*` and `o<N>*` to OpenAI, `gemini-*` to Google, `glm-*` to Z.AI, `kimi-*`/`moonshot-*` to Kimi (Moonshot AI), `deepseek-*` to DeepSeek, and Bedrock model ids (for example `us.anthropic....`) to AWS Bedrock.

OpenAI:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  LLM_PROVIDER: ai-sdk
  LLM_MODEL: gpt-5-mini
  LLM_API_KEY: ${{ secrets.OPENAI_API_KEY }}
```

Anthropic (Claude 4.x and Fable 5 model ids are supported, for example `claude-sonnet-4-6`, `claude-haiku-4-5-20251001`, `claude-opus-4-8`, or `claude-fable-5`):

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  LLM_PROVIDER: ai-sdk
  LLM_MODEL: claude-sonnet-4-6
  LLM_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
```

Google:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  LLM_PROVIDER: ai-sdk
  LLM_MODEL: gemini-2.0-flash-001
  LLM_API_KEY: ${{ secrets.GOOGLE_GENERATIVE_AI_API_KEY }}
```

Z.AI GLM coding endpoint:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  LLM_PROVIDER: ai-sdk
  LLM_MODEL: glm-5
  ZAI_API_KEY: ${{ secrets.ZAI_API_KEY }}
```

`ZAI_BASE_URL` defaults to the Z.AI coding endpoint, `https://api.z.ai/api/coding/paas/v4/`. Override it only when you intentionally want a different Z.AI OpenAI-compatible endpoint.

Kimi (Moonshot AI):

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  LLM_PROVIDER: ai-sdk
  LLM_MODEL: kimi-k2.7-code
  KIMI_API_KEY: ${{ secrets.KIMI_API_KEY }}
```

`KIMI_BASE_URL` defaults to the Moonshot platform endpoint, `https://api.moonshot.ai/v1`. Use a platform API key; Kimi For Coding plan keys are not supported because Moonshot restricts that endpoint to an allow-list of coding agents and rejects third-party clients such as this reviewer. Both `kimi-*` and `moonshot-*` model ids route through this provider.

DeepSeek:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  LLM_PROVIDER: ai-sdk
  LLM_MODEL: deepseek-chat
  DEEPSEEK_API_KEY: ${{ secrets.DEEPSEEK_API_KEY }}
```

`DEEPSEEK_BASE_URL` defaults to `https://api.deepseek.com/v1`. The catalog lists the `deepseek-chat` and `deepseek-reasoner` aliases, which always point at the latest model generation, plus the current `deepseek-v4-flash` and `deepseek-v4-pro` ids; other explicit `deepseek-*` ids also route through this provider.

AWS Bedrock:

```yaml
env:
  GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
  LLM_PROVIDER: ai-sdk
  LLM_MODEL: us.anthropic.claude-sonnet-4-5-20250929-v1:0
  AWS_ACCESS_KEY_ID: ${{ secrets.AWS_ACCESS_KEY_ID }}
  AWS_SECRET_ACCESS_KEY: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
  AWS_REGION: us-east-1
```

Bedrock model IDs use inference profiles where required, for example `us.anthropic.claude-sonnet-4-5-20250929-v1:0`. Make sure model access is enabled in the Bedrock console for the AWS account and region you use.

## Local Dry Run

Prerequisites:

- Node.js 20+
- GitHub CLI authenticated with `gh auth login`
- `.env` with model credentials

Build:

```bash
npm ci
npm run build
```

List pull requests:

```bash
npm run review -- --list-prs --owner <owner> --repo <repo> --state open --limit 5
```

Dry-run a review:

```bash
npm run review -- --pr 123 --owner <owner> --repo <repo> --dry-run --full --out
```

Dry-run mode prints the overview and inline comments instead of writing to GitHub. With `--out`, output is saved under `dry/` unless you provide a path.

Example `.env` for direct API access:

```bash
GITHUB_TOKEN=
LLM_PROVIDER=ai-sdk
LLM_MODEL=gpt-5-mini
LLM_API_KEY=
```

Example `.env` for Z.AI:

```bash
GITHUB_TOKEN=
LLM_PROVIDER=ai-sdk
LLM_MODEL=glm-5
ZAI_API_KEY=
```

Example `.env` for Bedrock:

```bash
GITHUB_TOKEN=
LLM_PROVIDER=ai-sdk
LLM_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
```

## Review Behavior

The reviewer prioritizes bugs, security issues, behavior changes, API contract risks, missing tests, migration risks, and performance problems. It avoids posting low-confidence comments and caps comment volume with `REVIEW_MAX_COMMENTS`.

`custom_mode` keeps the enhanced senior-engineer review path:

- `auto`: enable deeper review for complex code, backend, infra, and configuration changes.
- `on`: always use enhanced review.
- `off`: use the standard review prompt.

Review scopes default to `security,performance,best-practices` and can be changed with `REVIEW_SCOPES`.

## Batching

Large PRs are split into review batches by estimated diff size. This preserves useful context without exceeding model limits, then combines comments from each batch into a single GitHub review. Tune `REVIEW_MAX_REVIEW_CHARS` lower for smaller-context models or higher for models with larger context windows.

## Review Controls

The reviewer recognizes these PR body phrases:

- `@context-engine-reviewer ignore`
- `@context-engine-reviewer skip`
- `@ce-reviewer ignore`
- `@ce-reviewer skip`

New documentation should use the Context Engine Reviewer names.

If `ALLOW_TITLE_UPDATE=true`, the reviewer can update a PR title when the title explicitly mentions `@context-engine-reviewer` or `@ce-reviewer`.

## GitHub Enterprise

Use these settings for GitHub Enterprise Server:

```yaml
env:
  GITHUB_API_URL: https://github.example.com/api/v3
  GITHUB_SERVER_URL: https://github.example.com
```

## Development

```bash
npm ci
npm test
npm run build
npx tsc --noEmit
```

The built GitHub Action entrypoints are emitted into `dist/`.

## License

AGPL-3.0. See [LICENSE](LICENSE).
