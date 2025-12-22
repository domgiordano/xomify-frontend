// user.service.ts
import { Injectable, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class UserService implements OnInit {
  accessToken: string;
  refreshToken: string;
  user: any;
  userName = '';
  id = '';
  activeWrapped: boolean = false;
  activeReleaseRadar: boolean = false;
  playlistCount: number = 0;
  followingCount: number = 0;
  private baseUrl = 'https://api.spotify.com/v1';
  private xomifyApiUrl: string = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  private readonly apiAuthToken = environment.apiAuthToken;

  constructor(private http: HttpClient, private AuthService: AuthService) {}

  ngOnInit() {
    this.accessToken = this.AuthService.getAccessToken();
    this.refreshToken = this.AuthService.getRefreshToken();
  }

  private getAuthHeaders(): HttpHeaders {
    this.accessToken = this.AuthService.getAccessToken();
    return new HttpHeaders({
      Authorization: `Bearer ${this.accessToken}`,
    });
  }

  getUserData(): Observable<any> {
    return this.http.get(`${this.baseUrl}/me`, {
      headers: this.getAuthHeaders(),
    });
  }

  // Get user's playlists (limit=1 to just get total count, or higher for actual list)
  getUserPlaylists(limit: number = 1, offset: number = 0): Observable<any> {
    return this.http.get(`${this.baseUrl}/me/playlists`, {
      headers: this.getAuthHeaders(),
      params: {
        limit: limit.toString(),
        offset: offset.toString(),
      },
    });
  }

  // Get followed artists with pagination support
  getFollowedArtists(limit: number = 20, after?: string): Observable<any> {
    const params: any = {
      type: 'artist',
      limit: limit.toString(),
    };

    if (after) {
      params.after = after;
    }

    return this.http.get(`${this.baseUrl}/me/following`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  // Get all followed artists (handles pagination)
  getAllFollowedArtists(): Observable<any[]> {
    return new Observable((observer) => {
      const allArtists: any[] = [];

      const fetchPage = (after?: string) => {
        this.getFollowedArtists(50, after).subscribe({
          next: (data) => {
            const artists = data.artists?.items || [];
            allArtists.push(...artists);

            // Check if there are more artists (Spotify uses cursor-based pagination)
            const nextCursor = data.artists?.cursors?.after;
            if (nextCursor && artists.length === 50) {
              fetchPage(nextCursor);
            } else {
              observer.next(allArtists);
              observer.complete();
            }
          },
          error: (err) => {
            observer.error(err);
          },
        });
      };

      fetchPage();
    });
  }

  // Check if user follows specific artists
  checkFollowingArtists(artistIds: string[]): Observable<any> {
    return this.http.get(`${this.baseUrl}/me/following/contains`, {
      headers: this.getAuthHeaders(),
      params: {
        type: 'artist',
        ids: artistIds.join(','),
      },
    });
  }

  // Follow an artist
  followArtist(artistId: string): Observable<any> {
    return this.http.put(`${this.baseUrl}/me/following`, null, {
      headers: this.getAuthHeaders(),
      params: {
        type: 'artist',
        ids: artistId,
      },
    });
  }

  // Unfollow an artist
  unfollowArtist(artistId: string): Observable<any> {
    return this.http.delete(`${this.baseUrl}/me/following`, {
      headers: this.getAuthHeaders(),
      params: {
        type: 'artist',
        ids: artistId,
      },
    });
  }

  // Get a user's public profile by ID
  getUserProfile(userId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/users/${userId}`, {
      headers: this.getAuthHeaders(),
    });
  }

  updateUserTableRefreshToken(): Observable<any> {
    this.refreshToken = this.AuthService.getRefreshToken();
    const url = `${this.xomifyApiUrl}/user/user-table`;
    const body = {
      email: this.user.email,
      userId: this.id,
      displayName: this.user.display_name || this.user.email,
      refreshToken: this.refreshToken,
    };
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
    return this.http.post(url, body, { headers });
  }

  updateUserTableEnrollments(
    wrappedEnrolled: boolean,
    releaseRadarEnrolled: boolean
  ): Observable<any> {
    this.refreshToken = this.AuthService.getRefreshToken();
    const url = `${this.xomifyApiUrl}/user/user-table`;
    const body = {
      email: this.user.email,
      wrappedEnrolled: wrappedEnrolled,
      releaseRadarEnrolled: releaseRadarEnrolled,
    };
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
    return this.http.post(url, body, { headers });
  }

  getUserTableData(email: string): Observable<any> {
    const url = `${
      this.xomifyApiUrl
    }/user/user-table?email=${encodeURIComponent(email)}`;
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
    return this.http.get(url, { headers });
  }

  setUser(data): void {
    this.userName = data.display_name;
    this.id = data.id;
    this.user = data;
  }

  getUser(): any {
    return this.user;
  }

  getProfilePic(): string {
    if (this.user?.images && this.user.images.length > 0) {
      // Get the largest image available
      return this.user.images[0].url;
    }
    return '';
  }

  getUserName(): string {
    return this.userName;
  }

  getEmail(): string {
    return this.user?.email || '';
  }

  getFollowers(): number {
    return this.user?.followers?.total || 0;
  }

  getAccessToken(): string {
    return this.accessToken;
  }

  getRefreshToken(): string {
    return this.refreshToken;
  }

  getUserId(): string {
    return this.id;
  }

  getWrappedEnrollment(): boolean {
    return this.activeWrapped;
  }

  getReleaseRadarEnrollment(): boolean {
    return this.activeReleaseRadar;
  }

  setWrappedEnrollment(enrolled: boolean): void {
    this.activeWrapped = enrolled;
  }

  setReleaseRadarEnrollment(enrolled: boolean): void {
    this.activeReleaseRadar = enrolled;
  }

  setPlaylistCount(count: number): void {
    this.playlistCount = count;
  }

  getPlaylistCount(): number {
    return this.playlistCount;
  }

  setFollowingCount(count: number): void {
    this.followingCount = count;
  }

  getFollowingCount(): number {
    return this.followingCount;
  }
}
