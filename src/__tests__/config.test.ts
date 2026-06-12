import { Config } from '../config';
import * as core from '@actions/core';

// Create manual mocks for core functions
const mockGetInput = jest.fn().mockImplementation(() => '');
const mockGetMultilineInput = jest.fn().mockImplementation(() => []);

// Mock the entire module
jest.mock('@actions/core', () => ({
  getInput: (...args: any[]) => mockGetInput(...args),
  getMultilineInput: (...args: any[]) => mockGetMultilineInput(...args),
  info: jest.fn(),
  warning: jest.fn()
}));

describe('Config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockGetInput.mockImplementation(() => '');
    mockGetMultilineInput.mockImplementation(() => []);

    // Reset environment
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test('throws error when GITHUB_TOKEN is not set', () => {
    process.env.GITHUB_TOKEN = '';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'test-model';

    expect(() => new Config()).toThrow('GITHUB_TOKEN is not set');
  });

  test('throws error when LLM_API_KEY is not set', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = '';
    process.env.LLM_MODEL = 'test-model';

    expect(() => new Config()).toThrow('LLM_API_KEY is not set');
  });

  test('uses ZAI_API_KEY for Z.AI GLM models', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = '';
    process.env.ZAI_API_KEY = 'test-zai-key';
    process.env.LLM_MODEL = 'glm-5';

    const config = new Config();

    expect(config.llmApiKey).toBe('test-zai-key');
  });

  test('uses KIMI_API_KEY for Kimi models', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = '';
    process.env.KIMI_API_KEY = 'test-kimi-key';
    process.env.LLM_MODEL = 'kimi-k2.7-code';

    const config = new Config();

    expect(config.llmApiKey).toBe('test-kimi-key');
  });

  test('uses DEEPSEEK_API_KEY for DeepSeek models', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = '';
    process.env.DEEPSEEK_API_KEY = 'test-deepseek-key';
    process.env.LLM_MODEL = 'deepseek-chat';

    const config = new Config();

    expect(config.llmApiKey).toBe('test-deepseek-key');
  });

  test('throws DeepSeek-specific error when no key is set for deepseek models', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = '';
    delete process.env.DEEPSEEK_API_KEY;
    process.env.LLM_MODEL = 'deepseek-chat';

    expect(() => new Config()).toThrow('LLM_API_KEY or DEEPSEEK_API_KEY is not set');
  });

  test('throws Kimi-specific error when no key is set for kimi models', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = '';
    delete process.env.KIMI_API_KEY;
    process.env.LLM_MODEL = 'kimi-k2.7-code';

    expect(() => new Config()).toThrow('LLM_API_KEY or KIMI_API_KEY is not set');
  });

  test('throws error when LLM_MODEL is not set', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = '';

    expect(() => new Config()).toThrow('LLM_MODEL is not set');
  });

  test('loads style guide rules from action inputs', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.DEBUG = '';

    const styleGuideRules = ['Rule 1', 'Rule 2', 'Rule 3'];
    mockGetMultilineInput.mockImplementation((name) => {
      if (name === 'style_guide_rules') return styleGuideRules;
      return [];
    });

    const config = new Config();
    config.loadInputs();

    expect(config.styleGuideRules).toBe(styleGuideRules.join('\n'));
  });

  test('uses default GitHub URLs when not provided', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'test-model';

    const config = new Config();

    expect(config.githubApiUrl).toBe('https://api.github.com');
    expect(config.githubServerUrl).toBe('https://github.com');
  });

  test('loads GitHub Enterprise Server URLs from environment variables', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.GITHUB_API_URL = 'https://github.example.com/api/v3';
    process.env.GITHUB_SERVER_URL = 'https://github.example.com';

    const config = new Config();

    expect(config.githubApiUrl).toBe('https://github.example.com/api/v3');
    expect(config.githubServerUrl).toBe('https://github.example.com');
  });

  test('loads GitHub Enterprise Server URLs from action inputs', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'test-model';
    // Explicitly unset the environment variables to ensure getInput is used
    delete process.env.GITHUB_API_URL;
    delete process.env.GITHUB_SERVER_URL;

    mockGetInput.mockImplementation((name) => {
      if (name === 'github_api_url') return 'https://github.example.com/api/v3';
      if (name === 'github_server_url') return 'https://github.example.com';
      return '';
    });

    const config = new Config();

    expect(config.githubApiUrl).toBe('https://github.example.com/api/v3');
    expect(config.githubServerUrl).toBe('https://github.example.com');
  });

  test('loads optional Context Engine MCP configuration from environment', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.CONTEXT_ENGINE_API_KEY = 'ce-key';
    process.env.CONTEXT_ENGINE_MCP_URL = 'https://dev.context-engine.ai/indexer/mcp';
    process.env.CONTEXT_ENGINE_COLLECTION = 'repo-collection';
    process.env.CONTEXT_ENGINE_TOOLS = 'repo_search,batch_search';
    process.env.CONTEXT_ENGINE_MAX_TOOLS = '2';

    const config = new Config();

    expect(config.contextEngineApiKey).toBe('ce-key');
    expect(config.contextEngineMcpUrl).toBe('https://dev.context-engine.ai/indexer/mcp');
    expect(config.contextEngineCollection).toBe('repo-collection');
    expect(config.contextEngineTools).toEqual(['repo_search', 'batch_search']);
    expect(config.contextEngineMaxTools).toBe(2);
  });

  test('parses REVIEW_MAX_COMMENTS as base-10', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'test-model';
    process.env.REVIEW_MAX_COMMENTS = '40';

    const config = new Config();

    expect(config.maxComments).toBe(40);
  });

  test('defaults Context Engine max steps to 8 and accepts override', () => {
    process.env.GITHUB_TOKEN = 'test-token';
    process.env.LLM_API_KEY = 'test-api-key';
    process.env.LLM_MODEL = 'test-model';

    expect(new Config().contextEngineMaxSteps).toBe(8);

    process.env.CONTEXT_ENGINE_MAX_STEPS = '12';
    expect(new Config().contextEngineMaxSteps).toBe(12);

    process.env.CONTEXT_ENGINE_MAX_STEPS = '-3';
    expect(new Config().contextEngineMaxSteps).toBe(8);
  });

  //   test('skips loading inputs when DEBUG is set', () => {
  //     process.env.GITHUB_TOKEN = 'test-token';
  //     process.env.LLM_API_KEY = 'test-api-key';
  //     process.env.LLM_MODEL = 'test-model';
  //     process.env.DEBUG = 'true';
  //     process.env.STYLE_GUIDE_RULES = 'Debug rule';

  //     const config = new Config();
  //     config.loadInputs();

  //     expect(config.styleGuideRules).toBe('Debug rule');
  //     expect(core.getMultilineInput).not.toHaveBeenCalled();
  //   });
});
