import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';

export interface Release {
  id: string;
  name: string;
  artists: { id: string; name: string }[];
  images: { url: string }[];
  release_date: string;
  release_date_precision: string;
  total_tracks: number;
  album_type: string;
  external_urls: { spotify: string };
}

interface CachedData {
  releases: Release[];
  timestamp: number;
  artistIds: string[];
}

@Injectable({
  providedIn: 'root',
})
export class ReleaseCalendarService {
  private readonly CACHE_KEY = 'xomify_release_calendar';
  private readonly CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

  private cachedData: CachedData | null = null;
  private loadingSubject = new BehaviorSubject<boolean>(false);
  private releasesSubject = new BehaviorSubject<Release[]>([]);

  loading$ = this.loadingSubject.asObservable();
  releases$ = this.releasesSubject.asObservable();

  constructor(private http: HttpClient, private authService: AuthService) {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.CACHE_KEY);
      if (stored) {
        this.cachedData = JSON.parse(stored);
        if (this.cachedData && this.isCacheValid()) {
          this.releasesSubject.next(this.cachedData.releases);
        }
      }
    } catch {
      this.cachedData = null;
    }
  }

  private saveToStorage(data: CachedData): void {
    try {
      localStorage.setItem(this.CACHE_KEY, JSON.stringify(data));
    } catch {
      console.warn('Failed to save release calendar to localStorage');
    }
  }

  private isCacheValid(): boolean {
    if (!this.cachedData) return false;
    const now = Date.now();
    return now - this.cachedData.timestamp < this.CACHE_DURATION;
  }

  getCachedReleases(): Release[] {
    return this.cachedData?.releases || [];
  }

  hasCachedData(): boolean {
    return (
      this.isCacheValid() &&
      this.cachedData !== null &&
      this.cachedData.releases.length > 0
    );
  }

  getReleases(forceRefresh: boolean = false): Observable<Release[]> {
    // Return cached data if valid and not forcing refresh
    if (!forceRefresh && this.isCacheValid() && this.cachedData) {
      return of(this.cachedData.releases);
    }

    this.loadingSubject.next(true);

    // First get followed artists, then get their albums
    return this.fetchFollowedArtistsAlbums().pipe(
      tap((releases) => {
        const cacheData: CachedData = {
          releases,
          timestamp: Date.now(),
          artistIds: [
            ...new Set(releases.flatMap((r) => r.artists.map((a) => a.id))),
          ],
        };
        this.cachedData = cacheData;
        this.saveToStorage(cacheData);
        this.releasesSubject.next(releases);
        this.loadingSubject.next(false);
      })
    );
  }

  private fetchFollowedArtistsAlbums(): Observable<Release[]> {
    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    // Get followed artists first
    return this.http
      .get<any>(
        'https://api.spotify.com/v1/me/following?type=artist&limit=50',
        { headers }
      )
      .pipe(
        map((response) => {
          const artists = response.artists?.items || [];
          return artists;
        }),
        // This is simplified - in real implementation you'd fetch albums for each artist
        // For now we'll use a simpler approach with new releases
        map(() => {
          // Return empty for now - the component will handle fetching
          return [];
        })
      );
  }

  clearCache(): void {
    this.cachedData = null;
    localStorage.removeItem(this.CACHE_KEY);
    this.releasesSubject.next([]);
  }

  updateCache(releases: Release[]): void {
    const cacheData: CachedData = {
      releases,
      timestamp: Date.now(),
      artistIds: [
        ...new Set(releases.flatMap((r) => r.artists.map((a) => a.id))),
      ],
    };
    this.cachedData = cacheData;
    this.saveToStorage(cacheData);
    this.releasesSubject.next(releases);
  }
}
