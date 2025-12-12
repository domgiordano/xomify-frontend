import { Component, HostListener, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss'],
})
export class ToolbarComponent implements OnInit {
  dropdownVisible = false;
  isMobile: boolean;

  constructor(
    private AuthService: AuthService,
    private router: Router
  ) {
    this.checkIfMobile();
    window.addEventListener('resize', this.checkIfMobile.bind(this));
  }

  ngOnInit(): void {
    console.log("Toolbar initialized.");
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
    return this.AuthService.isLoggedIn();
  }

  isSelected(route: string): boolean {
    return this.router.url === route;
  }

  logout(): void {
    this.AuthService.logout();
    this.dropdownVisible = false;
    this.router.navigate(['/home']);
  }
}
