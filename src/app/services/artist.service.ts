import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders, HttpParams } from '@angular/common/http';
import { Observable, throwError } from 'rxjs';
import { catchError, tap } from 'rxjs/operators';
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
    console.log('ArtistService: Getting artist details for:', artistId);
    return this.http
      .get(`${this.baseUrl}/artists/${artistId}`, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        tap((response) =>
          console.log('ArtistService: Artist details response:', response)
        ),
        catchError((error) => {
          console.error('ArtistService: Error getting artist details:', error);
          return throwError(() => error);
        })
      );
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
    console.log(
      'ArtistService: Getting top tracks for:',
      artistId,
      'market:',
      market
    );

    // Use HttpParams for cleaner parameter handling
    const params = new HttpParams().set('market', market);

    return this.http
      .get(`${this.baseUrl}/artists/${artistId}/top-tracks`, {
        headers: this.getAuthHeaders(),
        params: params,
      })
      .pipe(
        tap((response) =>
          console.log('ArtistService: Top tracks response:', response)
        ),
        catchError((error) => {
          console.error('ArtistService: Error getting top tracks:', error);
          console.error('ArtistService: Error status:', error.status);
          console.error('ArtistService: Error message:', error.message);
          return throwError(() => error);
        })
      );
  }

  // Get related artists
  getRelatedArtists(artistId: string): Observable<any> {
    console.log('ArtistService: Getting related artists for:', artistId);
    return this.http
      .get(`${this.baseUrl}/artists/${artistId}/related-artists`, {
        headers: this.getAuthHeaders(),
      })
      .pipe(
        tap((response) =>
          console.log('ArtistService: Related artists response:', response)
        ),
        catchError((error) => {
          console.error('ArtistService: Error getting related artists:', error);
          console.error('ArtistService: Error status:', error.status);
          return throwError(() => error);
        })
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
