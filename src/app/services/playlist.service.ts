import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, switchMap, expand, reduce, map } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment';
import { EMPTY } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class PlaylistService {
  private apiUrl = 'https://api.spotify.com/v1';

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getHeaders(): HttpHeaders {
    const token = this.authService.getAccessToken();
    return new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });
  }

  // ============================================
  // PLAYLIST CRUD OPERATIONS
  // ============================================

  /**
   * Get user's playlists
   */
  getUserPlaylists(limit: number = 50, offset: number = 0): Observable<any> {
    return this.http.get(`${this.apiUrl}/me/playlists`, {
      headers: this.getHeaders(),
      params: { limit: limit.toString(), offset: offset.toString() },
    });
  }

  /**
   * Get all user's playlists (paginated, returns all)
   */
  getAllUserPlaylists(): Observable<any[]> {
    const limit = 50;
    return this.getUserPlaylists(limit, 0).pipe(
      expand((response) => {
        if (response.next) {
          const nextOffset = response.offset + limit;
          return this.getUserPlaylists(limit, nextOffset);
        }
        return EMPTY;
      }),
      reduce((acc: any[], response) => {
        return acc.concat(response.items || []);
      }, [])
    );
  }

  /**
   * Get playlist details
   */
  getPlaylistDetails(playlistId: string): Observable<any> {
    return this.http.get(`${this.apiUrl}/playlists/${playlistId}`, {
      headers: this.getHeaders(),
    });
  }

  /**
   * Get playlist tracks with pagination
   */
  getPlaylistTracks(playlistId: string, limit: number = 50, offset: number = 0): Observable<any> {
    return this.http.get(`${this.apiUrl}/playlists/${playlistId}/tracks`, {
      headers: this.getHeaders(),
      params: { limit: limit.toString(), offset: offset.toString() },
    });
  }

  /**
   * Create a new playlist
   */
  createPlaylist(
    userId: string,
    name: string,
    description: string = '',
    isPublic: boolean = false
  ): Observable<any> {
    const body = {
      name,
      description,
      public: isPublic,
    };
    return this.http.post(`${this.apiUrl}/users/${userId}/playlists`, body, {
      headers: this.getHeaders(),
    });
  }

  /**
   * Add tracks to a playlist
   * Handles batching for large track lists (Spotify limit is 100 per request)
   */
  addTracksToPlaylist(playlistId: string, trackUris: string[]): Observable<any> {
    if (trackUris.length === 0) {
      return of({ snapshot_id: null });
    }

    // Spotify allows max 100 tracks per request
    if (trackUris.length <= 100) {
      return this.http.post(
        `${this.apiUrl}/playlists/${playlistId}/tracks`,
        { uris: trackUris },
        { headers: this.getHeaders() }
      );
    }

    // Batch requests for more than 100 tracks
    const batches: string[][] = [];
    for (let i = 0; i < trackUris.length; i += 100) {
      batches.push(trackUris.slice(i, i + 100));
    }

    // Chain the batch requests
    return batches.reduce(
      (chain, batch) =>
        chain.pipe(
          switchMap(() =>
            this.http.post(
              `${this.apiUrl}/playlists/${playlistId}/tracks`,
              { uris: batch },
              { headers: this.getHeaders() }
            )
          )
        ),
      of(null)
    );
  }

  /**
   * Legacy method name for backwards compatibility
   */
  addPlaylistSongs(playlist: any, trackUris: string[]): Observable<any> {
    return this.addTracksToPlaylist(playlist.id, trackUris);
  }

  /**
   * Remove tracks from a playlist
   */
  removeTracksFromPlaylist(playlistId: string, trackUris: string[]): Observable<any> {
    const tracks = trackUris.map(uri => ({ uri }));
    return this.http.delete(`${this.apiUrl}/playlists/${playlistId}/tracks`, {
      headers: this.getHeaders(),
      body: { tracks },
    });
  }

  /**
   * Update playlist details
   */
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

    return this.http.put(`${this.apiUrl}/playlists/${playlistId}`, body, {
      headers: this.getHeaders(),
    });
  }

  // ============================================
  // PLAYLIST IMAGE OPERATIONS
  // ============================================

  /**
   * Upload a custom image to a playlist
   * @param playlistId - The Spotify playlist ID
   * @param base64Image - Base64 encoded JPEG image (max 256KB)
   */
  uploadPlaylistImage(playlistId: string, base64Image: string): Observable<any> {
    // Remove data URL prefix if present
    let imageData = base64Image;
    if (imageData.includes('base64,')) {
      imageData = imageData.split('base64,')[1];
    }
    // Remove any newlines
    imageData = imageData.replace(/\n/g, '').replace(/\r/g, '');

    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'image/jpeg',
    });

    return this.http.put(
      `${this.apiUrl}/playlists/${playlistId}/images`,
      imageData,
      { headers }
    );
  }

  /**
   * Upload the Xomify logo to a playlist
   * Uses the logo from environment config
   */
  uploadXomifyLogo(playlistId: string): Observable<any> {
    if (!environment.logoBase64) {
      console.warn('No logo configured in environment');
      return of(null);
    }
    return this.uploadPlaylistImage(playlistId, environment.logoBase64);
  }

  /**
   * Create a playlist with tracks and optional Xomify branding
   * Convenience method that handles the full flow
   */
  createPlaylistWithTracks(
    userId: string,
    name: string,
    description: string,
    trackUris: string[],
    options: {
      isPublic?: boolean;
      addXomifyLogo?: boolean;
    } = {}
  ): Observable<any> {
    const { isPublic = false, addXomifyLogo = true } = options;

    return this.createPlaylist(userId, name, description, isPublic).pipe(
      switchMap((playlist) => {
        return this.addTracksToPlaylist(playlist.id, trackUris).pipe(
          switchMap(() => {
            if (addXomifyLogo && environment.logoBase64) {
              return this.uploadXomifyLogo(playlist.id).pipe(
                // Don't fail if image upload fails
                catchError((err) => {
                  console.warn('Failed to upload playlist image:', err);
                  return of(null);
                }),
                switchMap(() => of(playlist))
              );
            }
            return of(playlist);
          })
        );
      })
    );
  }

  // ============================================
  // SEARCH OPERATIONS
  // ============================================

  /**
   * Search for tracks
   */
  searchTracks(query: string, limit: number = 20): Observable<any> {
    if (!query || !query.trim()) {
      return of({ tracks: { items: [] } });
    }

    return this.http.get(`${this.apiUrl}/search`, {
      headers: this.getHeaders(),
      params: {
        q: query,
        type: 'track',
        limit: limit.toString(),
      },
    }).pipe(
      catchError((error) => {
        console.error('Search error:', error);
        return of({ tracks: { items: [] } });
      })
    );
  }

  /**
   * Search for playlists
   */
  searchPlaylists(query: string, limit: number = 20): Observable<any> {
    return this.http.get(`${this.apiUrl}/search`, {
      headers: this.getHeaders(),
      params: {
        q: query,
        type: 'playlist',
        limit: limit.toString(),
      },
    });
  }

  // ============================================
  // FOLLOW OPERATIONS
  // ============================================

  /**
   * Follow a playlist
   */
  followPlaylist(playlistId: string): Observable<any> {
    return this.http.put(
      `${this.apiUrl}/playlists/${playlistId}/followers`,
      {},
      { headers: this.getHeaders() }
    );
  }

  /**
   * Unfollow a playlist
   */
  unfollowPlaylist(playlistId: string): Observable<any> {
    return this.http.delete(
      `${this.apiUrl}/playlists/${playlistId}/followers`,
      { headers: this.getHeaders() }
    );
  }

  /**
   * Check if user follows a playlist
   */
  checkFollowsPlaylist(playlistId: string, userId: string): Observable<boolean[]> {
    return this.http.get<boolean[]>(
      `${this.apiUrl}/playlists/${playlistId}/followers/contains`,
      {
        headers: this.getHeaders(),
        params: { ids: userId },
      }
    );
  }
}
