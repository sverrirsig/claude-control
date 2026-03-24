"use client";

import { useEffect, useRef } from "react";
import { ConversationMessage } from "@/lib/types";

function MessageBubble({ message }: { message: ConversationMessage }) {
  const isUser = message.type === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
          isUser
            ? "bg-blue-600/20 border border-blue-500/20 text-blue-100"
            : "bg-white/3 border border-white/6 text-zinc-300"
        }`}
      >
        {message.text && (
          <p className="whitespace-pre-wrap wrap-break-word">{message.text}</p>
        )}
        {message.toolUses.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {message.toolUses.map((tool, i) => (
              <span
                key={i}
                className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] rounded-md bg-violet-500/10 border border-violet-500/20 text-violet-300 font-(family-name:--font-geist-mono)"
              >
                <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.42 15.17l-5.1-5.1m0 0L11.42 4.97m-5.1 5.1H21" />
                </svg>
                {tool.name}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StreamingCursor() {
  return (
    <div className="flex justify-start">
      <div className="rounded-xl px-4 py-3 bg-white/3 border border-white/6">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:0ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:150ms]" />
          <span className="w-1.5 h-1.5 rounded-full bg-zinc-500 animate-bounce [animation-delay:300ms]" />
        </div>
      </div>
    </div>
  );
}

export function ConversationView({
  messages,
  isStreaming,
}: {
  messages: ConversationMessage[];
  isStreaming?: boolean;
}) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isStreaming]);

  if (messages.length === 0 && !isStreaming) {
    return (
      <div className="flex items-center justify-center py-12 text-zinc-600 text-sm">
        No conversation data available.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="space-y-3 max-h-[70vh] overflow-y-auto pr-2">
      {messages.map((msg, i) => (
        <MessageBubble key={i} message={msg} />
      ))}
      {isStreaming && <StreamingCursor />}
      <div ref={bottomRef} />
    </div>
  );
}
