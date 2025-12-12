import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'map'
})
export class MapPipe implements PipeTransform {
  transform(items: any[], property: string): any[] {
    if (!items || !property) {
      return items;
    }
    return items.map(item => item[property]);
  }
}
