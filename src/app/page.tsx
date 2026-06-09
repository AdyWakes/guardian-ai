"use client";

import Link from "next/link";
import { Shield, Brain, AlertTriangle, MessageSquare, ArrowRight, Mic } from "lucide-react";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="w-full py-4 px-6 bg-white/80 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-8 h-8 text-guardian-600" />
            <span className="text-xl font-bold text-slate-800">Guardian AI</span>
          </div>
          <div className="text-sm text-slate-500">Microsoft Agents League Hackathon</div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center px-6 py-20 text-center">
        <div className="max-w-3xl mx-auto space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-guardian-100 text-guardian-700 rounded-full text-sm font-medium">
            <Brain className="w-4 h-4" />
            <span>Powered by Microsoft IQ</span>
          </div>

          {/* Title */}
          <h1 className="text-5xl md:text-6xl font-bold text-slate-900 leading-tight">
            Guardian AI
          </h1>

          {/* Tagline */}
          <p className="text-xl md:text-2xl text-slate-600 leading-relaxed">
            An AI safety companion that thinks before emergencies become disasters.
          </p>

          {/* Description */}
          <p className="text-slate-500 max-w-2xl mx-auto">
            Guardian AI uses Microsoft Foundry IQ to reason over safety situations, 
            retrieve relevant knowledge, create action plans, and send emergency alerts 
            when you need help.
          </p>

          {/* CTA Button */}
          <div className="pt-4">
            <Link
              href="/safety"
              className="inline-flex items-center gap-3 px-8 py-4 bg-guardian-600 hover:bg-guardian-700 text-white font-semibold rounded-xl transition-all transform hover:scale-105 shadow-lg shadow-guardian-500/25"
            >
              <span>Start Safety Mode</span>
              <ArrowRight className="w-5 h-5" />
            </Link>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-4 gap-6 pt-16 max-w-5xl mx-auto">
            <FeatureCard
              icon={<Brain className="w-6 h-6 text-guardian-600" />}
              title="AI Reasoning"
              description="Analyzes your situation using advanced AI reasoning to assess risk levels"
            />
            <FeatureCard
              icon={<Mic className="w-6 h-6 text-guardian-600" />}
              title="Voice Wake Demo"
              description='Say "Guardian" followed by your concern to start the assistant-style flow'
            />
            <FeatureCard
              icon={<AlertTriangle className="w-6 h-6 text-emergency-600" />}
              title="Risk Assessment"
              description="Classifies situations as LOW, MEDIUM, or HIGH risk with clear reasoning"
            />
            <FeatureCard
              icon={<MessageSquare className="w-6 h-6 text-guardian-600" />}
              title="Emergency Alerts"
              description="Sends location and context to your emergency contacts via Telegram"
            />
          </div>
        </div>
      </section>

      {/* Disclaimer */}
      <footer className="w-full py-6 px-6 bg-slate-50 border-t border-slate-200">
        <div className="max-w-4xl mx-auto text-center">
          <p className="text-sm text-slate-400">
            <strong className="text-slate-500">Prototype Only:</strong> Guardian AI is a hackathon MVP for demonstration purposes. 
            It is not a replacement for emergency services. Always call 911 in a real emergency.
          </p>
        </div>
      </footer>
    </main>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 bg-white rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
      <div className="w-12 h-12 bg-slate-50 rounded-lg flex items-center justify-center mb-4">
        {icon}
      </div>
      <h3 className="font-semibold text-slate-900 mb-2">{title}</h3>
      <p className="text-sm text-slate-500">{description}</p>
    </div>
  );
}
