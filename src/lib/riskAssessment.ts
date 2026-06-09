import { retrieveSafetyKnowledge, RetrievedKnowledge } from './foundryIQ';

export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export interface RiskAssessment {
  risk_level: RiskLevel;
  reasoning_summary: string;
  immediate_steps: string[];
  emergency_message: string;
  retrieved_sources: string[];
  is_demo_mode: boolean;
}

export interface AssessmentInput {
  userMessage: string;
  canSpeakSafely: boolean | null;
  isAlone: boolean | null;
  isBeingFollowed: boolean | null;
  location: { lat: number; lng: number } | null;
  activationMode?: 'typed' | 'voice';
  audioClipStatus?: string | null;
}

const HIGH_RISK_KEYWORDS = [
  'following',
  'followed',
  'stalking',
  'chasing',
  'danger',
  'help',
  'emergency',
  'scared',
  'terrified',
  'threatened',
  'attacking',
  'attacked',
  'violent',
  'weapon',
  'gun',
  'knife',
];

const MEDIUM_RISK_KEYWORDS = [
  'uncomfortable',
  'weird',
  'strange',
  'creepy',
  'nervous',
  'unsafe',
  'worried',
  'concerned',
  'alone',
  'dark',
  'isolated',
];

const classifyRisk = (input: AssessmentInput): RiskLevel => {
  let riskScore = 0;
  const messageLower = input.userMessage.toLowerCase();
  const safeAtHome =
    /\b(safe|okay|ok|fine|secure|all good)\b/.test(messageLower) &&
    /\b(home|house|apartment|room|flat)\b/.test(messageLower);
  const activeThreat = input.isBeingFollowed === true || input.canSpeakSafely === false;

  if (safeAtHome && !activeThreat) {
    return 'LOW';
  }

  if (HIGH_RISK_KEYWORDS.some((keyword) => messageLower.includes(keyword))) {
    riskScore += 3;
  }

  if (/\b(very unsafe|not safe|unsafe place)\b/.test(messageLower)) {
    riskScore += 2;
  }

  if (MEDIUM_RISK_KEYWORDS.some((keyword) => messageLower.includes(keyword))) {
    riskScore += 1;
  }

  if (input.isBeingFollowed === true) {
    riskScore += 3;
  }

  if (input.canSpeakSafely === false) {
    riskScore += 2;
  }

  if (input.isAlone === true) {
    riskScore += 1;
  }

  if (riskScore >= 4) {
    return 'HIGH';
  }

  if (riskScore >= 1) {
    return 'MEDIUM';
  }

  return 'LOW';
};

const generateReasoning = (input: AssessmentInput): string => {
  const reasons: string[] = [];
  const messageLower = input.userMessage.toLowerCase();
  const safeAtHome =
    /\b(safe|okay|ok|fine|secure|all good)\b/.test(messageLower) &&
    /\b(home|house|apartment|room|flat)\b/.test(messageLower);

  if (input.isBeingFollowed) {
    reasons.push('Someone may be following or threatening you');
  }

  if (input.canSpeakSafely === false) {
    reasons.push('It may not be safe for you to speak');
  }

  if (input.isAlone) {
    reasons.push('You are alone, so immediate support may be limited');
  }

  if (safeAtHome && input.isBeingFollowed !== true && input.canSpeakSafely !== false) {
    reasons.push('You reported being safe at home with no active threat');
  }

  const highRiskIndicators = input.userMessage
    .toLowerCase()
    .match(/(following|danger|emergency|threatened|attacking|weapon|knife|gun)/g);

  if (highRiskIndicators) {
    reasons.push(`Your message includes urgent words: ${Array.from(new Set(highRiskIndicators)).join(', ')}`);
  }

  if (reasons.length === 0) {
    return 'No immediate high-risk indicators are visible from the current context.';
  }

  return `${reasons.join('. ')}.`;
};

