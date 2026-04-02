"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Diff, Hunk, Decoration, parseDiff, getChangeKey } from "react-diff-view";
import type { FileData, ChangeData, HunkData } from "react-diff-view";
import type { GutterOptions, ViewType } from "react-diff-view";
import type { ReviewComment } from "@/lib/types";
import { CommentThread } from "./CommentThread";
import "react-diff-view/style/index.css";

interface DiffViewerProps {
	rawDiff: string;
	viewType: ViewType;
	comments: ReviewComment[];
	activeCommentLocation: { filePath: string; line: number } | null;
	onGutterClick: (filePath: string, line: number, anchorSnippet: string) => void;
	onSubmitComment: (content: string) => void;
	onCancelComment: () => void;
	onResolveComment?: (id: string) => void;
	onDeleteComment?: (id: string) => void;
	selectedFile: string | null;
	isViewed?: (path: string) => boolean;
	onToggleViewed?: (path: string) => void;
	sessionId?: string;
}

function getFilePath(file: FileData): string {
	return file.newPath === "/dev/null" ? file.oldPath : file.newPath;
}

/** Parse a unified diff and deduplicate entries that share the same file path. */
function parseDiffDeduped(raw: string): FileData[] {
	const parsed = parseDiff(raw, { nearbySequences: "zip" });
	const byPath = new Map<string, FileData>();
	for (const file of parsed) {
		const path = getFilePath(file);
		const existing = byPath.get(path);
		if (existing) {
			existing.hunks = [...existing.hunks, ...file.hunks];
		} else {
			byPath.set(path, { ...file });
		}
	}
	return Array.from(byPath.values());
}

/** Extract ~3 lines of context around a change for comment anchoring. */
function getAnchorSnippet(hunk: HunkData, changeIndex: number): string {
	const changes = hunk.changes;
	const start = Math.max(0, changeIndex - 1);
	const end = Math.min(changes.length, changeIndex + 2);
	return changes
		.slice(start, end)
		.map((c) => c.content)
		.join("\n");
}

function findChangeIndexByNewLine(hunks: HunkData[], line: number): { hunk: HunkData; index: number } | null {
	for (const hunk of hunks) {
		for (let i = 0; i < hunk.changes.length; i++) {
			const change = hunk.changes[i];
			const newLine = change.type === "normal" ? change.newLineNumber : change.type === "insert" ? change.lineNumber : null;
			if (newLine === line) {
				return { hunk, index: i };
			}
		}
	}
	return null;
}

/** Build "normal" change entries from raw file lines for expanding context. */
function buildNormalChanges(lines: string[], startLine: number, count: number): ChangeData[] {
	const changes: ChangeData[] = [];
	for (let i = 0; i < count; i++) {
		const lineNum = startLine + i;
		if (lineNum < 1 || lineNum > lines.length) continue;
		changes.push({
			type: "normal",
			isNormal: true,
			oldLineNumber: lineNum,
			newLineNumber: lineNum,
			content: lines[lineNum - 1] ?? "",
		} as ChangeData);
	}
	return changes;
}

const EXPAND_STEP = 20;

