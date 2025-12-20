import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { map, catchError } from 'rxjs/operators';
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

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {}

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
        limit: limit.toString()
      }
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
      params: { ids }
    });
  }

  // Get artist's top tracks
  getArtistTopTracks(artistId: string, market: string = 'US'): Observable<any> {
    return this.http.get(`${this.baseUrl}/artists/${artistId}/top-tracks`, {
      headers: this.getAuthHeaders(),
      params: { market }
    });
  }

  // Get related artists
  getRelatedArtists(artistId: string): Observable<any> {
    return this.http.get(`${this.baseUrl}/artists/${artistId}/related-artists`, {
      headers: this.getAuthHeaders(),
    });
  }

  // Get artist's albums (original method - has sorting limitation)
  getArtistAlbums(artistId: string, limit: number = 20, offset: number = 0, includeGroups: string = 'album,single'): Observable<any> {
    return this.http.get(`${this.baseUrl}/artists/${artistId}/albums`, {
      headers: this.getAuthHeaders(),
      params: {
        limit: limit.toString(),
        offset: offset.toString(),
        include_groups: includeGroups
      }
    });
  }

  /**
   * Get artist's recent releases - fetches each type separately to avoid Spotify's
   * sorting issue where albums come first, then singles (not mixed by date).
   * Returns combined results from albums, singles, and appears_on.
   */
  getArtistRecentReleases(artistId: string, limitPerType: number = 5): Observable<any> {
    const types = ['album', 'single', 'appears_on'];
    
    const requests = types.map(type => 
      this.http.get(`${this.baseUrl}/artists/${artistId}/albums`, {
        headers: this.getAuthHeaders(),
        params: {
          limit: limitPerType.toString(),
          include_groups: type
        }
      }).pipe(
        map((response: any) => response.items || []),
        catchError(() => of([]))
      )
    );

    return forkJoin(requests).pipe(
      map((results: any[]) => {
        // Flatten all results into single array (ES5 compatible)
        const allReleases = results.reduce((acc, arr) => acc.concat(arr), []);
        
        // Sort by release date descending
        allReleases.sort((a, b) => {
          const dateA = new Date(a.release_date).getTime();
          const dateB = new Date(b.release_date).getTime();
          return dateB - dateA;
        });
        
        return { items: allReleases };
      })
    );
  }

  // Search for artists
  searchArtists(query: string, limit: number = 20): Observable<any> {
    return this.http.get(`${this.baseUrl}/search`, {
      headers: this.getAuthHeaders(),
      params: {
        q: query,
        type: 'artist',
        limit: limit.toString()
      }
    });
  }
}
