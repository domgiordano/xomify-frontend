import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { Location } from '@angular/common';
import { AlbumService } from 'src/app/services/album.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { RatingsService } from 'src/app/services/ratings.service';
import {
  SongDetailModalComponent,
  SongDetailTrack,
} from 'src/app/components/song-detail-modal/song-detail-modal.component';
import { take, Subscription } from 'rxjs';

@Component({
  selector: 'app-album-detail',
  templateUrl: './album-detail.component.html',
  styleUrls: ['./album-detail.component.scss'],
})
export class AlbumDetailComponent implements OnInit, OnDestroy {
  @ViewChild('songDetailModal') songDetailModal!: SongDetailModalComponent;

  album: any = null;
  tracks: any[] = [];
  loading = true;
  error: string | null = null;
  totalDuration: string = '';

  private routeSub!: Subscription;
  private albumId: string = '';

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private location: Location,
    private albumService: AlbumService,
    private playerService: PlayerService,
    private queueService: QueueService,
    private toastService: ToastService,
    private ratingsService: RatingsService
  ) {}

  ngOnInit(): void {
    this.routeSub = this.route.params.subscribe((params) => {
      this.albumId = params['id'];
      if (this.albumId) {
        this.loadAlbum();
      } else {
        this.error = 'No album ID provided';
        this.loading = false;
      }
    });
  }

  ngOnDestroy(): void {
    if (this.routeSub) {
      this.routeSub.unsubscribe();
    }
  }

  loadAlbum(): void {
    this.loading = true;
    this.error = null;

    this.albumService
      .getAlbumDetails(this.albumId)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.album = data;
          this.tracks = data.tracks?.items || [];
          this.calculateTotalDuration();
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading album:', err);
          this.error = 'Failed to load album. Please try again.';
          this.toastService.showNegativeToast('Failed to load album');
          this.loading = false;
        },
      });
  }

  private calculateTotalDuration(): void {
    let totalMs = 0;
    this.tracks.forEach((track) => {
      if (track.duration_ms) {
        totalMs += track.duration_ms;
      }
    });

    const hours = Math.floor(totalMs / 3600000);
    const minutes = Math.floor((totalMs % 3600000) / 60000);

    if (hours > 0) {
      this.totalDuration = `${hours} hr ${minutes} min`;
    } else {
      this.totalDuration = `${minutes} min`;
    }
  }

  formatDuration(ms: number): string {
    if (!ms) return '--:--';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  formatReleaseDate(dateString: string): string {
    if (!dateString) return '';
    const parts = dateString.split('-');

    if (parts.length === 1) {
      return parts[0];
    }

    if (parts.length === 2) {
      const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1);
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      });
    }

    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getAlbumYear(): string {
    if (!this.album?.release_date) return '';
    return this.album.release_date.split('-')[0];
  }

  goToArtist(artistId: string): void {
    this.router.navigate(['/artist-profile', artistId]);
  }

  goBack(): void {
    // Use browser back button to go to previous page
    this.location.back();
  }

  getQueueTrack(track: any): QueueTrack {
    return {
      id: track.id,
      name: track.name,
      artists: track.artists || [],
      album: {
        id: this.album?.id || '',
        name: this.album?.name || '',
        images: this.album?.images || [],
      },
      duration_ms: track.duration_ms,
      external_urls: track.external_urls,
    };
  }

  addToSpotifyQueue(track: any, event: Event): void {
    event.stopPropagation();
    this.playerService.addToSpotifyQueue(track.id).pipe(take(1)).subscribe({
      next: (success) => {
        if (success) {
          this.toastService.showPositiveToast(`Added "${track.name}" to Spotify queue`);
        } else {
          this.toastService.showNegativeToast('Could not add to queue. Open Spotify on any device and try again.');
        }
      },
      error: () => {
        this.toastService.showNegativeToast('Error adding to queue. Check console for details.');
      },
    });
  }

  addToPlaylistBuilder(track: any, event: Event): void {
    event.stopPropagation();

    const queueTrack: QueueTrack = {
      id: track.id,
      name: track.name,
      artists: track.artists || [],
      album: {
        id: this.album?.id || '',
        name: this.album?.name || '',
        images: this.album?.images || [],
      },
      duration_ms: track.duration_ms,
      external_urls: track.external_urls,
    };

    if (this.queueService.isInQueue(track.id)) {
      this.queueService.removeFromQueue(track.id);
      this.toastService.showPositiveToast(`Removed "${track.name}" from playlist builder`);
    } else {
      this.queueService.addToQueue(queueTrack);
      this.toastService.showPositiveToast(`Added "${track.name}" to playlist builder`);
    }
  }

  isInQueue(trackId: string): boolean {
    return this.queueService.isInQueue(trackId);
  }

  // Rating methods
  openSongDetail(track: any, event: Event): void {
    event.stopPropagation();
    const detailTrack: SongDetailTrack = {
      id: track.id,
      name: track.name,
      artists: track.artists || [],
      album: {
        id: this.album?.id || '',
        name: this.album?.name || '',
        images: this.album?.images || [],
        release_date: this.album?.release_date,
      },
      duration_ms: track.duration_ms,
      popularity: track.popularity,
      explicit: track.explicit,
      external_urls: track.external_urls,
    };
    this.songDetailModal.open(detailTrack);
  }

  getRating(trackId: string): number {
    return this.ratingsService.getCachedRating(trackId);
  }

  isRated(trackId: string): boolean {
    return this.ratingsService.isRated(trackId);
  }
}
