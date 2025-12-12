import { Component, OnInit, OnDestroy, Input } from '@angular/core';
import { Router } from '@angular/router';
import { PlaylistService } from 'src/app/services/playlist.service';
import { UserService } from 'src/app/services/user.service';
import { ToastService } from 'src/app/services/toast.service';
import { Subject, interval } from 'rxjs';
import { takeUntil, take } from 'rxjs/operators';

interface PlaybackState {
  isPlaying: boolean;
  track: {
    id: string;
    name: string;
    artists: { id: string; name: string }[];
    album: {
      id: string;
      name: string;
      images: { url: string }[];
    };
    duration_ms: number;
  } | null;
  progress_ms: number;
  device: {
    id: string;
    name: string;
    type: string;
    volume_percent: number;
  } | null;
  shuffle_state: boolean;
  repeat_state: string; // 'off', 'track', 'context'
}

@Component({
  selector: 'app-playback-bar',
  templateUrl: './playback-bar.component.html',
  styleUrls: ['./playback-bar.component.scss']
})
export class PlaybackBarComponent implements OnInit, OnDestroy {
  @Input() showOnlyWhenPlaying = false;
  
  private destroy$ = new Subject<void>();
  
  isPremium = false;
  isLoading = true;
  playbackState: PlaybackState | null = null;
  
  showVolumeSlider = false;
  showDevices = false;
  availableDevices: any[] = [];
  
  // Progress tracking
  localProgress = 0;
  progressInterval: any;

  constructor(
    private playlistService: PlaylistService,
    private userService: UserService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    const user = this.userService.getUser();
    this.isPremium = user?.product === 'premium';
    
    if (this.isPremium) {
      this.loadPlaybackState();
      
      // Poll for playback state every 5 seconds
      interval(5000)
        .pipe(takeUntil(this.destroy$))
        .subscribe(() => this.loadPlaybackState());
    } else {
      this.isLoading = false;
    }
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    this.stopProgressTracking();
  }

  loadPlaybackState(): void {
    this.playlistService.getPlaybackState().pipe(take(1)).subscribe({
      next: (state) => {
        this.isLoading = false;
        
        if (state && state.item) {
          const wasPlaying = this.playbackState?.isPlaying;
          
          this.playbackState = {
            isPlaying: state.is_playing,
            track: {
              id: state.item.id,
              name: state.item.name,
              artists: state.item.artists,
              album: state.item.album,
              duration_ms: state.item.duration_ms
            },
            progress_ms: state.progress_ms,
            device: state.device ? {
              id: state.device.id,
              name: state.device.name,
              type: state.device.type,
              volume_percent: state.device.volume_percent
            } : null,
            shuffle_state: state.shuffle_state,
            repeat_state: state.repeat_state
          };
          
          this.localProgress = state.progress_ms;
          
          // Start/stop progress tracking based on play state
          if (state.is_playing && !wasPlaying) {
            this.startProgressTracking();
          } else if (!state.is_playing && wasPlaying) {
            this.stopProgressTracking();
          }
        } else {
          this.playbackState = null;
          this.stopProgressTracking();
        }
      },
      error: () => {
        this.isLoading = false;
        this.playbackState = null;
      }
    });
  }

  startProgressTracking(): void {
    this.stopProgressTracking();
    this.progressInterval = setInterval(() => {
      if (this.playbackState?.isPlaying && this.playbackState.track) {
        this.localProgress = Math.min(
          this.localProgress + 1000,
          this.playbackState.track.duration_ms
        );
      }
    }, 1000);
  }

  stopProgressTracking(): void {
    if (this.progressInterval) {
      clearInterval(this.progressInterval);
      this.progressInterval = null;
    }
  }

