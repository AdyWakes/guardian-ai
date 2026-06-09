"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Brain,
  CheckCircle,
  FileAudio,
  Loader2,
  MapPin,
  Mic,
  Phone,
  Radio,
  Send,
  Shield,
  Video,
} from "lucide-react";
import { RiskAssessment, RiskLevel } from "@/lib/riskAssessment";

interface Message {
  id: string;
  type: "user" | "agent";
  content: string;
}

interface AssessmentState {
  userMessage: string;
  canSpeakSafely: boolean | null;
  isAlone: boolean | null;
  isBeingFollowed: boolean | null;
  location: { lat: number; lng: number } | null;
  activationMode: "typed" | "voice";
  audioClipStatus: string | null;
  declaredSafety: "safe" | "unsafe" | "unknown";
  placeContext: "home" | "public" | "vehicle" | "unknown";
}

interface RuntimeStatus {
  is_demo_mode: boolean;
  foundry_configured: boolean;
  telegram_configured: boolean;
  whatsapp_configured: boolean;
}

interface ChatTurnResponse {
  reply: string;
  state: AssessmentState;
  risk_estimate: RiskLevel;
  risk_assessment: RiskAssessment | null;
  offer_assessment: boolean;
  auto_alert_requested: boolean;
}

interface AlertAttachment {
  type: "audio" | "video";
  mimeType: string;
  dataUrl: string;
  filename: string;
}

interface AlertChannelResult {
  success: boolean;
  message: string;
  isDemoMode: boolean;
  mediaNotes?: string[];
}

interface SendAlertResponse {
  success: boolean;
  message: string;
  channels?: {
    telegram?: AlertChannelResult;
    whatsapp?: AlertChannelResult;
  };
}

const DEMO_LOCATION = {
  lat: 47.6062,
  lng: -122.3321,
};

const QUICK_ACTIONS = [
  { label: "I feel unsafe", message: "I feel unsafe" },
  { label: "I'm safe at home", message: "I'm safe at home" },
  { label: "Send emergency alert", message: "Very unsafe place, take the appropriate measures" },
];

const initialAssessment: AssessmentState = {
  userMessage: "",
  canSpeakSafely: null,
  isAlone: null,
  isBeingFollowed: null,
  location: null,
  activationMode: "typed",
  audioClipStatus: null,
  declaredSafety: "unknown",
  placeContext: "unknown",
};

type SpeechRecognitionConstructor = new () => {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

interface SpeechRecognitionEventLike {
  results: ArrayLike<{ 0: { transcript: string } }>;
}

const createMessageId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to read media clip"));
    reader.readAsDataURL(blob);
  });

const getLiveStatusText = (risk: RiskLevel, state: AssessmentState) => {
  if (!state.userMessage) {
    return "Tell Guardian what is happening. The status will update as you talk.";
  }

  if (risk === "LOW") {
    if (state.declaredSafety === "safe" && state.placeContext === "home") {
      return "You appear safe right now. Guardian is on standby and will not alert anyone unless you ask.";
    }

    return "No immediate emergency signal is visible right now. Guardian is monitoring the situation.";
  }

  if (risk === "MEDIUM") {
    return "Use caution. Guardian can get location, prepare an action plan, and send an alert if you ask.";
  }

  return "High-risk situation. Guardian can send location and an emergency clip to your saved contact now.";
};

const hasUnsafeIntent = (message: string) => {
  const normalized = message.toLowerCase();

  return /\b(unsafe|scared|afraid|followed|following|stalked|stalking|threatened|threatening|danger|emergency|help|creepy|uncomfortable|lost|trapped|weapon|knife|gun)\b/.test(
    normalized
  );
};

