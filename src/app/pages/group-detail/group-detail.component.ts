import { Component, OnInit, OnDestroy, ViewChild } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { Subscription, forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  GroupsService,
  GroupDetail,
  GroupSong,
  GroupMember,
  GroupSongTrack,
} from 'src/app/services/groups.service';
import { UserService } from 'src/app/services/user.service';
import { PlayerService } from 'src/app/services/player.service';
import { QueueService, QueueTrack } from 'src/app/services/queue.service';
import { ToastService } from 'src/app/services/toast.service';
import {
  SongDetailModalComponent,
  SongDetailTrack,
} from 'src/app/components/song-detail-modal/song-detail-modal.component';

type SongFilterType = 'all' | 'unlistened' | 'listened' | 'queued';

@Component({
  selector: 'app-group-detail',
  templateUrl: './group-detail.component.html',
  styleUrls: ['./group-detail.component.scss'],
})
export class GroupDetailComponent implements OnInit, OnDestroy {
  @ViewChild('songDetailModal') songDetailModal!: SongDetailModalComponent;

  private subscriptions: Subscription[] = [];

  // State
  loading = true;
  currentEmail = '';
  groupId = '';

  // Group data
  group: GroupDetail | null = null;
  filteredSongs: GroupSong[] = [];

  // Filter state
  songFilter: SongFilterType = 'all';
  searchQuery = '';

  // Modal states
  showAddSongModal = false;
  showAddMemberModal = false;

  // Action states
  actionLoading: { [songId: string]: boolean } = {};
  addingAllToQueue = false;
  markingAllListened = false;

