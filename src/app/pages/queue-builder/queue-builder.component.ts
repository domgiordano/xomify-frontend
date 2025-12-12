import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { UserService } from 'src/app/services/user.service';
import { PlaylistService } from 'src/app/services/playlist.service';
import { ToastService } from 'src/app/services/toast.service';
import { Subject } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, take } from 'rxjs/operators';

interface QueueTrack {
  id: string;
  uri: string;
  name: string;
  artists: { id: string; name: string }[];
  album: {
    id: string;
    name: string;
    images: { url: string }[];
  };
  duration_ms: number;
  explicit: boolean;
  preview_url: string | null;
}

@Component({
  selector: 'app-queue-builder',
  templateUrl: './queue-builder.component.html',
  styleUrls: ['./queue-builder.component.scss']
})
export class QueueBuilderComponent implements OnInit {
  // Search
  searchQuery = '';
  searchResults: QueueTrack[] = [];
  isSearching = false;
  private searchSubject = new Subject<string>();

  // Queue
  queue: QueueTrack[] = [];
  
  // Playlist saving
  playlistName = '';
  playlistDescription = '';
  isPublic = false;
  isSaving = false;
  showSaveModal = false;

  // Playback (for premium users)
  isPremium = false;
  currentlyPlaying: QueueTrack | null = null;
  isPlaying = false;

  // Stats
  get totalDuration(): number {
    return this.queue.reduce((sum, track) => sum + track.duration_ms, 0);
  }

  get uniqueArtists(): number {
    const artistIds = new Set<string>();
    this.queue.forEach(track => {
      track.artists.forEach(a => artistIds.add(a.id));
    });
    return artistIds.size;
  }

  constructor(
    private userService: UserService,
    private playlistService: PlaylistService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Check if user is premium (for playback features)
    const user = this.userService.getUser();
    this.isPremium = user?.product === 'premium';

    // Set up debounced search
    this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query.trim()) {
          return [];
        }
        this.isSearching = true;
        return this.playlistService.searchTracks(query, 20);
      })
    ).subscribe({
      next: (response: any) => {
        this.searchResults = response?.tracks?.items || [];
        this.isSearching = false;
      },
      error: () => {
        this.searchResults = [];
        this.isSearching = false;
      }
    });
  }

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
  }

  // Queue management
  addToQueue(track: QueueTrack): void {
    // Check for duplicates
    if (this.queue.some(t => t.id === track.id)) {
      this.toastService.showNegativeToast('Track already in queue');
      return;
    }
    
    this.queue.push({ ...track });
    this.toastService.showPositiveToast(`Added "${track.name}"`);
  }

  removeFromQueue(index: number): void {
    const track = this.queue[index];
    this.queue.splice(index, 1);
    this.toastService.showPositiveToast(`Removed "${track.name}"`);
  }

  clearQueue(): void {
    if (this.queue.length === 0) return;
    
    if (confirm('Clear all tracks from queue?')) {
      this.queue = [];
      this.toastService.showPositiveToast('Queue cleared');
    }
  }

  onDrop(event: CdkDragDrop<QueueTrack[]>): void {
    moveItemInArray(this.queue, event.previousIndex, event.currentIndex);
  }

  moveTrack(index: number, direction: 'up' | 'down'): void {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= this.queue.length) return;
    
    moveItemInArray(this.queue, index, newIndex);
  }

  // Playlist save
  openSaveModal(): void {
    if (this.queue.length === 0) {
      this.toastService.showNegativeToast('Add tracks to your queue first');
      return;
    }
    this.showSaveModal = true;
    this.playlistName = `My Playlist ${new Date().toLocaleDateString()}`;
    this.playlistDescription = `Created with Xomify • ${this.queue.length} tracks`;
  }

  closeSaveModal(): void {
    this.showSaveModal = false;
  }

  saveAsPlaylist(): void {
    if (!this.playlistName.trim()) {
      this.toastService.showNegativeToast('Enter a playlist name');
      return;
    }

    this.isSaving = true;
    const userId = this.userService.getUserId();
    const trackUris = this.queue.map(t => t.uri);

    // First create the playlist
    this.playlistService.createPlaylist(
      userId,
      this.playlistName,
      this.playlistDescription,
      this.isPublic
    ).pipe(take(1)).subscribe({
      next: (playlist: any) => {
        // Then add tracks to it
        this.playlistService.addTracksToPlaylist(playlist.id, trackUris)
          .pipe(take(1))
          .subscribe({
            next: () => {
              this.isSaving = false;
              this.showSaveModal = false;
              this.toastService.showPositiveToast(`Playlist "${this.playlistName}" created!`);
              
              // Optionally clear queue after saving
              // this.queue = [];
            },
            error: (err) => {
              console.error('Error adding tracks to playlist', err);
              this.toastService.showNegativeToast('Error adding tracks to playlist');
              this.isSaving = false;
            }
          });
      },
      error: (err) => {
        console.error('Error creating playlist', err);
        this.toastService.showNegativeToast('Error creating playlist');
        this.isSaving = false;
      }
    });
  }

  // Playback controls (Premium only)
  playPreview(track: QueueTrack): void {
    if (!track.preview_url) {
      this.toastService.showNegativeToast('No preview available');
      return;
    }
    
    // For now just open preview - full playback would use Web Playback SDK
    window.open(track.preview_url, '_blank');
  }

  addToSpotifyQueue(track: QueueTrack): void {
    if (!this.isPremium) {
      this.toastService.showNegativeToast('Spotify Premium required');
      return;
    }

    this.playlistService.addToQueue(track.uri).pipe(take(1)).subscribe({
      next: () => {
        this.toastService.showPositiveToast(`Added to Spotify queue`);
      },
      error: (err) => {
        console.error('Error adding to queue', err);
        this.toastService.showNegativeToast('Error adding to Spotify queue');
      }
    });
  }

  playAllInSpotify(): void {
    if (this.queue.length === 0) return;

    // Open first track in Spotify
    const firstTrack = this.queue[0];
    const spotifyUrl = `https://open.spotify.com/track/${firstTrack.id}`;
    window.open(spotifyUrl, '_blank');
  }

  // Navigation
  goToArtist(artistId: string): void {
    this.router.navigate(['/artist-profile', artistId]);
  }

  // Formatters
  formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  formatTotalDuration(): string {
    const totalSeconds = Math.floor(this.totalDuration / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    
    if (hours > 0) {
      return `${hours} hr ${minutes} min`;
    }
    return `${minutes} min`;
  }

  getArtistNames(track: QueueTrack): string {
    return track.artists.map(a => a.name).join(', ');
  }

  isInQueue(trackId: string): boolean {
    return this.queue.some(t => t.id === trackId);
  }
}
