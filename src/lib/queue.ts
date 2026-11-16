// The batch queue as pure data + transitions.
//
// The UI owns the actual files and blobs; this module owns the bookkeeping —
// which items exist, what state each is in, and what runs next — as immutable
// updates that are trivial to test. One item failing never changes the state
// of any other item: a bad photo must not kill the batch.

export type BatchItemStatus = "queued" | "processing" | "done" | "error";

export interface BatchItem {
  id: string;
  /** Original file name, used for the output name and the zip manifest. */
  name: string;
  status: BatchItemStatus;
  /** Human-readable failure reason when status is "error". */
  error: string | null;
}

export function createItem(id: string, name: string): BatchItem {
  return { id, name, status: "queued", error: null };
}

/** Return a copy of the list with one item patched. Unknown ids are ignored. */
export function updateItem<T extends BatchItem>(
  items: readonly T[],
  id: string,
  patch: Partial<Omit<T, "id">>,
): T[] {
  return items.map((item) => (item.id === id ? { ...item, ...patch } : item));
}

/** The next item waiting to be processed, or null when the queue is drained. */
export function nextQueued<T extends BatchItem>(items: readonly T[]): T | null {
  return items.find((item) => item.status === "queued") ?? null;
}

export interface QueueSummary {
  total: number;
  queued: number;
  processing: number;
  done: number;
  failed: number;
  /** True once nothing is queued or processing. */
  finished: boolean;
}

export function summarize(items: readonly BatchItem[]): QueueSummary {
  const summary: QueueSummary = {
    total: items.length,
    queued: 0,
    processing: 0,
    done: 0,
    failed: 0,
    finished: false,
  };
  for (const item of items) {
    if (item.status === "queued") summary.queued++;
    else if (item.status === "processing") summary.processing++;
    else if (item.status === "done") summary.done++;
    else summary.failed++;
  }
  summary.finished = summary.queued === 0 && summary.processing === 0;
  return summary;
}

/** Re-queue a single failed item (the "retry" button), clearing its error. */
export function requeue<T extends BatchItem>(items: readonly T[], id: string): T[] {
  return items.map((item) =>
    item.id === id && item.status === "error"
      ? { ...item, status: "queued" as const, error: null }
      : item,
  );
}
