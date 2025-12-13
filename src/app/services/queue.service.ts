import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

export interface QueueTrack {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string }[];
  };
  duration_ms: number;
  external_urls?: { spotify: string };
}

@Injectable({
  providedIn: 'root',
})
export class QueueService {
  private readonly STORAGE_KEY = 'xomify_queue';

  private queueSubject = new BehaviorSubject<QueueTrack[]>(
    this.loadFromStorage()
  );

  queue$ = this.queueSubject.asObservable();

  get queueCount(): number {
    return this.queueSubject.getValue().length;
  }

  get queueCount$(): Observable<number> {
    return new Observable((observer) => {
      this.queue$.subscribe((queue) => {
        observer.next(queue.length);
      });
    });
  }

  constructor() {}

  private loadFromStorage(): QueueTrack[] {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  }

  private saveToStorage(queue: QueueTrack[]): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(queue));
    } catch {
      console.warn('Failed to save queue to localStorage');
    }
  }

  getQueue(): QueueTrack[] {
    return this.queueSubject.getValue();
  }

  addToQueue(track: QueueTrack): boolean {
    const currentQueue = this.queueSubject.getValue();

    // Check if already in queue
    if (currentQueue.some((t) => t.id === track.id)) {
      return false;
    }

    const newQueue = [...currentQueue, track];
    this.queueSubject.next(newQueue);
    this.saveToStorage(newQueue);
    return true;
  }

  removeFromQueue(trackId: string): void {
    const currentQueue = this.queueSubject.getValue();
    const newQueue = currentQueue.filter((t) => t.id !== trackId);
    this.queueSubject.next(newQueue);
    this.saveToStorage(newQueue);
  }

  removeAtIndex(index: number): void {
    const currentQueue = this.queueSubject.getValue();
    if (index >= 0 && index < currentQueue.length) {
      const newQueue = [...currentQueue];
      newQueue.splice(index, 1);
      this.queueSubject.next(newQueue);
      this.saveToStorage(newQueue);
    }
  }

  moveTrack(fromIndex: number, toIndex: number): void {
    const currentQueue = this.queueSubject.getValue();
    if (
      fromIndex < 0 ||
      fromIndex >= currentQueue.length ||
      toIndex < 0 ||
      toIndex >= currentQueue.length
    ) {
      return;
    }

    const newQueue = [...currentQueue];
    const [removed] = newQueue.splice(fromIndex, 1);
    newQueue.splice(toIndex, 0, removed);
    this.queueSubject.next(newQueue);
    this.saveToStorage(newQueue);
  }

  clearQueue(): void {
    this.queueSubject.next([]);
    this.saveToStorage([]);
  }

  isInQueue(trackId: string): boolean {
    return this.queueSubject.getValue().some((t) => t.id === trackId);
  }

  getTotalDuration(): number {
    return this.queueSubject
      .getValue()
      .reduce((total, track) => total + (track.duration_ms || 0), 0);
  }

  getUniqueArtistCount(): number {
    const artistIds = new Set<string>();
    this.queueSubject.getValue().forEach((track) => {
      track.artists?.forEach((artist) => artistIds.add(artist.id));
    });
    return artistIds.size;
  }
}
