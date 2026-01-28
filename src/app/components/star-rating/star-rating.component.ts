import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-star-rating',
  templateUrl: './star-rating.component.html',
  styleUrls: ['./star-rating.component.scss'],
})
export class StarRatingComponent {
  @Input() rating: number = 0;
  @Input() readonly: boolean = false;
  @Input() size: 'small' | 'medium' | 'large' = 'medium';
  @Output() ratingChange = new EventEmitter<number>();

  stars = [1, 2, 3, 4, 5];
  hoverRating: number = 0;

  onStarClick(star: number, event: MouseEvent): void {
    if (this.readonly) return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const isHalfStar = event.offsetX < rect.width / 2;
    const newRating = isHalfStar ? star - 0.5 : star;

    this.rating = newRating;
    this.ratingChange.emit(newRating);
  }

  onStarHover(star: number, event: MouseEvent): void {
    if (this.readonly) return;

    const rect = (event.target as HTMLElement).getBoundingClientRect();
    const isHalfStar = event.offsetX < rect.width / 2;
    this.hoverRating = isHalfStar ? star - 0.5 : star;
  }

  onMouseLeave(): void {
    this.hoverRating = 0;
  }

  getStarClass(star: number): string {
    const displayRating = this.hoverRating || this.rating;

    if (displayRating >= star) {
      return 'full';
    } else if (displayRating >= star - 0.5) {
      return 'half';
    }
    return 'empty';
  }
}
