export type AiProviderType = 'auto' | 'chrome-nano' | 'local-openai';

export interface AiConfig {
  provider: AiProviderType;
  localEndpoint: string;
  localModel: string;
  localApiKey?: string;
}

export const DEFAULT_AI_CONFIG: AiConfig = {
  provider: 'auto',
  localEndpoint: 'http://localhost:11434/v1',
  localModel: 'llama3.2',
  localApiKey: '',
};

export const COMMON_LOCAL_PRESETS = [
  {
    name: 'Ollama',
    endpoint: 'http://localhost:11434/v1',
    defaultModel: 'llama3.2',
    hint: 'Default Ollama endpoint at port 11434',
  },
  {
    name: 'LM Studio',
    endpoint: 'http://localhost:1234/v1',
    defaultModel: 'local-model',
    hint: 'Default LM Studio local server at port 1234',
  },
  {
    name: 'OMLX',
    endpoint: 'http://localhost:8000/v1',
    defaultModel: 'default',
    hint: 'Default OMLX server at port 8000',
  },
  {
    name: 'llama.cpp',
    endpoint: 'http://localhost:8080/v1',
    defaultModel: 'default',
    hint: 'Default llama.cpp server at port 8080',
  },
] as const;

export interface AiProvider {
  readonly id: 'chrome-nano' | 'local-openai';
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generateJson<T>(systemPrompt: string, userPrompt: string, schema?: object): Promise<T>;
}
