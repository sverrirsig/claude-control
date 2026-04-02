"use client";

import { memo } from "react";
import type { FileData } from "react-diff-view";

interface FileTreeProps {
	files: FileData[];
	selectedFile: string | null;
	commentCounts: Record<string, number>;
	onSelectFile: (path: string | null) => void;
	onCollapse?: () => void;
	isViewed?: (path: string) => boolean;
	onToggleViewed?: (path: string) => void;
	viewedCount?: number;
	totalFiles?: number;
}

function fileStatus(type: string): { label: string; color: string } {
	switch (type) {
		case "add":
			return { label: "A", color: "text-emerald-400" };
		case "delete":
			return { label: "D", color: "text-red-400" };
		case "rename":
			return { label: "R", color: "text-blue-400" };
		case "copy":
			return { label: "C", color: "text-blue-400" };
		default:
			return { label: "M", color: "text-amber-400" };
	}
}

function countChanges(file: FileData): { additions: number; deletions: number } {
	let additions = 0;
	let deletions = 0;
	for (const hunk of file.hunks) {
		for (const change of hunk.changes) {
			if (change.type === "insert") additions++;
			else if (change.type === "delete") deletions++;
		}
	}
	return { additions, deletions };
}

export const FileTree = memo(function FileTree({ files, selectedFile, commentCounts, onSelectFile, onCollapse, isViewed, onToggleViewed, viewedCount, totalFiles }: FileTreeProps) {
	return (
		<div className="flex flex-col h-full">
			<div className="px-3 py-2 border-b border-zinc-800/50 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h2 className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
						Files ({files.length})
					</h2>
					{viewedCount != null && totalFiles != null && totalFiles > 0 && (
						<span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
							viewedCount === totalFiles
								? "bg-emerald-500/15 text-emerald-400"
								: "bg-zinc-700/50 text-zinc-500"
						}`}>
							{viewedCount}/{totalFiles}
						</span>
					)}
				</div>
				{onCollapse && (
					<button onClick={onCollapse} className="text-zinc-600 hover:text-zinc-300 transition-colors p-0.5" title="Hide files">
						<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
							<path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
						</svg>
					</button>
				)}
			</div>
			<div className="flex-1 overflow-y-auto py-1">
				{files.map((file) => {
					const filePath = file.newPath === "/dev/null" ? file.oldPath : file.newPath;
					const { label, color } = fileStatus(file.type);
					const { additions, deletions } = countChanges(file);
					const comments = commentCounts[filePath] ?? 0;
					const isSelected = selectedFile === filePath;
					const viewed = isViewed?.(filePath) ?? false;

					return (
						<div
							key={filePath}
							className={`w-full flex items-center gap-1 text-xs hover:bg-white/5 transition-colors ${
								isSelected ? "bg-white/8 border-l-2 border-violet-500" : "border-l-2 border-transparent"
							} ${viewed ? "opacity-50" : ""}`}
						>
							{onToggleViewed && (
								<button
									onClick={(e) => { e.stopPropagation(); onToggleViewed(filePath); }}
									className="pl-2 py-1.5 text-zinc-600 hover:text-emerald-400 transition-colors shrink-0"
									title={viewed ? "Mark as unviewed" : "Mark as viewed"}
								>
									<svg className="w-3.5 h-3.5" fill={viewed ? "currentColor" : "none"} viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
										{viewed
											? <path d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
											: <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
										}
									</svg>
								</button>
							)}
							<button
								onClick={() => onSelectFile(isSelected ? null : filePath)}
								className={`flex-1 text-left ${onToggleViewed ? "pl-0" : "pl-3"} pr-3 py-1.5 flex items-center gap-2 min-w-0`}
							>
								<span className={`font-mono font-bold text-[10px] w-3 shrink-0 ${color}`}>{label}</span>
								<span className="truncate flex-1 text-zinc-300" title={filePath}>
									{filePath.split("/").pop()}
								</span>
								<span className="flex items-center gap-1 shrink-0">
									{additions > 0 && <span className="text-emerald-500 text-[10px]">+{additions}</span>}
									{deletions > 0 && <span className="text-red-500 text-[10px]">-{deletions}</span>}
									{comments > 0 && (
										<span className="ml-1 bg-violet-500/20 text-violet-300 rounded-full px-1.5 text-[10px]">
											{comments}
										</span>
									)}
								</span>
							</button>
						</div>
					);
				})}
			</div>
		</div>
	);
});
