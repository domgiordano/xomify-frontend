import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

export interface MonthlyWrap {
  monthKey: string; // "YYYY-MM" format
  topSongIds: {
    short_term: string[];
    medium_term: string[];
    long_term: string[];
  };
  topArtistIds: {
    short_term: string[];
    medium_term: string[];
    long_term: string[];
  };
  topGenres: {
    short_term: { [genre: string]: number };
    medium_term: { [genre: string]: number };
    long_term: { [genre: string]: number };
  };
  createdAt: string;
}

export interface WrappedDataResponse {
  active: boolean;
  activeWrapped: boolean;
  activeReleaseRadar: boolean;
  wraps: MonthlyWrap[];
}

@Injectable({
  providedIn: 'root',
})
export class WrappedService {
  private xomifyApiUrl: string = environment.xomifyApiUrl;
  private readonly apiAuthToken = environment.apiAuthToken;

  constructor(private http: HttpClient) {}

  private getHeaders(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
  }

  /**
   * Get all wrapped data for a user including enrollment status and history.
   * Returns wraps sorted newest first.
   */
  getUserWrappedData(email: string): Observable<WrappedDataResponse> {
    const url = `${this.xomifyApiUrl}/wrapped/data?email=${encodeURIComponent(
      email
    )}`;
    return this.http
      .get<WrappedDataResponse>(url, { headers: this.getHeaders() })
      .pipe(
        map((response) => {
          // Ensure wraps array exists
          if (!response.wraps) {
            response.wraps = [];
          }
          return response;
        }),
        catchError((error) => {
          console.error('Error fetching wrapped data:', error);
          return of({
            active: false,
            activeWrapped: false,
            activeReleaseRadar: false,
            wraps: [],
          });
        })
      );
  }

  /**
   * Get wrapped data for a specific month.
   */
  getWrappedMonth(
    email: string,
    monthKey: string
  ): Observable<MonthlyWrap | null> {
    const url = `${this.xomifyApiUrl}/wrapped/month?email=${encodeURIComponent(
      email
    )}&monthKey=${encodeURIComponent(monthKey)}`;
    return this.http.get<MonthlyWrap>(url, { headers: this.getHeaders() }).pipe(
      catchError((error) => {
        console.error(`Error fetching wrapped for ${monthKey}:`, error);
        return of(null);
      })
    );
  }

  /**
   * Get all wrapped data for a specific year.
   */
  getWrappedYear(email: string, year: string): Observable<MonthlyWrap[]> {
    const url = `${this.xomifyApiUrl}/wrapped/year?email=${encodeURIComponent(
      email
    )}&year=${encodeURIComponent(year)}`;
    return this.http
      .get<MonthlyWrap[]>(url, { headers: this.getHeaders() })
      .pipe(
        catchError((error) => {
          console.error(`Error fetching wrapped for year ${year}:`, error);
          return of([]);
        })
      );
  }

  /**
   * Opt user in or out of monthly wrapped.
   */
  optInOrOutUserForWrapped(
    email: string,
    userId: string,
    refreshToken: string,
    optIn: boolean
  ): Observable<any> {
    const url = `${this.xomifyApiUrl}/wrapped/data`;
    const body = {
      email: email,
      userId: userId,
      refreshToken: refreshToken,
      active: optIn,
    };
    return this.http.post(url, body, { headers: this.getHeaders() });
  }
}
