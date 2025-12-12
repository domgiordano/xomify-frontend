import { Component, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AlbumService } from 'src/app/services/album.service';
import { PlayerService } from 'src/app/services/player.service';
import { ToastService } from 'src/app/services/toast.service';
import { take, Subscription } from 'rxjs';

@Component({
  selector: 'app-album-detail',
  templateUrl: './album-detail.component.html',
  styleUrls: ['./album-detail.component.scss'],
})
export class AlbumDetailComponent implements OnInit, OnDestroy {
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
    private albumService: AlbumService,
    private playerService: PlayerService,
    private toastService: ToastService
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
    this.playerService.stopSong();
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
    // Navigate back to the artist if we have artist info
    if (this.album?.artists?.[0]?.id) {
      this.router.navigate(['/artist-profile', this.album.artists[0].id]);
    } else {
      this.router.navigate(['/top-artists']);
    }
  }

  onTrackHover(track: any): void {
    this.playerService.playerReady$.pipe(take(1)).subscribe((ready) => {
      if (ready) {
        this.playerService.playSong(track.id);
      }
    });
  }

  onTrackLeave(): void {
    this.playerService.playerReady$.pipe(take(1)).subscribe((ready) => {
      if (ready) {
        this.playerService.stopSong();
      }
    });
  }
}
