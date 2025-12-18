import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from 'src/app/services/auth.service';

@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  title = 'XOMIFY';

  constructor(private AuthService: AuthService, private router: Router) {}

  ngOnInit(): void {
    console.log('Toolbar locked n loaded.');
    if (this.AuthService.isLoggedIn()) {
      this.router.navigate(['/my-profile']); // Navigate after login
    }
  }

  login(): void {
    this.AuthService.login();
  }
}