const FileDiff = memo(function FileDiff({
	file,
	viewType,
	comments,
	activeCommentLocation,
	onGutterClick,
	onSubmitComment,
	onCancelComment,
	onResolveComment,
	onDeleteComment,
	isViewed,
	onToggleViewed,
	sessionId,
}: {
	file: FileData;
	viewType: ViewType;
	comments: ReviewComment[];
	activeCommentLocation: { filePath: string; line: number } | null;
	onGutterClick: (filePath: string, line: number, anchorSnippet: string) => void;
	onSubmitComment: (content: string) => void;
	onCancelComment: () => void;
	onResolveComment?: (id: string) => void;
	onDeleteComment?: (id: string) => void;
	isViewed?: boolean;
	onToggleViewed?: () => void;
	sessionId?: string;
}) {
	const filePath = getFilePath(file);

	// File lines cache for expanding context
	const [fileLines, setFileLines] = useState<string[] | null>(null);
	const [expandedHunks, setExpandedHunks] = useState<HunkData[]>(file.hunks);

	// Reset expanded hunks when the file changes
	useEffect(() => { setExpandedHunks(file.hunks); }, [file.hunks]);

	const fetchFileLines = useCallback(async () => {
		if (fileLines || !sessionId) return fileLines;
		try {
			const res = await fetch(`/api/review/${encodeURIComponent(sessionId)}/file?path=${encodeURIComponent(filePath)}`);
			if (!res.ok) return null;
			const { lines } = await res.json();
			setFileLines(lines);
			return lines as string[];
		} catch { return null; }
	}, [fileLines, sessionId, filePath]);

	const expandUp = useCallback(async (hunkIndex: number) => {
		const lines = await fetchFileLines();
		if (!lines) return;
		setExpandedHunks((prev) => {
			const hunks = prev.map((h) => ({ ...h, changes: [...h.changes] }));
			const hunk = hunks[hunkIndex];
			const firstChange = hunk.changes[0];
			const firstLine = firstChange?.type === "normal" ? firstChange.oldLineNumber
				: firstChange?.type === "delete" ? firstChange.lineNumber : 1;
			const prevHunk = hunkIndex > 0 ? hunks[hunkIndex - 1] : null;
			const prevLastChange = prevHunk?.changes[prevHunk.changes.length - 1];
			const prevLastLine = prevLastChange?.type === "normal" ? prevLastChange.oldLineNumber
				: prevLastChange?.type === "insert" ? prevLastChange.lineNumber : 0;
			const gapStart = prevLastLine + 1;
			const gapEnd = firstLine - 1;
			const expandFrom = Math.max(gapStart, gapEnd - EXPAND_STEP + 1);
			const newChanges = buildNormalChanges(lines, expandFrom, gapEnd - expandFrom + 1);
			hunk.changes = [...newChanges, ...hunk.changes];
			hunk.oldStart = expandFrom;
			hunk.newStart = expandFrom;
			return hunks;
		});
	}, [fetchFileLines]);

	const expandDown = useCallback(async (hunkIndex: number) => {
		const lines = await fetchFileLines();
		if (!lines) return;
		setExpandedHunks((prev) => {
			const hunks = prev.map((h) => ({ ...h, changes: [...h.changes] }));
			const hunk = hunks[hunkIndex];
			const lastChange = hunk.changes[hunk.changes.length - 1];
			const lastLine = lastChange?.type === "normal" ? lastChange.oldLineNumber
				: lastChange?.type === "insert" ? lastChange.lineNumber : 0;
			const nextHunk = hunkIndex < hunks.length - 1 ? hunks[hunkIndex + 1] : null;
			const nextFirstChange = nextHunk?.changes[0];
			const nextFirstLine = nextFirstChange?.type === "normal" ? nextFirstChange.oldLineNumber
				: nextFirstChange?.type === "delete" ? nextFirstChange.lineNumber : lines.length + 1;
			const gapStart = lastLine + 1;
			const gapEnd = Math.min(nextFirstLine - 1, lines.length);
			const expandTo = Math.min(gapEnd, gapStart + EXPAND_STEP - 1);
			const newChanges = buildNormalChanges(lines, gapStart, expandTo - gapStart + 1);
			hunk.changes = [...hunk.changes, ...newChanges];
			return hunks;
		});
	}, [fetchFileLines]);
	const fileComments = useMemo(() => comments.filter((c) => c.filePath === filePath), [comments, filePath]);
	const fileRef = useRef<HTMLDivElement>(null);

	// Build widgets map: changeKey → ReactNode for inline comments
	const widgets = useMemo(() => {
		const w: Record<string, React.ReactNode> = {};

		// Group comments by line
		const commentsByLine = new Map<number, ReviewComment[]>();
		for (const c of fileComments) {
			const existing = commentsByLine.get(c.line) ?? [];
			existing.push(c);
			commentsByLine.set(c.line, existing);
		}

		// For each line with comments, find the corresponding change and add a widget
		for (const [line, lineComments] of commentsByLine) {
			const result = findChangeIndexByNewLine(file.hunks, line);
			if (result) {
				const key = getChangeKey(result.hunk.changes[result.index]);
				const isAdding = activeCommentLocation?.filePath === filePath && activeCommentLocation?.line === line;
				w[key] = (
					<CommentThread
						comments={lineComments}
						isAddingComment={isAdding}
						onSubmitComment={onSubmitComment}
						onCancelComment={onCancelComment}
						onResolveComment={onResolveComment}
						onDeleteComment={onDeleteComment}
					/>
				);
			}
		}

		// Handle the case where we're adding a new comment on a line that has no comments yet
		if (activeCommentLocation?.filePath === filePath) {
			const hasExistingWidget = fileComments.some((c) => c.line === activeCommentLocation.line);
			if (!hasExistingWidget) {
				const result = findChangeIndexByNewLine(file.hunks, activeCommentLocation.line);
				if (result) {
					const key = getChangeKey(result.hunk.changes[result.index]);
					w[key] = (
						<CommentThread
							comments={[]}
							isAddingComment={true}
							onSubmitComment={onSubmitComment}
							onCancelComment={onCancelComment}
						/>
					);
				}
			}
		}

		return w;
	}, [fileComments, activeCommentLocation, filePath, file.hunks, onSubmitComment, onCancelComment, onResolveComment, onDeleteComment]);

	const handleGutterClick = useCallback(
		({ change }: { change: ChangeData | null }) => {
			if (!change) return;
			const newLine =
				change.type === "normal" ? change.newLineNumber : change.type === "insert" ? change.lineNumber : null;
			if (newLine === null) return;

			const result = findChangeIndexByNewLine(file.hunks, newLine);
			const snippet = result ? getAnchorSnippet(result.hunk, result.index) : "";
			onGutterClick(filePath, newLine, snippet);
		},
		[file.hunks, filePath, onGutterClick],
	);

	const renderGutter = useCallback(
		({ change, side, renderDefault }: GutterOptions) => {
			if (side === "new" || (viewType === "unified" && change.type !== "delete")) {
				return (
					<span className="cursor-pointer hover:bg-violet-500/20 rounded px-0.5" title="Add comment">
						{renderDefault()}
					</span>
				);
			}
			return renderDefault();
		},
		[viewType],
	);

	const gutterEvents = useMemo(() => ({ onClick: handleGutterClick }), [handleGutterClick]);

	return (
		<div ref={fileRef} id={`file-${filePath}`} className="mb-4 mx-4 first:mt-3">
			{/* File header */}
			<div className="sticky top-0 z-20 px-3 py-1.5 bg-[#0a0a0f] border border-zinc-800/50 rounded-t-lg flex items-center gap-2">
				<span
					className={`text-[10px] font-bold shrink-0 ${
						file.type === "add" ? "text-emerald-400" : file.type === "delete" ? "text-red-400" : "text-amber-400"
					}`}
				>
					{file.type === "add" ? "NEW" : file.type === "delete" ? "DEL" : "MOD"}
				</span>
				<span
					className="text-xs text-zinc-300 font-mono cursor-pointer hover:text-zinc-100 transition-colors flex-1"
					onClick={() => navigator.clipboard.writeText(filePath)}
					title="Click to copy path"
				>{filePath}</span>
				{onToggleViewed && (
					<button
						onClick={onToggleViewed}
						className={`shrink-0 flex items-center gap-1 px-2 py-0.5 rounded text-[10px] border transition-colors ${
							isViewed
								? "border-emerald-500/30 text-emerald-400 bg-emerald-500/10"
								: "border-zinc-700 text-zinc-500 hover:text-zinc-300 hover:border-zinc-600"
						}`}
					>
						<svg className="w-3 h-3" fill={isViewed ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
						</svg>
						Viewed
					</button>
				)}
			</div>

			{/* Diff content — collapse when viewed */}
			{!isViewed && <div className="border border-t-0 border-zinc-800/50 rounded-b-lg diff-viewer-container" style={{ clipPath: "inset(0 round 0 0 0.5rem 0.5rem)" }}>
				{expandedHunks.length > 0 ? (
					<Diff
						viewType={viewType}
						diffType={file.type}
						hunks={expandedHunks}
						widgets={widgets}
						renderGutter={renderGutter}
						gutterEvents={gutterEvents}
					>
						{(hunks: HunkData[]) =>
							hunks.flatMap((hunk, idx) => {
								const hunkIdx = expandedHunks.indexOf(hunk);
								const firstChange = hunk.changes[0];
								const firstLine = firstChange?.type === "normal" ? firstChange.oldLineNumber
									: firstChange?.type === "delete" ? firstChange.lineNumber : 1;

								// Check gap above: between previous hunk's last line and this hunk's first line
								const prevHunk = idx > 0 ? hunks[idx - 1] : null;
								const prevLast = prevHunk?.changes[prevHunk.changes.length - 1];
								const prevLastLine = prevLast?.type === "normal" ? prevLast.oldLineNumber
									: prevLast?.type === "insert" ? prevLast.lineNumber : 0;
								const canExpandUp = sessionId && (prevHunk ? firstLine > prevLastLine + 1 : firstLine > 1);

								const lastChange = hunk.changes[hunk.changes.length - 1];
								const lastLine = lastChange?.type === "normal" ? lastChange.oldLineNumber
									: lastChange?.type === "insert" ? lastChange.lineNumber : 0;

								// Check gap below: between this hunk's last line and next hunk's first line (or EOF)
								const nextHunk = idx < hunks.length - 1 ? hunks[idx + 1] : null;
								const nextFirst = nextHunk?.changes[0];
								const nextFirstLine = nextFirst?.type === "normal" ? nextFirst.oldLineNumber
									: nextFirst?.type === "delete" ? nextFirst.lineNumber : null;
								const canExpandDown = sessionId && (
									nextFirstLine ? lastLine < nextFirstLine - 1
									: fileLines ? lastLine < fileLines.length : lastLine > 0
								);

								// Show hunk header only if there's a gap above it that can be expanded
								const showHeader = canExpandUp;

								return [
									...(showHeader ? [
										<Decoration key={`decoration-${hunk.content}`}>
											<div className="px-3 py-0.5 bg-blue-500/5 text-[10px] text-blue-400 font-mono border-y border-blue-500/10 flex items-center justify-between">
												<span>{hunk.content}</span>
												{canExpandUp && (
													<button
														onClick={() => expandUp(hunkIdx)}
														className="text-zinc-500 hover:text-blue-400 transition-colors px-1"
														title={`Show ${EXPAND_STEP} more lines above`}
													>
														↑ Expand
													</button>
												)}
											</div>
										</Decoration>,
									] : []),
									<Hunk key={hunk.content} hunk={hunk} />,
									...(canExpandDown ? [
										<Decoration key={`expand-down-${hunk.content}`}>
											<div className="flex justify-center py-0.5 bg-blue-500/5 border-y border-blue-500/10">
												<button
													onClick={() => expandDown(hunkIdx)}
													className="text-[10px] text-zinc-500 hover:text-blue-400 transition-colors px-2"
													title={`Show ${EXPAND_STEP} more lines below`}
												>
													↓ Expand
												</button>
											</div>
										</Decoration>,
									] : []),
								];
							})
						}
					</Diff>
				) : (
					<div className="px-4 py-3 text-xs text-zinc-600">Binary file or empty diff</div>
				)}
			</div>}
		</div>
	);
});

/** Only mount FileDiff when the placeholder scrolls into view. */
function LazyFileDiff(props: {
	file: FileData;
	viewType: ViewType;
	comments: ReviewComment[];
	activeCommentLocation: { filePath: string; line: number } | null;
	onGutterClick: (filePath: string, line: number, anchorSnippet: string) => void;
	onSubmitComment: (content: string) => void;
	onCancelComment: () => void;
	onResolveComment?: (id: string) => void;
	onDeleteComment?: (id: string) => void;
	isViewed?: boolean;
	onToggleViewed?: () => void;
	sessionId?: string;
}) {
	const [visible, setVisible] = useState(false);
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new IntersectionObserver(
			([entry]) => { if (entry.isIntersecting) { setVisible(true); observer.disconnect(); } },
			{ rootMargin: "200px" },
		);
		observer.observe(el);
		return () => observer.disconnect();
	}, []);

	if (!visible) {
		const lineCount = props.file.hunks.reduce((n, h) => n + h.changes.length, 0);
		return <div ref={ref} style={{ minHeight: Math.max(60, lineCount * 20) }} className="mb-4 mx-4" />;
	}

	return <FileDiff {...props} />;
}

