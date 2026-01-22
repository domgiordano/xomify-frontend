import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface Friend {
  email: string;
  displayName?: string;
  avatar?: string;
  addedAt?: string;
  status?: string;
  direction?: string;
}

export interface PendingRequest {
  email: string;
  displayName?: string;
  avatar?: string;
  requestedAt?: string;
  mutualCount?: number;
  direction?: 'incoming' | 'outgoing';
}

// API response for GET /friends/list
export interface FriendsListResponse {
  email: string;
  totalCount: number;
  accepted: Friend[];
  requested: Friend[];
  pending: Friend[];
  blocked: Friend[];
  acceptedCount: number;
  requestedCount: number;
  pendingCount: number;
  blockedCount: number;
}

// API response for GET /friends/pending
export interface PendingResponse {
  email: string;
  pendingCount: number;
  pending: PendingRequest[];
}

// Internal structure for component use
export interface PendingRequests {
  incoming: PendingRequest[];
  outgoing: PendingRequest[];
}

export interface FriendProfile {
  email: string;
  displayName?: string;
  userId?: string;
  avatar?: string;
  topSongs?: any[];
  topArtists?: any[];
  topGenres?: any[];
}

export interface SearchResult {
  email: string;
  displayName: string;
  avatar?: string;
  isFriend: boolean;
  isPending: boolean;
  mutualCount?: number;
}

@Injectable({
  providedIn: 'root',
})
export class FriendsService {
  private xomifyApiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  private readonly apiAuthToken = environment.apiAuthToken;

  // Cache subjects
  private friendsListSubject = new BehaviorSubject<Friend[]>([]);
  private pendingRequestsSubject = new BehaviorSubject<PendingRequests>({
    incoming: [],
    outgoing: [],
  });

  friendsList$ = this.friendsListSubject.asObservable();
  pendingRequests$ = this.pendingRequestsSubject.asObservable();

  // Cache settings
  private readonly CACHE_KEY_FRIENDS = 'xomify_friends';
  private readonly CACHE_KEY_PENDING = 'xomify_pending_requests';
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
    }

    const pendingCache = this.getCache(this.CACHE_KEY_PENDING);
    if (pendingCache) {
      this.pendingRequestsSubject.next(pendingCache);
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
    localStorage.removeItem(this.CACHE_KEY_PENDING);
  }

  // GET /friends/search?email={email}&q={query}
  // Returns: [{ email, displayName, avatar, isFriend, isPending, mutualCount }]
  searchUsers(email: string, query: string): Observable<SearchResult[]> {
    const url = `${this.xomifyApiUrl}/friends/search?email=${encodeURIComponent(email)}&q=${encodeURIComponent(query)}`;
    return this.http.get<SearchResult[]>(url, { headers: this.getHeaders() });
  }

  // GET /friends/list?email={email}
  // Returns: { accepted, requested, pending, blocked, counts... }
  getFriendsList(email: string): Observable<FriendsListResponse> {
    const url = `${this.xomifyApiUrl}/friends/list?email=${encodeURIComponent(email)}`;
    return this.http.get<FriendsListResponse>(url, { headers: this.getHeaders() }).pipe(
      tap((response) => {
        this.friendsListSubject.next(response.accepted || []);
        this.setCache(this.CACHE_KEY_FRIENDS, response.accepted || []);
      }),
    );
  }

  // GET /friends/pending?email={email}
  // Returns: { pending: [...] } where each item has direction: 'incoming' | 'outgoing'
  getPendingRequests(email: string): Observable<PendingRequests> {
    const url = `${this.xomifyApiUrl}/friends/pending?email=${encodeURIComponent(email)}`;
    return this.http
      .get<PendingResponse>(url, { headers: this.getHeaders() })
      .pipe(
        map((response) => {
          // Transform API response to incoming/outgoing structure
          const incoming = (response.pending || []).filter(p => p.direction === 'incoming');
          const outgoing = (response.pending || []).filter(p => p.direction === 'outgoing');
          return { incoming, outgoing };
        }),
        tap((pending) => {
          this.pendingRequestsSubject.next(pending);
          this.setCache(this.CACHE_KEY_PENDING, pending);
        }),
      );
  }

  // POST /friends/request
  // Body: { "email": "user@email.com", "targetEmail": "friend@email.com" }
  sendFriendRequest(email: string, targetEmail: string): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/request`;
    const body = { email, targetEmail };
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

  // DELETE /friends/{friendEmail}
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
  getCachedFriends(): Friend[] {
    return this.friendsListSubject.getValue();
  }

  // Helper to get cached pending requests
  getCachedPendingRequests(): PendingRequests {
    return this.pendingRequestsSubject.getValue();
  }

  // Get incoming requests count for badge
  getIncomingCount(): number {
    return this.pendingRequestsSubject.getValue().incoming?.length || 0;
  }
}
