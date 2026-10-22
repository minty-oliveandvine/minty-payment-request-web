const DB_NAME = "payment-request-attachments";
const STORE = "by-request-id";
const VERSION = 1;

type StoredFile = { name: string; type: string; buffer: ArrayBuffer };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () =>
      reject(req.error ?? new Error("I couldn't get to your saved attachments just now."));
  });
}

export function uniquifyFileName(original: string, used: Set<string>): string {
  if (!used.has(original)) return original;
  const lastDot = original.lastIndexOf(".");
  const base = lastDot > 0 ? original.slice(0, lastDot) : original;
  const ext = lastDot > 0 ? original.slice(lastDot) : "";
  let n = 1;
  for (;;) {
    const candidate = `${base} (${n})${ext}`;
    if (!used.has(candidate)) return candidate;
    n += 1;
  }
}

export async function appendAttachmentBlobs(requestId: string, files: File[]): Promise<void> {
  if (files.length === 0) return;
  const existingLoaded = await loadAttachmentBlobs(requestId);
  const usedNames = new Set(existingLoaded.map((x) => x.name));
  const existingStored: StoredFile[] = await Promise.all(
    existingLoaded.map(async (x) => ({
      name: x.name,
      type: x.type,
      buffer: await x.blob.arrayBuffer(),
    })),
  );
  const added: StoredFile[] = await Promise.all(
    files.map(async (f) => {
      const name = uniquifyFileName(f.name.trim() || "attachment", usedNames);
      usedNames.add(name);
      return {
        name,
        type: f.type || "application/octet-stream",
        buffer: await f.arrayBuffer(),
      };
    }),
  );
  const merged = [...existingStored, ...added];
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({ files: merged }, requestId);
    });
  } finally {
    db.close();
  }
}

/** Persist uploaded files for a payment request id so the details page can preview after navigation. */
export async function saveAttachmentBlobs(requestId: string, files: File[]): Promise<void> {
  const db = await openDb();
  try {
    if (files.length === 0) {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, "readwrite");
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
        tx.objectStore(STORE).delete(requestId);
      });
      return;
    }
    const stored: StoredFile[] = await Promise.all(
      files.map(async (f) => ({
        name: f.name,
        type: f.type || "application/octet-stream",
        buffer: await f.arrayBuffer(),
      })),
    );
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({ files: stored }, requestId);
    });
  } finally {
    db.close();
  }
}

export type LoadedAttachmentBlob = { name: string; type: string; blob: Blob };

export async function loadAttachmentBlobs(requestId: string): Promise<LoadedAttachmentBlob[]> {
  const db = await openDb();
  try {
    const record = await new Promise<{ files: StoredFile[] } | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(requestId);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    if (!record?.files?.length) return [];
    return record.files.map((f) => ({
      name: f.name,
      type: f.type,
      blob: new Blob([f.buffer], { type: f.type }),
    }));
  } finally {
    db.close();
  }
}

export async function replaceAttachmentBlobsFromPreviewItems(
  requestId: string,
  items: Array<{ url: string; name: string; mime: string }>,
): Promise<void> {
  if (items.length === 0) {
    await saveAttachmentBlobs(requestId, []);
    return;
  }
  const stored: StoredFile[] = await Promise.all(
    items.map(async (item) => {
      // Only fetch blob: or data: URLs. Remote pre-signed URLs (e.g. Backblaze B2)
      // cannot be fetched cross-origin — callers must filter to local URLs before
      // calling this function (see hasLocalBlobs guard in PaymentRequestDetailBody).
      if (!item.url.startsWith("blob:") && !item.url.startsWith("data:")) {
        throw new Error(
          `replaceAttachmentBlobsFromPreviewItems: refusing to fetch remote URL "${item.url.slice(0, 60)}…" (CORS not allowed). Only pass blob: or data: URLs.`,
        );
      }
      const res = await fetch(item.url);
      const buffer = await res.arrayBuffer();
      return {
        name: item.name,
        type: item.mime || "application/octet-stream",
        buffer,
      };
    }),
  );
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.objectStore(STORE).put({ files: stored }, requestId);
    });
  } finally {
    db.close();
  }
}

export async function removeAttachmentBlobs(
  requestId: string,
  namesToRemove: string[],
): Promise<void> {
  if (namesToRemove.length === 0) return;
  const remove = new Set(namesToRemove);
  const db = await openDb();
  try {
    const record = await new Promise<{ files: StoredFile[] } | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const r = tx.objectStore(STORE).get(requestId);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
    const existing = record?.files ?? [];
    const next = existing.filter((f) => !remove.has(f.name));
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      if (next.length === 0) tx.objectStore(STORE).delete(requestId);
      else tx.objectStore(STORE).put({ files: next }, requestId);
    });
  } finally {
    db.close();
  }
}
