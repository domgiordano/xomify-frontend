import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { environment } from 'src/environments/environment';

@Injectable({
  providedIn: 'root',
})
export class WrappedService {
  private xomifyApiUrl: string = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  private readonly apiAuthToken = environment.apiAuthToken;
  constructor(private http: HttpClient) {}

  // Method to get user wrapped data based on the selected term (short, medium, long)
  getUserWrappedData(email: string): Observable<any> {
    const url = `${this.xomifyApiUrl}/wrapped/data?email=${email}`;
    const headers = {
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    };
    return this.http.get(url, { headers });
  }

  // Optional method to sign up the user for monthly wrapped (if not opted in)
  optInOrOutUserForWrapped(
    email: string,
    id: string,
    refreshToken: string,
    optIn: boolean,
    topSongIdsLastMonth: any = { short_term: [], med_term: [], long_term: [] },
    topArtistIdsLastMonth: any = {
      short_term: [],
      med_term: [],
      long_term: [],
    },
    topGenresLastMonth: any = { short_term: [], med_term: [], long_term: [] },
    topSongIdsTwoMonthsAgo: any = {
      short_term: [],
      med_term: [],
      long_term: [],
    },
    topArtistIdsTwoMonthsAgo: any = {
      short_term: [],
      med_term: [],
      long_term: [],
    },
    topGenresTwoMonthsAgo: any = { short_term: [], med_term: [], long_term: [] }
  ): Observable<any> {
    const url = `${this.xomifyApiUrl}/wrapped/data`;
    const body = {
      email: email,
      userId: id,
      refreshToken: refreshToken,
      active: optIn,
      topSongIdsLastMonth: topSongIdsLastMonth,
      topArtistIdsLastMonth: topArtistIdsLastMonth,
      topGenresLastMonth: topGenresLastMonth,
      topSongIdsTwoMonthsAgo: topSongIdsTwoMonthsAgo,
      topArtistIdsTwoMonthsAgo: topArtistIdsTwoMonthsAgo,
      topGenresTwoMonthsAgo: topGenresTwoMonthsAgo,
    };
    const headers = new HttpHeaders({
      Authorization: `Bearer ${this.apiAuthToken}`,
      'Content-Type': 'application/json',
    });
    return this.http.post(url, body, { headers });
  }
}
