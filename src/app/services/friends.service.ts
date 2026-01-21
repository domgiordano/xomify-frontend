import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject } from 'rxjs';
import { tap } from 'rxjs/operators';
import { environment } from 'src/environments/environment';
import { AuthService } from './auth.service';

export interface Friend {
  email: string;
  displayName: string;
  profilePic?: string;
  userId?: string;
  status: 'pending' | 'accepted' | 'blocked';
  requestedBy: string;
  createdAt: string;
  acceptedAt?: string;
  mutualFriends?: number;
}

export interface FriendProfile {
  email: string;
  displayName: string;
  profilePic?: string;
  userId?: string;
  topSongs?: any[];
  topArtists?: any[];
  topGenres?: any[];
}

export interface SearchResult {
  email: string;
  displayName: string;
  profilePic?: string;
  userId?: string;
  isFriend: boolean;
  isPending: boolean;
  mutualFriends?: number;
}

@Injectable({
  providedIn: 'root',
})
export class FriendsService {
  private xomifyApiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  private readonly apiAuthToken = environment.apiAuthToken;

  // Cache
  private friendsListSubject = new BehaviorSubject<Friend[]>([]);
  private pendingRequestsSubject = new BehaviorSubject<Friend[]>([]);

  friendsList$ = this.friendsListSubject.asObservable();
  pendingRequests$ = this.pendingRequestsSubject.asObservable();

  // Cache settings
  private readonly CACHE_KEY_FRIENDS = 'xomify_friends';
  private readonly CACHE_KEY_PENDING = 'xomify_pending_requests';
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(private http: HttpClient, private authService: AuthService) {
    this.loadFromCache();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
  }

  private getSpotifyHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.authService.getAccessToken()}`,
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

  private getCache(key: string): any[] | null {
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

  private setCache(key: string, items: any[]): void {
    try {
      localStorage.setItem(key, JSON.stringify({
        items,
        timestamp: Date.now(),
      }));
    } catch {
      console.warn(`Failed to cache ${key}`);
    }
  }

  clearCache(): void {
    localStorage.removeItem(this.CACHE_KEY_FRIENDS);
    localStorage.removeItem(this.CACHE_KEY_PENDING);
  }

  // Search for users by name, display name, or email
  searchUsers(query: string): Observable<SearchResult[]> {
    const url = `${this.xomifyApiUrl}/friends/search?q=${encodeURIComponent(query)}`;
    return this.http.get<SearchResult[]>(url, { headers: this.getHeaders() });
  }

  // Get all accepted friends
  getFriendsList(email: string): Observable<Friend[]> {
    const url = `${this.xomifyApiUrl}/friends/list?email=${encodeURIComponent(email)}`;
    return this.http.get<Friend[]>(url, { headers: this.getHeaders() }).pipe(
      tap((friends) => {
        this.friendsListSubject.next(friends);
        this.setCache(this.CACHE_KEY_FRIENDS, friends);
      })
    );
  }

  // Get pending friend requests (both incoming and outgoing)
  getPendingRequests(email: string): Observable<Friend[]> {
    const url = `${this.xomifyApiUrl}/friends/pending?email=${encodeURIComponent(email)}`;
    return this.http.get<Friend[]>(url, { headers: this.getHeaders() }).pipe(
      tap((requests) => {
        this.pendingRequestsSubject.next(requests);
        this.setCache(this.CACHE_KEY_PENDING, requests);
      })
    );
  }

  // Send a friend request
  sendFriendRequest(fromEmail: string, toEmail: string): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/request`;
    const body = { fromEmail, toEmail };
    return this.http.post(url, body, { headers: this.getHeaders() }).pipe(
      tap(() => this.clearCache())
    );
  }

  // Accept a friend request
  acceptFriendRequest(email: string, friendEmail: string): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/accept`;
    const body = { email, friendEmail };
    return this.http.post(url, body, { headers: this.getHeaders() }).pipe(
      tap(() => this.clearCache())
    );
  }

  // Reject/remove a friend request or friend
  removeFriend(email: string, friendEmail: string): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/reject`;
    const body = { email, friendEmail };
    return this.http.post(url, body, { headers: this.getHeaders() }).pipe(
      tap(() => this.clearCache())
    );
  }

  // Get a friend's public profile with their top data
  getFriendProfile(email: string, friendEmail: string): Observable<FriendProfile> {
    const url = `${this.xomifyApiUrl}/friends/profile/${encodeURIComponent(friendEmail)}?email=${encodeURIComponent(email)}`;
    return this.http.get<FriendProfile>(url, { headers: this.getHeaders() });
  }

  // Get friend's top tracks (uses stored refresh token on backend to fetch from Spotify)
  getFriendTopTracks(friendEmail: string, timeRange: string = 'short_term', limit: number = 10): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/profile/${encodeURIComponent(friendEmail)}/top-tracks?timeRange=${timeRange}&limit=${limit}`;
    return this.http.get(url, { headers: this.getHeaders() });
  }

  // Get friend's top artists
  getFriendTopArtists(friendEmail: string, timeRange: string = 'short_term', limit: number = 10): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/profile/${encodeURIComponent(friendEmail)}/top-artists?timeRange=${timeRange}&limit=${limit}`;
    return this.http.get(url, { headers: this.getHeaders() });
  }

  // Get friend's top genres (derived from top artists)
  getFriendTopGenres(friendEmail: string, timeRange: string = 'short_term'): Observable<any> {
    const url = `${this.xomifyApiUrl}/friends/profile/${encodeURIComponent(friendEmail)}/top-genres?timeRange=${timeRange}`;
    return this.http.get(url, { headers: this.getHeaders() });
  }

  // Helper to get cached friends list
  getCachedFriends(): Friend[] {
    return this.friendsListSubject.getValue();
  }

  // Helper to get cached pending requests
  getCachedPendingRequests(): Friend[] {
    return this.pendingRequestsSubject.getValue();
  }

  // Get incoming requests (where someone else sent the request)
  getIncomingRequests(currentEmail: string): Friend[] {
    return this.pendingRequestsSubject.getValue().filter(
      (r) => r.requestedBy !== currentEmail && r.status === 'pending'
    );
  }

  // Get outgoing requests (where current user sent the request)
  getOutgoingRequests(currentEmail: string): Friend[] {
    return this.pendingRequestsSubject.getValue().filter(
      (r) => r.requestedBy === currentEmail && r.status === 'pending'
    );
  }

  // Get pending request count for badge
  getPendingCount(currentEmail: string): number {
    return this.getIncomingRequests(currentEmail).length;
  }
}
