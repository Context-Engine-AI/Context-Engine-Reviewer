import { getInput, getMultilineInput } from "@actions/core";
import { AIProviderType } from "./ai";

export class Config {
  public llmApiKey: string | undefined;
  public llmModel: string | undefined;
  public llmProvider: string;
  public githubToken: string | undefined;
  public styleGuideRules: string | undefined;
  public githubApiUrl: string;
  public githubServerUrl: string;
  public customMode: string | undefined;
  public reviewScopes: string[] | undefined; // e.g., ['security','performance','best-practices']
  public allowTitleUpdate: boolean = false; // gate PR title updates; default off
  public maxComments: number; // cap per run for inline comments
  public maxCodeblockLines: number; // cap lines inside fenced code blocks in comments
  public maxReviewChars: number; // cap total characters of diffs per LLM call
  public zaiBaseUrl: string | undefined;
  public kimiBaseUrl: string | undefined;
  public deepseekBaseUrl: string | undefined;
  public contextEngineApiKey: string | undefined;
  public contextEngineMcpUrl: string | undefined;
  public contextEngineCollection: string | undefined;
  public contextEngineTools: string[] | undefined;
  public contextEngineMaxTools: number;
  public contextEngineMaxSteps: number; // max LLM steps (tool roundtrips + final output) per review batch

  constructor() {
    this.githubToken = process.env.GITHUB_TOKEN;
    if (!this.githubToken) {
      throw new Error("GITHUB_TOKEN is not set");
    }

    this.llmModel = process.env.LLM_MODEL || getInput("llm_model");
    if (!this.llmModel?.length) {
      throw new Error("LLM_MODEL is not set");
    }

    this.llmProvider = process.env.LLM_PROVIDER || getInput("llm_provider");
    if (!this.llmProvider?.length) {
      this.llmProvider = AIProviderType.AI_SDK;
      console.log(`Using default LLM_PROVIDER '${this.llmProvider}'`);
    }

    const isZaiModel = /^glm-/i.test(this.llmModel || "");
    const isKimiModel = /^(kimi-|moonshot-)/i.test(this.llmModel || "");
    const isDeepSeekModel = /^deepseek-/i.test(this.llmModel || "");
    this.llmApiKey =
      process.env.LLM_API_KEY ||
      (isZaiModel ? process.env.ZAI_API_KEY : undefined) ||
      (isKimiModel ? process.env.KIMI_API_KEY : undefined) ||
      (isDeepSeekModel ? process.env.DEEPSEEK_API_KEY : undefined);
    const isBedrockWithAwsCreds = this.llmModel?.includes('qwen.') ||
                                   this.llmModel?.includes('anthropic.') ||
                                   this.llmModel?.includes('meta.') ||
                                   this.llmModel?.includes('amazon.');
    const hasAwsCredentials = !!(process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY);

    // AWS Bedrock with IAM credentials does not require an LLM API key.
    if (!this.llmApiKey && !(isBedrockWithAwsCreds && hasAwsCredentials)) {
      if (isZaiModel) throw new Error("LLM_API_KEY or ZAI_API_KEY is not set");
      if (isKimiModel) throw new Error("LLM_API_KEY or KIMI_API_KEY is not set");
      if (isDeepSeekModel) throw new Error("LLM_API_KEY or DEEPSEEK_API_KEY is not set");
      throw new Error("LLM_API_KEY is not set");
    }

    // GitHub Enterprise Server support
    this.githubApiUrl =
      process.env.GITHUB_API_URL || getInput('github_api_url') || 'https://api.github.com';
    this.githubServerUrl =
      process.env.GITHUB_SERVER_URL || getInput('github_server_url') || 'https://github.com';

    this.zaiBaseUrl = process.env.ZAI_BASE_URL || getInput('zai_base_url') || undefined;
    this.kimiBaseUrl = process.env.KIMI_BASE_URL || getInput('kimi_base_url') || undefined;
    this.deepseekBaseUrl = process.env.DEEPSEEK_BASE_URL || getInput('deepseek_base_url') || undefined;

    this.contextEngineApiKey =
      process.env.CONTEXT_ENGINE_API_KEY ||
      process.env.CTXCE_API_KEY ||
      getInput('context_engine_api_key') ||
      undefined;
    this.contextEngineMcpUrl =
      process.env.CONTEXT_ENGINE_MCP_URL ||
      process.env.CTXCE_INDEXER_URL ||
      getInput('context_engine_mcp_url') ||
      'https://dev.context-engine.ai/indexer/mcp';
    this.contextEngineCollection =
      process.env.CONTEXT_ENGINE_COLLECTION || getInput('context_engine_collection') || undefined;
    const ceToolsRaw = process.env.CONTEXT_ENGINE_TOOLS || getInput('context_engine_tools') || '';
    this.contextEngineTools = ceToolsRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const ceMaxToolsRaw = process.env.CONTEXT_ENGINE_MAX_TOOLS || getInput('context_engine_max_tools');
    const parsedCeMaxTools = ceMaxToolsRaw && parseInt(ceMaxToolsRaw, 10);
    this.contextEngineMaxTools = Number.isFinite(parsedCeMaxTools as any) && (parsedCeMaxTools as any)! > 0 ? (parsedCeMaxTools as any) : 10;

    const ceMaxStepsRaw = process.env.CONTEXT_ENGINE_MAX_STEPS || getInput('context_engine_max_steps');
    const parsedCeMaxSteps = ceMaxStepsRaw && parseInt(ceMaxStepsRaw, 10);
    this.contextEngineMaxSteps = Number.isFinite(parsedCeMaxSteps as any) && (parsedCeMaxSteps as any)! > 0 ? (parsedCeMaxSteps as any) : 8;

    // Custom review mode: 'on' | 'off' | 'auto' (default)
    this.customMode = (
      process.env.CUSTOM_MODE || getInput('custom_mode') || 'auto'
    ).toLowerCase();

    // Review scopes: comma-separated list; default to comprehensive review areas
    const scopesRaw = process.env.REVIEW_SCOPES || getInput('review_scopes') || 'security,performance,best-practices';
    this.reviewScopes = scopesRaw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter((s) => !!s);

    // Gate PR title updates (disabled by default per requirements)
    const allowTitle = process.env.ALLOW_TITLE_UPDATE || getInput('allow_title_update') || 'false';
    this.allowTitleUpdate = String(allowTitle).toLowerCase() === 'true';

    // Reviewer caps (configurable)
    const maxCommentsEnv = process.env.REVIEW_MAX_COMMENTS || getInput('max_comments');
    const parsedMax = maxCommentsEnv && parseInt(maxCommentsEnv, 10);
    this.maxComments = Number.isFinite(parsedMax as any) && (parsedMax as any)! > 0 ? (parsedMax as any) : 40;

    const maxCodeblockLinesEnv = process.env.REVIEW_MAX_CODEBLOCK_LINES || getInput('max_codeblock_lines');
    const parsedMaxCode = maxCodeblockLinesEnv && parseInt(maxCodeblockLinesEnv, 10);
    this.maxCodeblockLines = Number.isFinite(parsedMaxCode as any) && (parsedMaxCode as any)! > 0 ? (parsedMaxCode as any) : 60;

    const maxReviewCharsEnv = process.env.REVIEW_MAX_REVIEW_CHARS || getInput('max_review_chars');
    const parsedMaxReviewChars = maxReviewCharsEnv && parseInt(maxReviewCharsEnv, 10);
    this.maxReviewChars = Number.isFinite(parsedMaxReviewChars as any) && (parsedMaxReviewChars as any)! > 0 ? (parsedMaxReviewChars as any) : 725000;

    if (!process.env.DEBUG) {
      return;
    }
    console.log("[debug] loading extra inputs from .env");

    this.styleGuideRules = process.env.STYLE_GUIDE_RULES;
  }

