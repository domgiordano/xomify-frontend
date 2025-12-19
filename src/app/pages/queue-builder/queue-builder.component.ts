import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subject, Subscription, of } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap, catchError } from 'rxjs/operators';
import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';

import { UserService } from 'src/app/services/user.service';
import { PlaylistService } from 'src/app/services/playlist.service';
import { ToastService } from 'src/app/services/toast.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';

@Component({
  selector: 'app-queue-builder',
  templateUrl: './queue-builder.component.html',
  styleUrls: ['./queue-builder.component.scss']
})
export class QueueBuilderComponent implements OnInit, OnDestroy {
  // Search
  searchQuery = '';
  searchResults: any[] = [];
  isSearching = false;
  private searchSubject = new Subject<string>();
  private searchSub!: Subscription;

  // Queue (from service)
  queue: QueueTrack[] = [];
  private queueSub!: Subscription;

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
    private queueService: QueueService,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Subscribe to queue from service
    this.queueSub = this.queueService.queue$.subscribe(queue => {
      this.queue = queue;
    });

    // Check if user is premium (for playback features)
    this.userService.getUser().subscribe((user: any) => {
      this.isPremium = user?.product === 'premium';
    });

    // Set up debounced search - FIXED: proper Observable handling
    this.searchSub = this.searchSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(query => {
        if (!query || !query.trim()) {
          this.isSearching = false;
          return of({ tracks: { items: [] } });  // Return Observable, not array
        }
        this.isSearching = true;
        return this.playlistService.searchTracks(query, 20).pipe(
          catchError(error => {
            console.error('Search error:', error);
            return of({ tracks: { items: [] } });
          })
        );
      })
    ).subscribe({
      next: (response: any) => {
        this.searchResults = response?.tracks?.items || [];
        this.isSearching = false;
        console.log('Search results:', this.searchResults.length, 'tracks found');
      },
      error: (err) => {
        console.error('Search subscription error:', err);
        this.searchResults = [];
        this.isSearching = false;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.queueSub) {
      this.queueSub.unsubscribe();
    }
    if (this.searchSub) {
      this.searchSub.unsubscribe();
    }
  }

  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
  }

  // Queue management - now using QueueService
  addToQueue(track: any): void {
    const queueTrack: QueueTrack = {
      id: track.id,
      name: track.name,
      artists: track.artists || [],
      album: track.album || { id: '', name: '', images: [] },
      duration_ms: track.duration_ms,
      external_urls: track.external_urls
    };
    
    this.queueService.addToQueue(queueTrack);
  }

  removeFromQueue(index: number): void {
    const track = this.queue[index];
    this.queueService.removeFromQueue(track.id);
  }

  clearQueue(): void {
    if (this.queue.length === 0) return;
    
    if (confirm('Clear all tracks from queue?')) {
      this.queueService.clearQueue();
      this.toastService.showPositiveToast('Queue cleared');
    }
  }

  onDrop(event: CdkDragDrop<QueueTrack[]>): void {
    this.queueService.moveTrack(event.previousIndex, event.currentIndex);
  }

  moveTrack(index: number, direction: 'up' | 'down'): void {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex >= 0 && newIndex < this.queue.length) {
      this.queueService.moveTrack(index, newIndex);
    }
  }

  // Playlist saving
  openSaveModal(): void {
    if (this.queue.length === 0) {
      this.toastService.showNegativeToast('Add tracks to your queue first');
      return;
    }
    this.showSaveModal = true;
  }

  closeSaveModal(): void {
    this.showSaveModal = false;
    this.playlistName = '';
    this.playlistDescription = '';
    this.isPublic = false;
  }

  savePlaylist(): void {
    if (!this.playlistName.trim()) {
      this.toastService.showNegativeToast('Please enter a playlist name');
      return;
    }

    this.isSaving = true;

    // Get user ID first
    this.userService.getUser().subscribe({
      next: (user: any) => {
        const userId = user?.id;
        if (!userId) {
          this.toastService.showNegativeToast('Could not get user info');
          this.isSaving = false;
          return;
        }

        // Create playlist
        this.playlistService.createPlaylist(
          userId,
          this.playlistName,
          this.playlistDescription,
          this.isPublic
        ).subscribe({
          next: (playlist: any) => {
            // Add tracks to playlist
            const trackUris = this.queue.map(t => `spotify:track:${t.id}`);
            this.playlistService.addTracksToPlaylist(playlist.id, trackUris).subscribe({
              next: () => {
                this.toastService.showPositiveToast(`Playlist "${this.playlistName}" created!`);
                this.closeSaveModal();
                this.isSaving = false;
                
                // Optionally clear queue after saving
                // this.queueService.clearQueue();
              },
              error: () => {
                this.toastService.showNegativeToast('Failed to add tracks to playlist');
                this.isSaving = false;
              }
            });
          },
          error: () => {
            this.toastService.showNegativeToast('Failed to create playlist');
            this.isSaving = false;
          }
        });
      },
      error: () => {
        this.toastService.showNegativeToast('Could not get user info');
        this.isSaving = false;
      }
    });
  }

  // Navigation
  goToArtist(artistId: string): void {
    if (artistId) {
      this.router.navigate(['/artist-profile', artistId]);
    }
  }

  // Play all in Spotify
  playAllInSpotify(): void {
    if (this.queue.length === 0) {
      this.toastService.showNegativeToast('No tracks in queue');
      return;
    }
    
    // Open first track in Spotify - user can then play the queue
    const firstTrack = this.queue[0];
    if (firstTrack.external_urls?.spotify) {
      window.open(firstTrack.external_urls.spotify, '_blank');
    } else {
      window.open(`https://open.spotify.com/track/${firstTrack.id}`, '_blank');
    }
  }

  // Alias for savePlaylist (template uses saveAsPlaylist)
  saveAsPlaylist(): void {
    this.savePlaylist();
  }

  // Preview playback
  playPreview(track: QueueTrack): void {
    // Implement preview if needed
  }

  // Utilities
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

  getArtistNames(track: any): string {
    return track.artists?.map((a: any) => a.name).join(', ') || '';
  }

  isInQueue(trackId: string): boolean {
    return this.queueService.isInQueue(trackId);
  }
}