  // Playback controls
  togglePlay(): void {
    if (!this.playbackState) return;
    
    const action = this.playbackState.isPlaying 
      ? this.playlistService.pause() 
      : this.playlistService.play();
    
    action.pipe(take(1)).subscribe({
      next: () => {
        if (this.playbackState) {
          this.playbackState.isPlaying = !this.playbackState.isPlaying;
          
          if (this.playbackState.isPlaying) {
            this.startProgressTracking();
          } else {
            this.stopProgressTracking();
          }
        }
      },
      error: () => {
        this.toastService.showNegativeToast('Playback control failed');
      }
    });
  }

  skipNext(): void {
    this.playlistService.skipToNext().pipe(take(1)).subscribe({
      next: () => {
        // Reload state after a short delay
        setTimeout(() => this.loadPlaybackState(), 500);
      },
      error: () => {
        this.toastService.showNegativeToast('Skip failed');
      }
    });
  }

  skipPrevious(): void {
    this.playlistService.skipToPrevious().pipe(take(1)).subscribe({
      next: () => {
        setTimeout(() => this.loadPlaybackState(), 500);
      },
      error: () => {
        this.toastService.showNegativeToast('Skip failed');
      }
    });
  }

  // Volume control
  toggleVolumeSlider(): void {
    this.showVolumeSlider = !this.showVolumeSlider;
  }

  setVolume(event: Event): void {
    const target = event.target as HTMLInputElement;
    const volume = parseInt(target.value, 10);
    
    this.playlistService.setVolume(volume).pipe(take(1)).subscribe({
      next: () => {
        if (this.playbackState?.device) {
          this.playbackState.device.volume_percent = volume;
        }
      }
    });
  }

  // Device selection
  toggleDevices(): void {
    this.showDevices = !this.showDevices;
    
    if (this.showDevices) {
      this.loadDevices();
    }
  }

  loadDevices(): void {
    this.playlistService.getDevices().pipe(take(1)).subscribe({
      next: (response) => {
        this.availableDevices = response.devices || [];
      }
    });
  }

  selectDevice(deviceId: string): void {
    // Transfer playback to selected device
    // Note: This requires the Spotify API's transfer playback endpoint
    this.showDevices = false;
    this.toastService.showPositiveToast('Device selected');
    setTimeout(() => this.loadPlaybackState(), 500);
  }

  // Progress seeking
  seekTo(event: MouseEvent): void {
    if (!this.playbackState?.track) return;
    
    const progressBar = event.currentTarget as HTMLElement;
    const rect = progressBar.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const seekPosition = Math.floor(percent * this.playbackState.track.duration_ms);
    
    // Note: This would require implementing the seek endpoint
    this.localProgress = seekPosition;
  }

  // Navigation
  goToArtist(artistId: string): void {
    this.router.navigate(['/artist-profile', artistId]);
  }

  goToAlbum(albumId: string): void {
    this.router.navigate(['/album', albumId]);
  }

  openInSpotify(): void {
    if (this.playbackState?.track) {
      window.open(`https://open.spotify.com/track/${this.playbackState.track.id}`, '_blank');
    }
  }

  // Formatters
  formatTime(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  getArtistNames(): string {
    return this.playbackState?.track?.artists.map(a => a.name).join(', ') || '';
  }

  getProgressPercent(): number {
    if (!this.playbackState?.track) return 0;
    return (this.localProgress / this.playbackState.track.duration_ms) * 100;
  }

  getVolumeIcon(): string {
    const volume = this.playbackState?.device?.volume_percent || 0;
    if (volume === 0) return 'mute';
    if (volume < 50) return 'low';
    return 'high';
  }

  getDeviceIcon(type: string): string {
    switch (type.toLowerCase()) {
      case 'computer': return 'computer';
      case 'smartphone': return 'phone';
      case 'speaker': return 'speaker';
      default: return 'device';
    }
  }

  shouldShow(): boolean {
    if (!this.isPremium) return false;
    if (this.showOnlyWhenPlaying) return !!this.playbackState?.track;
    return true;
  }
}
