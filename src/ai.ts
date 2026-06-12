import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createDeepSeek as createDeepSeekProvider } from "@ai-sdk/deepseek";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import config from "./config";
import { AISDKProvider } from "./providers/ai-sdk";

export enum AIProviderType {
  AI_SDK = "ai-sdk",
}

const ZAI_CODING_BASE_URL = "https://api.z.ai/api/coding/paas/v4/";
// Moonshot platform endpoint. The separate Kimi For Coding endpoint is not
// supported: Moonshot restricts it to an allow-list of coding agents and
// rejects third-party clients such as this reviewer.
const KIMI_PLATFORM_BASE_URL = "https://api.moonshot.ai/v1";
const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";

// Uses the openai-compatible adapter: Z.AI accepts but ignores the json_schema
// response_format, so the schema must be injected into the prompt instead.
function createZAI(options?: Record<string, unknown>) {
  const provider = createOpenAICompatible({
    ...options,
    name: "zai",
    baseURL: config.zaiBaseUrl || ZAI_CODING_BASE_URL,
  } as any);
  return (modelId: string) => provider(modelId);
}

// Uses the openai-compatible adapter: Moonshot accepts but does not enforce the
// json_schema response_format, so the schema must be injected into the prompt.
function createKimi(options?: Record<string, unknown>) {
  const provider = createOpenAICompatible({
    ...options,
    name: "kimi",
    baseURL: config.kimiBaseUrl || KIMI_PLATFORM_BASE_URL,
  } as any);
  return (modelId: string) => provider(modelId);
}

// Uses the official DeepSeek provider: DeepSeek's API rejects the json_schema
// response_format that the generic OpenAI chat adapter sends for structured output.
function createDeepSeek(options?: Record<string, unknown>) {
  const provider = createDeepSeekProvider({
    ...options,
    baseURL: config.deepseekBaseUrl || DEEPSEEK_BASE_URL,
  });
  return (modelId: string) => provider(modelId);
}

const LLM_MODELS: Record<AIProviderType, ModelConfig[]> = {
  [AIProviderType.AI_SDK]: [
    // Anthropic
    {
      name: "claude-3-5-sonnet-20240620",
      createAi: createAnthropic,
    },
    {
      name: "claude-3-5-sonnet-20241022",
      createAi: createAnthropic,
    },
    {
      name: "claude-3-7-sonnet-20250219",
      createAi: createAnthropic,
    },
    {
      name: "claude-sonnet-4-20250514",
      createAi: createAnthropic,
    },
    {
      name: "claude-opus-4-20250514",
      createAi: createAnthropic,
    },
    {
      name: "claude-opus-4-1-20250805",
      createAi: createAnthropic,
    },
    {
      name: "claude-sonnet-4-5-20250929",
      createAi: createAnthropic,
    },
    {
      name: "claude-haiku-4-5-20251001",
      createAi: createAnthropic,
    },
    {
      name: "claude-opus-4-5-20251101",
      createAi: createAnthropic,
    },
    {
      name: "claude-sonnet-4-6",
      createAi: createAnthropic,
    },
    {
      name: "claude-opus-4-6",
      createAi: createAnthropic,
    },
    {
      name: "claude-opus-4-7",
      createAi: createAnthropic,
    },
    {
      name: "claude-opus-4-8",
      createAi: createAnthropic,
    },
    {
      name: "claude-fable-5",
      createAi: createAnthropic,
    },
    // OpenAI - using responses API (default in AI SDK v5)
    {
      name: "gpt-5",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-5-mini",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-5-nano",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-5.1",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-5.2",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-5.4",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-5.4-mini",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-5.4-nano",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-5.5",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-4.1-mini",
      createAi: createOpenAI,
    },
    {
      name: "gpt-4o-mini",
      createAi: createOpenAI,
    },
    {
      name: "o1",
      createAi: createOpenAI,
    },
    {
      name: "o1-mini",
      createAi: createOpenAI,
    },
    {
      name: "o3-mini",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "o4-mini",
      createAi: createOpenAI,
      temperature: 1,
    },
    {
      name: "gpt-4.1",
      createAi: createOpenAI,
    },
    // Z.AI GLM coding endpoint, OpenAI-compatible.
    {
      name: "glm-5",
      createAi: createZAI,
      temperature: 1,
    },
    // Kimi (Moonshot AI) platform endpoint, OpenAI-compatible.
    // Kimi k2.x models reject any temperature other than 1.
    {
      name: "kimi-k2.7-code",
      createAi: createKimi,
      temperature: 1,
    },
    {
      name: "kimi-k2.6",
      createAi: createKimi,
      temperature: 1,
    },
    // DeepSeek platform endpoint, OpenAI-compatible. These aliases always
    // point at the latest generation; older versioned ids are intentionally
    // not listed.
    {
      name: "deepseek-chat",
      createAi: createDeepSeek,
    },
    {
      name: "deepseek-reasoner",
      createAi: createDeepSeek,
    },
    {
      name: "deepseek-v4-flash",
      createAi: createDeepSeek,
    },
    {
      name: "deepseek-v4-pro",
      createAi: createDeepSeek,
    },
    // Google stable models https://ai.google.dev/gemini-api/docs/models/gemini
    {
      name: "gemini-2.0-flash-001",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-2.0-flash-lite-preview-02-05",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-1.5-flash",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-1.5-flash-latest",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-1.5-flash-8b",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-1.5-pro",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-2.5-pro",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-2.5-flash",
      createAi: createGoogleGenerativeAI,
    },
    // Google experimental models https://ai.google.dev/gemini-api/docs/models/experimental-models
    {
      name: "gemini-2.5-pro-preview-05-06",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-2.5-flash-preview-04-17",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-2.0-pro-exp-02-05",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-2.0-flash-thinking-exp-01-21",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-2.5-flash-preview-05-20",
      createAi: createGoogleGenerativeAI,
    },
    {
      name: "gemini-2.5-flash-lite-preview-06-17",
      createAi: createGoogleGenerativeAI,
    },
    // AWS Bedrock models - Claude (using inference profiles for cross-region routing)
    // Claude 3.5 models
    {
      name: "us.anthropic.claude-3-5-sonnet-20240620-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-3-5-sonnet-20241022-v2:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-3-7-sonnet-20250219-v1:0",
      createAi: createAmazonBedrock,
    },
    // Claude 4 models
    {
      name: "us.anthropic.claude-sonnet-4-20250514-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "global.anthropic.claude-sonnet-4-20250514-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-sonnet-4-5-20250929-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "global.anthropic.claude-haiku-4-5-20251001-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-opus-4-5-20251101-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-sonnet-4-6",
      createAi: createAmazonBedrock,
    },
    {
      name: "global.anthropic.claude-sonnet-4-6",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-opus-4-6-v1",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-opus-4-7",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-opus-4-8",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-fable-5",
      createAi: createAmazonBedrock,
    },
    {
      name: "global.anthropic.claude-fable-5",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-opus-4-20250514-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "us.anthropic.claude-opus-4-1-20250805-v1:0",
      createAi: createAmazonBedrock,
    },
    // AWS Bedrock models - Qwen
    {
      name: "qwen.qwen3-coder-30b-a3b-v1:0",
      createAi: createAmazonBedrock,
    },
    {
      name: "qwen.qwen3-32b-v1:0",
      createAi: createAmazonBedrock,
    },
  ],
};

