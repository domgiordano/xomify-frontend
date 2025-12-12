import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'join'
})
export class JoinPipe implements PipeTransform {
  transform(items: any[], separator: string = ', '): string {
    if (!items || !Array.isArray(items)) {
      return '';
    }
    return items.join(separator);
  }
}
