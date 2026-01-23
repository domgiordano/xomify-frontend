import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface Friend {
  email: string;
  friendEmail?: string; // Used in pending/requested responses
  displayName?: string;
  avatar?: string;
  addedAt?: string;
  createdAt?: string;
  status?: string;
  direction?: string;
  mutualCount?: number;
}

// API response for GET /friends/list
export interface FriendsListResponse {
  email: string;
  totalCount: number;
  accepted: Friend[];
  requested: Friend[]; // outgoing requests
  pending: Friend[]; // incoming requests
  blocked: Friend[];
  acceptedCount: number;
  requestedCount: number;
  pendingCount: number;
  blockedCount: number;
}

export interface FriendProfile {
  email: string;
  displayName?: string;
  userId?: string;
  avatar?: string;
  topSongs?: {
    short_term?: any[];
    medium_term?: any[];
    long_term?: any[];
  };
  topArtists?: {
    short_term?: any[];
    medium_term?: any[];
    long_term?: any[];
  };
  topGenres?: {
    short_term?: any[];
    medium_term?: any[];
    long_term?: any[];
  };
}

export interface SearchResult {
  email: string;
  displayName?: string;
  avatar?: string;
  isFriend: boolean;
  isPending: boolean;
  isOutgoingRequest?: boolean; // true if you sent them a request
  isIncomingRequest?: boolean; // true if they sent you a request
  mutualCount?: number;
}

@Injectable({
  providedIn: 'root',
})
export class FriendsService {
  private xomifyApiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  private readonly apiAuthToken = environment.apiAuthToken;

  // Cache subjects
  private friendsListSubject = new BehaviorSubject<FriendsListResponse | null>(
    null,
  );
  private incomingCountSubject = new BehaviorSubject<number>(0);

  friendsList$ = this.friendsListSubject.asObservable();
  incomingCount$ = this.incomingCountSubject.asObservable();

  // Cache settings
  private readonly CACHE_KEY_FRIENDS = 'xomify_friends_list';
  private readonly CACHE_KEY_USERS = 'xomify_all_users';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private http: HttpClient) {
    this.loadFromCache();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
  }

  // Load cached data on service init
  private loadFromCache(): void {
    const friendsCache = this.getCache(this.CACHE_KEY_FRIENDS);
    if (friendsCache) {
      this.friendsListSubject.next(friendsCache);
      this.incomingCountSubject.next(friendsCache.pendingCount || 0);
    }
  }

  private getCache(key: string): any | null {
    try {
      const cached = localStorage.getItem(key);
      if (!cached) return null;

      const data = JSON.parse(cached);
      const now = Date.now();

      if (now - data.timestamp > this.CACHE_TTL) {
        localStorage.removeItem(key);
        return null;
      }

      return data.items;
    } catch {
      return null;
    }
  }

  private setCache(key: string, items: any): void {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({
          items,
          timestamp: Date.now(),
        }),
      );
    } catch {
      console.warn(`Failed to cache ${key}`);
    }
  }

  clearCache(): void {
    localStorage.removeItem(this.CACHE_KEY_FRIENDS);
    localStorage.removeItem(this.CACHE_KEY_USERS);
    this.friendsListSubject.next(null);
  }

  // GET /user/all?email={email}
  // Returns: [{ email, displayName, avatar, isFriend, isPending, mutualCount }]
  // Uses cache if available and not expired
  getAllUsers(email: string, forceRefresh = false): Observable<SearchResult[]> {
    // Return cached data if available and not forcing refresh
    if (!forceRefresh) {
      const cached = this.getCache(this.CACHE_KEY_USERS);
      if (cached) {
        return of(cached);
      }
    }

    const url = `${this.xomifyApiUrl}/user/all`;
    return this.http.get<SearchResult[]>(url, { headers: this.getHeaders() }).pipe(
      tap((users) => {
        this.setCache(this.CACHE_KEY_USERS, users);
      }),
    );
  }

  // GET /friends/list?email={email}
  // Returns: { accepted, requested, pending, blocked, counts... }
  // Uses cache if available and not expired
  getFriendsList(email: string, forceRefresh = false): Observable<FriendsListResponse> {
    // Return cached data if available and not forcing refresh
    if (!forceRefresh) {
      const cached = this.getCache(this.CACHE_KEY_FRIENDS);
      if (cached) {
        return of(cached);
      }
    }

    const url = `${this.xomifyApiUrl}/friends/list?email=${encodeURIComponent(email)}`;
    return this.http
      .get<FriendsListResponse>(url, { headers: this.getHeaders() })
      .pipe(
        tap((response) => {
          this.friendsListSubject.next(response);
          this.incomingCountSubject.next(response.pendingCount || 0);
          this.setCache(this.CACHE_KEY_FRIENDS, response);
        }),
      );
  }

  // POST /friends/request
  // Body: { "email": "user@email.com", "requestEmail": "friend@email.com" }
  sendFriendRequest(email: string, requestEmail: string): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/request`;
    const body = { email, requestEmail };
    return this.http
      .post(url, body, { headers: this.getHeaders() })
      .pipe(tap(() => this.clearCache()));
  }

  // POST /friends/accept
  // Body: { "email": "user@email.com", "requestEmail": "requester@email.com" }
  acceptFriendRequest(email: string, requestEmail: string): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/accept`;
    const body = { email, requestEmail };
    return this.http
      .post(url, body, { headers: this.getHeaders() })
      .pipe(tap(() => this.clearCache()));
  }

  // POST /friends/reject
  // Body: { "email": "user@email.com", "requestEmail": "requester@email.com" }
  rejectFriendRequest(email: string, requestEmail: string): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/reject`;
    const body = { email, requestEmail };
    return this.http
      .post(url, body, { headers: this.getHeaders() })
      .pipe(tap(() => this.clearCache()));
  }

  // DELETE /friends/remove
  removeFriend(email: string, friendEmail: string): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/remove`;
    return this.http
      .delete(url, {
        headers: this.getHeaders(),
        params: {
          email: email,
          friendEmail: friendEmail,
        },
      })
      .pipe(tap(() => this.clearCache()));
  }

  // GET /friends/profile?friendEmail={friendEmail}
  // Returns: { displayName, email, userId, topSongs, topArtists, topGenres }
  getFriendProfile(friendEmail: string): Observable<FriendProfile> {
    const url = `${this.xomifyApiUrl}/friends/profile?friendEmail=${encodeURIComponent(friendEmail)}`;
    return this.http.get<FriendProfile>(url, { headers: this.getHeaders() });
  }

  // Helper to get cached friends list
  getCachedFriendsList(): FriendsListResponse | null {
    return this.friendsListSubject.getValue();
  }

  // Get incoming requests count for badge
  getIncomingCount(): number {
    return this.incomingCountSubject.getValue();
  }
}
