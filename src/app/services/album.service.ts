import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class AlbumService {
  private baseUrl = 'https://api.spotify.com/v1';

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getAuthHeaders(): HttpHeaders {
    const accessToken = this.authService.getAccessToken();
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken}`,
    });
  }

  // Get album details by ID
  getAlbumDetails(albumId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/albums/${albumId}`, {
      headers: this.getAuthHeaders(),
    });
  }

  // Get album tracks with pagination
  getAlbumTracks(albumId: string, limit: number = 50, offset: number = 0): Observable<any> {
    return this.http.get(`${this.baseUrl}/albums/${albumId}/tracks`, {
      headers: this.getAuthHeaders(),
      params: {
        limit: limit.toString(),
        offset: offset.toString(),
      },
    });
  }

  // Get multiple albums by IDs (comma-separated, max 20)
  getAlbumsByIds(ids: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/albums`, {
      headers: this.getAuthHeaders(),
      params: { ids },
    });
  }

  // Get new releases
  getNewReleases(limit: number = 20, offset: number = 0, country?: string): Observable<any> {
    const params: any = {
      limit: limit.toString(),
      offset: offset.toString(),
    };
    
    if (country) {
      params.country = country;
    }

    return this.http.get(`${this.baseUrl}/browse/new-releases`, {
      headers: this.getAuthHeaders(),
      params,
    });
  }

  // Check if albums are saved in user's library
  checkSavedAlbums(albumIds: string[]): Observable<boolean[]> {
    return this.http.get<boolean[]>(`${this.baseUrl}/me/albums/contains`, {
      headers: this.getAuthHeaders(),
      params: {
        ids: albumIds.join(','),
      },
    });
  }

  // Save albums to user's library
  saveAlbums(albumIds: string[]): Observable<any> {
    return this.http.put(
      `${this.baseUrl}/me/albums`,
      { ids: albumIds },
      { headers: this.getAuthHeaders() }
    );
  }

  // Remove albums from user's library
  removeAlbums(albumIds: string[]): Observable<any> {
    return this.http.delete(`${this.baseUrl}/me/albums`, {
      headers: this.getAuthHeaders(),
      body: { ids: albumIds },
    });
  }

  // Get user's saved albums
  getSavedAlbums(limit: number = 20, offset: number = 0): Observable<any> {
    return this.http.get(`${this.baseUrl}/me/albums`, {
      headers: this.getAuthHeaders(),
      params: {
        limit: limit.toString(),
        offset: offset.toString(),
      },
    });
  }
}
