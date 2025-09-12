// user.service.ts
import { Injectable, OnInit } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { AuthService } from './auth.service';
import { environment } from 'src/environments/environment.prod';

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
  private baseUrl = 'https://api.spotify.com/v1';
  private xomifyApiUrl: string = `https://${environment.apiId}.execute-api.us-east-1.amazonaws.com/dev`;
  private readonly apiAuthToken = environment.apiAuthToken;

  constructor(
      private http: HttpClient,
      private AuthService: AuthService
    ) {}

  ngOnInit() {
    this.accessToken = this.AuthService.getAccessToken();
    this.refreshToken = this.AuthService.getRefreshToken();
  }

  getUserData(): Observable<any> {
    this.accessToken = this.AuthService.getAccessToken();
    return this.http.get(`${this.baseUrl}/me`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
        },
      })
  }

  updateUserTableRefreshToken(): Observable<any> {
        this.refreshToken = this.AuthService.getRefreshToken();
        const url = `${this.xomifyApiUrl}/user/user-table`;
        const body =  {
          email: this.user.email,
          userId: this.id,
          refreshToken: this.refreshToken
        };
        const headers = new HttpHeaders({
            Authorization: `Bearer ${this.apiAuthToken}`,
            'Content-Type': 'application/json'
        });
        return this.http.post(url, body, { headers });
    }

  updateUserTableEnrollments(wrappedEnrolled: boolean, releaseRadarEnrolled: boolean): Observable<any> {
        this.refreshToken = this.AuthService.getRefreshToken();
        const url = `${this.xomifyApiUrl}/user/user-table`;
        const body =  {
          email: this.user.email,
          wrappedEnrolled: wrappedEnrolled,
          releaseRadarEnrolled: releaseRadarEnrolled
        };
        const headers = new HttpHeaders({
            Authorization: `Bearer ${this.apiAuthToken}`,
            'Content-Type': 'application/json'
        });
        return this.http.post(url, body, { headers });
    }

  setUser(data): void{
      this.userName = data.display_name;
      this.id = data.id;
      this.user = data;
  }
  getUser(): any {
       return this.user;
  }
  getProfilePic(): string {
      return this.user.images[0].url;
  }

  getUserName(): string {
      return this.userName;
  }

  getEmail(): string {
      return this.user.email;
  }

  getFollowers(): number {
      return this.user.followers.total;
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
}
