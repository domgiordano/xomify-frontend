import { Component, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import {
  GroupsService,
  Group,
  CreateGroupRequest,
} from 'src/app/services/groups.service';
import { FriendsService, Friend } from 'src/app/services/friends.service';
import { UserService } from 'src/app/services/user.service';
import { ToastService } from 'src/app/services/toast.service';

type TabType = 'my-groups' | 'create';

@Component({
  selector: 'app-groups',
  templateUrl: './groups.component.html',
  styleUrls: ['./groups.component.scss'],
})
export class GroupsComponent implements OnInit, OnDestroy {
  private subscriptions: Subscription[] = [];

  // State
  loading = true;
  currentEmail = '';
  activeTab: TabType = 'my-groups';

  // Groups data
  groups: Group[] = [];
  filteredGroups: Group[] = [];
  searchQuery = '';

  // Create group form
  newGroupName = '';
  newGroupDescription = '';
  selectedFriends: Friend[] = [];
  creatingGroup = false;

  // Friends for selection
  friends: Friend[] = [];
  friendsLoading = false;
  friendsLoaded = false;

  constructor(
    private router: Router,
    private groupsService: GroupsService,
    private friendsService: FriendsService,
    private userService: UserService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.currentEmail = this.userService.getEmail();
    this.loadGroups();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  // ============================================
  // DATA LOADING
  // ============================================

  loadGroups(forceRefresh = false): void {
    this.loading = true;
    this.groupsService
      .getGroups(this.currentEmail, forceRefresh)
      .pipe(take(1))
      .subscribe({
        next: (groups) => {
          this.groups = groups;
          this.filterGroups();
          this.loading = false;
          if (forceRefresh) {
            this.toastService.showPositiveToast('Groups refreshed');
          }
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading groups');
          this.loading = false;
        },
      });
  }

  loadFriends(): void {
    if (this.friendsLoaded || this.friendsLoading) return;

    this.friendsLoading = true;
    this.friendsService
      .getFriendsList(this.currentEmail)
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          // Map friendEmail to email (API returns friendEmail for the friend's actual email)
          this.friends = (response.accepted || []).map((f: any) => ({
            ...f,
            email: f.friendEmail || f.email,
            displayName: f.displayName || f.friendEmail || f.email,
          }));
          this.friendsLoaded = true;
          this.friendsLoading = false;
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading friends');
          this.friendsLoading = false;
        },
      });
  }

  // ============================================
  // TAB NAVIGATION
  // ============================================

  switchTab(tab: TabType): void {
    this.activeTab = tab;
    if (tab === 'create' && !this.friendsLoaded) {
      this.loadFriends();
    }
  }

  // ============================================
  // SEARCH & FILTER
  // ============================================

  filterGroups(): void {
    if (!this.searchQuery.trim()) {
      this.filteredGroups = [...this.groups];
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.filteredGroups = this.groups.filter(
      (g) =>
        g.name.toLowerCase().includes(query) ||
        g.description?.toLowerCase().includes(query),
    );
  }

  onSearchChange(): void {
    this.filterGroups();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filterGroups();
  }

  // ============================================
  // NAVIGATION
  // ============================================

  goToGroup(group: Group): void {
    this.router.navigate(['/group', group.id]);
  }

  // ============================================
  // CREATE GROUP
  // ============================================

  toggleFriendSelection(friend: Friend): void {
    const index = this.selectedFriends.findIndex(
      (f) => f.email === friend.email,
    );
    if (index >= 0) {
      this.selectedFriends.splice(index, 1);
    } else {
      this.selectedFriends.push(friend);
    }
  }

  isFriendSelected(friend: Friend): boolean {
    return this.selectedFriends.some((f) => f.email === friend.email);
  }

  canCreateGroup(): boolean {
    return this.newGroupName.trim().length > 0 && !this.creatingGroup;
  }

  createGroup(): void {
    if (!this.canCreateGroup()) return;

    this.creatingGroup = true;

    const request: CreateGroupRequest = {
      name: this.newGroupName.trim(),
      description: this.newGroupDescription.trim() || undefined,
      memberEmails: this.selectedFriends.map((f) => f.email),
    };

    this.groupsService
      .createGroup(this.currentEmail, request)
      .pipe(take(1))
      .subscribe({
        next: (newGroup) => {
          this.toastService.showPositiveToast('Group created!');
          this.creatingGroup = false;
          this.resetCreateForm();
          this.router.navigate(['/group', newGroup.id]);
        },
        error: () => {
          this.toastService.showNegativeToast('Error creating group');
          this.creatingGroup = false;
        },
      });
  }

  resetCreateForm(): void {
    this.newGroupName = '';
    this.newGroupDescription = '';
    this.selectedFriends = [];
  }

  // ============================================
  // HELPERS
  // ============================================

  refresh(): void {
    this.loadGroups(true);
  }

  getDefaultGroupImage(): string {
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="%239c0abf"%3E%3Cpath d="M12 12.75c1.63 0 3.07.39 4.24.9 1.08.48 1.76 1.56 1.76 2.73V18H6v-1.61c0-1.18.68-2.26 1.76-2.73 1.17-.52 2.61-.91 4.24-.91zM4 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm1.13 1.1c-.37-.06-.74-.1-1.13-.1-.99 0-1.93.21-2.78.58A2.01 2.01 0 0 0 0 16.43V18h4.5v-1.61c0-.83.23-1.61.63-2.29zM20 13c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm4 3.43c0-.81-.48-1.53-1.22-1.85A6.95 6.95 0 0 0 20 14c-.39 0-.76.04-1.13.1.4.68.63 1.46.63 2.29V18H24v-1.57zM12 6c1.66 0 3 1.34 3 3s-1.34 3-3 3-3-1.34-3-3 1.34-3 3-3z"/%3E%3C/svg%3E';
  }

  getTotalUnlistened(): number {
    return this.groups.reduce((sum, g) => sum + (g.unlistenedCount || 0), 0);
  }
}
