import { Component, Input, OnInit } from '@angular/core';
import { trigger, state, style, animate, transition } from '@angular/animations';
import { ToastService } from 'src/app/services/toast.service';

@Component({
  selector: 'app-toast',
  templateUrl: './toast.component.html',
  styleUrls: ['./toast.component.scss'],
  animations: [
    trigger('slideIn', [
      state('void', style({ 
        opacity: 0,
        transform: 'translate(-50%, 20px)'
      })),
      transition(':enter', [
        animate('300ms ease-out', style({ 
          opacity: 1,
          transform: 'translate(-50%, 0)'
        }))
      ]),
      transition(':leave', [
        animate('300ms ease-in', style({ 
          opacity: 0,
          transform: 'translate(-50%, 20px)'
        }))
      ]),
    ]),
  ],
})
export class ToastComponent implements OnInit {
  @Input() toastType: 'positive' | 'negative' | 'info' = 'positive';
  message: string = '';
  isVisible: boolean = false;

  constructor(private ToastService: ToastService) {}

  ngOnInit() {
    this.ToastService.registerToast(this);
  }

  showToast(msg: string) {
    this.message = msg;
    this.isVisible = true;

    setTimeout(() => {
      this.isVisible = false;
      this.message = '';
    }, 3000);
  }
}
