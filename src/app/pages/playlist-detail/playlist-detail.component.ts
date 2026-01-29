import { Component, OnInit, ViewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PlaylistService } from 'src/app/services/playlist.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { RatingsService } from 'src/app/services/ratings.service';
import {
  SongDetailModalComponent,
  SongDetailTrack,
} from 'src/app/components/song-detail-modal/song-detail-modal.component';
import { take } from 'rxjs';

@Component({
  selector: 'app-playlist-detail',
  templateUrl: './playlist-detail.component.html',
  styleUrls: ['./playlist-detail.component.scss'],
})
export class PlaylistDetailComponent implements OnInit {
  @ViewChild('songDetailModal') songDetailModal!: SongDetailModalComponent;

  playlist: any = null;
  tracks: any[] = [];
  loading = true;
  loadingMore = false;
  error: string | null = null;
  hasMoreTracks = false;
  totalDuration: string = '';

  private playlistId: string = '';
  private nextOffset: number = 0;
  private limit: number = 50;
  private fromFriend: string | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private playlistService: PlaylistService,
    private playerService: PlayerService,
    private queueService: QueueService,
    private toastService: ToastService,
    private ratingsService: RatingsService
  ) {}

  ngOnInit(): void {
    // Read query params for navigation context
    this.route.queryParams.pipe(take(1)).subscribe((queryParams) => {
      this.fromFriend = queryParams['fromFriend'] || null;
    });

    this.route.params.subscribe((params) => {
      this.playlistId = params['id'];
      if (this.playlistId) {
        this.loadPlaylist();
      } else {
        this.error = 'No playlist ID provided';
        this.loading = false;
      }
    });
  }

  loadPlaylist(): void {
    this.loading = true;
    this.error = null;

    this.playlistService
      .getPlaylistDetails(this.playlistId)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          this.playlist = data;
          this.tracks = data.tracks?.items || [];
          this.nextOffset = this.tracks.length;
          this.hasMoreTracks = data.tracks?.total > this.tracks.length;
          this.calculateTotalDuration();
          this.loading = false;
        },
        error: (err) => {
          console.error('Error loading playlist:', err);
          this.error = 'Failed to load playlist. Please try again.';
          this.toastService.showNegativeToast('Failed to load playlist');
          this.loading = false;
        },
      });
  }

  loadMoreTracks(): void {
    if (this.loadingMore || !this.hasMoreTracks) return;

    this.loadingMore = true;

    this.playlistService
      .getPlaylistTracks(this.playlistId, this.limit, this.nextOffset)
      .pipe(take(1))
      .subscribe({
        next: (data) => {
          const newTracks = data.items || [];
          this.tracks = [...this.tracks, ...newTracks];
          this.nextOffset += newTracks.length;
          this.hasMoreTracks = data.total > this.tracks.length;
          this.calculateTotalDuration();
          this.loadingMore = false;
        },
        error: (err) => {
          console.error('Error loading more tracks:', err);
          this.toastService.showNegativeToast('Failed to load more tracks');
          this.loadingMore = false;
        },
      });
  }

  private calculateTotalDuration(): void {
    let totalMs = 0;
    this.tracks.forEach((item) => {
      if (item.track?.duration_ms) {
        totalMs += item.track.duration_ms;
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

  formatDate(dateString: string): string {
    if (!dateString) return '—';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }

  goBack(): void {
    if (this.fromFriend) {
      // Navigate back to friend's profile with playlists tab active
      this.router.navigate(['/friend', this.fromFriend]);
    } else {
      this.router.navigate(['/my-playlists']);
    }
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
      album: track.album || { id: '', name: '', images: [] },
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
      album: track.album || { id: '', name: '', images: [] },
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
