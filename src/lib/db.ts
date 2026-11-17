import type { Capture } from "../types";

const DB_NAME = "smile-studio";
const DB_VERSION = 1;
const CAPTURE_STORE = "captures";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CAPTURE_STORE)) {
        const store = db.createObjectStore(CAPTURE_STORE, { keyPath: "id" });
        store.createIndex("createdAt", "createdAt");
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local storage"));
  });

  return dbPromise;
}

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Local storage error"));
  });
}

export async function saveCapture(capture: Capture): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(CAPTURE_STORE, "readwrite");
  tx.objectStore(CAPTURE_STORE).put(capture);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save photo"));
  });
}

export async function listCaptures(): Promise<Capture[]> {
  const db = await openDatabase();
  const tx = db.transaction(CAPTURE_STORE, "readonly");
  const rows = await requestToPromise(tx.objectStore(CAPTURE_STORE).getAll());
  return (rows as Capture[]).sort((a, b) => b.createdAt - a.createdAt);
}

export async function deleteCapture(id: string): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(CAPTURE_STORE, "readwrite");
  tx.objectStore(CAPTURE_STORE).delete(id);
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not delete photo"));
  });
}

export async function clearCaptures(): Promise<void> {
  const db = await openDatabase();
  const tx = db.transaction(CAPTURE_STORE, "readwrite");
  tx.objectStore(CAPTURE_STORE).clear();
  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not clear the gallery"));
  });
}

/** Ask the browser to keep our photos around instead of evicting them. */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
