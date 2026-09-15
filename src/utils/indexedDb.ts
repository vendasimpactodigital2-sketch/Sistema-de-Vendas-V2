const DB_NAME = "NexVoltDb";
const STORE_NAME = "heavy_cache";
const DB_VERSION = 1;

export function getIndexedDbItem<T>(key: string): Promise<T | null> {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        resolve(null);
        return;
      }
      try {
        const transaction = db.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const getReq = store.get(key);
        getReq.onsuccess = () => {
          resolve(getReq.result || null);
        };
        getReq.onerror = () => resolve(null);
      } catch (err) {
        resolve(null);
      }
    };
    request.onerror = () => resolve(null);
  });
}

export function setIndexedDbItem<T>(key: string, value: T): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      try {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const putReq = store.put(value, key);
        putReq.onsuccess = () => resolve(true);
        putReq.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    };
    request.onerror = () => resolve(false);
  });
}

export function removeIndexedDbItem(key: string): Promise<boolean> {
  return new Promise((resolve) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onsuccess = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        resolve(true);
        return;
      }
      try {
        const transaction = db.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        const delReq = store.delete(key);
        delReq.onsuccess = () => resolve(true);
        delReq.onerror = () => resolve(false);
      } catch (err) {
        resolve(false);
      }
    };
    request.onerror = () => resolve(false);
  });
}
