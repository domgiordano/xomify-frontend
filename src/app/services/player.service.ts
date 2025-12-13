import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { AuthService } from './auth.service';

@Injectable({
  providedIn: 'root',
})
export class PlayerService {
  private playerReadySubject = new BehaviorSubject<boolean>(false);
  private currentTrackIdSubject = new BehaviorSubject<string | null>(null);
  private isLoadingSubject = new BehaviorSubject<boolean>(false);
  private isPlayingSubject = new BehaviorSubject<boolean>(false);

  playerReady$ = this.playerReadySubject.asObservable();
  currentTrackId$ = this.currentTrackIdSubject.asObservable();
  isLoading$ = this.isLoadingSubject.asObservable();
  isPlaying$ = this.isPlayingSubject.asObservable();

  private deviceId: string | null = null;
  private player: any = null;

  constructor(private http: HttpClient, private authService: AuthService) {
    this.initializePlayer();
  }

  private initializePlayer(): void {
    // Check if Spotify SDK is available
    if (typeof window !== 'undefined' && (window as any).Spotify) {
      this.setupPlayer();
    } else {
      // Wait for SDK to load
      (window as any).onSpotifyWebPlaybackSDKReady = () => {
        this.setupPlayer();
      };
    }
  }

  private setupPlayer(): void {
    const token = this.authService.getAccessToken();
    if (!token) {
      console.warn('No access token available for player');
      return;
    }

    this.player = new (window as any).Spotify.Player({
      name: 'Xomify Web Player',
      getOAuthToken: (cb: (token: string) => void) => {
        cb(this.authService.getAccessToken());
      },
      volume: 0.5,
    });

    // Ready
    this.player.addListener('ready', ({ device_id }: { device_id: string }) => {
      console.log('Spotify Player Ready with Device ID:', device_id);
      this.deviceId = device_id;
      this.playerReadySubject.next(true);
    });

    // Not Ready
    this.player.addListener(
      'not_ready',
      ({ device_id }: { device_id: string }) => {
        console.log('Device ID has gone offline:', device_id);
        this.playerReadySubject.next(false);
      }
    );

    // Player state changed
    this.player.addListener('player_state_changed', (state: any) => {
      if (!state) {
        this.isPlayingSubject.next(false);
        this.currentTrackIdSubject.next(null);
        return;
      }

      this.isPlayingSubject.next(!state.paused);

      if (state.track_window?.current_track) {
        const trackUri = state.track_window.current_track.uri;
        const trackId = trackUri.split(':').pop();
        this.currentTrackIdSubject.next(trackId);
      }
    });

    // Errors
    this.player.addListener(
      'initialization_error',
      ({ message }: { message: string }) => {
        console.error('Initialization Error:', message);
      }
    );

    this.player.addListener(
      'authentication_error',
      ({ message }: { message: string }) => {
        console.error('Authentication Error:', message);
        this.playerReadySubject.next(false);
      }
    );

    this.player.addListener(
      'account_error',
      ({ message }: { message: string }) => {
        console.error('Account Error:', message);
      }
    );

    this.player.addListener(
      'playback_error',
      ({ message }: { message: string }) => {
        console.error('Playback Error:', message);
        this.isLoadingSubject.next(false);
      }
    );

    // Connect player
    this.player.connect().then((success: boolean) => {
      if (success) {
        console.log('Spotify Player connected successfully');
      }
    });
  }

  playSong(trackId: string): void {
    if (!this.deviceId) {
      console.warn('No device ID available');
      return;
    }

    // If same track, toggle play/pause
    if (this.currentTrackIdSubject.getValue() === trackId) {
      this.togglePlayPause();
      return;
    }

    this.isLoadingSubject.next(true);
    this.currentTrackIdSubject.next(trackId);

    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    const body = {
      uris: [`spotify:track:${trackId}`],
    };

    this.http
      .put(
        `https://api.spotify.com/v1/me/player/play?device_id=${this.deviceId}`,
        body,
        { headers }
      )
      .subscribe({
        next: () => {
          this.isLoadingSubject.next(false);
          this.isPlayingSubject.next(true);
        },
        error: (err) => {
          console.error('Error playing song:', err);
          this.isLoadingSubject.next(false);
          this.currentTrackIdSubject.next(null);
        },
      });
  }

  stopSong(): void {
    if (this.player) {
      this.player.pause().then(() => {
        this.isPlayingSubject.next(false);
      });
    }
  }

  togglePlayPause(): void {
    if (this.player) {
      this.player.togglePlay();
    }
  }

  resume(): void {
    if (this.player) {
      this.player.resume().then(() => {
        this.isPlayingSubject.next(true);
      });
    }
  }

  setVolume(volume: number): void {
    if (this.player) {
      this.player.setVolume(volume);
    }
  }

  seek(positionMs: number): void {
    if (this.player) {
      this.player.seek(positionMs);
    }
  }

  getCurrentState(): Promise<any> {
    if (this.player) {
      return this.player.getCurrentState();
    }
    return Promise.resolve(null);
  }

  // Getters for current values
  get isPlayerReady(): boolean {
    return this.playerReadySubject.getValue();
  }

  get currentTrackId(): string | null {
    return this.currentTrackIdSubject.getValue();
  }

  get isCurrentlyPlaying(): boolean {
    return this.isPlayingSubject.getValue();
  }

  disconnect(): void {
    if (this.player) {
      this.player.disconnect();
      this.playerReadySubject.next(false);
      this.currentTrackIdSubject.next(null);
      this.isPlayingSubject.next(false);
    }
  }
}