const extractKnowledgeSteps = (knowledge: RetrievedKnowledge): string[] => {
  const topKnowledge = knowledge.knowledge[0];

  if (!topKnowledge) {
    return [];
  }

  const numberedSteps = Array.from(topKnowledge.content.matchAll(/\d+\)\s*([^0-9]+?)(?=\s*\d+\)|$)/g));

  if (numberedSteps.length > 0) {
    return numberedSteps
      .map((match) => match[1].trim())
      .filter((step) => step.length > 10)
      .slice(0, 3);
  }

  return topKnowledge.content
    .split(/[.;]/)
    .map((step) => step.trim())
    .filter((step) => step.length > 10)
    .slice(0, 3);
};

const generateImmediateSteps = (
  input: AssessmentInput,
  riskLevel: RiskLevel,
  knowledge: RetrievedKnowledge
): string[] => {
  const steps = extractKnowledgeSteps(knowledge);

  if (input.canSpeakSafely === false) {
    steps.unshift('Use silent emergency features on your phone if available');
    steps.unshift('Move toward a public, well-lit place if you can do so safely');
  }

  if (riskLevel === 'HIGH') {
    steps.unshift('Call emergency services now if there is immediate danger');
  }

  if (input.location) {
    steps.push(
      `Your location (${input.location.lat.toFixed(4)}, ${input.location.lng.toFixed(4)}) will be shared with your alert`
    );
  }

  const defaultSteps = [
    'Contact a trusted friend or family member immediately',
    'Stay in a public, well-lit area with other people around',
    'Keep your phone charged, unlocked, and accessible',
  ];

  while (steps.length < 3) {
    steps.push(defaultSteps[steps.length % defaultSteps.length]);
  }

  return Array.from(new Set(steps)).slice(0, 5);
};

const generateEmergencyMessage = (
  input: AssessmentInput,
  riskLevel: RiskLevel
): string => {
  const locationStr = input.location
    ? `Location: https://maps.google.com/?q=${input.location.lat},${input.location.lng}`
    : 'Location: Not available';
  const activationStr =
    input.activationMode === 'voice'
      ? 'Activation: Voice wake phrase "Guardian"'
      : 'Activation: Typed Safety Mode';
  const audioClipStr =
    input.activationMode === 'voice'
      ? `Emergency clip: ${input.audioClipStatus ?? 'Voice phrase captured; alert can attach a short browser media clip'}`
      : 'Emergency clip: The app will try to attach a short video clip when the alert is sent';

  const riskIndicator = riskLevel === 'HIGH'
    ? '[URGENT] SAFETY ALERT - HIGH RISK'
    : riskLevel === 'MEDIUM'
    ? '[WARNING] SAFETY ALERT - MEDIUM RISK'
    : '[INFO] Safety Alert - Low Risk';

  const context = input.userMessage.length > 100
    ? `${input.userMessage.substring(0, 100)}...`
    : input.userMessage;

  return `${riskIndicator}

From: Guardian AI Safety Companion
Time: ${new Date().toLocaleString()}

Context: "${context}"

Status:
- Can speak safely: ${input.canSpeakSafely === null ? 'Unknown' : input.canSpeakSafely ? 'Yes' : 'No'}
- Is alone: ${input.isAlone === null ? 'Unknown' : input.isAlone ? 'Yes' : 'No'}
- Being followed/threatened: ${input.isBeingFollowed === null ? 'Unknown' : input.isBeingFollowed ? 'Yes' : 'No'}

${locationStr}
${activationStr}
${audioClipStr}
Video clip: Included when browser camera permission is allowed; otherwise audio-only fallback may be used.

This is an automated safety alert from a prototype. Please check on the sender immediately.
${riskLevel === 'HIGH' ? 'Consider contacting emergency services (911).' : ''}

Sent via Guardian AI`;
};

export const assessRisk = async (input: AssessmentInput): Promise<RiskAssessment> => {
  const knowledge = await retrieveSafetyKnowledge(input.userMessage);
  const riskLevel = classifyRisk(input);
  const reasoningSummary = generateReasoning(input);
  const immediateSteps = generateImmediateSteps(input, riskLevel, knowledge);
  const emergencyMessage = generateEmergencyMessage(input, riskLevel);

  return {
    risk_level: riskLevel,
    reasoning_summary: reasoningSummary,
    immediate_steps: immediateSteps,
    emergency_message: emergencyMessage,
    retrieved_sources: knowledge.sources,
    is_demo_mode: knowledge.isDemoMode,
  };
};