  constructor(
    private router: Router,
    private route: ActivatedRoute,
    private groupsService: GroupsService,
    private userService: UserService,
    private playerService: PlayerService,
    private queueService: QueueService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.route.params.pipe(take(1)).subscribe((params) => {
      this.groupId = params['id'];
    });
    this.currentEmail = this.userService.getEmail();
    this.loadGroup();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  // ============================================
  // DATA LOADING
  // ============================================

  loadGroup(forceRefresh = false): void {
    this.loading = true;
    this.groupsService
      .getGroup(this.groupId, this.currentEmail, forceRefresh)
      .pipe(take(1))
      .subscribe({
        next: (group) => {
          this.group = group;
          this.filterSongs();
          this.loading = false;
          if (forceRefresh) {
            this.toastService.showPositiveToast('Group refreshed');
          }
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading group');
          this.loading = false;
        },
      });
  }

  // ============================================
  // NAVIGATION
  // ============================================

  goBack(): void {
    this.router.navigate(['/groups']);
  }

  // ============================================
  // SONG FILTERING
  // ============================================

  filterSongs(): void {
    if (!this.group?.songs) {
      this.filteredSongs = [];
      return;
    }

    let songs = this.groupsService.filterSongsByStatus(
      this.group.songs,
      this.songFilter,
    );

    if (this.searchQuery.trim()) {
      const query = this.searchQuery.toLowerCase();
      songs = songs.filter(
        (s) =>
          s.track.name.toLowerCase().includes(query) ||
          s.track.artists.some((a) => a.name.toLowerCase().includes(query)),
      );
    }

    this.filteredSongs = songs;
  }

  setSongFilter(filter: SongFilterType): void {
    this.songFilter = filter;
    this.filterSongs();
  }

  onSearchChange(): void {
    this.filterSongs();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filterSongs();
  }

  // ============================================
  // SONG ACTIONS
  // ============================================

  playSong(song: GroupSong, event: Event): void {
    event.stopPropagation();
    this.playerService.playSong(song.trackId);
  }

  addToSpotifyQueue(song: GroupSong, event: Event): void {
    event.stopPropagation();
    if (this.actionLoading[song.id]) return;

    this.actionLoading[song.id] = true;

    this.playerService
      .addToSpotifyQueue(song.trackId)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.toastService.showPositiveToast(
            `Added "${song.track.name}" to Spotify queue`,
          );
          // Mark as queued in the group
          this.markAsQueued(song);
          this.actionLoading[song.id] = false;
        },
        error: () => {
          this.toastService.showNegativeToast('Error adding to queue');
          this.actionLoading[song.id] = false;
        },
      });
  }

  addToPlaylistBuilder(song: GroupSong, event: Event): void {
    event.stopPropagation();
    const queueTrack: QueueTrack = {
      id: song.trackId,
      name: song.track.name,
      artists: song.track.artists,
      album: song.track.album,
      duration_ms: song.track.duration_ms,
      external_urls: song.track.external_urls,
    };

    if (this.queueService.isInQueue(song.trackId)) {
      this.queueService.removeFromQueue(song.trackId);
      this.toastService.showPositiveToast(`Removed from Playlist Builder`);
    } else {
      this.queueService.addToQueue(queueTrack);
      this.toastService.showPositiveToast(`Added to Playlist Builder`);
    }
  }

  isInPlaylistBuilder(trackId: string): boolean {
    return this.queueService.isInQueue(trackId);
  }

  markAsQueued(song: GroupSong): void {
    this.groupsService
      .markAsQueued(this.groupId, this.currentEmail, song.id)
      .pipe(take(1))
      .subscribe();
  }

  markAsListened(song: GroupSong, event: Event): void {
    event.stopPropagation();
    if (this.actionLoading[song.id]) return;

    this.actionLoading[song.id] = true;

    this.groupsService
      .markAsListened(this.groupId, this.currentEmail, song.id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (song.userStatus) {
            song.userStatus.listened = true;
          }
          this.filterSongs();
          this.toastService.showPositiveToast('Marked as listened');
          this.actionLoading[song.id] = false;
        },
        error: () => {
          this.toastService.showNegativeToast('Error updating status');
          this.actionLoading[song.id] = false;
        },
      });
  }

  markAsUnlistened(song: GroupSong, event: Event): void {
    event.stopPropagation();
    if (this.actionLoading[song.id]) return;

    this.actionLoading[song.id] = true;

    this.groupsService
      .markAsUnlistened(this.groupId, this.currentEmail, song.id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (song.userStatus) {
            song.userStatus.listened = false;
          }
          this.filterSongs();
          this.toastService.showPositiveToast('Marked as unlistened');
          this.actionLoading[song.id] = false;
        },
        error: () => {
          this.toastService.showNegativeToast('Error updating status');
          this.actionLoading[song.id] = false;
        },
      });
  }

  removeSong(song: GroupSong, event: Event): void {
    event.stopPropagation();
    if (this.actionLoading[song.id]) return;

    this.actionLoading[song.id] = true;

    this.groupsService
      .removeSong(this.groupId, this.currentEmail, song.id)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (this.group) {
            this.group.songs = this.group.songs.filter((s) => s.id !== song.id);
            this.group.songCount--;
          }
          this.filterSongs();
          this.toastService.showPositiveToast('Song removed');
          this.actionLoading[song.id] = false;
        },
        error: () => {
          this.toastService.showNegativeToast('Error removing song');
          this.actionLoading[song.id] = false;
        },
      });
  }

  openSongDetail(song: GroupSong): void {
    const detailTrack: SongDetailTrack = {
      id: song.trackId,
      name: song.track.name,
      artists: song.track.artists,
      album: song.track.album,
      duration_ms: song.track.duration_ms,
      external_urls: song.track.external_urls,
    };
    this.songDetailModal.open(detailTrack);
  }

  // ============================================
  // BATCH ACTIONS
  // ============================================

  addAllUnlistenedToQueue(): void {
    if (this.addingAllToQueue || !this.group) return;

    const unlistenedSongs = this.groupsService.getUnlistenedSongs(this.group);
    if (unlistenedSongs.length === 0) {
      this.toastService.showNegativeToast('No unlistened songs');
      return;
    }

    this.addingAllToQueue = true;
    let successCount = 0;
    let failCount = 0;
    let completed = 0;

    unlistenedSongs.forEach((song) => {
      this.playerService
        .addToSpotifyQueue(song.trackId)
        .pipe(take(1))
        .subscribe({
          next: () => {
            successCount++;
            this.groupsService
              .markAsQueued(this.groupId, this.currentEmail, song.id)
              .pipe(take(1))
              .subscribe();
            completed++;
            this.checkBatchComplete(
              completed,
              unlistenedSongs.length,
              successCount,
              failCount,
            );
          },
          error: () => {
            failCount++;
            completed++;
            this.checkBatchComplete(
              completed,
              unlistenedSongs.length,
              successCount,
              failCount,
            );
          },
        });
    });
  }

  private checkBatchComplete(
    completed: number,
    total: number,
    success: number,
    fail: number,
  ): void {
    if (completed === total) {
      this.addingAllToQueue = false;
      if (fail === 0) {
        this.toastService.showPositiveToast(
          `Added ${success} songs to Spotify queue`,
        );
      } else {
        this.toastService.showNegativeToast(
          `Added ${success} songs, ${fail} failed`,
        );
      }
      this.loadGroup(true);
    }
  }

  markAllAsListened(): void {
    if (this.markingAllListened || !this.group) return;

    this.markingAllListened = true;

    this.groupsService
      .markAllAsListened(this.groupId, this.currentEmail)
      .pipe(take(1))
      .subscribe({
        next: (result) => {
          this.toastService.showPositiveToast(
            `Marked ${result.count} songs as listened`,
          );
          this.markingAllListened = false;
          this.loadGroup(true);
        },
        error: () => {
          this.toastService.showNegativeToast('Error marking songs');
          this.markingAllListened = false;
        },
      });
  }

  // ============================================
  // MEMBER ACTIONS
  // ============================================

  removeMember(member: GroupMember, event: Event): void {
    event.stopPropagation();
    if (!this.isAdmin() || member.email === this.currentEmail) return;

    this.groupsService
      .removeMember(this.groupId, this.currentEmail, member.email)
      .pipe(take(1))
      .subscribe({
        next: () => {
          if (this.group) {
            this.group.members = this.group.members.filter(
              (m) => m.email !== member.email,
            );
            this.group.memberCount--;
          }
          this.toastService.showPositiveToast('Member removed');
        },
        error: () => {
          this.toastService.showNegativeToast('Error removing member');
        },
      });
  }

  leaveGroup(): void {
    this.groupsService
      .leaveGroup(this.groupId, this.currentEmail)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.toastService.showPositiveToast('Left the group');
          this.router.navigate(['/groups']);
        },
        error: () => {
          this.toastService.showNegativeToast('Error leaving group');
        },
      });
  }

  // ============================================
  // MODAL HANDLERS
  // ============================================

  openAddSongModal(): void {
    this.showAddSongModal = true;
  }

  closeAddSongModal(): void {
    this.showAddSongModal = false;
  }

  onSongAdded(song: GroupSong): void {
    if (this.group) {
      this.group.songs.unshift(song);
      this.group.songCount++;
    }
    this.filterSongs();
    this.closeAddSongModal();
  }

  openAddMemberModal(): void {
    this.showAddMemberModal = true;
  }

  closeAddMemberModal(): void {
    this.showAddMemberModal = false;
  }

  onMemberAdded(member: GroupMember): void {
    if (this.group) {
      this.group.members.push(member);
      this.group.memberCount++;
    }
  }

  // ============================================
  // HELPERS
  // ============================================

  getUnlistenedCount(): number {
    return this.group ? this.groupsService.getUnlistenedCount(this.group) : 0;
  }

  canRemoveSong(song: GroupSong): boolean {
    return this.isAdmin() || song.addedBy === this.currentEmail;
  }

  isAdmin(): boolean {
    return this.group?.currentUserRole === 'admin';
  }

  formatDuration(ms: number): string {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  }

  refresh(): void {
    this.loadGroup(true);
  }

  getDefaultAvatar(): string {
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="%236a6a7a"%3E%3Cpath d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E';
  }

  getAlbumArt(song: GroupSong): string {
    return song.track.album?.images?.[0]?.url || this.getDefaultAvatar();
  }

  getArtistNames(song: GroupSong): string {
    return song.track.artists.map((a) => a.name).join(', ');
  }

  getExistingMemberEmails(): string[] {
    return this.group?.members.map((m) => m.email) || [];
  }
}
