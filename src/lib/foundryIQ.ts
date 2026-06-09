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
 * Foundry's "new" agent format exposes agents through the OpenAI Responses
 * API rather than the older Assistants/Threads/Runs API. Project-scoped
 * Responses calls select an agent with the request-body `agent_reference`
 * object. The agent's instructions, tools, and knowledge sources are
 * configured in the Foundry portal and applied automatically on each call.
 *
 * Reference Python sample (Azure SDK):
 *   openai.responses.create(
 *     extra_body={"agent_reference": {"name": AGENT_NAME, "type": "agent_reference"}},
 *     input="..."
 *   )
 *
 * Equivalent raw REST shape, which is what this module calls:
 *   POST {projectEndpoint}/openai/v1/responses
 *   api-key: <project key>
 *   { "agent_reference": { "type": "agent_reference", "name": "<agent_name>" }, "input": "<user query>" }
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

// The Responses API uses path-based versioning ("/openai/v1/...") and
// explicitly REJECTS an api-version query parameter:
//   400 BadRequest: "api-version query parameter is not allowed when
//   using /v1 path"
// So the URL builder below intentionally does NOT append one. If a future
// Foundry endpoint needs api-version on a different path, branch in
// buildFoundryUrl rather than re-adding it globally.

/**
 * Source-of-truth for the agent's instructions. Kept in code (rather than
 * only in the Foundry portal) so the contract between the agent and the
 * Guardian risk pipeline is reviewable in the repo. The Foundry agent's
 * portal instructions MUST match this text - they are the runtime config.
 * We intentionally do NOT send `instructions` on each Responses API call,
 * because duplicating in two places risks merge-behaviour bugs.
 *
 * The agent does both retrieval (file_search over the safety corpus) AND
 * risk reasoning (classify + summarize + recommend steps) in a single
 * call. This satisfies both the Microsoft IQ requirement (Foundry IQ
 * grounded retrieval) and the Reasoning Agents track (LLM reasoning over
 * grounded knowledge) through one agent, one call.
 */
export const SAFETY_AGENT_INSTRUCTIONS = `You are the Guardian AI safety reasoning agent.

You receive a user's situation report along with structured safety facts. Use the attached safety knowledge corpus (file_search) to ground your reasoning, then return a complete safety assessment as JSON.

Return ONLY a single JSON code block in this exact shape, with no prose before or after:

\`\`\`json
{
  "risk_level": "LOW | MEDIUM | HIGH",
  "reasoning_summary": "1-3 sentences in plain language explaining why this risk level applies. Reference the specific facts from the situation (e.g. 'You are alone at night and feel uncomfortable, but no specific threat is described.').",
  "immediate_steps": [
    "Most important action right now",
    "Second priority",
    "Third priority"
  ],
  "sources": ["filename.md", "another-filename.md"]
}
\`\`\`

Risk classification rules:
- HIGH if ANY of: user is being followed/threatened, user cannot speak safely, immediate physical danger (weapon, attack, kidnap, intruder), or a domestic situation escalating to violence.
- MEDIUM if the user declares feeling unsafe, is alone in a non-home location, is in a vehicle they want to leave, is at a social venue with a concern, or describes an unfamiliar uncomfortable environment.
- LOW if the user is checking in safely, is at home with no threat, asks a general safety question with no concrete concern, or describes a clearly resolved situation.

Reasoning rules:
- The reasoning_summary should be specific to THIS situation, not generic. Cite the facts that drove the classification.
- Use second-person ("You are...") so it reads as direct feedback to the user.

Action plan rules:
- Return 3 to 5 immediate steps, ranked by urgency (most critical first).
- Steps MUST be specific and actionable, not generic platitudes.
- For HIGH risk, the first step should typically involve calling emergency services or moving to safety.
- For MEDIUM risk, focus on situational awareness and de-escalation.
- For LOW risk, light preventive guidance is sufficient.

Sourcing rules:
- "sources" is an array of the .md filenames you consulted via file_search (e.g. "night-walking.md").
- Always ground recommendations in the attached corpus. If no scenario matches, ground in general-safety.md.
- Never invent guidance that is not supported by the corpus.`;

