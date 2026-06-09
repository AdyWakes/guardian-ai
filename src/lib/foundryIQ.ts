import safetyData from '../../data/safetyKnowledge.json';

export interface SafetyKnowledge {
  id: string;
  category: string;
  title: string;
  content: string;
  urgencyLevel: 'low' | 'medium' | 'high' | string;
  sources: string[];
}

export interface RetrievedKnowledge {
  knowledge: SafetyKnowledge[];
  sources: string[];
  isDemoMode: boolean;
}

interface FoundryRun {
  id?: string;
  thread_id?: string;
  status?: string;
}

type MessageContentBlock = {
  type?: string;
  text?: string | { value?: string };
};

type FoundryMessage = {
  role?: string;
  content?: string | MessageContentBlock[];
};

const API_VERSION = 'v1';
const MAX_RUN_POLLS = 8;
const POLL_INTERVAL_MS = 750;

export const isFoundryConfigured = (): boolean => {
  return Boolean(
    process.env.AZURE_AI_FOUNDRY_ENDPOINT &&
      process.env.AZURE_AI_FOUNDRY_API_KEY &&
      process.env.AZURE_AI_AGENT_ID
  );
};

const normalizeEndpoint = (endpoint: string): string => endpoint.replace(/\/+$/, '');

const buildFoundryUrl = (path: string): string => {
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;

  if (!endpoint) {
    throw new Error('Missing Azure AI Foundry endpoint');
  }

  const separator = path.includes('?') ? '&' : '?';
  return `${normalizeEndpoint(endpoint)}${path}${separator}api-version=${API_VERSION}`;
};

const buildFoundryHeaders = (): HeadersInit => {
  const apiKey = process.env.AZURE_AI_FOUNDRY_API_KEY;

  if (!apiKey) {
    throw new Error('Missing Azure AI Foundry API key');
  }

  const trimmedKey = apiKey.trim();
  const authHeaders: HeadersInit =
    trimmedKey.startsWith('Bearer ') || trimmedKey.split('.').length === 3
      ? { Authorization: trimmedKey.startsWith('Bearer ') ? trimmedKey : `Bearer ${trimmedKey}` }
      : { 'api-key': trimmedKey };

  return {
    'Content-Type': 'application/json',
    ...authHeaders,
  };
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const getKeywordsForQuery = (query: string): string[] => {
  const keywordMap: Record<string, string[]> = {
    follow: ['stalking', 'following', 'pursue'],
    stalk: ['stalking', 'following'],
    scared: ['unsafe', 'fear', 'danger'],
    afraid: ['unsafe', 'fear', 'danger'],
    unsafe: ['unsafe-location', 'unsafe', 'danger', 'safety'],
    place: ['unsafe-location', 'public', 'location'],
    danger: ['danger', 'unsafe', 'emergency'],
    alone: ['walking', 'night', 'unsafe'],
    night: ['walking', 'night'],
    dark: ['walking', 'night'],
    stranger: ['stalking', 'unsafe', 'danger'],
    weird: ['unsafe', 'danger'],
    creepy: ['unsafe', 'danger'],
    car: ['transport', 'vehicle', 'driving'],
    ride: ['transport', 'vehicle'],
    taxi: ['transport', 'vehicle'],
    uber: ['transport', 'vehicle'],
    driver: ['transport', 'vehicle'],
    home: ['home', 'domestic'],
    house: ['home', 'domestic'],
    apartment: ['home', 'domestic'],
    bar: ['social', 'bar', 'club'],
    club: ['social', 'bar', 'club'],
    party: ['social', 'bar', 'club'],
    drink: ['social', 'bar', 'club'],
    online: ['online', 'meeting', 'date'],
    date: ['online', 'meeting', 'date'],
    dating: ['online', 'meeting', 'date'],
    tinder: ['online', 'meeting', 'date'],
    partner: ['domestic', 'home'],
    boyfriend: ['domestic', 'home'],
    girlfriend: ['domestic', 'home'],
    ex: ['domestic', 'home'],
    yelling: ['domestic', 'home'],
    fighting: ['domestic', 'home'],
  };

  return Object.entries(keywordMap).flatMap(([key, values]) => (query.includes(key) ? values : []));
};

const mockRetrieveSafetyKnowledge = async (query: string): Promise<RetrievedKnowledge> => {
  const queryLower = query.toLowerCase();
  const keywords = getKeywordsForQuery(queryLower);
  const queryTerms = queryLower
    .split(/\W+/)
    .filter((term) => term.length > 3);
  const scoredKnowledge = safetyData.safetyTopics.map((topic) => {
    const topicText = `${topic.category} ${topic.title} ${topic.content}`.toLowerCase();
    const safeAtHome =
      /\b(safe|okay|ok|fine|secure|all good)\b/.test(queryLower) &&
      /\b(home|house|apartment|room|flat)\b/.test(queryLower);
    let score = 0;

    if (queryLower.includes(topic.category.toLowerCase())) {
      score += 5;
    }

    if (safeAtHome && topic.id === 'safe-home-checkin-1') {
      score += 10;
    }

    if (/\b(very unsafe|unsafe place|not safe)\b/.test(queryLower) && topic.id === 'unsafe-place-1') {
      score += 10;
    }

    if (queryLower.includes('alone') && topic.category === 'walking') {
      score += 5;
    }

    for (const keyword of keywords) {
      if (`${topic.category} ${topic.title}`.toLowerCase().includes(keyword)) {
        score += 3;
      } else if (topic.content.toLowerCase().includes(keyword)) {
        score += 1;
      }
    }

    for (const term of queryTerms) {
      if (`${topic.category} ${topic.title}`.toLowerCase().includes(term)) {
        score += 2;
      } else if (topic.content.toLowerCase().includes(term)) {
        score += 1;
      }
    }

    return { topic, score };
  });
  const relevantKnowledge = scoredKnowledge.filter(({ score }) => score > 0);

  if (relevantKnowledge.length === 0) {
    const generalInfo = safetyData.safetyTopics.find((topic) => topic.category === 'general');

    if (generalInfo) {
      relevantKnowledge.push({ topic: generalInfo, score: 1 });
    }
  }

  const urgencyOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  const sortedKnowledge = relevantKnowledge
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return (urgencyOrder[a.topic.urgencyLevel] ?? 3) - (urgencyOrder[b.topic.urgencyLevel] ?? 3);
    })
    .map(({ topic }) => topic)
    .slice(0, 3);

  return {
    knowledge: sortedKnowledge,
    sources: Array.from(new Set(sortedKnowledge.flatMap((item) => item.sources))),
    isDemoMode: true,
  };
};