  public loadInputs() {
    if (process.env.DEBUG) {
      console.log("[debug] skip loading inputs");
      return;
    }

    // Custom style guide rules
    try {
      const styleGuideRules = getMultilineInput("style_guide_rules") || [];
      if (
        Array.isArray(styleGuideRules) &&
        styleGuideRules.length &&
        styleGuideRules[0].trim().length
      ) {
        this.styleGuideRules = styleGuideRules.join("\n");
      }
    } catch (e) {
      console.error("Error loading style guide rules:", e);
    }
  }
}

// For testing, we'll modify how the config instance is created
// This prevents the automatic loading when the module is imported
let configInstance: Config | null = null;

// If not in test environment, create and configure the instance
if (process.env.NODE_ENV !== "test") {
  configInstance = new Config();
  configInstance.loadInputs();
}

// Export the instance or a function to create one for tests
export default process.env.NODE_ENV === "test"
  ? {
      // Default values for tests
      githubToken: "mock-token",
      llmApiKey: "mock-api-key",
      llmModel: "mock-model",
      llmProvider: "mock-provider",
      styleGuideRules: "",
      githubApiUrl: "https://api.github.com",
      githubServerUrl: "https://github.com",
      customMode: "off",
      reviewScopes: ["security","performance","best-practices"],
      allowTitleUpdate: false,
      zaiBaseUrl: undefined,
      kimiBaseUrl: undefined,
      deepseekBaseUrl: undefined,
      contextEngineApiKey: undefined,
      contextEngineMcpUrl: 'https://dev.context-engine.ai/indexer/mcp',
      contextEngineCollection: undefined,
      contextEngineTools: [],
      contextEngineMaxTools: 10,
      contextEngineMaxSteps: 8,
      loadInputs: () => undefined,
    }
  : configInstance!;