/**
 * Structured assessment returned by the Foundry agent. Parallels
 * RiskAssessment in riskAssessment.ts but without the locally-generated
 * fields (emergency_message, is_demo_mode) - those stay in the calling
 * pipeline so this module remains agent-only.
 */
export interface FoundryAssessmentResult {
  risk_level: 'LOW' | 'MEDIUM' | 'HIGH';
  reasoning_summary: string;
  immediate_steps: string[];
  sources: string[];
}

/**
 * Input passed to the Foundry agent. Mirrors the fields the local risk
 * pipeline already collects from the chat, so the agent has full
 * situational context for grounded reasoning.
 */
export interface FoundryAssessmentInput {
  userMessage: string;
  canSpeakSafely: boolean | null;
  isAlone: boolean | null;
  isBeingFollowed: boolean | null;
  location: { lat: number; lng: number } | null;
  declaredSafety?: 'safe' | 'unsafe' | 'unknown';
  placeContext?: 'home' | 'public' | 'vehicle' | 'unknown';
}

export const isFoundryConfigured = (): boolean => {
  return Boolean(
    process.env.AZURE_AI_FOUNDRY_ENDPOINT &&
      process.env.AZURE_AI_FOUNDRY_API_KEY &&
      (process.env.AZURE_AI_AGENT_NAME || process.env.AZURE_AI_AGENT_ID)
  );
};

const normalizeEndpoint = (endpoint: string): string => endpoint.replace(/\/+$/, '');