// Fallback for model names not in the catalog above: infer the provider from
// the model name so newly released models work without a code change.
// Bedrock ids must be checked first; they embed vendor segments like "anthropic.".
function inferModelConfig(modelName: string): ModelConfig | undefined {
  if (/(^|\.)(anthropic|qwen|meta|amazon)\./.test(modelName)) {
    return { name: modelName, createAi: createAmazonBedrock };
  }
  if (/^claude-/i.test(modelName)) {
    return { name: modelName, createAi: createAnthropic };
  }
  // Newer OpenAI reasoning models reject temperature 0; 1 is accepted everywhere.
  // o-series must be a bare "o<digits>" segment so names like "oracle-1" don't match.
  if (/^(gpt-|o[1-9]\d*(-|$))/i.test(modelName)) {
    return { name: modelName, createAi: createOpenAI, temperature: 1 };
  }
  if (/^gemini-/i.test(modelName)) {
    return { name: modelName, createAi: createGoogleGenerativeAI };
  }
  if (/^glm-/i.test(modelName)) {
    return { name: modelName, createAi: createZAI, temperature: 1 };
  }
  // Kimi k2.x models reject any temperature other than 1.
  if (/^(kimi-|moonshot-)/i.test(modelName)) {
    return { name: modelName, createAi: createKimi, temperature: 1 };
  }
  if (/^deepseek-/i.test(modelName)) {
    return { name: modelName, createAi: createDeepSeek };
  }
  return undefined;
}

export type InferenceConfig = {
  prompt: string;
  temperature?: number;
  system?: string;
  schema: z.ZodObject<any, any>;
  enableContextEngineTools?: boolean;
};

export interface AIProvider {
  runInference(params: InferenceConfig): Promise<any>;
}

class AIProviderFactory {
  static getProvider(
    provider: AIProviderType,
    modelConfig: ModelConfig
  ): AIProvider {
    switch (provider) {
      case AIProviderType["AI_SDK"]:
        if (!modelConfig.createAi) {
          throw new Error(
            `No createAi function found for model ${modelConfig.name}`
          );
        }
        return new AISDKProvider(modelConfig.createAi, modelConfig.name);
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }
}

type ModelConfig = {
  name: string;
  createAi?: any;
  temperature?: number;
};

export async function runPrompt({
  prompt,
  systemPrompt,
  schema,
  enableContextEngineTools,
}: {
  prompt: string;
  systemPrompt?: string;
  schema: z.ZodObject<any, any>;
  enableContextEngineTools?: boolean;
}) {
  if (
    !Object.values(AIProviderType).includes(
      config.llmProvider as AIProviderType
    )
  ) {
    throw new Error(
      `Unknown LLM provider: ${
        config.llmProvider
      }. Valid providers are: ${Object.keys(AIProviderType).join(", ")}`
    );
  }
  const providerType = config.llmProvider as AIProviderType;
  const providerModels = LLM_MODELS[providerType];
  const modelConfig =
    providerModels.find((m) => m.name === config.llmModel) ||
    inferModelConfig(config.llmModel || "");
  if (!modelConfig) {
    throw new Error(
      `Unknown LLM model: ${config.llmModel}. For provider ${
        config.llmProvider
      }, use a model name starting with claude-, gpt-, o<N>, gemini-, or glm-, a Bedrock model id (e.g. us.anthropic....), or one of: ${providerModels
        .map((m) => m.name)
        .join(", ")}`
    );
  }

  // Get the appropriate provider for this model
  const provider = AIProviderFactory.getProvider(providerType, modelConfig);

  // Run the inference using the provider
  return await provider.runInference({
    prompt,
    temperature: modelConfig.temperature,
    system: systemPrompt,
    schema,
    enableContextEngineTools,
  });
}
