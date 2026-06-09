import { assessRisk, RiskAssessment, RiskLevel } from './riskAssessment';

export type SafetyQuestionKey = 'isBeingFollowed' | 'canSpeakSafely' | 'isAlone';

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
  /**
   * The safety follow-up question Guardian asked on the previous turn, if
   * any. A bare "yes"/"no" reply from the user is then routed to this field
   * so the chat actually progresses instead of asking the same question
   * again. Cleared after the answer is applied.
   */
  lastQuestion: SafetyQuestionKey | null;
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
  lastQuestion: null,
};

const YES_PATTERN = /^(yes|yeah|yep|yup|y|true|correct|affirmative|sure|right|absolutely|definitely)[\s.!?]*$/i;
const NO_PATTERN = /^(no|nope|nah|n|false|not really|negative|never|nay)[\s.!?]*$/i;

const isYesNoAnswer = (message: string): boolean | null => {
  const trimmed = message.trim();
  if (YES_PATTERN.test(trimmed)) return true;
  if (NO_PATTERN.test(trimmed)) return false;
  return null;
};

/**
 * If the user replied with a bare yes/no and we previously asked a specific
 * safety question, route the answer to that field. Returns the patched
 * state (or the input unchanged if there is no pending question to answer).
 */
const applyYesNoToLastQuestion = (
  state: ConversationState,
  message: string,
): ConversationState => {
  if (!state.lastQuestion) return state;
  const answer = isYesNoAnswer(message);
  if (answer === null) return state;

  return {
    ...state,
    [state.lastQuestion]: answer,
    lastQuestion: null,
  };
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

interface NextQuestion {
  key: SafetyQuestionKey;
  text: string;
}

const getNextSafetyQuestion = (state: ConversationState): NextQuestion | null => {
  if (state.isBeingFollowed === null) {
    return {
      key: 'isBeingFollowed',
      text: 'Is anyone following or threatening you right now?',
    };
  }

  if (state.canSpeakSafely === null) {
    return {
      key: 'canSpeakSafely',
      text: 'Are you able to speak out loud safely right now?',
    };
  }

  if (state.isAlone === null) {
    return {
      key: 'isAlone',
      text: 'Are you alone right now?',
    };
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
      question ? ` ${question.text}` : ' I can prepare the alert preview now.'
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

/**
 * Build a result with bookkeeping for the next turn: if `nextQuestion` is
 * provided, store its key on `lastQuestion` so a bare yes/no on the next
 * turn lands on the right field.
 */
const buildResult = ({
  reply,
  state,
  risk,
  riskAssessment,
  offerAssessment,
  autoAlertRequested,
  nextQuestion,
}: {
  reply: string;
  state: ConversationState;
  risk: RiskLevel;
  riskAssessment: RiskAssessment | null;
  offerAssessment: boolean;
  autoAlertRequested: boolean;
  nextQuestion?: NextQuestion | null;
}): ConversationTurnResult => ({
  reply,
  state: { ...state, lastQuestion: nextQuestion?.key ?? null },
  risk_estimate: risk,
  risk_assessment: riskAssessment,
  offer_assessment: offerAssessment,
  auto_alert_requested: autoAlertRequested,
});

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

  // If the user replied "yes"/"no" to the question we asked on the previous
  // turn, route the answer to the right state field before the regular
  // merge runs. Without this, a bare "no" falls through every branch and
  // the bot loops on the same question.
  const stateAfterYesNo = applyYesNoToLastQuestion(currentState, message);
  const yesNoApplied = stateAfterYesNo !== currentState;
  const lastQuestionKey = currentState.lastQuestion;

  const updatedState = mergeState(stateAfterYesNo, message, activationMode);
  const risk = estimateConversationRisk(updatedState);
  const shouldAssess = isActionRequest(message) || risk === 'HIGH' || /\b(very unsafe|assess now|prepare alert)\b/i.test(message);
  const riskAssessment = shouldAssess ? await assessRisk(updatedState) : null;
  const autoAlertRequested = isAutoAlertRequest(message) && risk !== 'LOW';

  // If a yes/no was just applied to a follow-up question, acknowledge the
  // answer and either ask the next question or move to the status reply.
  if (yesNoApplied && lastQuestionKey) {
    const nextQuestion = getNextSafetyQuestion(updatedState);
    const acknowledgement = (() => {
      const answerWasYes = updatedState[lastQuestionKey] === true;
      switch (lastQuestionKey) {
        case 'isBeingFollowed':
          return answerWasYes
            ? 'Understood — someone is following or threatening you. Treating this as urgent.'
            : 'Good — no one is following or threatening you right now.';
        case 'canSpeakSafely':
          return answerWasYes
            ? 'Good — you can speak safely.'
            : 'Understood — keep things silent. I will avoid suggesting you talk out loud.';
        case 'isAlone':
          return answerWasYes
            ? 'Understood — you are alone.'
            : 'Good — you have other people nearby.';
        default:
          return 'Got it.';
      }
    })();

    const followUp = nextQuestion
      ? ` ${nextQuestion.text}`
      : risk === 'LOW'
        ? ' From what you have told me, this looks LOW risk. I will stay on standby.'
        : ' I have enough to prepare a risk assessment now.';

    return buildResult({
      reply: `${acknowledgement}${followUp}`,
      state: updatedState,
      risk,
      riskAssessment,
      offerAssessment: risk !== 'LOW',
      autoAlertRequested: false,
      nextQuestion,
    });
  }

  if (isCapabilityQuestion(message)) {
    return buildResult({
      reply:
        'I can listen in normal language, estimate risk, prepare a safety plan, request location, capture a short emergency clip, and send a Telegram alert to your saved contact. I am still a prototype, so call emergency services directly for immediate danger.',
      state: updatedState,
      risk,
      riskAssessment,
      offerAssessment: risk !== 'LOW',
      autoAlertRequested: false,
    });
  }

  if (isGreeting(message) && updatedState.userMessage === message) {
    return buildResult({
      reply: 'I am here. Tell me what is happening in your own words.',
      state: updatedState,
      risk,
      riskAssessment,
      offerAssessment: false,
      autoAlertRequested: false,
    });
  }

  if (isStatusQuestion(message)) {
    return buildResult({
      reply: buildStatusReply(updatedState),
      state: updatedState,
      risk,
      riskAssessment,
      offerAssessment: risk !== 'LOW',
      autoAlertRequested: false,
    });
  }

  if (isActionRequest(message) || hasUnsafeIntent(message)) {
    const nextQuestion = !autoAlertRequested && risk !== 'LOW' ? getNextSafetyQuestion(updatedState) : null;

    return buildResult({
      reply: `${
        autoAlertRequested
          ? 'I am starting the alert now: location, emergency clip, then your saved Telegram contact. Keep moving toward people or a safer place if you can.'
          : buildActionReply(updatedState)
      }${nextQuestion ? ` ${nextQuestion.text}` : ''}`,
      state: updatedState,
      risk,
      riskAssessment,
      offerAssessment: risk !== 'LOW',
      autoAlertRequested,
      nextQuestion,
    });
  }

  if (hasSafeIntent(message)) {
    return buildResult({
      reply: buildStatusReply(updatedState),
      state: updatedState,
      risk,
      riskAssessment,
      offerAssessment: false,
      autoAlertRequested: false,
    });
  }

  // Fall-through: nothing matched. If we still owe the user a follow-up
  // question (they replied to "are you alone?" with a sentence that didn't
  // hit any branch), keep the conversation moving instead of stalling.
  const fallbackQuestion = risk !== 'LOW' ? getNextSafetyQuestion(updatedState) : null;
  const fallbackText = fallbackQuestion
    ? `Got it. ${fallbackQuestion.text}`
    : 'I am listening. I do not see an emergency signal yet. Tell me if you feel unsafe, cannot speak, are being followed, or want me to send an alert.';

  return buildResult({
    reply: fallbackText,
    state: updatedState,
    risk,
    riskAssessment,
    offerAssessment: risk !== 'LOW',
    autoAlertRequested: false,
    nextQuestion: fallbackQuestion,
  });
};
