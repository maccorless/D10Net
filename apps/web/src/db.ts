export const DB_NAME = "daily-top-ten";
export const DB_VERSION = 3;

export function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("games")) db.createObjectStore("games");
      if (!db.objectStoreNames.contains("finishQueue"))
        db.createObjectStore("finishQueue");
      if (!db.objectStoreNames.contains("issuedGames"))
        db.createObjectStore("issuedGames");
      if (!db.objectStoreNames.contains("achievements"))
        db.createObjectStore("achievements");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function read<T>(
  store: string,
  key: string,
): Promise<T | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export async function write(
  store: string,
  key: string,
  value: unknown,
): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(store, "readwrite")
      .objectStore(store)
      .put(value, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getAll<T>(store: string): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(store).objectStore(store).getAll();
    request.onsuccess = () => resolve(request.result as T[]);
    request.onerror = () => reject(request.error);
  });
}

export async function remove(store: string, key: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const request = db
      .transaction(store, "readwrite")
      .objectStore(store)
      .delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}
