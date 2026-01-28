import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, BehaviorSubject } from 'rxjs';
import { tap, catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface TrackRating {
  email: string;
  trackId: string;
  rating: number;
  ratedAt: string;
  trackName: string;
  artistName: string;
  albumArt?: string;
  albumId?: string;
  context?: string;
}

export interface FriendRating {
  email: string;
  displayName?: string;
  avatar?: string;
  rating: number;
  ratedAt: string;
}

@Injectable({
  providedIn: 'root',
})
export class RatingsService {
  private xomifyApiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  private readonly apiAuthToken = environment.apiAuthToken;

  // Cache settings
  private readonly CACHE_KEY_PREFIX = 'xomify_ratings_';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  // In-memory ratings for quick access
  private ratingsSubject = new BehaviorSubject<TrackRating[]>([]);
  ratings$ = this.ratingsSubject.asObservable();

  constructor(private http: HttpClient) {
    this.loadFromLocalStorage();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
  }

  // Load ratings from localStorage on init
  private loadFromLocalStorage(): void {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY_PREFIX + 'all');
      if (cached) {
        const data = JSON.parse(cached);
        if (Date.now() - data.timestamp < this.CACHE_TTL) {
          this.ratingsSubject.next(data.ratings || []);
        }
      }
    } catch {
      // Ignore cache errors
    }
  }

  // Save ratings to localStorage
  private saveToLocalStorage(ratings: TrackRating[]): void {
    try {
      localStorage.setItem(
        this.CACHE_KEY_PREFIX + 'all',
        JSON.stringify({
          ratings,
          timestamp: Date.now(),
        }),
      );
    } catch {
      console.warn('Failed to cache ratings');
    }
  }

  // GET all ratings for a user
  getAllRatings(
    email: string,
    forceRefresh = false,
  ): Observable<TrackRating[]> {
    // Return cached if available
    if (!forceRefresh) {
      const cached = this.ratingsSubject.getValue();
      if (cached.length > 0) {
        return of(cached);
      }
    }

    const url = `${this.xomifyApiUrl}/ratings?email=${encodeURIComponent(email)}`;
    return this.http
      .get<TrackRating[]>(url, { headers: this.getHeaders() })
      .pipe(
        tap((ratings) => {
          this.ratingsSubject.next(ratings);
          this.saveToLocalStorage(ratings);
        }),
        catchError((error) => {
          console.error('Error fetching ratings:', error);
          // Return cached data on error
          return of(this.ratingsSubject.getValue());
        }),
      );
  }

  // GET single track rating
  getTrackRating(
    email: string,
    trackId: string,
  ): Observable<TrackRating | null> {
    // Check local cache first
    const cached = this.ratingsSubject.getValue();
    const existing = cached.find((r) => r.trackId === trackId);
    if (existing) {
      return of(existing);
    }

    const url = `${this.xomifyApiUrl}/ratings/track/?trackId=${trackId}&email=${encodeURIComponent(email)}`;
    return this.http
      .get<TrackRating>(url, { headers: this.getHeaders() })
      .pipe(catchError(() => of(null)));
  }

  // POST/PUT rating
  rateTrack(
    email: string,
    trackId: string,
    rating: number,
    trackName: string,
    artistName: string,
    albumArt?: string,
    albumId?: string,
    context?: string,
  ): Observable<TrackRating> {
    const url = `${this.xomifyApiUrl}/ratings`;
    const body = {
      email,
      trackId,
      rating,
      trackName,
      artistName,
      albumArt,
      albumId,
      context,
    };

    return this.http
      .post<TrackRating>(url, body, { headers: this.getHeaders() })
      .pipe(
        tap((newRating) => {
          // Update local cache
          const current = this.ratingsSubject.getValue();
          const existingIndex = current.findIndex((r) => r.trackId === trackId);

          if (existingIndex >= 0) {
            current[existingIndex] = newRating;
          } else {
            current.push(newRating);
          }

          this.ratingsSubject.next([...current]);
          this.saveToLocalStorage(current);
        }),
        catchError((error) => {
          console.error('Error saving rating:', error);
          // Save locally even if API fails (offline support)
          const localRating: TrackRating = {
            email,
            trackId,
            rating,
            trackName,
            artistName,
            albumArt,
            albumId,
            context,
            ratedAt: new Date().toISOString(),
          };
          this.updateLocalRating(localRating);
          return of(localRating);
        }),
      );
  }

  // DELETE rating
  deleteRating(email: string, trackId: string): Observable<void> {
    const url = `${this.xomifyApiUrl}/ratings/remove?trackId=${trackId}&email=${encodeURIComponent(email)}`;
    return this.http.delete<void>(url, { headers: this.getHeaders() }).pipe(
      tap(() => {
        // Remove from local cache
        const current = this.ratingsSubject.getValue();
        const filtered = current.filter((r) => r.trackId !== trackId);
        this.ratingsSubject.next(filtered);
        this.saveToLocalStorage(filtered);
      }),
      catchError((error) => {
        console.error('Error deleting rating:', error);
        // Remove locally even if API fails
        const current = this.ratingsSubject.getValue();
        const filtered = current.filter((r) => r.trackId !== trackId);
        this.ratingsSubject.next(filtered);
        this.saveToLocalStorage(filtered);
        return of(void 0);
      }),
    );
  }

  // GET friends' ratings for a specific track
  getFriendsRatings(
    email: string,
    trackId: string,
  ): Observable<FriendRating[]> {
    const url = `${this.xomifyApiUrl}/ratings/track?trackId=${trackId}&email=${encodeURIComponent(email)}`;
    return this.http
      .get<FriendRating[]>(url, { headers: this.getHeaders() })
      .pipe(catchError(() => of([])));
  }

  // Helper: Update local rating cache
  private updateLocalRating(rating: TrackRating): void {
    const current = this.ratingsSubject.getValue();
    const existingIndex = current.findIndex(
      (r) => r.trackId === rating.trackId,
    );

    if (existingIndex >= 0) {
      current[existingIndex] = rating;
    } else {
      current.push(rating);
    }

    this.ratingsSubject.next([...current]);
    this.saveToLocalStorage(current);
  }

  // Helper: Get rating for a track from cache
  getCachedRating(trackId: string): number {
    const ratings = this.ratingsSubject.getValue();
    const rating = ratings.find((r) => r.trackId === trackId);
    return rating?.rating || 0;
  }

  // Helper: Check if track has been rated
  isRated(trackId: string): boolean {
    const ratings = this.ratingsSubject.getValue();
    return ratings.some((r) => r.trackId === trackId);
  }

  // Clear all cached data
  clearCache(): void {
    localStorage.removeItem(this.CACHE_KEY_PREFIX + 'all');
    this.ratingsSubject.next([]);
  }
}
