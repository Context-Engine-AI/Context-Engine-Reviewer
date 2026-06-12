import { AIProvider, InferenceConfig } from "@/ai";
import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import config from "../config";
import { info, warning } from "@actions/core";
import { generateObject, generateText, Output, stepCountIs } from "ai";
import { jsonrepair } from "jsonrepair";
import { appendContextEngineToolInstructions, createContextEngineTools, logContextEngineToolUsage } from "../context_engine_mcp";

const DEFAULT_CONTEXT_ENGINE_MAX_STEPS = 8;

// Some OpenAI-compatible endpoints default max_tokens very low (Moonshot: 1024),
// which truncates structured review output mid-JSON. Always set it explicitly.
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;

function maxOutputTokens(): number {
  const raw = Number(process.env.LLM_MAX_OUTPUT_TOKENS);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_OUTPUT_TOKENS;
}

// The review schemas use unions and optional fields that OpenAI's strict
// json_schema mode rejects (newer gpt-5.x models enforce this). Output is
// validated with zod after generation, so strict mode adds nothing here.
// Other providers ignore the openai namespace.
const PROVIDER_OPTIONS = { openai: { strictJsonSchema: false } };

function contextEngineMaxSteps(): number {
  const raw = Number((config as any).contextEngineMaxSteps);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_CONTEXT_ENGINE_MAX_STEPS;
}

function extractJsonCandidate(text: string): string | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenced?.[1]) return fenced[1].trim();

  const objectStart = trimmed.indexOf("{");
  const objectEnd = trimmed.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) {
    return trimmed.slice(objectStart, objectEnd + 1).trim();
  }

  const arrayStart = trimmed.indexOf("[");
  const arrayEnd = trimmed.lastIndexOf("]");
  if (arrayStart >= 0 && arrayEnd > arrayStart) {
    return trimmed.slice(arrayStart, arrayEnd + 1).trim();
  }

  return null;
}

function repairJsonText(text: string): string | null {
  const candidate = extractJsonCandidate(text) ?? text.trim();
  if (!candidate) return null;
  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    // Fix structural damage (missing commas, unescaped quotes, truncation)
    // that simple fence/brace extraction cannot.
    try {
      return jsonrepair(candidate);
    } catch {
      return null;
    }
  }
}

export class AISDKProvider implements AIProvider {
  private createAiFunc: any;
  private modelName: string;

  constructor(createAiFunc: any, modelName: string) {
    this.createAiFunc = createAiFunc;
    this.modelName = modelName;
  }

  async runInference({
    prompt,
    temperature,
    system,
    schema,
    enableContextEngineTools,
  }: InferenceConfig): Promise<any> {
    // Check if this is AWS Bedrock provider
    const isBedrockModel = this.modelName.includes('qwen.') ||
                           this.modelName.includes('anthropic.') ||
                           this.modelName.includes('meta.') ||
                           this.modelName.includes('amazon.');

    // Compare by reference first: the bundled dist/ is minified, which mangles
    // function names and would make the .name fallback fail in production.
    const isBedrockFactory =
      this.createAiFunc === createAmazonBedrock ||
      this.createAiFunc?.name === 'createAmazonBedrock';

    let llm;
    if (isBedrockModel && isBedrockFactory) {
      // AWS Bedrock uses different authentication
      const bedrockConfig: any = {
        region: process.env.AWS_REGION || 'us-east-1',
      };

      // Support both AWS credentials and Bedrock API keys
      if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
        bedrockConfig.accessKeyId = process.env.AWS_ACCESS_KEY_ID;
        bedrockConfig.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        if (process.env.AWS_SESSION_TOKEN) {
          bedrockConfig.sessionToken = process.env.AWS_SESSION_TOKEN;
        }
      } else if (config.llmApiKey) {
        // Bedrock API key is passed as bearer token
        // Note: The AI SDK doesn't directly support Bedrock API keys yet
        // This will use the API key as if it were an access key
        bedrockConfig.accessKeyId = config.llmApiKey;
      }

      llm = this.createAiFunc(bedrockConfig);
    } else {
      // Other providers use apiKey
      llm = this.createAiFunc({ apiKey: config.llmApiKey });
    }

    const contextEngineTools = enableContextEngineTools ? await createContextEngineTools() : undefined;
    if (contextEngineTools) {
      try {
        const { output, totalUsage } = await generateText({
          model: llm(this.modelName),
          prompt,
          temperature: temperature || 0,
          system: appendContextEngineToolInstructions(system),
          tools: contextEngineTools,
          stopWhen: stepCountIs(contextEngineMaxSteps()),
          output: Output.object({ schema }),
          providerOptions: PROVIDER_OPTIONS,
          maxOutputTokens: maxOutputTokens(),
        });

        if (process.env.DEBUG) {
          info(`usage: \n${JSON.stringify(totalUsage, null, 2)}`);
        }

        return output;
      } catch (error: unknown) {
        // Some models cannot reliably emit structured output in tool-use mode.
        // Fall through to the plain structured path (with JSON repair) so a
        // parse failure degrades to a diff-only review instead of aborting.
        if ((error as { name?: string })?.name !== "AI_NoObjectGeneratedError") {
          throw error;
        }
        warning("[context-engine] structured output failed with tools enabled; retrying without Context Engine tools");
      } finally {
        logContextEngineToolUsage();
      }
    }

    // Use structured output for all supported models (including Bedrock Qwen)
    const { object, usage } = await generateObject({
      model: llm(this.modelName),
      prompt,
      temperature: temperature || 0,
      system,
      schema,
      experimental_repairText: async ({ text }) => repairJsonText(text),
      providerOptions: PROVIDER_OPTIONS,
      maxOutputTokens: maxOutputTokens(),
    });

    if (process.env.DEBUG) {
      info(`usage: \n${JSON.stringify(usage, null, 2)}`);
    }

    return object;
  }
}
