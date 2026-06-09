import { assessRisk, RiskAssessment, RiskLevel } from './riskAssessment';

export interface ConversationState {
  userMessage: string;
  canSpeakSafely: boolean | null;
  isAlone: boolean | null;
  isBeingFollowed: boolean | null;
  location: { lat: number; lng: number } | null;
  activationMode: 'typed' | 'voice';
  audioClipStatus: string | null;
  declaredSafety: 'safe' | 'unsafe' | 'unknown';
  placeContext: 'home' | 'public' | 'vehicle' | 'unknown';
}

export interface ConversationTurnResult {
  reply: string;
  state: ConversationState;
  risk_estimate: RiskLevel;
  risk_assessment: RiskAssessment | null;
  offer_assessment: boolean;
  auto_alert_requested: boolean;
}

export const initialConversationState: ConversationState = {
  userMessage: '',
  canSpeakSafely: null,
  isAlone: null,
  isBeingFollowed: null,
  location: null,
  activationMode: 'typed',
  audioClipStatus: null,
  declaredSafety: 'unknown',
  placeContext: 'unknown',
};

const hasImmediateDangerIntent = (message: string) =>
  /\b(emergency|help|danger|attacking|attacked|threatened|threatening|weapon|knife|gun|chasing|trapped|kidnap|assault)\b/i.test(
    message
  );

const hasUnsafeIntent = (message: string) =>
  /\b(unsafe|not safe|scared|afraid|followed|following|stalked|stalking|threatened|threatening|danger|emergency|help|creepy|uncomfortable|lost|trapped|weapon|knife|gun|very unsafe)\b/i.test(
    message
  );

const isStatusQuestion = (message: string) =>
  /\b(what do you know|am i safe|safe or not|what is my risk|risk level|do you think i am safe|should i worry|status|what should i do|what do i do)\b/i.test(
    message
  );

const isActionRequest = (message: string) =>
  /\b(take measures|do something|help me|send alert|alert|action plan|assess|what should i do|what do i do|guide me)\b/i.test(
    message
  );

const isAutoAlertRequest = (message: string) =>
  /\b(very unsafe|send alert|alert my contact|alert contacts|emergency|help me|take the appropriate measures|take measures)\b/i.test(
    message
  );

const isCapabilityQuestion = (message: string) =>
  /\b(what can you do|who are you|how do you work|can you talk|can you help|what are you)\b/i.test(message);

const isGreeting = (message: string) => /\b(hi|hello|hey|yo)\b/i.test(message.trim());

const hasSafeIntent = (message: string) => {
  if (isStatusQuestion(message)) {
    return false;
  }

  if (hasUnsafeIntent(message)) {
    return false;
  }

  return /\b(i am|i'm|im|feel|feeling|now|currently)?\s*(safe|okay|ok|fine|secure|not worried|all good)\b/i.test(
    message
  );
};

const inferDeclaredSafety = (message: string): ConversationState['declaredSafety'] => {
  if (hasUnsafeIntent(message)) {
    return 'unsafe';
  }

  if (hasSafeIntent(message)) {
    return 'safe';
  }

  return 'unknown';
};

const inferPlaceContext = (message: string): ConversationState['placeContext'] => {
  if (/\b(home|house|apartment|room|flat)\b/i.test(message)) {
    return 'home';
  }

  if (/\b(car|cab|taxi|uber|bus|train|vehicle|ride|driver)\b/i.test(message)) {
    return 'vehicle';
  }

  if (/\b(street|road|outside|mall|store|station|public|market|bar|club|restaurant|school|office)\b/i.test(message)) {
    return 'public';
  }

  return 'unknown';
};

