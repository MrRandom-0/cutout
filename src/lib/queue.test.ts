import { describe, expect, it } from "vitest";
import { createItem, nextQueued, requeue, summarize, updateItem } from "./queue";

describe("createItem / updateItem", () => {
  it("creates queued items and patches them immutably", () => {
    const items = [createItem("1", "a.jpg"), createItem("2", "b.jpg")];
    const updated = updateItem(items, "1", { status: "processing" });
    expect(updated[0].status).toBe("processing");
    expect(updated[1].status).toBe("queued");
    // The original list is untouched.
    expect(items[0].status).toBe("queued");
  });

  it("ignores unknown ids", () => {
    const items = [createItem("1", "a.jpg")];
    expect(updateItem(items, "zzz", { status: "done" })[0].status).toBe("queued");
  });
});

describe("nextQueued", () => {
  it("returns the first queued item, skipping finished ones", () => {
    const items = [
      { ...createItem("1", "a.jpg"), status: "done" as const },
      { ...createItem("2", "b.jpg"), status: "error" as const, error: "boom" },
      createItem("3", "c.jpg"),
    ];
    expect(nextQueued(items)?.id).toBe("3");
  });

  it("returns null when nothing is queued", () => {
    expect(nextQueued([{ ...createItem("1", "a.jpg"), status: "done" as const }])).toBeNull();
    expect(nextQueued([])).toBeNull();
  });
});

describe("summarize", () => {
  it("counts every state and knows when the queue is finished", () => {
    const items = [
      createItem("1", "a.jpg"),
      { ...createItem("2", "b.jpg"), status: "done" as const },
      { ...createItem("3", "c.jpg"), status: "error" as const, error: "x" },
      { ...createItem("4", "d.jpg"), status: "processing" as const },
    ];
    const summary = summarize(items);
    expect(summary).toEqual({
      total: 4,
      queued: 1,
      processing: 1,
      done: 1,
      failed: 1,
      finished: false,
    });
    expect(summarize([items[1], items[2]]).finished).toBe(true);
  });
});

describe("requeue", () => {
  it("moves a failed item back to queued and clears its error", () => {
    const items = [{ ...createItem("1", "a.jpg"), status: "error" as const, error: "bad file" }];
    const out = requeue(items, "1");
    expect(out[0].status).toBe("queued");
    expect(out[0].error).toBeNull();
  });

  it("does not touch items that are not failed", () => {
    const items = [{ ...createItem("1", "a.jpg"), status: "done" as const }];
    expect(requeue(items, "1")[0].status).toBe("done");
  });
});
