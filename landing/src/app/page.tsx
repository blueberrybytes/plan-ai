import React from "react";
import {
  Download,
  MonitorPlay,
  Mic,
  ListTodo,
  Activity,
  ArrowRight,
  BrainCircuit,
} from "lucide-react";

export default function Home() {
  return (
    <main className="grow flex flex-col">
      {/* Header */}
      <header className="border-b border-white/10 bg-[#161920]/80 backdrop-blur-md sticky top-0 z-50 transition-all">
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="font-jakarta font-bold text-xl tracking-tight text-white">
              Plan <span className="text-[#4361EE]">AI</span>
            </span>
          </div>
          <nav className="flex items-center gap-3">
            <a
              href="#download"
              className="text-sm font-semibold text-white/80 hover:text-white transition-colors hover:bg-white/5 rounded-lg px-4 py-2"
            >
              Download Recorder
            </a>
            <a
              href="https://plan-ai.blueberrybytes.com"
              className="text-sm font-semibold bg-[#4361EE] hover:bg-[#2d4cdd] text-white transition-colors rounded-lg px-4 py-2"
            >
              Open Web App
            </a>
          </nav>
        </div>
      </header>

      {/* Hero Section */}
      <section
        id="download"
        className="grow flex flex-col items-center justify-center px-6 py-20 lg:py-32 text-center"
      >
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#4361EE]/10 text-[#4361EE] text-sm font-medium mb-8 border border-[#4361EE]/20">
          <Activity size={16} />
          <span>Capture meetings seamlessly</span>
        </div>

        <h1 className="font-jakarta text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight mb-6 max-w-4xl mx-auto text-white">
          Meet the <span className="text-gradient">AI Recorder</span>
        </h1>

        <p className="text-lg md:text-xl text-[#94a3b8] max-w-2xl mx-auto mb-12 font-inter">
          A native desktop app that captures your system audio and microphone, automatically
          transcribing and generating tasks for your engineering team with zero manual effort.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
          {/* Mac Download */}
          <a
            href="https://firebasestorage.googleapis.com/v0/b/plan-ai-211b8.firebasestorage.app/o/packages%2FPlan%20AI%20Recorder-1.0.0-arm64.dmg?alt=media"
            className="flex items-center justify-center gap-2 w-full sm:w-[220px] bg-primary-gradient text-white rounded-xl px-6 py-4 font-semibold shadow-[0_4px_20px_rgba(67,97,238,0.3)] hover:shadow-[0_8px_24px_rgba(67,97,238,0.4)] transition-all hover:-translate-y-0.5"
          >
            <Download size={20} />
            Download for Mac
            <span className="text-xs font-normal opacity-80 mt-0.5 absolute bottom-1 right-2 hidden">
              .dmg
            </span>
          </a>

          {/* Windows Download */}
          <a
            href="https://firebasestorage.googleapis.com/v0/b/plan-ai-211b8.firebasestorage.app/o/packages%2FPlan%20AI%20Recorder%20Setup%201.0.0.exe?alt=media"
            className="flex items-center justify-center gap-2 w-full sm:w-[220px] bg-[#1e293b] border border-white/10 hover:border-white/20 text-white rounded-xl px-6 py-4 font-semibold hover:bg-[#334155] transition-all"
          >
            <Download size={20} />
            Download for Windows
            <span className="text-xs font-normal opacity-50 mt-0.5 absolute bottom-1 right-2 hidden">
              .exe
            </span>
          </a>
        </div>
      </section>

      {/* Features Grid */}
      <section className="bg-[#161920]/50 border-t border-white/5 py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <FeatureCard
              icon={<MonitorPlay className="text-[#a78bfa] mb-4" size={32} />}
              title="Native Performance"
              description="A lightweight desktop app built for efficiency. Runs quietly in the background without draining your battery."
            />
            <FeatureCard
              icon={<Mic className="text-[#10B981] mb-4" size={32} />}
              title="Crystal Clear Audio"
              description="Seamlessly grabs system audio and your microphone simultaneously, ensuring no participant is missed."
            />
            <FeatureCard
              icon={<ListTodo className="text-[#F59E0B] mb-4" size={32} />}
              title="Automated Task Generation"
              description="Uploads transcripts directly to your Plan-AI workspace to auto-detect speakers, decisions, and action items."
            />
          </div>
        </div>
      </section>

      {/* About Plan AI SaaS */}
      <section className="py-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center justify-center p-4 bg-[#4361EE]/10 rounded-full mb-6">
            <BrainCircuit size={40} className="text-[#4361EE]" />
          </div>
          <h2 className="font-jakarta text-3xl md:text-5xl font-bold tracking-tight mb-6 text-white">
            Powered by the <span className="text-gradient">Plan AI</span> Ecosystem
          </h2>
          <p className="text-lg md:text-xl text-[#94a3b8] mb-12 font-inter leading-relaxed">
            The recorder is just the beginning. All audio and transcripts are seamlessly synced to
            the
            <strong> Plan AI Web Platform</strong>. Our AI analyzes your meetings to auto-generate
            tickets, assign developers, and manage your entire agile workflow—all in one place.
          </p>
          <a
            href="https://plan-ai.blueberrybytes.com"
            className="inline-flex items-center justify-center gap-2 bg-[#161920] border border-[#4361EE]/50 hover:border-[#4361EE] text-white rounded-xl px-8 py-4 font-semibold hover:bg-[#4361EE]/10 transition-all shadow-[0_4px_20px_rgba(67,97,238,0.15)] hover:shadow-[0_8px_32px_rgba(67,97,238,0.3)]"
          >
            Access the Web Platform
            <ArrowRight size={20} />
          </a>
        </div>
      </section>

      <footer className="border-t border-white/10 py-8 text-center text-white/40 text-sm">
        <p>© {new Date().getFullYear()} Blueberrybytes. All rights reserved.</p>
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
    <div className="bg-[#161920] border border-white/10 rounded-2xl p-8 hover:border-white/20 transition-all hover:shadow-[0_8px_32px_rgba(0,0,0,0.2)] hover:-translate-y-1">
      {icon}
      <h3 className="font-jakarta text-xl font-bold text-white mb-3">{title}</h3>
      <p className="text-[#94a3b8] leading-relaxed">{description}</p>
    </div>
  );
}
