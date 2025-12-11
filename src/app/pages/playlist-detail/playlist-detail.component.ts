import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { PlaylistService } from 'src/app/services/playlist.service';
import { ToastService } from 'src/app/services/toast.service';
import { take } from 'rxjs';

@Component({
  selector: 'app-playlist-detail',
  templateUrl: './playlist-detail.component.html',
  styleUrls: ['./playlist-detail.component.scss'],
})
export class PlaylistDetailComponent implements OnInit {
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

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private playlistService: PlaylistService,
    private toastService: ToastService
  ) {}

  ngOnInit(): void {
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
    this.router.navigate(['/my-playlists']);
  }
}
