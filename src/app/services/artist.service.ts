import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable } from 'rxjs';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class ArtistService {
  private baseUrl = 'https://api.spotify.com/v1';

  // Cached top artists by term
  private topArtistsShortTerm: any[] = [];
  private topArtistsMedTerm: any[] = [];
  private topArtistsLongTerm: any[] = [];

  constructor(private http: HttpClient, private authService: AuthService) {}

  private getAuthHeaders(): HttpHeaders {
    const accessToken = this.authService.getAccessToken();
    return new HttpHeaders({
      Authorization: `Bearer ${accessToken}`,
    });
  }

  // ============================================
  // TOP ARTISTS - API CALLS
  // ============================================

  // Get user's top artists by time range
  getTopArtists(term: string, limit: number = 50): Observable<any> {
    return this.http.get(`${this.baseUrl}/me/top/artists`, {
      headers: this.getAuthHeaders(),
      params: {
        time_range: term,
        limit: limit.toString(),
      },
    });
  }

  // ============================================
  // TOP ARTISTS - CACHE GETTERS/SETTERS
  // ============================================

  getShortTermTopArtists(): any[] {
    return this.topArtistsShortTerm;
  }

  getMedTermTopArtists(): any[] {
    return this.topArtistsMedTerm;
  }

  getLongTermTopArtists(): any[] {
    return this.topArtistsLongTerm;
  }

  setShortTermTopArtists(artists: any[]): void {
    this.topArtistsShortTerm = artists;
  }

  setMedTermTopArtists(artists: any[]): void {
    this.topArtistsMedTerm = artists;
  }

  setLongTermTopArtists(artists: any[]): void {
    this.topArtistsLongTerm = artists;
  }

  // ============================================
  // ARTIST DETAILS
  // ============================================

  // Get artist details by ID
  getArtistDetails(artistId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/artists/${artistId}`, {
      headers: this.getAuthHeaders(),
    });
  }

  // Get multiple artists by IDs (comma-separated)
  getArtistsByIds(ids: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/artists`, {
      headers: this.getAuthHeaders(),
      params: { ids },
    });
  }

  // Get artist's top tracks
  getArtistTopTracks(artistId: string, market: string = 'US'): Observable<any> {
    return this.http.get(`${this.baseUrl}/artists/${artistId}/top-tracks`, {
      headers: this.getAuthHeaders(),
      params: { market },
    });
  }

  // Get related artists
  getRelatedArtists(artistId: string): Observable<any> {
    return this.http.get(
      `${this.baseUrl}/artists/${artistId}/related-artists`,
      {
        headers: this.getAuthHeaders(),
      }
    );
  }

  // Get artist's albums
  getArtistAlbums(
    artistId: string,
    limit: number = 20,
    offset: number = 0
  ): Observable<any> {
    return this.http.get(`${this.baseUrl}/artists/${artistId}/albums`, {
      headers: this.getAuthHeaders(),
      params: {
        limit: limit.toString(),
        offset: offset.toString(),
        include_groups: 'album,single',
      },
    });
  }

  // Search for artists
  searchArtists(query: string, limit: number = 20): Observable<any> {
    return this.http.get(`${this.baseUrl}/search`, {
      headers: this.getAuthHeaders(),
      params: {
        q: query,
        type: 'artist',
        limit: limit.toString(),
      },
    });
  }
}