const getClipSummary = (attachments: AlertAttachment[], alertResult?: SendAlertResponse) => {
  if (attachments.length === 0) {
    return "No clip was included.";
  }

  const clipType = attachments[0].type === "video" ? "Video" : "Audio";
  const telegram = alertResult?.channels?.telegram;
  const whatsApp = alertResult?.channels?.whatsapp;
  const whatsAppNotes = whatsApp?.mediaNotes?.join(" ").toLowerCase() ?? "";
  const whatsAppSkippedClip = whatsAppNotes.includes("skipped") || whatsAppNotes.includes("could not be sent");
  const whatsAppSentClip = whatsAppNotes.includes("sent via whatsapp");

  if (telegram?.success && !telegram.isDemoMode) {
    if (whatsApp?.success && !whatsApp.isDemoMode && whatsAppSkippedClip) {
      return `${clipType} clip sent to Telegram. WhatsApp received text only.`;
    }

    if (whatsApp?.success && !whatsApp.isDemoMode && whatsAppSentClip) {
      return `${clipType} clip sent to Telegram and WhatsApp.`;
    }

    return `${clipType} clip sent to Telegram.`;
  }

  if (whatsApp?.success && !whatsApp.isDemoMode && whatsAppSentClip) {
    return `${clipType} clip sent to WhatsApp.`;
  }

  if (telegram?.isDemoMode && whatsApp?.isDemoMode) {
    return `${clipType} clip captured for demo.`;
  }

  return `${clipType} clip captured, but it may not have been sent.`;
};

