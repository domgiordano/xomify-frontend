import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Subscription } from 'rxjs';
import { take } from 'rxjs/operators';
import { GroupsService, GroupMember } from 'src/app/services/groups.service';
import { FriendsService, Friend } from 'src/app/services/friends.service';
import { UserService } from 'src/app/services/user.service';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-add-member-modal',
  templateUrl: './add-member-modal.component.html',
  styleUrls: ['./add-member-modal.component.scss'],
})
export class AddMemberModalComponent implements OnInit, OnDestroy {
  @Input() groupId = '';
  @Input() existingMemberEmails: string[] = [];
  @Output() memberAdded = new EventEmitter<GroupMember>();
  @Output() closed = new EventEmitter<void>();

  private subscriptions: Subscription[] = [];

  // State
  currentEmail = '';

  // Friends data
  friends: Friend[] = [];
  filteredFriends: Friend[] = [];
  friendsLoading = true;
  searchQuery = '';

  // Adding state
  addingMember: { [email: string]: boolean } = {};

  constructor(
    private groupsService: GroupsService,
    private friendsService: FriendsService,
    private userService: UserService,
    private toastService: ToastService,
  ) {}

  ngOnInit(): void {
    this.currentEmail = this.userService.getEmail();
    this.loadFriends();
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  // ============================================
  // MODAL CONTROL
  // ============================================

  close(): void {
    this.closed.emit();
  }

  onBackdropClick(event: MouseEvent): void {
    if ((event.target as HTMLElement).classList.contains('modal-backdrop')) {
      this.close();
    }
  }

  // ============================================
  // DATA LOADING
  // ============================================

  loadFriends(): void {
    this.friendsLoading = true;

    this.friendsService
      .getFriendsList(this.currentEmail)
      .pipe(take(1))
      .subscribe({
        next: (response) => {
          // Filter out users who are already members
          this.friends = (response.accepted || []).filter(
            (f) => !this.existingMemberEmails.includes(f.email),
          );
          this.filterFriends();
          this.friendsLoading = false;
        },
        error: () => {
          this.toastService.showNegativeToast('Error loading friends');
          this.friendsLoading = false;
        },
      });
  }

  // ============================================
  // SEARCH & FILTER
  // ============================================

  filterFriends(): void {
    if (!this.searchQuery.trim()) {
      this.filteredFriends = [...this.friends];
      return;
    }

    const query = this.searchQuery.toLowerCase();
    this.filteredFriends = this.friends.filter(
      (f) =>
        f.email.toLowerCase().includes(query) ||
        f.displayName?.toLowerCase().includes(query),
    );
  }

  onSearchChange(): void {
    this.filterFriends();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.filterFriends();
  }

  // ============================================
  // ADD MEMBER
  // ============================================

  addMember(friend: Friend): void {
    if (this.addingMember[friend.email]) return;

    this.addingMember[friend.email] = true;

    this.groupsService
      .addMember(this.groupId, this.currentEmail, friend.email)
      .pipe(take(1))
      .subscribe({
        next: (member) => {
          this.toastService.showPositiveToast(
            `Added ${friend.displayName || friend.email} to group`,
          );
          // Remove from available friends list
          this.friends = this.friends.filter((f) => f.email !== friend.email);
          this.filterFriends();
          this.memberAdded.emit(member);
          this.addingMember[friend.email] = false;
        },
        error: () => {
          this.toastService.showNegativeToast('Error adding member');
          this.addingMember[friend.email] = false;
        },
      });
  }

  // ============================================
  // HELPERS
  // ============================================

  getDefaultAvatar(): string {
    return 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 24 24" fill="%236a6a7a"%3E%3Cpath d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/%3E%3C/svg%3E';
  }
}
