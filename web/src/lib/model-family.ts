/** Built-in family chips for route browsing. Keep in sync with op.InferModelFamily spirit. */
export type ModelFamilyId =
    | 'all'
    | 'claude'
    | 'openai'
    | 'deepseek'
    | 'google'
    | 'qwen'
    | 'zhipu'
    | 'moonshot'
    | 'minimax'
    | 'mistral'
    | 'meta'
    | 'xai'
    | 'other';

export const MODEL_FAMILY_OPTIONS: { id: ModelFamilyId; label: string }[] = [
    { id: 'all', label: '全部' },
    { id: 'claude', label: 'Claude' },
    { id: 'openai', label: 'OpenAI' },
    { id: 'deepseek', label: 'DeepSeek' },
    { id: 'google', label: 'Google' },
    { id: 'qwen', label: 'Qwen' },
    { id: 'zhipu', label: '智谱' },
    { id: 'moonshot', label: 'Kimi' },
    { id: 'minimax', label: 'MiniMax' },
    { id: 'mistral', label: 'Mistral' },
    { id: 'meta', label: 'Meta' },
    { id: 'xai', label: 'xAI' },
    { id: 'other', label: '其他' },
];

export function inferModelFamily(name: string): Exclude<ModelFamilyId, 'all'> {
    const s = (name || '').toLowerCase().trim();
    if (!s) return 'other';
    if (s.includes('claude')) return 'claude';
    if (s.includes('gpt') || s.includes('o1') || s.includes('o3') || s.includes('o4') || s.startsWith('chatgpt')) return 'openai';
    if (s.includes('deepseek')) return 'deepseek';
    if (s.includes('gemini') || s.includes('gemma')) return 'google';
    if (s.includes('qwen') || s.includes('qwq')) return 'qwen';
    if (s.includes('glm') || s.includes('chatglm')) return 'zhipu';
    if (s.includes('moonshot') || s.includes('kimi')) return 'moonshot';
    if (s.includes('minimax') || s.includes('abab')) return 'minimax';
    if (s.includes('mistral') || s.includes('mixtral') || s.includes('codestral')) return 'mistral';
    if (s.includes('llama') || s.includes('meta-llama')) return 'meta';
    if (s.includes('grok')) return 'xai';
    return 'other';
}