export const DiffViewer = memo(function DiffViewer({
	rawDiff,
	viewType,
	comments,
	activeCommentLocation,
	onGutterClick,
	onSubmitComment,
	onCancelComment,
	onResolveComment,
	onDeleteComment,
	selectedFile,
	isViewed,
	onToggleViewed,
	sessionId,
}: DiffViewerProps) {
	const files = useMemo(() => {
		if (!rawDiff) return [];
		try {
			return parseDiffDeduped(rawDiff);
		} catch (e) {
			console.error("Failed to parse diff:", e);
			return [];
		}
	}, [rawDiff]);

	if (files.length === 0) {
		return (
			<div className="flex-1 flex items-center justify-center text-zinc-600 text-sm">
				No changes to review
			</div>
		);
	}

	// If a file is selected, only show that file (no lazy wrapper needed)
	if (selectedFile) {
		const file = files.find((f) => getFilePath(f) === selectedFile);
		if (!file) return null;
		return (
			<div className="flex-1 overflow-y-auto">
				<FileDiff
					key={getFilePath(file)}
					file={file}
					viewType={viewType}
					comments={comments}
					activeCommentLocation={activeCommentLocation}
					onGutterClick={onGutterClick}
					onSubmitComment={onSubmitComment}
					onCancelComment={onCancelComment}
					onResolveComment={onResolveComment}
					onDeleteComment={onDeleteComment}
					isViewed={isViewed?.(selectedFile) ?? false}
					onToggleViewed={onToggleViewed ? () => onToggleViewed(selectedFile!) : undefined}
				sessionId={sessionId}
				/>
			</div>
		);
	}

	// All files: lazy-render so only visible diffs mount
	return (
		<div className="flex-1 overflow-y-auto">
			{files.map((file) => {
				const fp = getFilePath(file);
				return (
				<LazyFileDiff
					key={fp}
					file={file}
					viewType={viewType}
					comments={comments}
					activeCommentLocation={activeCommentLocation}
					onGutterClick={onGutterClick}
					onSubmitComment={onSubmitComment}
					onCancelComment={onCancelComment}
					onResolveComment={onResolveComment}
					onDeleteComment={onDeleteComment}
					isViewed={isViewed?.(fp) ?? false}
					onToggleViewed={onToggleViewed ? () => onToggleViewed(fp) : undefined}
				sessionId={sessionId}
				/>
				);
			})}
		</div>
	);
});

/** Re-export for the page to build the file list. */
export { parseDiffDeduped as parseDiff, getFilePath };