const extractTextFromMessage = (message: FoundryMessage): string => {
  if (typeof message.content === 'string') {
    return message.content;
  }

  if (!Array.isArray(message.content)) {
    return '';
  }

  return message.content
    .map((block) => {
      if (typeof block.text === 'string') {
        return block.text;
      }

      return block.text?.value ?? '';
    })
    .filter(Boolean)
    .join('\n');
};

const normalizeKnowledge = (item: Partial<SafetyKnowledge>, index: number): SafetyKnowledge | null => {
  if (!item.content && !item.title) {
    return null;
  }

  return {
    id: item.id ?? `foundry-${index + 1}`,
    category: item.category ?? 'foundry-iq',
    title: item.title ?? 'Foundry IQ safety guidance',
    content: item.content ?? '',
    urgencyLevel: item.urgencyLevel ?? 'medium',
    sources: Array.isArray(item.sources) && item.sources.length > 0 ? item.sources : ['Azure AI Foundry Agent Service'],
  };
};

const parseKnowledgeFromAgentText = (text: string): SafetyKnowledge[] => {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
  const jsonText = jsonMatch?.[1] ?? jsonMatch?.[0];

  if (jsonText) {
    try {
      const parsed = JSON.parse(jsonText);
      const items = Array.isArray(parsed) ? parsed : parsed.knowledge ?? parsed.results ?? [];

      if (Array.isArray(items)) {
        return items
          .map((item, index) => normalizeKnowledge(item, index))
          .filter((item): item is SafetyKnowledge => Boolean(item));
      }
    } catch {
      // Fall through and wrap the text below.
    }
  }

  if (!text.trim()) {
    return [];
  }

  return [
    {
      id: 'foundry-agent-summary',
      category: 'foundry-iq',
      title: 'Foundry IQ safety guidance',
      content: text.trim(),
      urgencyLevel: 'medium',
      sources: ['Azure AI Foundry Agent Service'],
    },
  ];
};

const fetchJson = async <T>(url: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(url, init);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Foundry API error ${response.status}: ${errorText || response.statusText}`);
  }

  return response.json() as Promise<T>;
};

const realRetrieveSafetyKnowledge = async (query: string): Promise<RetrievedKnowledge> => {
  const agentId = process.env.AZURE_AI_AGENT_ID;

  if (!agentId) {
    throw new Error('Missing Azure AI agent id');
  }

  const headers = buildFoundryHeaders();
  const run = await fetchJson<FoundryRun>(buildFoundryUrl('/threads/runs'), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      assistant_id: agentId,
      instructions:
        'Retrieve concise safety knowledge for Guardian AI. Return JSON with a knowledge array. Each item must include id, category, title, content, urgencyLevel, and sources.',
      thread: {
        messages: [
          {
            role: 'user',
            content: `Safety situation query: ${query}`,
          },
        ],
      },
    }),
  });

  if (!run.id || !run.thread_id) {
    throw new Error('Foundry run response did not include run and thread identifiers');
  }

  let currentRun = run;

  for (let attempt = 0; attempt < MAX_RUN_POLLS; attempt += 1) {
    if (currentRun.status && ['completed', 'failed', 'cancelled', 'expired', 'requires_action'].includes(currentRun.status)) {
      break;
    }

    await delay(POLL_INTERVAL_MS);
    currentRun = await fetchJson<FoundryRun>(buildFoundryUrl(`/threads/${run.thread_id}/runs/${run.id}`), {
      headers,
    });
  }

  if (currentRun.status !== 'completed') {
    throw new Error(`Foundry run did not complete. Status: ${currentRun.status ?? 'unknown'}`);
  }

  const messages = await fetchJson<{ data?: FoundryMessage[] }>(
    buildFoundryUrl(`/threads/${run.thread_id}/messages?run_id=${run.id}&order=desc&limit=10`),
    { headers }
  );
  const assistantMessage = messages.data?.find((message) => message.role === 'assistant');
  const agentText = assistantMessage ? extractTextFromMessage(assistantMessage) : '';
  const knowledge = parseKnowledgeFromAgentText(agentText);

  if (knowledge.length === 0) {
    throw new Error('Foundry response did not contain usable safety knowledge');
  }

  return {
    knowledge: knowledge.slice(0, 3),
    sources: Array.from(new Set(knowledge.flatMap((item) => item.sources))),
    isDemoMode: false,
  };
};

export const retrieveSafetyKnowledge = async (query: string): Promise<RetrievedKnowledge> => {
  if (!isFoundryConfigured()) {
    return mockRetrieveSafetyKnowledge(query);
  }

  try {
    return await realRetrieveSafetyKnowledge(query);
  } catch (error) {
    console.error('Falling back to mock Foundry IQ knowledge:', error);
    return mockRetrieveSafetyKnowledge(query);
  }
};
