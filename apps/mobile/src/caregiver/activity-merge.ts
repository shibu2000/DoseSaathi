export interface FeedItem {
  eventId: string;
  actionTimestamp: string;
}

export interface FeedPage<T extends FeedItem> {
  items: T[];
  /** null = no more pages; string = more available */
  nextCursor: string | null;
}

/**
 * Merges several newest-first feeds into one newest-first list without ever showing a gap.
 * A feed that still has more pages may hold events older than what we loaded from it, so anything
 * older than the *newest* "oldest loaded" timestamp among unfinished feeds is held back until
 * the user loads more.
 */
export function mergeFeeds<T extends FeedItem>(pages: Array<FeedPage<T>>): { items: T[]; hasMore: boolean; heldBack: number } {
  const seen = new Set<string>();
  const all: T[] = [];
  for (const p of pages) {
    for (const it of p.items) {
      if (seen.has(it.eventId)) continue;
      seen.add(it.eventId);
      all.push(it);
    }
  }
  all.sort((a, b) => (a.actionTimestamp < b.actionTimestamp ? 1 : a.actionTimestamp > b.actionTimestamp ? -1 : 0));

  const unfinished = pages.filter((p) => p.nextCursor);
  let cutoff: string | null = null;
  for (const p of unfinished) {
    const oldest = p.items[p.items.length - 1]?.actionTimestamp;
    // An unfinished feed with no items gives no bound; ignore it
    if (oldest && (cutoff === null || oldest > cutoff)) cutoff = oldest;
  }
  const visible = cutoff === null ? all : all.filter((i) => i.actionTimestamp >= cutoff!);
  return { items: visible, hasMore: unfinished.length > 0, heldBack: all.length - visible.length };
}
