import { Injectable } from '@angular/core';

export interface PdfFileRecord {
  id: string;
  classId: string;
  name: string;
  size: number;
  type: string;
  uploadedAt: number;
  blob: Blob;
}

const DB_NAME = 'classlab-files';
const DB_VERSION = 1;
const STORE_NAME = 'pdfs';

@Injectable({ providedIn: 'root' })
export class PdfStoreService {
  private dbPromise?: Promise<IDBDatabase>;

  async list(classId: string): Promise<PdfFileRecord[]> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).index('classId').getAll(classId);
      request.onsuccess = () => {
        const records = (request.result as PdfFileRecord[]).sort(
          (a, b) => a.uploadedAt - b.uploadedAt,
        );
        resolve(records);
      };
      request.onerror = () =>
        reject(request.error ?? new Error('No pudimos leer los PDFs guardados.'));
    });
  }

  async get(id: string): Promise<PdfFileRecord | null> {
    const db = await this.openDb();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const request = transaction.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => resolve((request.result as PdfFileRecord | undefined) ?? null);
      request.onerror = () =>
        reject(request.error ?? new Error('No pudimos leer el PDF guardado.'));
    });
  }

  async add(classId: string, file: File): Promise<PdfFileRecord> {
    const record: PdfFileRecord = {
      id: crypto.randomUUID(),
      classId,
      name: file.name,
      size: file.size,
      type: file.type,
      uploadedAt: Date.now(),
      blob: file,
    };
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).put(record);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('No pudimos guardar el PDF.'));
    });
    return record;
  }

  async remove(id: string): Promise<void> {
    const db = await this.openDb();
    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error('No pudimos quitar el PDF.'));
    });
  }

  private openDb(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
            store.createIndex('classId', 'classId', { unique: false });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () =>
          reject(request.error ?? new Error('No pudimos abrir el almacén local de PDFs.'));
      });
    }
    return this.dbPromise;
  }
}
