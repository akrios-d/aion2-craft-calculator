import { Pipe, PipeTransform, inject } from '@angular/core';
import { AppStore } from './app-store';
import { Params } from './i18n';

@Pipe({ name: 'tr', pure: false })
export class TrPipe implements PipeTransform {
  private readonly store = inject(AppStore);

  transform(text: string | null | undefined, params?: Params): string {
    return this.store.tr(text ?? '', params);
  }
}
