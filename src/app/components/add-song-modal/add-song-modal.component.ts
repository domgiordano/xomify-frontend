import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import {
  debounceTime,
  distinctUntilChanged,
  switchMap,
  take,
} from 'rxjs/operators';
import {
  GroupsService,
  GroupSong,
  AddSongRequest,
  GroupSongTrack,
} from 'src/app/services/groups.service';
import { PlaylistService } from 'src/app/services/playlist.service';
import { SongService } from 'src/app/services/song.service';
import { UserService } from 'src/app/services/user.service';
import { ToastService } from 'src/app/services/toast.service';

type TabType = 'paste' | 'search';

@Component({
  selector: 'app-add-song-modal',
  templateUrl: './add-song-modal.component.html',
  styleUrls: ['./add-song-modal.component.scss'],
})
export class AddSongModalComponent implements OnInit, OnDestroy {
  @Input() groupId = '';
  @Output() songAdded = new EventEmitter<GroupSong>();
  @Output() closed = new EventEmitter<void>();

  private subscriptions: Subscription[] = [];
  private searchSubject = new Subject<string>();

  // State
  currentEmail = '';
  activeTab: TabType = 'paste';

  // Paste URL tab
  spotifyUrl = '';
  urlError = '';
  urlLoading = false;
  parsedTrack: any = null;

  // Search tab
  searchQuery = '';
  searchResults: any[] = [];
  searchLoading = false;
  selectedTrack: any = null;

  // Adding state
  addingTrack = false;

  constructor(
    private groupsService: GroupsService,
    private playlistService: PlaylistService,
    private songService: SongService,
    private userService: UserService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.currentEmail = this.userService.getEmail();

    // Setup search with debounce
    const searchSub = this.searchSubject
      .pipe(
        debounceTime(300),
        distinctUntilChanged(),
        switchMap((query) => {
          if (!query || query.trim().length < 2) {
            this.searchLoading = false;
            return [];
          }
          this.searchLoading = true;
          return this.playlistService.searchTracks(query, 10);
        }),
      )
      .subscribe({
        next: (response: any) => {
          this.searchResults = response?.tracks?.items || [];
          this.searchLoading = false;
        },
        error: () => {
          this.searchResults = [];
          this.searchLoading = false;
        },
      });

    this.subscriptions.push(searchSub);
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  // ============================================
  // MODAL CONTROL
  // ============================================

  close(): void {
    this.resetState();
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  private resetState(): void {
    this.spotifyUrl = '';
    this.urlError = '';
    this.parsedTrack = null;
    this.searchQuery = '';
    this.searchResults = [];
    this.selectedTrack = null;
  }

  // ============================================
  // TAB NAVIGATION
  // ============================================

  switchTab(tab: TabType): void {
    this.activeTab = tab;
    this.selectedTrack = null;
  }

  // ============================================
  // URL PASTE
  // ============================================

  onUrlInput(): void {
    this.urlError = '';
    this.parsedTrack = null;

    if (!this.spotifyUrl.trim()) return;

    const result = this.groupsService.parseSpotifyUrl(this.spotifyUrl);

    if (!result.valid) {
      this.urlError = result.error || 'Invalid URL';
      return;
    }

    this.fetchTrackDetails(result.trackId!);
  }

  private fetchTrackDetails(trackId: string): void {
    this.urlLoading = true;

    this.songService
      .getTrackDetails(trackId)
      .pipe(take(1))
      .subscribe({
        next: (track) => {
          this.parsedTrack = track;
          this.urlLoading = false;
        },
        error: () => {
          this.urlError =
            'Could not fetch track details. Please check the URL.';
          this.urlLoading = false;
        },
      });
  }

  clearUrl(): void {
    this.spotifyUrl = '';
    this.urlError = '';
    this.parsedTrack = null;
  }

  // ============================================
  // SEARCH
  // ============================================

  onSearchInput(): void {
    this.selectedTrack = null;
    this.searchSubject.next(this.searchQuery);
  }

  selectTrack(track: any): void {
    this.selectedTrack = track;
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.selectedTrack = null;
  }

  // ============================================
  // ADD SONG
  // ============================================

  canAddSong(): boolean {
    if (this.addingTrack) return false;
    if (this.activeTab === 'paste') return !!this.parsedTrack;
    return !!this.selectedTrack;
  }

  addSong(): void {
    if (!this.canAddSong()) return;

    const track =
      this.activeTab === 'paste' ? this.parsedTrack : this.selectedTrack;
    if (!track) return;

    this.addingTrack = true;

    const trackData: GroupSongTrack = {
      id: track.id,
      name: track.name,
      artists: track.artists.map((a: any) => ({ id: a.id, name: a.name })),
      album: {
        id: track.album?.id || '',
        name: track.album?.name || '',
        images: track.album?.images || [],
      },
      duration_ms: track.duration_ms || 0,
      external_urls: track.external_urls,
    };

    const request: AddSongRequest = {
      trackId: track.id,
      track: trackData,
    };

    this.groupsService
      .addSong(this.groupId, this.currentEmail, request)
      .pipe(take(1))
      .subscribe({
        next: (groupSong) => {
          this.toastService.showPositiveToast(`Added "${track.name}" to group`);
          this.songAdded.emit(groupSong);
          this.addingTrack = false;
        },
        error: () => {
          this.toastService.showNegativeToast('Error adding song');
          this.addingTrack = false;
        },
      });
  }

  // ============================================
  // HELPERS
  // ============================================

  getAlbumArt(track: any): string {
    return track?.album?.images?.[0]?.url || this.getDefaultArt();
  }

  getArtistNames(track: any): string {
    return track?.artists?.map((a: any) => a.name).join(', ') || '';
  }

  getDefaultArt(): string {
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="%239c0abf"%3E%3Cpath d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/%3E%3C/svg%3E';
  }

  formatDuration(ms: number): string {
    if (!ms) return '0:00';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }
}