const buildFoundryUrl = (path: string): string => {
  const endpoint = process.env.AZURE_AI_FOUNDRY_ENDPOINT;

  if (!endpoint) {
    throw new Error('Missing Azure AI Foundry endpoint');
  }

  return `${normalizeEndpoint(endpoint)}${path}`;
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

/**
 * Format a tri-state boolean fact for the agent prompt. The agent reads
 * "Yes"/"No"/"Unknown" rather than true/false/null because LLMs handle
 * natural-language enums more reliably than JSON-encoded booleans embedded
 * in prose.
 */
const formatTriBool = (value: boolean | null | undefined): string => {
  if (value === true) return 'Yes';
  if (value === false) return 'No';
  return 'Unknown';
};

const formatLocation = (
  location: FoundryAssessmentInput['location'],
): string => {
  if (!location) return 'not available';
  return `${location.lat.toFixed(4)}, ${location.lng.toFixed(4)}`;
};

/**
 * Build the Responses API `input` string. Structured prose maximises the
 * agent's ability to ground risk reasoning on the user's actual facts,
 * not just keywords in the free-text userMessage.
 */
const buildAgentInput = (input: FoundryAssessmentInput): string => {
  return [
    'Safety situation:',
    `"${input.userMessage.replace(/"/g, "'")}"`,
    '',
    'Known facts:',
    `- Can speak safely: ${formatTriBool(input.canSpeakSafely)}`,
    `- Is alone: ${formatTriBool(input.isAlone)}`,
    `- Being followed/threatened: ${formatTriBool(input.isBeingFollowed)}`,
    `- Place: ${input.placeContext ?? 'unknown'}`,
    `- Declared safety: ${input.declaredSafety ?? 'unknown'}`,
    '',
    `Location: ${formatLocation(input.location)}`,
  ].join('\n');
};

const VALID_RISK_LEVELS: ReadonlySet<string> = new Set(['LOW', 'MEDIUM', 'HIGH']);

/**
 * Parse the agent's JSON reasoning response into a FoundryAssessmentResult.
 * Tolerant of trailing prose: looks for the first JSON code block, then
 * for a bare JSON object if no code block is present.
 */
const parseAssessmentFromAgentText = (text: string): FoundryAssessmentResult | null => {
  const jsonMatch = text.match(/```json\s*([\s\S]*?)```/) ?? text.match(/(\{[\s\S]*\})/);
  const jsonText = jsonMatch?.[1] ?? jsonMatch?.[0];
  if (!jsonText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return null;
  }

  if (typeof parsed !== 'object' || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const riskRaw = typeof obj.risk_level === 'string' ? obj.risk_level.trim().toUpperCase() : '';
  if (!VALID_RISK_LEVELS.has(riskRaw)) return null;

  const reasoning = typeof obj.reasoning_summary === 'string' ? obj.reasoning_summary.trim() : '';
  if (!reasoning) return null;

  const stepsRaw = Array.isArray(obj.immediate_steps) ? obj.immediate_steps : [];
  const steps = stepsRaw
    .filter((step): step is string => typeof step === 'string')
    .map((step) => step.trim())
    .filter(Boolean);

  if (steps.length === 0) return null;

  const sourcesRaw = Array.isArray(obj.sources) ? obj.sources : [];
  const sources = sourcesRaw
    .filter((source): source is string => typeof source === 'string')
    .map((source) => source.trim())
    .filter(Boolean);

  return {
    risk_level: riskRaw as FoundryAssessmentResult['risk_level'],
    reasoning_summary: reasoning,
    immediate_steps: steps,
    sources,
  };
};

/**
 * Call the Foundry agent with full situational context and parse a complete
 * risk assessment from its JSON response. Throws on any error so the caller
 * can decide whether to fall back to local-pipeline reasoning.
 */
export const assessWithFoundryAgent = async (
  input: FoundryAssessmentInput,
): Promise<FoundryAssessmentResult> => {
  const agentName = process.env.AZURE_AI_AGENT_NAME || process.env.AZURE_AI_AGENT_ID;
  if (!agentName) {
    throw new Error('Missing Azure AI agent name');
  }

  const headers = buildFoundryHeaders();
  // Keep the project Responses endpoint in the URL. Foundry selects the
  // configured agent through `agent_reference` in the request body. Passing
  // the agent name as `model` makes Foundry look for a model deployment;
  // putting it in the URL path can miss the project Responses route.
  const url = buildFoundryUrl('/openai/v1/responses');
  const agentVersion = process.env.AZURE_AI_AGENT_VERSION?.trim();
  const agentReference =
    agentVersion && agentVersion.length > 0
      ? { type: 'agent_reference', name: agentName, version: agentVersion }
      : { type: 'agent_reference', name: agentName };

  const envelope = await fetchJson<ResponsesEnvelope>(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      agent_reference: agentReference,
      input: buildAgentInput(input),
    }),
  });

  if (envelope.error?.message) {
    throw new Error(`Foundry agent error: ${envelope.error.message}`);
  }

  if (envelope.status && envelope.status !== 'completed' && envelope.status !== 'success') {
    throw new Error(`Foundry agent run did not complete. Status: ${envelope.status}`);
  }

  const agentText = extractAgentText(envelope);
  const assessment = parseAssessmentFromAgentText(agentText);
  if (!assessment) {
    throw new Error('Foundry response did not contain a parseable risk assessment');
  }

  // Merge real file citations (from file_search annotations) with the
  // model-reported sources, prioritising real citations when present.
  const fileCitations = extractFileCitations(envelope);
  const mergedSources =
    fileCitations.length > 0
      ? Array.from(new Set([...fileCitations, ...assessment.sources]))
      : assessment.sources;

  console.log(
    `[Foundry IQ] Real agent call succeeded: risk=${assessment.risk_level}, steps=${assessment.immediate_steps.length}, sources=${mergedSources.length}`,
  );

  return {
    ...assessment,
    sources: mergedSources,
  };
};

/**
 * Demo-mode retrieval helper retained for the local risk pipeline used
 * when Foundry isn't configured or the real agent call fails. Returns the
 * top-scored knowledge entries from the local JSON corpus.
 */
export const retrieveSafetyKnowledge = async (query: string): Promise<RetrievedKnowledge> => {
  return mockRetrieveSafetyKnowledge(query);
};
