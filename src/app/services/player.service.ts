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
  private sdkReady = false;

  constructor(private http: HttpClient, private authService: AuthService) {
    this.waitForSpotifySDK();
  }

  private waitForSpotifySDK(): void {
    if (typeof window !== 'undefined') {
      if ((window as any).Spotify?.Player) {
        this.sdkReady = true;
        this.initializePlayer();
      } else {
        (window as any).onSpotifyWebPlaybackSDKReady = () => {
          console.log('Spotify SDK Ready');
          this.sdkReady = true;
          this.initializePlayer();
        };
      }
    }
  }

  private initializePlayer(): void {
    const token = this.authService.getAccessToken();
    if (!token) {
      console.warn('No access token available for player');
      return;
    }

    if (!this.sdkReady || !(window as any).Spotify?.Player) {
      console.warn('Spotify SDK not ready');
      return;
    }

    try {
      this.player = new (window as any).Spotify.Player({
        name: 'Xomify Web Player',
        getOAuthToken: (cb: (token: string) => void) => {
          cb(this.authService.getAccessToken());
        },
        volume: 0.5,
      });

      this.player.addListener(
        'ready',
        ({ device_id }: { device_id: string }) => {
          console.log('Spotify Player Ready with Device ID:', device_id);
          this.deviceId = device_id;
          this.playerReadySubject.next(true);
        }
      );

      this.player.addListener(
        'not_ready',
        ({ device_id }: { device_id: string }) => {
          console.log('Device ID has gone offline:', device_id);
          this.playerReadySubject.next(false);
        }
      );

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
          console.error('Account Error (Premium required):', message);
        }
      );

      this.player.addListener(
        'playback_error',
        ({ message }: { message: string }) => {
          console.error('Playback Error:', message);
          this.isLoadingSubject.next(false);
        }
      );

      this.player.connect().then((success: boolean) => {
        if (success) {
          console.log('Spotify Player connected successfully');
        } else {
          console.warn('Failed to connect Spotify Player');
        }
      });
    } catch (error) {
      console.error('Error initializing Spotify Player:', error);
    }
  }

  tryInitializePlayer(): void {
    if (this.sdkReady && !this.player) {
      this.initializePlayer();
    } else if (!this.sdkReady) {
      this.waitForSpotifySDK();
    }
  }

  playSong(trackId: string): void {
    if (!this.deviceId) {
      console.warn('No device ID available');
      return;
    }

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

    const body = { uris: [`spotify:track:${trackId}`] };

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

  playContext(contextUri: string, trackId?: string): void {
    if (!this.deviceId) {
      console.warn('No device ID available');
      return;
    }

    this.isLoadingSubject.next(true);
    if (trackId) {
      this.currentTrackIdSubject.next(trackId);
    }

    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    const body: any = { context_uri: contextUri };
    if (trackId) {
      body.offset = { uri: `spotify:track:${trackId}` };
    }

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
          console.error('Error playing context:', err);
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

  get isPlayerReady(): boolean {
    return this.playerReadySubject.getValue();
  }

  get currentTrackId(): string | null {
    return this.currentTrackIdSubject.getValue();
  }

  get isCurrentlyPlaying(): boolean {
    return this.isPlayingSubject.getValue();
  }

  // Add track to Spotify's queue (plays on user's active session)
  addToSpotifyQueue(trackId: string): Observable<boolean> {
    console.log('[Queue] Starting addToSpotifyQueue for track:', trackId);

    return new Observable((observer) => {
      // First, check for active devices before attempting to add to queue
      this.getAvailableDevices().subscribe({
        next: (devicesResponse) => {
          const devices = devicesResponse.devices || [];
          const activeDevice = devices.find((d: any) => d.is_active);

          console.log('[Queue] Available devices:', devices.length);
          console.log('[Queue] Active device:', activeDevice?.name || 'none');

          if (!activeDevice && devices.length === 0) {
            // No devices available at all
            console.error('[Queue] No Spotify devices available');
            observer.next(false);
            observer.complete();
            return;
          }

          if (!activeDevice && devices.length > 0) {
            // Devices exist but none are active - activate one first
            console.log('[Queue] No active device, activating first available...');
            const deviceToActivate = devices[0];

            this.transferPlayback(deviceToActivate.id).subscribe({
              next: () => {
                console.log('[Queue] Device activated:', deviceToActivate.name);
                // Wait for device to be ready, then add to queue
                setTimeout(() => {
                  this.attemptAddToQueue(trackId, observer);
                }, 1500);
              },
              error: (err) => {
                console.error('[Queue] Failed to activate device:', err);
                observer.next(false);
                observer.complete();
              },
            });
          } else {
            // Active device exists, directly add to queue
            console.log('[Queue] Active device found, adding to queue...');
            this.attemptAddToQueue(trackId, observer);
          }
        },
        error: (err) => {
          console.error('[Queue] Error fetching devices:', err);
          // Fallback: try to add to queue anyway
          this.attemptAddToQueue(trackId, observer);
        },
      });
    });
  }

  // Helper method to attempt adding track to queue
  private attemptAddToQueue(trackId: string, observer: any): void {
    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });
    const uri = `spotify:track:${trackId}`;

    this.http
      .post(
        `https://api.spotify.com/v1/me/player/queue?uri=${encodeURIComponent(uri)}`,
        null,
        { headers, responseType: 'text' }
      )
      .subscribe({
        next: () => {
          console.log('[Queue] Successfully added to queue');
          observer.next(true);
          observer.complete();
        },
        error: (err) => {
          console.error('[Queue] Failed to add to queue:', err);
          console.error('[Queue] Error status:', err.status);
          console.error('[Queue] Error message:', err.message);
          observer.next(false);
          observer.complete();
        },
      });
  }

  // Play next - adds to queue which effectively plays next
  playNext(trackId: string): Observable<boolean> {
    return this.addToSpotifyQueue(trackId);
  }

  // Get available Spotify devices
  private getAvailableDevices(): Observable<any> {
    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
    });

    return this.http.get('https://api.spotify.com/v1/me/player/devices', { headers });
  }

  // Transfer playback to a specific device
  private transferPlayback(deviceId: string): Observable<any> {
    const token = this.authService.getAccessToken();
    const headers = new HttpHeaders({
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    });

    const body = {
      device_ids: [deviceId],
      play: false,
    };

    return this.http.put(
      'https://api.spotify.com/v1/me/player',
      body,
      { headers, responseType: 'text' }
    );
  }

  // Activate a device (prioritize web player, then any available device)
  private activateDevice(): Observable<boolean> {
    return new Observable((observer) => {
      // First, check if our web player device is available
      if (this.deviceId) {
        console.log('Activating web player device:', this.deviceId);
        this.transferPlayback(this.deviceId).subscribe({
          next: () => {
            console.log('Web player activated successfully');
            observer.next(true);
            observer.complete();
          },
          error: (err) => {
            console.error('Error activating web player:', err);
            // If web player fails, try to find any available device
            this.tryActivateAnyDevice(observer);
          },
        });
      } else {
        // No web player, try to find any available device
        this.tryActivateAnyDevice(observer);
      }
    });
  }

  // Try to activate any available device
  private tryActivateAnyDevice(observer: any): void {
    this.getAvailableDevices().subscribe({
      next: (response) => {
        const devices = response.devices || [];
        console.log('Available devices:', devices);

        if (devices.length > 0) {
          // Find first active device, or use first device
          const activeDevice = devices.find((d: any) => d.is_active) || devices[0];
          console.log('Transferring playback to device:', activeDevice.name);

          this.transferPlayback(activeDevice.id).subscribe({
            next: () => {
              console.log('Device activated successfully');
              observer.next(true);
              observer.complete();
            },
            error: (err) => {
              console.error('Error transferring playback:', err);
              observer.next(false);
              observer.complete();
            },
          });
        } else {
          console.warn('No Spotify devices available');
          observer.next(false);
          observer.complete();
        }
      },
      error: (err) => {
        console.error('Error fetching devices:', err);
        observer.next(false);
        observer.complete();
      },
    });
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