const inferKnownFacts = (
  message: string
): Partial<Pick<ConversationState, 'canSpeakSafely' | 'isAlone' | 'isBeingFollowed'>> => {
  const facts: Partial<Pick<ConversationState, 'canSpeakSafely' | 'isAlone' | 'isBeingFollowed'>> = {};

  if (/\b(not alone|with my friend|with friends|with family|with people|with someone|near people)\b/i.test(message)) {
    facts.isAlone = false;
  } else if (/\b(i am|i'm|im|me)\s+alone\b|\balone\b/i.test(message)) {
    facts.isAlone = true;
  }

  if (/\b(can't|cant|cannot|not safe to|unable to)\s+(speak|talk|call)\b|\bsilent\b/i.test(message)) {
    facts.canSpeakSafely = false;
  } else if (
    /\b(can speak|can talk|safe to speak|safe to talk|i can speak|i can talk)\b/i.test(message) ||
    hasSafeIntent(message)
  ) {
    facts.canSpeakSafely = true;
  }

  if (/\b(no one is following|nobody is following|not being followed|no threat|not threatened|not following)\b/i.test(message)) {
    facts.isBeingFollowed = false;
  } else if (/\b(following|followed|stalking|stalker|chasing|threatening|threatened|weapon|knife|gun)\b/i.test(message)) {
    facts.isBeingFollowed = true;
  } else if (hasSafeIntent(message) || /\b(home|house|apartment|room|flat)\b.*\b(safe|okay|ok|fine)\b/i.test(message)) {
    facts.isBeingFollowed = false;
  }

  return facts;
};

const mergeState = (
  current: ConversationState,
  message: string,
  activationMode: ConversationState['activationMode'] = current.activationMode
): ConversationState => {
  const declaredSafety = inferDeclaredSafety(message);
  const placeContext = inferPlaceContext(message);
  const existingMessage = current.userMessage.trim();

  return {
    ...current,
    ...inferKnownFacts(message),
    userMessage: existingMessage ? `${existingMessage}\nUpdate: ${message}` : message,
    activationMode,
    audioClipStatus:
      activationMode === 'voice'
        ? 'Wake phrase transcript captured in browser demo; production alert can attach the audio clip'
        : current.audioClipStatus,
    declaredSafety: declaredSafety === 'unknown' ? current.declaredSafety : declaredSafety,
    placeContext: placeContext === 'unknown' ? current.placeContext : placeContext,
  };
};

export const estimateConversationRisk = (state: ConversationState): RiskLevel => {
  if (state.isBeingFollowed || state.canSpeakSafely === false || hasImmediateDangerIntent(state.userMessage)) {
    return 'HIGH';
  }

  if (state.declaredSafety === 'safe') {
    return 'LOW';
  }

  if (state.declaredSafety === 'unsafe' || (state.isAlone && state.placeContext !== 'home')) {
    return 'MEDIUM';
  }

  return 'LOW';
};

const getNextSafetyQuestion = (state: ConversationState) => {
  if (state.isBeingFollowed === null) {
    return 'Is anyone following or threatening you?';
  }

  if (state.canSpeakSafely === null) {
    return 'Can you speak safely, or should we keep this silent?';
  }

  if (state.isAlone === null) {
    return 'Are you alone?';
  }

  return null;
};

const buildStatusReply = (state: ConversationState) => {
  const risk = estimateConversationRisk(state);

  if (risk === 'LOW') {
    if (state.placeContext === 'home' && state.isAlone) {
      return 'You look safe right now: LOW risk. You are alone at home and have not described an active threat, so I will stay on standby and will not alert anyone unless you ask.';
    }

    return 'You look safe right now: LOW risk. I will stay on standby and will not alert anyone unless you ask or the situation changes.';
  }

  if (risk === 'MEDIUM') {
    const question = getNextSafetyQuestion(state);

    return `I am treating this as MEDIUM risk. Move toward a safer or public place if you can, and keep your phone ready.${
      question ? ` ${question}` : ' I can prepare the alert preview now.'
    }`;
  }

  return 'This sounds HIGH risk. Get to people or a secure place if you can, use silent emergency features if speaking is unsafe, and send the alert now if you need help.';
};

const buildActionReply = (state: ConversationState) => {
  const risk = estimateConversationRisk(state);

  if (risk === 'LOW') {
    return 'You appear safe right now. Keep your phone nearby and stay aware; I do not recommend an emergency alert from what you told me.';
  }

  if (risk === 'MEDIUM') {
    return 'Take these measures now: move toward a public or better-lit place, keep your phone ready, avoid isolated areas, and share your location if safe.';
  }

  return 'Take immediate measures: get to people or a secure place, use silent emergency features if you cannot speak, call emergency services if possible, and send the alert.';
};

export const respondToSafetyMessage = async ({
  message,
  state,
  activationMode = 'typed',
}: {
  message: string;
  state?: Partial<ConversationState> | null;
  activationMode?: ConversationState['activationMode'];
}): Promise<ConversationTurnResult> => {
  const currentState: ConversationState = {
    ...initialConversationState,
    ...state,
  };
  const updatedState = mergeState(currentState, message, activationMode);
  const risk = estimateConversationRisk(updatedState);
  const shouldAssess = isActionRequest(message) || risk === 'HIGH' || /\b(very unsafe|assess now|prepare alert)\b/i.test(message);
  const riskAssessment = shouldAssess ? await assessRisk(updatedState) : null;
  const autoAlertRequested = isAutoAlertRequest(message) && risk !== 'LOW';

  if (isCapabilityQuestion(message)) {
    return {
      reply:
        'I can listen in normal language, estimate risk, prepare a safety plan, request location, capture a short emergency clip, and send a Telegram alert to your saved contact. I am still a prototype, so call emergency services directly for immediate danger.',
      state: updatedState,
      risk_estimate: risk,
      risk_assessment: riskAssessment,
      offer_assessment: risk !== 'LOW',
      auto_alert_requested: false,
    };
  }

  if (isGreeting(message) && updatedState.userMessage === message) {
    return {
      reply:
        'I am here. Tell me what is happening in your own words.',
      state: updatedState,
      risk_estimate: risk,
      risk_assessment: riskAssessment,
      offer_assessment: false,
      auto_alert_requested: false,
    };
  }

  if (isStatusQuestion(message)) {
    return {
      reply: buildStatusReply(updatedState),
      state: updatedState,
      risk_estimate: risk,
      risk_assessment: riskAssessment,
      offer_assessment: risk !== 'LOW',
      auto_alert_requested: false,
    };
  }

  if (isActionRequest(message) || hasUnsafeIntent(message)) {
    const question = !autoAlertRequested && risk !== 'LOW' ? getNextSafetyQuestion(updatedState) : null;

    return {
      reply: `${
        autoAlertRequested
          ? 'I am starting the alert now: location, emergency clip, then your saved Telegram contact. Keep moving toward people or a safer place if you can.'
          : buildActionReply(updatedState)
      }${question ? ` ${question}` : ''}`,
      state: updatedState,
      risk_estimate: risk,
      risk_assessment: riskAssessment,
      offer_assessment: risk !== 'LOW',
      auto_alert_requested: autoAlertRequested,
    };
  }

  if (hasSafeIntent(message)) {
    return {
      reply: buildStatusReply(updatedState),
      state: updatedState,
      risk_estimate: risk,
      risk_assessment: riskAssessment,
      offer_assessment: false,
      auto_alert_requested: false,
    };
  }

  return {
    reply: 'I am listening. I do not see an emergency signal yet. Tell me if you feel unsafe, cannot speak, are being followed, or want me to send an alert.',
    state: updatedState,
    risk_estimate: risk,
    risk_assessment: riskAssessment,
    offer_assessment: risk !== 'LOW',
    auto_alert_requested: false,
  };
};
