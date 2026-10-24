import { Component, computed, inject, input } from '@angular/core';
import { AppStore } from './app-store';

@Component({
  selector: 'app-ico',
  template: `@if (src(); as s) { <img class="ico" [src]="s" alt="" width="24" height="24" loading="lazy" referrerpolicy="no-referrer" /> }`,
  styles: `.ico { vertical-align: middle; margin-right: 4px; border-radius: 3px; }`,
})
export class ItemIcon {
  private readonly store = inject(AppStore);
  readonly id = input.required<string>();
  readonly src = computed(() => this.store.iconOf(this.id()));
}
