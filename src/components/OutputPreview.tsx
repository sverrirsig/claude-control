import { ConversationPreview, SessionStatus } from "@/lib/types";

export function OutputPreview({ preview, status }: { preview: ConversationPreview; status?: SessionStatus }) {
  if (preview.messageCount === 0) {
    return (
      <div className="flex items-center gap-2 text-xs text-zinc-600 italic py-2">
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
          />
        </svg>
        No messages yet
      </div>
    );
  }

  const showTools = preview.lastTools.length > 0 && (status === "working" || status === "waiting");

  return (
    <div className="space-y-1.5">
      {preview.lastUserMessage && (
        <p className="text-xs text-zinc-300 line-clamp-2 leading-relaxed">{preview.lastUserMessage}</p>
      )}
      {preview.assistantIsNewer && preview.lastAssistantText && (
        <p className="text-[11px] text-zinc-500 line-clamp-1 leading-relaxed">{preview.lastAssistantText}</p>
      )}
      {showTools && (
        <div className="flex items-center gap-1.5 text-xs flex-wrap">
          {preview.lastTools.map((tool, i) => (
            <span
              key={i}
              className="inline-flex items-center px-1.5 py-0.5 rounded-sm bg-violet-500/10 border border-violet-500/20 text-violet-300 font-mono text-[10px]"
            >
              {tool.name}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
