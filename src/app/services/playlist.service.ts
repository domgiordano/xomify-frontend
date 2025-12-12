import { Injectable, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class PlaylistService implements OnInit {
  private accessToken: string;
  private baseUrl = 'https://api.spotify.com/v1';

  constructor(private http: HttpClient, private AuthService: AuthService) {}

  ngOnInit() {
    this.accessToken = this.AuthService.getAccessToken();
  }

  private getAuthHeaders(): HttpHeaders {
    this.accessToken = this.AuthService.getAccessToken();
    return new HttpHeaders({
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    });
  }

  // ============================================
  // GET PLAYLISTS
  // ============================================

  // Get user's playlists with pagination
  getUserPlaylists(limit: number = 50, offset: number = 0): Observable<any> {
    return this.http.get(`${this.baseUrl}/me/playlists`, {
      headers: this.getAuthHeaders(),
      params: {
        limit: limit.toString(),
        offset: offset.toString(),
      },
    });
  }

  // Get all user playlists (handles pagination)
  getAllUserPlaylists(): Observable<any[]> {
    return new Observable((observer) => {
      const allPlaylists: any[] = [];

      const fetchPage = (offset: number = 0) => {
        this.getUserPlaylists(50, offset).subscribe({
          next: (data) => {
            const playlists = data.items || [];
            allPlaylists.push(...playlists);

            // Check if there are more playlists
            if (data.next && playlists.length === 50) {
              fetchPage(offset + 50);
            } else {
              observer.next(allPlaylists);
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

  // Get playlist details by ID
  getPlaylistDetails(playlistId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/playlists/${playlistId}`, {
      headers: this.getAuthHeaders(),
    });
  }

  // Get playlist tracks with pagination
  getPlaylistTracks(
    playlistId: string,
    limit: number = 50,
    offset: number = 0
  ): Observable<any> {
    return this.http.get(`${this.baseUrl}/playlists/${playlistId}/tracks`, {
      headers: this.getAuthHeaders(),
      params: {
        limit: limit.toString(),
        offset: offset.toString(),
      },
    });
  }

  // ============================================
  // CREATE & MODIFY PLAYLISTS
  // ============================================

  createPlaylist(
    userId: string,
    playlistName: string,
    playlistDesc: string
  ): Observable<any> {
    const url = `${this.baseUrl}/users/${userId}/playlists`;
    const body = {
      name: playlistName,
      description: playlistDesc,
      public: true,
    };
    return this.http.post(url, body, { headers: this.getAuthHeaders() });
  }

  addPlaylistSongs(playlist: any, uriList: string[]): Observable<any> {
    const url = `${this.baseUrl}/playlists/${playlist.id}/tracks`;
    const body = {
      uris: uriList,
    };
    return this.http.post(url, body, { headers: this.getAuthHeaders() });
  }

  uploadPlaylistImage(
    playlistId: string,
    base64Image: string
  ): Observable<any> {
    this.accessToken = this.AuthService.getAccessToken();
    const url = `${this.baseUrl}/playlists/${playlistId}/images`;
    const body = base64Image;
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'image/jpeg',
    });
    return this.http.put(url, body, { headers });
  }

  // ============================================
  // PLAYLIST MANAGEMENT
  // ============================================

  // Update playlist details
  updatePlaylistDetails(
    playlistId: string,
    name?: string,
    description?: string,
    isPublic?: boolean
  ): Observable<any> {
    const body: any = {};
    if (name !== undefined) body.name = name;
    if (description !== undefined) body.description = description;
    if (isPublic !== undefined) body.public = isPublic;

    return this.http.put(`${this.baseUrl}/playlists/${playlistId}`, body, {
      headers: this.getAuthHeaders(),
    });
  }

  // Remove tracks from playlist
  removePlaylistTracks(
    playlistId: string,
    trackUris: string[]
  ): Observable<any> {
    const url = `${this.baseUrl}/playlists/${playlistId}/tracks`;
    const body = {
      tracks: trackUris.map((uri) => ({ uri })),
    };
    return this.http.request('DELETE', url, {
      headers: this.getAuthHeaders(),
      body: body,
    });
  }

  // Check if user follows a playlist
  checkPlaylistFollowed(
    playlistId: string,
    userIds: string[]
  ): Observable<boolean[]> {
    return this.http.get<boolean[]>(
      `${this.baseUrl}/playlists/${playlistId}/followers/contains`,
      {
        headers: this.getAuthHeaders(),
        params: {
          ids: userIds.join(','),
        },
      }
    );
  }

  // Follow a playlist
  followPlaylist(
    playlistId: string,
    isPublic: boolean = true
  ): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/playlists/${playlistId}/followers`,
      { public: isPublic },
      { headers: this.getAuthHeaders() }
    );
  }

  // Unfollow a playlist
  unfollowPlaylist(playlistId: string): Observable<any> {
    return this.http.delete(
      `${this.baseUrl}/playlists/${playlistId}/followers`,
      {
        headers: this.getAuthHeaders(),
      }
    );
  }
}
