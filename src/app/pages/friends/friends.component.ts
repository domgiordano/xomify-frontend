import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  FriendsService,
  Friend,
  SearchResult,
} from 'src/app/services/friends.service';
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

  loading = true;
  currentEmail = '';
  activeTab: TabType = 'friends';

  // Friends list
  friends: Friend[] = [];
  filteredFriends: Friend[] = [];
  friendsSearchQuery = '';

  // Pending requests (from getFriendsList response)
  incomingRequests: Friend[] = [];
  outgoingRequests: Friend[] = [];

  // All users for "Add Friends" tab
  allUsers: SearchResult[] = [];
  filteredUsers: SearchResult[] = [];
  userSearchQuery = '';
  usersLoading = false;
  usersLoaded = false;

  // Action loading states
  actionLoading: { [key: string]: boolean } = {};

  // Store raw response for re-enrichment after users load
  private rawFriendsResponse: any = null;

  constructor(
    private friendsService: FriendsService,
    private userService: UserService,
    private toastService: ToastService,
    private router: Router,
  ) {}

  ngOnInit(): void {
    this.currentEmail = this.userService.getEmail();
    // Set the current user email so the service knows whose data to track
    this.friendsService.setCurrentUserEmail(this.currentEmail);
    // Load users first, then friends data (so we have user info for enrichment)
    this.loadAllUsers();
    this.loadData();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  loadData(forceRefresh = false): void {
    this.loading = true;

    if (forceRefresh) {
      this.usersLoaded = false;
    }

    this.friendsService
      .getFriendsList(this.currentEmail, forceRefresh)
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          // Store raw response for re-enrichment after users load
          this.rawFriendsResponse = response;
          this.enrichFriendsData();

          this.loading = false;

          // Update allUsers statuses based on friends/pending/outgoing lists
          this.syncUserStatuses();

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

  // Enrich friends data with user info (avatar, displayName)
  private enrichFriendsData(): void {
    if (!this.rawFriendsResponse) return;

    const response = this.rawFriendsResponse;

    // accepted friends - map friendEmail to email for display
    this.friends = (response.accepted || []).map((f: any) => {
      const targetEmail = f.friendEmail || f.email;
      const userInfo = this.getUserInfo(targetEmail);
      return {
        ...f,
        email: targetEmail,
        displayName: userInfo?.displayName || f.displayName || targetEmail,
        avatar: userInfo?.avatar || f.avatar,
      };
    });
    this.filteredFriends = [...this.friends];

    // pending = incoming requests (from others to you)
    this.incomingRequests = (response.pending || []).map((r: any) => {
      const targetEmail = r.friendEmail || r.email;
      const userInfo = this.getUserInfo(targetEmail);
      return {
        ...r,
        email: targetEmail,
        displayName: userInfo?.displayName || r.displayName || targetEmail,
        avatar: userInfo?.avatar || r.avatar,
      };
    });

    // requested = outgoing requests (from you to others)
    this.outgoingRequests = (response.requested || []).map((r: any) => {
      const targetEmail = r.friendEmail || r.email;
      const userInfo = this.getUserInfo(targetEmail);
      return {
        ...r,
        email: targetEmail,
        displayName: userInfo?.displayName || r.displayName || targetEmail,
        avatar: userInfo?.avatar || r.avatar,
      };
    });
  }

  // Tab switching
  switchTab(tab: TabType): void {
    this.activeTab = tab;
  }

  // Load all users for "Find Friends" tab (called on init, uses cache)
  loadAllUsers(forceRefresh = false): void {
    if (this.usersLoaded && !forceRefresh) return;

    this.usersLoading = true;

    this.friendsService
      .getAllUsers(this.currentEmail, forceRefresh)
      .pipe(take(1))
      .subscribe({
        next: (users) => {
          // Filter out current user
          this.allUsers = users.filter((u) => u.email !== this.currentEmail);
          // Show up to 10 recommended users by default
          this.filteredUsers = this.allUsers.slice(0, 10);
          this.usersLoading = false;
          this.usersLoaded = true;

          // Re-enrich friends data now that we have user info for avatars
          if (this.rawFriendsResponse) {
            this.enrichFriendsData();
          }
        },
        error: (err) => {
          console.error('Error loading users:', err);
          this.usersLoading = false;
        },
      });
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
          f.email?.toLowerCase().includes(query),
      );
    }
  }

  clearFriendsSearch(): void {
    this.friendsSearchQuery = '';
    this.filterFriends();
  }

  // User search filtering (client-side autocomplete)
  filterUsers(): void {
    const query = this.userSearchQuery.toLowerCase().trim();
    if (!query) {
      // Show up to 10 recommended users when no query
      this.filteredUsers = this.allUsers.slice(0, 10);
    } else {
      // Filter all users based on query
      this.filteredUsers = this.allUsers.filter(
        (u) =>
          u.displayName?.toLowerCase().includes(query) ||
          u.email?.toLowerCase().includes(query),
      );
    }
  }

  clearUserSearch(): void {
    this.userSearchQuery = '';
    // Reset to recommended users
    this.filteredUsers = this.allUsers.slice(0, 10);
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
          // Update the user's status in allUsers
          result.isPending = true;
          result.isOutgoingRequest = true;
          const userInList = this.allUsers.find((u) => u.email === result.email);
          if (userInList) {
            userInList.isPending = true;
            userInList.isOutgoingRequest = true;
          }

          // Add to outgoing requests for immediate UI update
          this.outgoingRequests.push({
            email: result.email,
            displayName: result.displayName,
            avatar: result.avatar,
            direction: 'outgoing',
            status: 'pending',
            createdAt: new Date().toISOString(),
          });

          this.toastService.showPositiveToast(
            `Friend request sent to ${result.displayName}`,
          );
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
          this.incomingRequests = this.incomingRequests.filter(
            (r) => r.email !== request.email,
          );
          this.friends.push({
            email: request.email,
            displayName: request.displayName,
            avatar: request.avatar,
          });
          this.filteredFriends = [...this.friends];

          // Update user status in allUsers
          const userInList = this.allUsers.find((u) => u.email === request.email);
          if (userInList) {
            userInList.isFriend = true;
            userInList.isPending = false;
            userInList.isIncomingRequest = false;
            userInList.isOutgoingRequest = false;
          }

          this.toastService.showPositiveToast(
            `You are now friends with ${request.displayName}`,
          );
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
      .rejectFriendRequest(this.currentEmail, request.email)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.incomingRequests = this.incomingRequests.filter(
            (r) => r.email !== request.email,
          );

          // Update user status in allUsers
          const userInList = this.allUsers.find((u) => u.email === request.email);
          if (userInList) {
            userInList.isPending = false;
            userInList.isIncomingRequest = false;
          }

          this.toastService.showPositiveToast('Request rejected');
          this.actionLoading[request.email] = false;
        },
        error: (err) => {
          console.error('Error rejecting request:', err);
          this.toastService.showNegativeToast('Error rejecting request');
          this.actionLoading[request.email] = false;
        },
      });
  }

  cancelRequest(request: Friend): void {
    if (this.actionLoading[request.email]) return;

    this.actionLoading[request.email] = true;

    this.friendsService
      .rejectFriendRequest(this.currentEmail, request.email)
      .pipe(take(1))
      .subscribe({
        next: () => {
          this.outgoingRequests = this.outgoingRequests.filter(
            (r) => r.email !== request.email,
          );

          // Update user status in allUsers
          const userInList = this.allUsers.find((u) => u.email === request.email);
          if (userInList) {
            userInList.isPending = false;
            userInList.isOutgoingRequest = false;
          }

          this.toastService.showPositiveToast('Request cancelled');
          this.actionLoading[request.email] = false;
        },
        error: (err) => {
          console.error('Error cancelling request:', err);
          this.toastService.showNegativeToast('Error cancelling request');
          this.actionLoading[request.email] = false;
        },
      });
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
          this.filteredFriends = this.filteredFriends.filter(
            (f) => f.email !== friend.email,
          );

          // Update user status in allUsers
          const userInList = this.allUsers.find((u) => u.email === friend.email);
          if (userInList) {
            userInList.isFriend = false;
          }

          this.toastService.showPositiveToast(
            `Removed ${friend.displayName} from friends`,
          );
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

  getUserInfo(email: string): { displayName?: string; avatar?: string } | null {
    const user = this.allUsers.find((u) => u.email === email);
    return user ? { displayName: user.displayName, avatar: user.avatar } : null;
  }

  // Sync user statuses in allUsers based on friends/pending/outgoing lists
  syncUserStatuses(): void {
    if (this.allUsers.length === 0) return;

    const friendEmails = new Set(this.friends.map((f) => f.email));
    const incomingEmails = new Set(this.incomingRequests.map((r) => r.email));
    const outgoingEmails = new Set(this.outgoingRequests.map((r) => r.email));

    this.allUsers.forEach((user) => {
      user.isFriend = friendEmails.has(user.email);
      user.isIncomingRequest = incomingEmails.has(user.email);
      user.isOutgoingRequest = outgoingEmails.has(user.email);
      user.isPending = user.isIncomingRequest || user.isOutgoingRequest;
    });

    // Update filtered users if needed
    if (this.userSearchQuery) {
      this.filterUsers();
    } else {
      this.filteredUsers = this.allUsers.slice(0, 10);
    }
  }

  refresh(): void {
    this.loadData(true);
    this.loadAllUsers(true);
  }
}
