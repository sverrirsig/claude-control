import { useCallback, useState } from "react";

const STORAGE_KEY = "review-viewed-files";

function loadViewed(sessionId: string): Set<string> {
	try {
		const raw = localStorage.getItem(`${STORAGE_KEY}:${sessionId}`);
		return raw ? new Set(JSON.parse(raw)) : new Set();
	} catch {
		return new Set();
	}
}

function saveViewed(sessionId: string, viewed: Set<string>) {
	localStorage.setItem(`${STORAGE_KEY}:${sessionId}`, JSON.stringify([...viewed]));
}

export function useViewedFiles(sessionId: string) {
	const [viewed, setViewed] = useState<Set<string>>(() => loadViewed(sessionId));

	const toggleViewed = useCallback((filePath: string) => {
		setViewed((prev) => {
			const next = new Set(prev);
			if (next.has(filePath)) next.delete(filePath);
			else next.add(filePath);
			saveViewed(sessionId, next);
			return next;
		});
	}, [sessionId]);

	const isViewed = useCallback((filePath: string) => viewed.has(filePath), [viewed]);

	return { viewed, viewedCount: viewed.size, toggleViewed, isViewed };
}
