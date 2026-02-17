import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, BehaviorSubject, of } from 'rxjs';
import { tap, map, catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

// ============================================
// INTERFACES
// ============================================

export interface Group {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  createdBy: string;
  createdAt: string;
  updatedAt?: string;
  memberCount: number;
  songCount: number;
  unlistenedCount?: number;
}

export interface GroupMember {
  email: string;
  displayName?: string;
  avatar?: string;
  role: 'admin' | 'member';
  joinedAt: string;
}

export interface GroupSongTrack {
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

export interface GroupSongUserStatus {
  songId: string;
  email: string;
  addedToQueue: boolean;
  queuedAt?: string;
  listened: boolean;
  listenedAt?: string;
}

export interface GroupSong {
  id: string;
  groupId: string;
  trackId: string;
  addedBy: string;
  addedByName?: string;
  addedByAvatar?: string;
  addedAt: string;
  track: GroupSongTrack;
  userStatus?: GroupSongUserStatus;
  listenedByCount?: number;
  queuedByCount?: number;
}

export interface GroupDetail extends Group {
  members: GroupMember[];
  songs: GroupSong[];
  currentUserRole: 'admin' | 'member';
}

export interface GroupListResponse {
  email: string;
  groups: Group[];
  totalCount: number;
}

export interface CreateGroupRequest {
  name: string;
  description?: string;
  memberEmails?: string[];
}

export interface AddSongRequest {
  trackId: string;
  track: GroupSongTrack;
}

export interface SpotifyUrlParseResult {
  valid: boolean;
  trackId?: string;
  error?: string;
}

// ============================================
// SERVICE
// ============================================

@Injectable({
  providedIn: 'root',
})
export class GroupsService {
  private xomifyApiUrl = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  private readonly apiAuthToken = environment.apiAuthToken;

  // Cache subjects
  private groupsListSubject = new BehaviorSubject<Group[]>([]);
  private currentGroupSubject = new BehaviorSubject<GroupDetail | null>(null);

  // Observables
  groupsList$ = this.groupsListSubject.asObservable();
  currentGroup$ = this.currentGroupSubject.asObservable();

  // Cache settings
  private readonly CACHE_KEY_GROUPS = 'xomify_groups_list';
  private readonly CACHE_KEY_GROUP_PREFIX = 'xomify_group_';
  private readonly CACHE_TTL = 2 * 60 * 1000; // 2 minutes

  constructor(private http: HttpClient) {
    this.loadFromCache();
  }

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  private loadFromCache(): void {
    try {
      const cached = localStorage.getItem(this.CACHE_KEY_GROUPS);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < this.CACHE_TTL) {
          this.groupsListSubject.next(data || []);
        }
      }
    } catch (e) {
      console.warn('Error loading groups from cache:', e);
    }
  }

  private getCache<T>(key: string): T | null {
    try {
      const cached = localStorage.getItem(key);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < this.CACHE_TTL) {
          return data;
        }
      }
    } catch (e) {
      console.warn('Error reading cache:', e);
    }
    return null;
  }

  private setCache(key: string, data: any): void {
    try {
      localStorage.setItem(
        key,
        JSON.stringify({ data, timestamp: Date.now() }),
      );
    } catch (e) {
      console.warn('Error writing to cache:', e);
    }
  }

  clearCache(): void {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith('xomify_group')) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      this.groupsListSubject.next([]);
      this.currentGroupSubject.next(null);
    } catch (e) {
      console.warn('Error clearing cache:', e);
    }
  }

  clearGroupCache(groupId: string): void {
    localStorage.removeItem(`${this.CACHE_KEY_GROUP_PREFIX}${groupId}`);
    this.currentGroupSubject.next(null);
  }

  // ============================================
  // GROUP CRUD OPERATIONS
  // ============================================

  getGroups(email: string, forceRefresh = false): Observable<Group[]> {
    if (!forceRefresh) {
      const cached = this.groupsListSubject.getValue();
      if (cached.length > 0) {
        return of(cached);
      }
    }

    const url = `${this.xomifyApiUrl}/groups/list?email=${encodeURIComponent(email)}`;
    return this.http
      .get<GroupListResponse>(url, { headers: this.getHeaders() })
      .pipe(
        map((response) => response.groups || []),
        tap((groups) => {
          this.groupsListSubject.next(groups);
          this.setCache(this.CACHE_KEY_GROUPS, groups);
        }),
        catchError((error) => {
          console.error('Error fetching groups:', error);
          return of(this.groupsListSubject.getValue());
        }),
      );
  }

  getGroup(
    groupId: string,
    email: string,
    forceRefresh = false,
  ): Observable<GroupDetail | null> {
    const cacheKey = `${this.CACHE_KEY_GROUP_PREFIX}${groupId}`;

    if (!forceRefresh) {
      const cached = this.getCache<GroupDetail>(cacheKey);
      if (cached) {
        this.currentGroupSubject.next(cached);
        return of(cached);
      }
    }

    const url = `${this.xomifyApiUrl}/groups/info?groupId=${groupId}&email=${encodeURIComponent(email)}`;
    return this.http.get<GroupDetail>(url, { headers: this.getHeaders() }).pipe(
      tap((group) => {
        this.currentGroupSubject.next(group);
        this.setCache(cacheKey, group);
      }),
      catchError((error) => {
        console.error('Error fetching group:', error);
        return of(null);
      }),
    );
  }

  createGroup(email: string, request: CreateGroupRequest): Observable<Group> {
    const url = `${this.xomifyApiUrl}/groups/create`;
    const body = { email, ...request };

    return this.http
      .post<Group>(url, body, { headers: this.getHeaders() })
      .pipe(
        tap((newGroup) => {
          const current = this.groupsListSubject.getValue();
          this.groupsListSubject.next([newGroup, ...current]);
          localStorage.removeItem(this.CACHE_KEY_GROUPS);
        }),
        catchError((error) => {
          console.error('Error creating group:', error);
          throw error;
        }),
      );
  }

  updateGroup(
    groupId: string,
    email: string,
    updates: Partial<CreateGroupRequest>,
  ): Observable<Group> {
    const url = `${this.xomifyApiUrl}/groups/update`;
    const body = { email, groupId, ...updates };

    return this.http.put<Group>(url, body, { headers: this.getHeaders() }).pipe(
      tap((updatedGroup) => {
        const current = this.groupsListSubject.getValue();
        const index = current.findIndex((g) => g.id === groupId);
        if (index >= 0) {
          current[index] = { ...current[index], ...updatedGroup };
          this.groupsListSubject.next([...current]);
        }
        this.clearGroupCache(groupId);
      }),
      catchError((error) => {
        console.error('Error updating group:', error);
        throw error;
      }),
    );
  }

  deleteGroup(groupId: string, email: string): Observable<void> {
    const url = `${this.xomifyApiUrl}/groups/remove?groupId=${groupId}&email=${encodeURIComponent(email)}`;

    return this.http.delete<void>(url, { headers: this.getHeaders() }).pipe(
      tap(() => {
        const current = this.groupsListSubject.getValue();
        this.groupsListSubject.next(current.filter((g) => g.id !== groupId));
        this.clearGroupCache(groupId);
        localStorage.removeItem(this.CACHE_KEY_GROUPS);
      }),
      catchError((error) => {
        console.error('Error deleting group:', error);
        throw error;
      }),
    );
  }

  // ============================================
  // MEMBER MANAGEMENT
  // ============================================

  addMember(
    groupId: string,
    email: string,
    memberEmail: string,
  ): Observable<GroupMember> {
    const url = `${this.xomifyApiUrl}/groups/add-member`;
    const body = { email, groupId, memberEmail };

    return this.http
      .post<GroupMember>(url, body, { headers: this.getHeaders() })
      .pipe(
        tap(() => {
          this.clearGroupCache(groupId);
          localStorage.removeItem(this.CACHE_KEY_GROUPS);
        }),
        catchError((error) => {
          console.error('Error adding member:', error);
          throw error;
        }),
      );
  }

  removeMember(
    groupId: string,
    email: string,
    memberEmail: string,
  ): Observable<void> {
    const url = `${this.xomifyApiUrl}/groups/remove-member?groupId=${groupId}&memberEmail=${encodeURIComponent(memberEmail)}&email=${encodeURIComponent(email)}`;

    return this.http.delete<void>(url, { headers: this.getHeaders() }).pipe(
      tap(() => {
        this.clearGroupCache(groupId);
        localStorage.removeItem(this.CACHE_KEY_GROUPS);
      }),
      catchError((error) => {
        console.error('Error removing member:', error);
        throw error;
      }),
    );
  }

  leaveGroup(groupId: string, email: string): Observable<void> {
    const url = `${this.xomifyApiUrl}/groups/leave`;
    const body = { email, groupId };

    return this.http.post<void>(url, body, { headers: this.getHeaders() }).pipe(
      tap(() => {
        const current = this.groupsListSubject.getValue();
        this.groupsListSubject.next(current.filter((g) => g.id !== groupId));
        this.clearGroupCache(groupId);
        localStorage.removeItem(this.CACHE_KEY_GROUPS);
      }),
      catchError((error) => {
        console.error('Error leaving group:', error);
        throw error;
      }),
    );
  }

  // ============================================
  // SONG MANAGEMENT
  // ============================================

  addSong(
    groupId: string,
    email: string,
    request: AddSongRequest,
  ): Observable<GroupSong> {
    const url = `${this.xomifyApiUrl}/groups/add-song`;
    const body = { email, groupId, ...request };

    return this.http
      .post<GroupSong>(url, body, { headers: this.getHeaders() })
      .pipe(
        tap(() => {
          this.clearGroupCache(groupId);
          localStorage.removeItem(this.CACHE_KEY_GROUPS);
        }),
        catchError((error) => {
          console.error('Error adding song:', error);
          throw error;
        }),
      );
  }

  addSongByUrl(
    groupId: string,
    email: string,
    spotifyUrl: string,
  ): Observable<GroupSong> {
    const url = `${this.xomifyApiUrl}/groups/add-song-url`;
    const body = { email, groupId, spotifyUrl };

    return this.http
      .post<GroupSong>(url, body, { headers: this.getHeaders() })
      .pipe(
        tap(() => {
          this.clearGroupCache(groupId);
          localStorage.removeItem(this.CACHE_KEY_GROUPS);
        }),
        catchError((error) => {
          console.error('Error adding song by URL:', error);
          throw error;
        }),
      );
  }

  removeSong(groupId: string, email: string, songId: string): Observable<void> {
    const url = `${this.xomifyApiUrl}/groups/remove-song?groupId=${groupId}&songId${songId}=email=${encodeURIComponent(email)}`;

    return this.http.delete<void>(url, { headers: this.getHeaders() }).pipe(
      tap(() => {
        this.clearGroupCache(groupId);
        localStorage.removeItem(this.CACHE_KEY_GROUPS);
      }),
      catchError((error) => {
        console.error('Error removing song:', error);
        throw error;
      }),
    );
  }

  // ============================================
  // SONG STATUS MANAGEMENT
  // ============================================

  updateSongStatus(
    groupId: string,
    email: string,
    songId: string,
    status: Partial<Pick<GroupSongUserStatus, 'addedToQueue' | 'listened'>>,
  ): Observable<GroupSongUserStatus> {
    const url = `${this.xomifyApiUrl}/groups/song-status`;
    const body = { email, groupId, songId, ...status };

    return this.http
      .put<GroupSongUserStatus>(url, body, { headers: this.getHeaders() })
      .pipe(
        tap(() => {
          // Update local cache
          const currentGroup = this.currentGroupSubject.getValue();
          if (currentGroup) {
            const songIndex = currentGroup.songs.findIndex(
              (s) => s.id === songId,
            );
            if (songIndex >= 0) {
              currentGroup.songs[songIndex].userStatus = {
                ...currentGroup.songs[songIndex].userStatus,
                songId,
                email,
                addedToQueue:
                  status.addedToQueue ??
                  currentGroup.songs[songIndex].userStatus?.addedToQueue ??
                  false,
                listened:
                  status.listened ??
                  currentGroup.songs[songIndex].userStatus?.listened ??
                  false,
              };
              this.currentGroupSubject.next({ ...currentGroup });
            }
          }
        }),
        catchError((error) => {
          console.error('Error updating song status:', error);
          throw error;
        }),
      );
  }

  markAsQueued(
    groupId: string,
    email: string,
    songId: string,
  ): Observable<GroupSongUserStatus> {
    return this.updateSongStatus(groupId, email, songId, {
      addedToQueue: true,
    });
  }

  markAsListened(
    groupId: string,
    email: string,
    songId: string,
  ): Observable<GroupSongUserStatus> {
    return this.updateSongStatus(groupId, email, songId, { listened: true });
  }

  markAsUnlistened(
    groupId: string,
    email: string,
    songId: string,
  ): Observable<GroupSongUserStatus> {
    return this.updateSongStatus(groupId, email, songId, { listened: false });
  }

  markAllAsListened(
    groupId: string,
    email: string,
  ): Observable<{ count: number }> {
    const url = `${this.xomifyApiUrl}/groups/mark-all-listened`;
    const body = { email, groupId };

    return this.http
      .post<{ count: number }>(url, body, { headers: this.getHeaders() })
      .pipe(
        tap(() => {
          // Update local cache - mark all songs as listened
          const currentGroup = this.currentGroupSubject.getValue();
          if (currentGroup) {
            currentGroup.songs.forEach((song) => {
              if (song.userStatus) {
                song.userStatus.listened = true;
              } else {
                song.userStatus = {
                  songId: song.id,
                  email,
                  addedToQueue: false,
                  listened: true,
                };
              }
            });
            this.currentGroupSubject.next({ ...currentGroup });
          }
        }),
        catchError((error) => {
          console.error('Error marking all as listened:', error);
          throw error;
        }),
      );
  }

  // ============================================
  // SPOTIFY URL UTILITIES
  // ============================================

  parseSpotifyUrl(url: string): SpotifyUrlParseResult {
    if (!url || typeof url !== 'string') {
      return { valid: false, error: 'No URL provided' };
    }

    const trimmedUrl = url.trim();

    // Pattern 1: Web URL (with or without params, with or without intl)
    // https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh
    // https://open.spotify.com/track/4iV5W9uYEdYUVa79Axb7Rh?si=abc123
    // https://open.spotify.com/intl-XX/track/4iV5W9uYEdYUVa79Axb7Rh
    const webUrlPattern =
      /^https?:\/\/open\.spotify\.com(?:\/intl-[a-z]{2})?\/track\/([a-zA-Z0-9]{22})(?:\?.*)?$/;
    const webMatch = trimmedUrl.match(webUrlPattern);
    if (webMatch) {
      return { valid: true, trackId: webMatch[1] };
    }

    // Pattern 2: Spotify URI
    // spotify:track:4iV5W9uYEdYUVa79Axb7Rh
    const uriPattern = /^spotify:track:([a-zA-Z0-9]{22})$/;
    const uriMatch = trimmedUrl.match(uriPattern);
    if (uriMatch) {
      return { valid: true, trackId: uriMatch[1] };
    }

    // Pattern 3: Shortened URL (not supported)
    if (trimmedUrl.includes('spotify.link')) {
      return {
        valid: false,
        error:
          'Shortened Spotify links are not supported. Please use the full track URL.',
      };
    }

    // Check if it looks like a Spotify URL but didn't match
    if (trimmedUrl.includes('spotify')) {
      return {
        valid: false,
        error:
          'Invalid Spotify track URL. Please paste a track link from Spotify.',
      };
    }

    return { valid: false, error: 'Not a valid Spotify URL' };
  }

  isValidSpotifyTrackUrl(url: string): boolean {
    return this.parseSpotifyUrl(url).valid;
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  getUnlistenedCount(group: GroupDetail): number {
    if (!group?.songs) return 0;
    return group.songs.filter((s) => !s.userStatus?.listened).length;
  }

  getUnlistenedSongs(group: GroupDetail): GroupSong[] {
    if (!group?.songs) return [];
    return group.songs.filter((s) => !s.userStatus?.listened);
  }

  filterSongsByStatus(
    songs: GroupSong[],
    status: 'all' | 'listened' | 'unlistened' | 'queued',
  ): GroupSong[] {
    switch (status) {
      case 'listened':
        return songs.filter((s) => s.userStatus?.listened);
      case 'unlistened':
        return songs.filter((s) => !s.userStatus?.listened);
      case 'queued':
        return songs.filter((s) => s.userStatus?.addedToQueue);
      default:
        return songs;
    }
  }

  getCachedGroups(): Group[] {
    return this.groupsListSubject.getValue();
  }

  getCachedGroup(): GroupDetail | null {
    return this.currentGroupSubject.getValue();
  }
}
