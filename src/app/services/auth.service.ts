// auth.service.ts
import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from 'src/environments/environment';
import { ToastService } from './toast.service';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly clientId = environment.spotifyClientId;
  private readonly clientSecret = environment.spotifyClientSecret;
  private readonly redirectUri = `${environment.baseCallbackUrl}/callback`;
  private readonly scope =
    'user-read-private user-read-email user-library-read user-top-read playlist-modify-public playlist-modify-private playlist-read-private playlist-read-collaborative ugc-image-upload user-follow-read user-modify-playback-state user-read-playback-state streaming';
  accessToken: string = '';
  refreshToken: string = '';

  constructor(
    private http: HttpClient,
    private router: Router,
    private ToastService: ToastService
  ) {}

  login() {
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${
      this.clientId
    }&redirect_uri=${encodeURIComponent(
      this.redirectUri
    )}&scope=${encodeURIComponent(this.scope)}&response_type=code`;
    window.location.href = authUrl;
  }

  handleCallback() {
    const code = new URL(window.location.href).searchParams.get('code');

    if (code) {
      this.exchangeCodeForToken(code);
    }
  }

  private exchangeCodeForToken(code: string) {
    const tokenUrl = 'https://accounts.spotify.com/api/token';
    const body = new URLSearchParams();

    body.set('grant_type', 'authorization_code');
    body.set('code', code);
    body.set('redirect_uri', this.redirectUri);
    body.set('client_id', this.clientId);
    body.set('client_secret', this.clientSecret); // Sending the Client Secret

    this.http
      .post(tokenUrl, body.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      })
      .subscribe({
        next: (response: any) => {
          this.accessToken = response.access_token;
          this.refreshToken = response.refresh_token;
          console.log('Tokens saved.');
          this.router.navigate(['/my-profile']); // Navigate after login
        },
        error: (err) => {
          this.ToastService.showNegativeToast('Token exchange failed.');
          console.error('Token exchange failed', err);
        },
      });
  }

  logout() {
    this.accessToken = '';
    this.refreshToken = '';
    // Optionally navigate to login or home page
  }

  getAccessToken() {
    return this.accessToken;
  }
  getRefreshToken() {
    return this.refreshToken;
  }

  isLoggedIn(): boolean {
    if (!this.accessToken || this.accessToken.trim() === '') {
      return false;
    } else {
      return true;
    }
  }
}
