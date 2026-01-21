import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, forkJoin, debounceTime, Subject } from 'rxjs';
import { take } from 'rxjs/operators';
import { FriendsService, Friend, SearchResult } from 'src/app/services/friends.service';
import { UserService } from 'src/app/services/user.service';
import { ToastService } from 'src/app/services/toast.service';

type TabType = 'friends' | 'pending' | 'search';

@Component({
  selector: 'app-friends',
  templateUrl: './friends.component.html',
  styleUrls: ['./friends.component.scss'],
})
export class FriendsComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];
  private searchSubject = new Subject<string>();

  loading = true;
  currentEmail = '';
  activeTab: TabType = 'friends';

  // Friends list
  friends: Friend[] = [];
  filteredFriends: Friend[] = [];
  friendsSearchQuery = '';

  // Pending requests
  incomingRequests: Friend[] = [];
  outgoingRequests: Friend[] = [];

  // User search
  searchQuery = '';
  searchResults: SearchResult[] = [];
  isSearching = false;
  hasSearched = false;

  // Action loading states
  actionLoading: { [key: string]: boolean } = {};

  constructor(
    private friendsService: FriendsService,
    private userService: UserService,
    private toastService: ToastService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.currentEmail = this.userService.getEmail();
    this.loadData();

    // Setup debounced search
    this.subscriptions.push(
      this.searchSubject.pipe(debounceTime(400)).subscribe((query) => {
        this.performSearch(query);
      })
    );
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  loadData(forceRefresh = false): void {
    this.loading = true;

    if (forceRefresh) {
      this.friendsService.clearCache();
    }

    forkJoin({
      friends: this.friendsService.getFriendsList(this.currentEmail).pipe(take(1)),
      pending: this.friendsService.getPendingRequests(this.currentEmail).pipe(take(1)),
    }).subscribe({
      next: ({ friends, pending }) => {
        this.friends = friends.filter((f) => f.status === 'accepted');
        this.filteredFriends = [...this.friends];

        this.incomingRequests = pending.filter(
          (r) => r.requestedBy !== this.currentEmail && r.status === 'pending'
        );
        this.outgoingRequests = pending.filter(
          (r) => r.requestedBy === this.currentEmail && r.status === 'pending'
        );

        this.loading = false;

        if (forceRefresh) {
          this.toastService.showPositiveToast('Friends list refreshed');
        }
      },
      error: (err) => {
        console.error('Error loading friends data:', err);
        this.toastService.showNegativeToast('Error loading friends');
        this.loading = false;
      },
    });
  }

  // Tab switching
  switchTab(tab: TabType): void {
    this.activeTab = tab;
    if (tab === 'search') {
      this.searchResults = [];
      this.hasSearched = false;
    }
  }

  // Friends list filtering
  filterFriends(): void {
    const query = this.friendsSearchQuery.toLowerCase().trim();
    if (!query) {
      this.filteredFriends = [...this.friends];
    } else {
      this.filteredFriends = this.friends.filter(
        (f) =>
          f.displayName?.toLowerCase().includes(query) ||
          f.email?.toLowerCase().includes(query)
      );
    }
  }

  clearFriendsSearch(): void {
    this.friendsSearchQuery = '';
    this.filterFriends();
  }

  // User search
  onSearchInput(): void {
    this.searchSubject.next(this.searchQuery);
  }

  performSearch(query: string): void {
    if (!query || query.trim().length < 2) {
      this.searchResults = [];
      this.hasSearched = false;
      return;
    }

    this.isSearching = true;
    this.hasSearched = true;

    this.friendsService
      .searchUsers(query.trim())
      .pipe(take(1))
      .subscribe({
        next: (results) => {
          // Filter out current user
          this.searchResults = results.filter((r) => r.email !== this.currentEmail);
          this.isSearching = false;
        },
        error: (err) => {
          console.error('Error searching users:', err);
          this.toastService.showNegativeToast('Error searching users');
          this.isSearching = false;
        },
      });
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.searchResults = [];
    this.hasSearched = false;
  }

  // Friend actions
  sendRequest(result: SearchResult): void {
    if (this.actionLoading[result.email]) return;

    this.actionLoading[result.email] = true;

    this.friendsService
      .sendFriendRequest(this.currentEmail, result.email)
      .pipe(take(1))
      .subscribe({
        next: () => {
          result.isPending = true;
          this.toastService.showPositiveToast(`Friend request sent to ${result.displayName}`);
          this.actionLoading[result.email] = false;
        },
        error: (err) => {
          console.error('Error sending friend request:', err);
          this.toastService.showNegativeToast('Error sending friend request');
          this.actionLoading[result.email] = false;
        },
      });
  }

  acceptRequest(request: Friend): void {
    if (this.actionLoading[request.email]) return;

    this.actionLoading[request.email] = true;

    this.friendsService
      .acceptFriendRequest(this.currentEmail, request.email)
      .pipe(take(1))
      .subscribe({
        next: () => {
          // Move from pending to friends
          this.incomingRequests = this.incomingRequests.filter((r) => r.email !== request.email);
          request.status = 'accepted';
          this.friends.push(request);
          this.filteredFriends = [...this.friends];

          this.toastService.showPositiveToast(`You are now friends with ${request.displayName}`);
          this.actionLoading[request.email] = false;
        },
        error: (err) => {
          console.error('Error accepting friend request:', err);
          this.toastService.showNegativeToast('Error accepting friend request');
          this.actionLoading[request.email] = false;
        },
      });
  }

  rejectRequest(request: Friend): void {
    if (this.actionLoading[request.email]) return;

    this.actionLoading[request.email] = true;

    this.friendsService
      .removeFriend(this.currentEmail, request.email)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.incomingRequests = this.incomingRequests.filter((r) => r.email !== request.email);
          this.outgoingRequests = this.outgoingRequests.filter((r) => r.email !== request.email);
          this.toastService.showPositiveToast('Request removed');
          this.actionLoading[request.email] = false;
        },
        error: (err) => {
          console.error('Error rejecting request:', err);
          this.toastService.showNegativeToast('Error removing request');
          this.actionLoading[request.email] = false;
        },
      });
  }

  cancelRequest(request: Friend): void {
    this.rejectRequest(request);
  }

  removeFriend(friend: Friend, event: Event): void {
    event.stopPropagation();

    if (this.actionLoading[friend.email]) return;

    this.actionLoading[friend.email] = true;

    this.friendsService
      .removeFriend(this.currentEmail, friend.email)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.friends = this.friends.filter((f) => f.email !== friend.email);
          this.filteredFriends = this.filteredFriends.filter((f) => f.email !== friend.email);
          this.toastService.showPositiveToast(`Removed ${friend.displayName} from friends`);
          this.actionLoading[friend.email] = false;
        },
        error: (err) => {
          console.error('Error removing friend:', err);
          this.toastService.showNegativeToast('Error removing friend');
          this.actionLoading[friend.email] = false;
        },
      });
  }

  // Navigation
  goToProfile(friend: Friend): void {
    this.router.navigate(['/friend', friend.email]);
  }

  // Helpers
  getPendingCount(): number {
    return this.incomingRequests.length;
  }

  getDefaultAvatar(): string {
    return 'assets/img/no-image.png';
  }

  refresh(): void {
    this.loadData(true);
  }
}
