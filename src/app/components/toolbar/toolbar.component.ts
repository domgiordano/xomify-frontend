import { Component, HostListener, OnInit, OnDestroy } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { QueueService } from '../../services/queue.service';
import { FriendsService } from '../../services/friends.service';
import { UserService } from '../../services/user.service';
import { Subscription, forkJoin } from 'rxjs';
import { take } from 'rxjs/operators';

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss'],
})
export class ToolbarComponent implements OnInit, OnDestroy {
  dropdownVisible = false;
  isMobile: boolean = false;
  queueCount = 0;
  pendingFriendsCount = 0;

  private subscriptions: Subscription[] = [];

  constructor(
    private authService: AuthService,
    private router: Router,
    private queueService: QueueService,
    private friendsService: FriendsService,
    private userService: UserService
  ) {
    this.checkIfMobile();
    window.addEventListener('resize', this.checkIfMobile.bind(this));
  }

  ngOnInit(): void {
    this.subscriptions.push(
      this.queueService.queueCount$.subscribe((count) => {
        this.queueCount = count;
      })
    );

    // Subscribe to pending requests
    this.subscriptions.push(
      this.friendsService.pendingRequests$.subscribe((requests) => {
        const email = this.userService.getEmail();
        if (email) {
          this.pendingFriendsCount = requests.filter(
            (r) => r.requestedBy !== email && r.status === 'pending'
          ).length;
        }
      })
    );

    // Load pending requests if logged in
    if (this.authService.isLoggedIn()) {
      this.loadPendingRequests();
    }
  }

  loadPendingRequests(): void {
    const email = this.userService.getEmail();
    if (email) {
      this.friendsService.getPendingRequests(email).pipe(take(1)).subscribe();
    }
  }

  ngOnDestroy(): void {
    this.subscriptions.forEach((sub) => sub.unsubscribe());
  }

  toggleDropdown() {
    this.dropdownVisible = !this.dropdownVisible;
  }

  selectItem(route: string) {
    this.dropdownVisible = false;
    this.router.navigate([route]);
  }

  @HostListener('document:click', ['$event'])
  closeDropdown(event: MouseEvent) {
    const target = event.target as HTMLElement;
    if (!target.closest('.dropdown') && !target.closest('.dropdown-button')) {
      this.dropdownVisible = false;
    }
  }

  checkIfMobile() {
    this.isMobile = window.innerWidth <= 768;
  }

  isLoggedIn(): boolean {
    return this.authService.isLoggedIn();
  }

  isSelected(route: string): boolean {
    return this.router.url === route;
  }

  logout(): void {
    this.authService.logout();
    this.dropdownVisible = false;
    this.router.navigate(['/home']);
  }
}
