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

/**
 * Azure AI Foundry Agent Service - Responses API shapes.
 *
 * Foundry's "new" agent format (Microsoft Foundry, post-2024) exposes
 * agents through the OpenAI Responses API rather than the older
 * Assistants/Threads/Runs API. Agents are addressed by their human-readable
 * `agent_name` passed in the `model` field. The agent's instructions,
 * tools, and knowledge sources are configured in the Foundry portal and
 * applied automatically on each call.
 *
 * Reference Python sample (Azure SDK):
 *   project_client.get_openai_client(agent_name=...).responses.create(input=...)
 *
 * Equivalent raw REST shape, which is what this module calls:
 *   POST {projectEndpoint}/openai/v1/responses?api-version=...
 *   api-key: <project key>
 *   { "model": "<agent_name>", "input": "<user query>" }
 */
type ResponsesAnnotation = {
  type?: string;
  file_id?: string;
  filename?: string;
  text?: string;
  start_index?: number;
  end_index?: number;
  file_citation?: {
    file_id?: string;
    filename?: string;
    quote?: string;
  };
};

type ResponsesContentBlock = {
  type?: string;
  text?: string | { value?: string; annotations?: ResponsesAnnotation[] };
  annotations?: ResponsesAnnotation[];
};

type ResponsesOutputItem = {
  type?: string;
  role?: string;
  content?: ResponsesContentBlock[];
};

type ResponsesEnvelope = {
  id?: string;
  object?: string;
  model?: string;
  status?: string;
  output?: ResponsesOutputItem[];
  output_text?: string;
  error?: { message?: string; code?: string };
};

// Foundry Responses API version. If a future stable version supersedes
// this preview, bump it here only - everything else is version-agnostic.
const API_VERSION = '2024-12-01-preview';

/**
 * Source-of-truth for the agent's instructions. Kept in code (rather than
 * only in the Foundry portal) so the contract between the agent and the
 * Guardian risk pipeline is reviewable in the repo. The Foundry agent's
 * portal instructions should match this text. We intentionally do NOT
 * send `instructions` on each Responses API call - duplicating instructions
 * in two places risks unexpected merging behaviour, so we trust the portal
 * configuration as the runtime source.
 */
export const SAFETY_AGENT_INSTRUCTIONS = `You are the Guardian AI safety knowledge retrieval agent.

Use the attached safety knowledge corpus (file_search) to retrieve the most relevant safety guidance for the user's situation.

Return ONLY a single JSON code block in this exact shape, with no prose before or after:

\`\`\`json
{
  "knowledge": [
    {
      "id": "string identifier from the knowledge file footer",
      "category": "string category from the knowledge file footer",
      "title": "string title from the knowledge file",
      "content": "Numbered safety steps as a single string in the format: '1) step one. 2) step two. 3) step three.'",
      "urgencyLevel": "low | medium | high",
      "sources": ["array of source attributions cited inside the knowledge file"]
    }
  ]
}
\`\`\`

Rules:
- Include 1 to 3 of the most relevant knowledge entries, ranked by relevance.
- The "content" field MUST be a single string with numbered steps (do not return an array).
- "urgencyLevel" reflects the severity of the matched scenario.
- "sources" come from each knowledge file's own Sources section, not from the file name.
- If no scenario is a strong match, return the general-safety entry.
- Never invent guidance that is not grounded in the attached corpus.`;

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
  // Most Foundry api-keys are opaque tokens that ride in the `api-key`
  // header. Pre-fetched Entra bearer JWTs (starts with "Bearer " or is a
  // 3-segment JWT) take the Authorization header instead.
  const authHeaders: HeadersInit =
    trimmedKey.startsWith('Bearer ') || trimmedKey.split('.').length === 3
      ? { Authorization: trimmedKey.startsWith('Bearer ') ? trimmedKey : `Bearer ${trimmedKey}` }
      : { 'api-key': trimmedKey };

  return {
    'Content-Type': 'application/json',
    ...authHeaders,
  };
};

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

/**
 * Walk a Responses API envelope and concatenate the assistant's text. Uses
 * the SDK convenience `output_text` field when present; otherwise extracts
 * text content blocks from `output[]`.
 */
const extractAgentText = (envelope: ResponsesEnvelope): string => {
  if (typeof envelope.output_text === 'string' && envelope.output_text.length > 0) {
    return envelope.output_text;
  }

  if (!envelope.output) return '';

  return envelope.output
    .filter((item) => item.role === 'assistant' || item.type === 'message' || item.type === undefined)
    .flatMap((item) => item.content ?? [])
    .map((block) => {
      if (typeof block.text === 'string') return block.text;
      return block.text?.value ?? '';
    })
    .filter(Boolean)
    .join('\n')
    .trim();
};

/**
 * Walk every annotation in the response and pull out the real file
 * citations from file_search. The Responses API has used a few annotation
 * shapes over its preview history, so we tolerate all of them:
 *   { type: 'file_citation', filename: 'night-walking.md', file_id: '...' }
 *   { type: 'file_citation', file_citation: { filename: '...', file_id: '...' } }
 *   { type: 'file_citation', text: '...night-walking.md...' }  (legacy)
 */
const extractFileCitations = (envelope: ResponsesEnvelope): string[] => {
  if (!envelope.output) return [];

  const citations = new Set<string>();
  const annotations: ResponsesAnnotation[] = envelope.output
    .flatMap((item) => item.content ?? [])
    .flatMap((block) => {
      const blockAnnotations = block.annotations ?? [];
      const textAnnotations =
        typeof block.text === 'object' ? block.text?.annotations ?? [] : [];
      return [...blockAnnotations, ...textAnnotations];
    });

  for (const annotation of annotations) {
    if (annotation.type && annotation.type !== 'file_citation') continue;

    const filename =
      annotation.filename ??
      annotation.file_citation?.filename ??
      annotation.text?.match(/【\d+:\d+†([^】]+)】/)?.[1]?.trim();

    if (filename) {
      citations.add(filename);
      continue;
    }

    const fileId = annotation.file_id ?? annotation.file_citation?.file_id;
    if (fileId) citations.add(fileId);
  }

  return Array.from(citations);
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
  const url = buildFoundryUrl('/openai/v1/responses');

  const envelope = await fetchJson<ResponsesEnvelope>(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      // For Foundry agents, the `model` field carries the agent name. The
      // agent's portal-configured model, tools, instructions, and knowledge
      // sources are applied by Foundry on its side.
      model: agentId,
      input: `Safety situation query: ${query}`,
    }),
  });

  if (envelope.error?.message) {
    throw new Error(`Foundry agent error: ${envelope.error.message}`);
  }

  if (envelope.status && envelope.status !== 'completed' && envelope.status !== 'success') {
    throw new Error(`Foundry agent run did not complete. Status: ${envelope.status}`);
  }

  const agentText = extractAgentText(envelope);
  const knowledge = parseKnowledgeFromAgentText(agentText);

  if (knowledge.length === 0) {
    throw new Error('Foundry response did not contain usable safety knowledge');
  }

  // Prefer real file citations from the agent's file_search annotations over
  // whatever the model put in the JSON "sources" field. Falls back to the
  // model-reported sources when no annotations are present (e.g. if the
  // agent answered without using file_search).
  const fileCitations = extractFileCitations(envelope);
  const modelReportedSources = knowledge.flatMap((item) => item.sources);
  const mergedSources = fileCitations.length > 0
    ? Array.from(new Set([...fileCitations, ...modelReportedSources]))
    : Array.from(new Set(modelReportedSources));

  return {
    knowledge: knowledge.slice(0, 3),
    sources: mergedSources,
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
