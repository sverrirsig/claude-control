"use client";

import type { KanbanColumn, KanbanColumnInput, KanbanColumnOutput } from "@/lib/types";
import { useEffect, useRef, useState } from "react";

interface Props {
  column: KanbanColumn | null; // null = creating new column
  onSave: (column: KanbanColumn) => void;
  onDelete?: () => void;
  onClose: () => void;
}

const OUTPUT_TYPES: { value: KanbanColumnOutput["type"]; label: string; description: string }[] = [
  { value: "conversation", label: "Last message", description: "Last assistant response text" },
  { value: "file", label: "File", description: "Read a file from the repo" },
  { value: "script", label: "Script", description: "Run a script, capture stdout" },
  { value: "git-diff", label: "Git diff", description: "Capture current git diff" },
];

export function KanbanColumnEditor({ column, onSave, onDelete, onClose }: Props) {
  const [name, setName] = useState(column?.name ?? "");
  const [promptTemplate, setPromptTemplate] = useState(column?.input?.promptTemplate ?? "");
  const [inputFilePath, setInputFilePath] = useState(column?.input?.filePath ?? "");
  const [inputScript, setInputScript] = useState(column?.input?.script ?? "");
  const [outputType, setOutputType] = useState<KanbanColumnOutput["type"]>(column?.output?.type ?? "conversation");
  const [outputValue, setOutputValue] = useState(column?.output?.value ?? "");
  const [outputRegex, setOutputRegex] = useState(column?.output?.regex ?? "");
  const [outputPrompt, setOutputPrompt] = useState(column?.outputPrompt ?? "");
  const [autoCascade, setAutoCascade] = useState(column?.autoCascade ?? false);
  const modalRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const handleSave = () => {
    if (!name.trim()) return;

    const input: KanbanColumnInput = {};
    if (promptTemplate.trim()) input.promptTemplate = promptTemplate.trim();
    if (inputFilePath.trim()) input.filePath = inputFilePath.trim();
    if (inputScript.trim()) input.script = inputScript.trim();

    const output: KanbanColumnOutput = { type: outputType };
    if (outputValue.trim()) output.value = outputValue.trim();
    if (outputRegex.trim()) output.regex = outputRegex.trim();

    const result: KanbanColumn = {
      id: column?.id ?? `col-${Date.now().toString(36)}`,
      name: name.trim(),
      input: Object.keys(input).length > 0 ? input : undefined,
      output,
      outputPrompt: outputPrompt.trim() || undefined,
      autoCascade,
    };

    onSave(result);
  };

  const needsValueField = outputType === "file" || outputType === "script";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        ref={modalRef}
        className="relative z-10 w-full max-w-lg bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold text-zinc-200 mb-4">
          {column ? "Edit Column" : "New Column"}
        </h2>

        {/* Column name */}
        <div className="mb-4">
          <label className="block text-xs text-zinc-500 mb-1">Column Name</label>
          <input
            ref={nameRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Plan, Implement, Review..."
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
          />
        </div>

        {/* Input section */}
        <div className="mb-4 border-t border-zinc-800 pt-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-3">Input (sent to session)</h3>

          <label className="block text-xs text-zinc-500 mb-1">
            Prompt Template <span className="text-zinc-700">{"{{previousOutput}} {{initialPrompt}} available"}</span>
          </label>
          <textarea
            value={promptTemplate}
            onChange={(e) => setPromptTemplate(e.target.value)}
            placeholder="Review the following code and provide feedback:\n\nOriginal task: {{initialPrompt}}\n\n{{previousOutput}}"
            rows={3}
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-(family-name:--font-geist-mono) resize-y"
          />

          <div className="grid grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">File Path (optional)</label>
              <input
                type="text"
                value={inputFilePath}
                onChange={(e) => setInputFilePath(e.target.value)}
                placeholder="REQUIREMENTS.md"
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Script (optional)</label>
              <input
                type="text"
                value={inputScript}
                onChange={(e) => setInputScript(e.target.value)}
                placeholder="cat TODO.md"
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          </div>
        </div>

        {/* Output section */}
        <div className="mb-4 border-t border-zinc-800 pt-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-3">Output (extracted when done)</h3>

          <div className="flex gap-2 mb-3">
            {OUTPUT_TYPES.map((ot) => (
              <button
                key={ot.value}
                onClick={() => setOutputType(ot.value)}
                className={`px-2.5 py-1.5 text-xs rounded-md border transition-colors ${
                  outputType === ot.value
                    ? "border-zinc-500 bg-zinc-800 text-zinc-200"
                    : "border-zinc-800 text-zinc-500 hover:text-zinc-400 hover:border-zinc-700"
                }`}
                title={ot.description}
              >
                {ot.label}
              </button>
            ))}
          </div>

          {needsValueField && (
            <div className="mb-3">
              <label className="block text-xs text-zinc-500 mb-1">
                {outputType === "file" ? "File Path" : "Script Command"}
              </label>
              <input
                type="text"
                value={outputValue}
                onChange={(e) => setOutputValue(e.target.value)}
                placeholder={outputType === "file" ? "PLAN.md" : "cat output.txt"}
                className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Regex Filter (optional)</label>
            <input
              type="text"
              value={outputRegex}
              onChange={(e) => setOutputRegex(e.target.value)}
              placeholder="Extract substring from output"
              className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>
        </div>

        {/* Exit prompt */}
        <div className="mb-4 border-t border-zinc-800 pt-4">
          <h3 className="text-xs font-semibold text-zinc-400 mb-3">Exit Prompt (runs before leaving)</h3>
          <label className="block text-xs text-zinc-500 mb-1">
            Prompt Template <span className="text-zinc-700">{"{{initialPrompt}} available"}</span>
          </label>
          <textarea
            value={outputPrompt}
            onChange={(e) => setOutputPrompt(e.target.value)}
            placeholder="Commit your changes with a descriptive message"
            rows={2}
            className="w-full px-3 py-2 text-sm bg-zinc-800 border border-zinc-700 rounded-lg text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 font-(family-name:--font-geist-mono) resize-y"
          />
          <p className="text-[10px] text-zinc-600 mt-1">
            Sent to the session before it moves to the next column. The card won{"'"}t move until this finishes.
          </p>
        </div>

        {/* Auto-cascade toggle */}
        <div className="mb-5 border-t border-zinc-800 pt-4">
          <label className="flex items-center gap-3 cursor-pointer">
            <button
              type="button"
              role="switch"
              aria-checked={autoCascade}
              onClick={() => setAutoCascade(!autoCascade)}
              className={`relative w-9 h-5 rounded-full transition-colors ${
                autoCascade ? "bg-amber-500/40" : "bg-zinc-700"
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform ${
                  autoCascade ? "translate-x-4" : ""
                }`}
              />
            </button>
            <div>
              <span className="text-sm text-zinc-300">Auto-cascade</span>
              <p className="text-xs text-zinc-600">Automatically move to next column when session goes idle</p>
            </div>
          </label>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={!name.trim()}
            className="px-4 py-2 text-sm font-medium bg-zinc-200 text-zinc-900 rounded-lg hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {column ? "Save" : "Create Column"}
          </button>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          {column && onDelete && (
            <button
              onClick={onDelete}
              className="ml-auto px-3 py-2 text-xs text-red-400/70 hover:text-red-400 transition-colors"
            >
              Delete Column
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