export default function SafetyPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      type: "agent",
      content:
        "I'm Guardian AI. Tell me what is happening. You can start with: I feel unsafe.",
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [assessment, setAssessment] = useState<AssessmentState>(initialAssessment);
  const [riskResult, setRiskResult] = useState<RiskAssessment | null>(null);
  const [estimatedRisk, setEstimatedRisk] = useState<RiskLevel>("LOW");
  const [runtimeStatus, setRuntimeStatus] = useState<RuntimeStatus | null>(null);
  const [isAssessing, setIsAssessing] = useState(false);
  const [isSendingAlert, setIsSendingAlert] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceTranscript, setVoiceTranscript] = useState("");
  const [voiceStatus, setVoiceStatus] = useState(
    'Say "Guardian" followed by your concern to start the voice demo.'
  );

  useEffect(() => {
    const loadRuntimeStatus = async () => {
      try {
        const response = await fetch("/api/status", { cache: "no-store" });

        if (!response.ok) {
          throw new Error("Status check failed");
        }

        setRuntimeStatus(await response.json());
      } catch {
        setRuntimeStatus({
          is_demo_mode: true,
          foundry_configured: false,
          telegram_configured: false,
          whatsapp_configured: false,
        });
      }
    };

    loadRuntimeStatus();
  }, []);

  const addAgentMessage = (content: string) => {
    setMessages((previous) => [
      ...previous,
      {
        id: createMessageId(),
        type: "agent",
        content,
      },
    ]);
  };

  const addUserMessage = (content: string) => {
    setMessages((previous) => [
      ...previous,
      {
        id: createMessageId(),
        type: "user",
        content,
      },
    ]);
  };

  const getCurrentLocation = async (): Promise<AssessmentState["location"]> => {
    if (!navigator.geolocation) {
      return null;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
        },
        () => resolve(null),
        {
          enableHighAccuracy: true,
          timeout: 8000,
          maximumAge: 30000,
        }
      );
    });
  };

  const recordEmergencyClip = async (): Promise<AlertAttachment[]> => {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      return [];
    }

    const videoMimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"
      : "video/webm";
    const audioMimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
      ? "audio/webm;codecs=opus"
      : "audio/webm";

    let stream: MediaStream;
    let type: AlertAttachment["type"] = "video";
    let mimeType = videoMimeType;

    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        type = "audio";
        mimeType = audioMimeType;
      } catch {
        return [];
      }
    }

    return new Promise((resolve) => {
      const chunks: BlobPart[] = [];
      const recorder = new MediaRecorder(stream, { mimeType });

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunks.push(event.data);
        }
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop());

        try {
          const blob = new Blob(chunks, { type: mimeType });
          const dataUrl = await blobToDataUrl(blob);
          resolve([
            {
              type,
              mimeType,
              dataUrl,
              filename: `guardian-emergency-${Date.now()}.webm`,
            },
          ]);
        } catch {
          resolve([]);
        }
      };

      recorder.start();
      window.setTimeout(() => {
        if (recorder.state !== "inactive") {
          recorder.stop();
        }
      }, 4000);
    });
  };

  const runAutomaticAlert = async (
    stateForAlert: AssessmentState,
    existingAssessment: RiskAssessment | null
  ) => {
    setIsSendingAlert(true);
    addAgentMessage("Starting alert: getting location and a short video clip. If camera access is blocked, I will try audio.");

    try {
      const [location, attachments] = await Promise.all([getCurrentLocation(), recordEmergencyClip()]);
      const updatedState = {
        ...stateForAlert,
        location: location ?? stateForAlert.location,
        audioClipStatus:
          attachments.length > 0
            ? `${attachments[0].type} emergency clip captured and attached`
            : "Emergency clip permission unavailable or denied",
      };
      setAssessment(updatedState);

      let assessmentForAlert = existingAssessment;

      if (!assessmentForAlert || updatedState.location !== stateForAlert.location || attachments.length > 0) {
        const assessmentResponse = await fetch("/api/assess", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(updatedState),
        });

        if (assessmentResponse.ok) {
          assessmentForAlert = await assessmentResponse.json();
          setRiskResult(assessmentForAlert);
        }
      }

      if (!assessmentForAlert) {
        throw new Error("No alert assessment available");
      }

      setEstimatedRisk(assessmentForAlert.risk_level);

      const alertResponse = await fetch("/api/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: assessmentForAlert.emergency_message,
          attachments,
        }),
      });

      if (!alertResponse.ok) {
        throw new Error("Automatic alert send failed");
      }

      const alertResult: SendAlertResponse = await alertResponse.json();

      if (!alertResult.success) {
        addAgentMessage(`Alert problem. ${alertResult.message}`);
        return;
      }

      addAgentMessage(
        `Alert flow complete. ${alertResult.message} Location ${
          updatedState.location ? "included" : "not available"
        }. ${getClipSummary(attachments, alertResult)}`
      );
    } catch (error) {
      console.error("Automatic alert error:", error);
      addAgentMessage(
        "I could not complete the automatic alert. If you are in immediate danger, call emergency services directly or try Send Alert again."
      );
    } finally {
      setIsSendingAlert(false);
    }
  };

  const submitConversationMessage = async (
    messageText: string,
    activationMode: "typed" | "voice" = "typed",
    displayText = messageText
  ) => {
    addUserMessage(displayText);
    setIsAssessing(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: messageText,
          state: assessment,
          activationMode,
        }),
      });

      if (!response.ok) {
        throw new Error("Chat turn failed");
      }

      const result: ChatTurnResponse = await response.json();
      setAssessment(result.state);
      setRiskResult(result.risk_assessment);
      setEstimatedRisk(result.risk_assessment?.risk_level ?? result.risk_estimate);
      addAgentMessage(result.reply);

      if (result.auto_alert_requested) {
        await runAutomaticAlert(result.state, result.risk_assessment);
      }
    } catch (error) {
      console.error("Chat error:", error);
      addAgentMessage(
        "I could not process that message. If you are in immediate danger, call emergency services directly. Otherwise, try telling me the situation again in one sentence."
      );
    } finally {
      setIsAssessing(false);
    }
  };

  const startAssessmentFlow = (messageText: string, activationMode: "typed" | "voice") => {
    submitConversationMessage(messageText, activationMode, activationMode === "voice" ? `Guardian ${messageText}` : messageText);
  };

  const handleSendMessage = () => {
    const messageText = inputText.trim();

    if (!messageText || isAssessing) {
      return;
    }

    setInputText("");
    submitConversationMessage(messageText);
  };

  const handleQuickAction = (messageText: string) => {
    if (isAssessing || isSendingAlert) {
      return;
    }

    submitConversationMessage(messageText);
  };

  const performAssessment = async (assessmentPayload: AssessmentState = assessment) => {
    if (!assessmentPayload.userMessage) {
      addAgentMessage("Please tell me what is happening before I assess risk.");
      return;
    }

    setIsAssessing(true);

    try {
      const response = await fetch("/api/assess", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(assessmentPayload),
      });

      if (!response.ok) {
        throw new Error("Assessment failed");
      }

      const result: RiskAssessment = await response.json();
      setRiskResult(result);
      setEstimatedRisk(result.risk_level);
      addAgentMessage(`Assessment complete: ${result.risk_level} risk. I prepared the action plan and alert preview.`);
    } catch (error) {
      console.error("Assessment error:", error);
      addAgentMessage(
        "I could not complete the assessment. If there is immediate danger, contact emergency services directly."
      );
    } finally {
      setIsAssessing(false);
    }
  };

  const captureLocation = () => {
    if (!navigator.geolocation) {
      addAgentMessage("Geolocation is not supported here. I will assess without location.");
      performAssessment();
      return;
    }

    setIsAssessing(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const location = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        const updatedAssessment = { ...assessment, location };
        setAssessment(updatedAssessment);
        addAgentMessage("Location captured. I am checking safety now.");
        performAssessment(updatedAssessment);
      },
      (error) => {
        console.error("Location error:", error);
        addAgentMessage("Location was not available. I will assess without it.");
        performAssessment();
      },
      {
        enableHighAccuracy: true,
        timeout: 8000,
        maximumAge: 30000,
      }
    );
  };

  const useDemoLocation = () => {
    const updatedAssessment = { ...assessment, location: DEMO_LOCATION };
    setAssessment(updatedAssessment);
    addAgentMessage("Demo location selected. I am checking safety now.");
    performAssessment(updatedAssessment);
  };

  const handleWakePhraseTranscript = (transcript: string) => {
    if (isAssessing || isSendingAlert) {
      setVoiceStatus("Guardian heard you. Finish the current safety action first.");
      return;
    }

    const lowerTranscript = transcript.toLowerCase();
    const wakeIndex = lowerTranscript.indexOf("guardian");

    if (wakeIndex === -1) {
      setVoiceStatus('Wake word not detected. Try: "Guardian I am alone and feel unsafe."');
      return;
    }

    const concern = transcript.slice(wakeIndex + "guardian".length).replace(/^[,.:;\s]+/, "").trim();

    if (!concern) {
      setVoiceStatus('Wake word detected. Add the concern after "Guardian".');
      return;
    }

    setVoiceStatus("Wake phrase detected. Starting Safety Mode from voice.");
    startAssessmentFlow(concern, "voice");
  };

  const startVoiceWakeDemo = () => {
    const speechWindow = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognitionApi = speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition;

    if (!SpeechRecognitionApi) {
      setVoiceStatus(
        'This browser does not expose speech recognition. Type a phrase like "Guardian I am alone and feel unsafe" for the demo.'
      );
      return;
    }

    const recognition = new SpeechRecognitionApi();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = "en-US";
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join(" ")
        .trim();
      setVoiceTranscript(transcript);
      handleWakePhraseTranscript(transcript);
    };
    recognition.onerror = () => {
      setVoiceStatus("Voice capture failed or permission was denied. The typed flow still works.");
      setIsListening(false);
    };
    recognition.onend = () => {
      setIsListening(false);
    };

    setVoiceTranscript("");
    setVoiceStatus('Listening for "Guardian"...');
    setIsListening(true);

    try {
      recognition.start();
    } catch {
      setVoiceStatus("Voice capture is already active or unavailable. Try again in a moment.");
      setIsListening(false);
    }
  };

  const sendAlert = async () => {
    if (!riskResult) {
      return;
    }

    setIsSendingAlert(true);
    addAgentMessage("Sending alert now. I will try to attach a short video clip.");

    try {
      const attachments = await recordEmergencyClip();
      const response = await fetch("/api/send-alert", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: riskResult.emergency_message,
          attachments,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to send alert");
      }

      const result: SendAlertResponse = await response.json();
      addAgentMessage(
        result.success
          ? `Alert flow complete. ${result.message} ${getClipSummary(attachments, result)}`
          : `Alert was not sent: ${result.message}`
      );
    } catch (error) {
      console.error("Alert error:", error);
      addAgentMessage("Failed to send the alert. Contact emergency services directly if needed.");
    } finally {
      setIsSendingAlert(false);
    }
  };

  const canRequestAssessment = Boolean(
    assessment.userMessage &&
      (hasUnsafeIntent(assessment.userMessage) || assessment.declaredSafety === "unsafe") &&
      !riskResult
  );

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100">
      <header className="border-b border-white/10 bg-slate-950/90 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 text-sm font-medium text-slate-300 transition-colors hover:text-white"
          >
            <ArrowLeft className="h-5 w-5" />
            Back
          </Link>
          <div className="flex items-center gap-2">
            <Shield className="h-6 w-6 text-guardian-400" />
            <span className="font-semibold">Guardian AI Safety Mode</span>
          </div>
          <div className="w-12" />
        </div>
      </header>

      {runtimeStatus?.is_demo_mode && (
        <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <div className="mx-auto flex max-w-6xl items-center gap-2 text-sm text-amber-100">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>
              Demo Mode: mock Foundry IQ knowledge, a fake trusted Telegram contact, and demo location are available.
            </span>
          </div>
        </div>
      )}

      <div className="mx-auto grid min-h-[calc(100vh-73px)] w-full max-w-6xl gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="flex min-h-[640px] flex-col overflow-hidden rounded-lg border border-white/10 bg-white text-slate-900 shadow-2xl shadow-slate-950/30">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Safety chat</p>
              <p className="text-xs text-slate-500">Prototype only. Call emergency services for real emergencies.</p>
            </div>
            <span className="rounded-full bg-guardian-50 px-3 py-1 text-xs font-medium text-guardian-700">
              Reasoning Agent
            </span>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto bg-slate-50 p-4">
            {messages.map((message) => (
              <div
                key={message.id}
                className={`flex ${message.type === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[82%] rounded-lg px-4 py-3 text-sm leading-relaxed ${
                    message.type === "user"
                      ? "bg-guardian-600 text-white"
                      : "border border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  {message.content}
                </div>
              </div>
            ))}
            {(isAssessing || isSendingAlert) && (
              <div className="flex justify-start">
                <div className="rounded-lg border border-slate-200 bg-white p-3">
                  <Loader2 className="h-5 w-5 animate-spin text-guardian-600" />
                </div>
              </div>
            )}
          </div>

          <div className="border-t border-slate-200 bg-white p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    handleSendMessage();
                  }
                }}
                placeholder="Tell Guardian what happened"
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-4 py-3 text-sm outline-none transition focus:border-guardian-500 focus:ring-2 focus:ring-guardian-200"
              />
              <button
                onClick={handleSendMessage}
                disabled={!inputText.trim() || isAssessing || isSendingAlert}
                className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-guardian-600 text-white transition hover:bg-guardian-700 disabled:cursor-not-allowed disabled:opacity-50"
                aria-label="Send message"
              >
                <Send className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {QUICK_ACTIONS.map((action) => {
                const isEmergencyAction = action.label.includes("emergency");

                return (
                  <button
                    key={action.label}
                    onClick={() => handleQuickAction(action.message)}
                    disabled={isAssessing || isSendingAlert}
                    className={`rounded-full px-3 py-2 text-xs font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${
                      isEmergencyAction
                        ? "bg-emergency-100 text-emergency-800 hover:bg-emergency-200"
                        : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                    }`}
                  >
                    {action.label}
                  </button>
                );
              })}
            </div>

            {canRequestAssessment && (
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  onClick={captureLocation}
                  disabled={isAssessing}
                  className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                >
                  <MapPin className="h-4 w-4" />
                  Get Location
                </button>
                {runtimeStatus?.is_demo_mode && (
                  <button
                    onClick={useDemoLocation}
                    disabled={isAssessing}
                    className="inline-flex items-center gap-2 rounded-lg bg-amber-100 px-4 py-2 text-sm font-medium text-amber-800 transition hover:bg-amber-200 disabled:opacity-50"
                  >
                    <MapPin className="h-4 w-4" />
                    Use Demo Location
                  </button>
                )}
                <button
                  onClick={() => performAssessment()}
                  disabled={isAssessing}
                  className="inline-flex items-center gap-2 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 disabled:opacity-50"
                >
                  <Brain className="h-4 w-4" />
                  Assess Without Location
                </button>
              </div>
            )}

            {riskResult && (
              <button
                onClick={sendAlert}
                disabled={isSendingAlert}
                className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emergency-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emergency-700 disabled:opacity-50"
              >
                {isSendingAlert ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
                Send Alert
              </button>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          {riskResult ? (
            <RiskPanel result={riskResult} onSendAlert={sendAlert} isSendingAlert={isSendingAlert} />
          ) : (
            <div className="rounded-lg border border-white/10 bg-white/5 p-5">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Shield className="h-5 w-5 text-guardian-300" />
                Current status
              </h2>
              <div className="mt-4">
                <RiskBadge level={estimatedRisk} />
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-300">
                {getLiveStatusText(estimatedRisk, assessment)}
              </p>
              <div className="mt-5 rounded-lg border border-white/10 bg-slate-950/40 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Understood details</p>
                <div className="mt-3 space-y-2">
                  <KnownFactRow label="Speak safely" value={assessment.canSpeakSafely} />
                  <KnownFactRow label="Alone" value={assessment.isAlone} />
                  <KnownFactRow label="Threat" value={assessment.isBeingFollowed} />
                  <KnownTextRow label="Place" value={assessment.placeContext} />
                </div>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-white/10 bg-white/5 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Radio className="h-4 w-4 text-guardian-300" />
              Assistant mode
            </h2>
            <div className="mt-3 rounded-lg bg-slate-950/50 p-3 text-sm text-slate-200">
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">Wake word</span>
                <span className="rounded-full bg-guardian-400/15 px-2 py-1 text-xs font-semibold text-guardian-200">
                  Guardian
                </span>
              </div>
              <p className="mt-3 text-xs leading-relaxed text-slate-400">
                Example: Guardian, I am alone and feel unsafe.
              </p>
            </div>
            <button
              onClick={startVoiceWakeDemo}
              disabled={isListening}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-guardian-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-guardian-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isListening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}
              {isListening ? "Listening" : "Speak to Guardian"}
            </button>
            <p className="mt-3 text-xs leading-relaxed text-slate-300">{voiceStatus}</p>
            {voiceTranscript && (
              <p className="mt-2 rounded bg-white/10 p-2 text-xs leading-relaxed text-slate-300">
                Transcript: {voiceTranscript}
              </p>
            )}
            <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-slate-300">
                <FileAudio className="mb-2 h-4 w-4 text-guardian-300" />
                Audio fallback if camera is blocked
              </div>
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-slate-300">
                <Video className="mb-2 h-4 w-4 text-guardian-300" />
                Short video clip when allowed
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-white/10 bg-white/5 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Phone className="h-4 w-4 text-emergency-300" />
              Emergency numbers
            </h2>
            <div className="mt-3 space-y-2 text-sm text-slate-300">
              <p>
                <span className="font-semibold text-emergency-200">911</span> - Emergency services
              </p>
              <p>
                <span className="font-semibold text-emergency-200">1-800-799-SAFE</span> - Domestic Violence Hotline
              </p>
              <p>
                <span className="font-semibold text-emergency-200">Text HOME to 741741</span> - Crisis Text Line
              </p>
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}

function KnownFactRow({ label, value }: { label: string; value: boolean | null }) {
  const displayValue = value === null ? "Unknown" : value ? "Yes" : "No";

  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-400">{label}</span>
      <span
        className={`rounded-full px-2 py-1 font-semibold ${
          value === null ? "bg-white/10 text-slate-300" : "bg-guardian-400/15 text-guardian-200"
        }`}
      >
        {displayValue}
      </span>
    </div>
  );
}

function KnownTextRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-slate-400">{label}</span>
      <span
        className={`rounded-full px-2 py-1 font-semibold ${
          value === "unknown" ? "bg-white/10 text-slate-300" : "bg-guardian-400/15 text-guardian-200"
        }`}
      >
        {value === "unknown" ? "Unknown" : value}
      </span>
    </div>
  );
}

function RiskPanel({
  result,
  onSendAlert,
  isSendingAlert,
}: {
  result: RiskAssessment;
  onSendAlert: () => void;
  isSendingAlert: boolean;
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white p-5 text-slate-900 shadow-2xl shadow-slate-950/30">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Brain className="h-5 w-5 text-guardian-600" />
          Risk result
        </h2>
        {result.is_demo_mode && (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
            Demo Mode
          </span>
        )}
      </div>

      <div className="mt-4">
        <RiskBadge level={result.risk_level} />
      </div>

      <div className="mt-4 rounded-lg bg-slate-50 p-3">
        <p className="text-sm leading-relaxed text-slate-700">{result.reasoning_summary}</p>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-800">Action plan</h3>
        <ol className="mt-2 space-y-2">
          {result.immediate_steps.map((step, index) => (
            <li key={step} className="flex gap-2 text-sm leading-relaxed text-slate-700">
              <span className="font-semibold text-guardian-700">{index + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-800">Foundry IQ sources</h3>
        <div className="mt-2 flex flex-wrap gap-2">
          {result.retrieved_sources.map((source) => (
            <span key={source} className="rounded bg-guardian-50 px-2 py-1 text-xs font-medium text-guardian-700">
              {source}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-5">
        <h3 className="text-sm font-semibold text-slate-800">Emergency alert preview</h3>
        <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-lg border border-slate-200 bg-slate-950 p-3 text-xs leading-relaxed text-slate-100">
          {result.emergency_message}
        </pre>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
          <FileAudio className="mb-2 h-4 w-4 text-guardian-600" />
          Audio fallback if camera access is blocked.
        </div>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-slate-700">
          <Video className="mb-2 h-4 w-4 text-guardian-600" />
          Short video clip is attached when allowed.
        </div>
      </div>

      <button
        onClick={onSendAlert}
        disabled={isSendingAlert}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emergency-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-emergency-700 disabled:opacity-50"
      >
        {isSendingAlert ? <Loader2 className="h-4 w-4 animate-spin" /> : <AlertTriangle className="h-4 w-4" />}
        Send Alert
      </button>
    </div>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  const configs = {
    LOW: {
      bg: "bg-emerald-100",
      text: "text-emerald-800",
      border: "border-emerald-200",
      icon: CheckCircle,
    },
    MEDIUM: {
      bg: "bg-amber-100",
      text: "text-amber-800",
      border: "border-amber-200",
      icon: AlertTriangle,
    },
    HIGH: {
      bg: "bg-emergency-100",
      text: "text-emergency-800",
      border: "border-emergency-200",
      icon: AlertTriangle,
    },
  };
  const config = configs[level];
  const Icon = config.icon;

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${config.bg} ${config.border}`}>
      <Icon className={`h-6 w-6 ${config.text}`} />
      <div>
        <p className={`text-xs font-semibold uppercase tracking-wide ${config.text}`}>Risk level</p>
        <p className={`text-2xl font-bold ${config.text}`}>{level}</p>
      </div>
    </div>
  );
}
