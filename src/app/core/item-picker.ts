import { Component, computed, effect, inject, input, model, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AppStore } from './app-store';
import { ItemIcon } from './item-icon';
import { Item } from './models';
import { TrPipe } from './tr.pipe';

/** Searchable picker restricted to the given game items; `selectedId` is '' until an item is chosen. */
@Component({
  selector: 'app-item-picker',
  imports: [FormsModule, ItemIcon, TrPipe],
  template: `
    <div class="combo">
      <input type="search" autocomplete="off" [placeholder]="'Search item…' | tr" [ngModel]="query()"
        (ngModelChange)="onQuery($event)" (focus)="open.set(true)" (blur)="closeSoon()"
        (keydown.enter)="pickFirst($event)" (keydown.escape)="open.set(false)" />
      @if (open()) {
        <ul class="combo-list">
          @for (i of matches(); track i.id) {
            <li (mousedown)="pick(i.id)"><app-ico [id]="i.id" />{{ i.name }}</li>
          } @empty { <li class="muted">{{ 'No matches.' | tr }}</li> }
        </ul>
      }
    </div>
  `,
})
export class ItemPicker {
  private readonly store = inject(AppStore);
  readonly items = input.required<Item[]>();
  readonly selectedId = model('');
  readonly query = signal('');
  readonly open = signal(false);

  readonly matches = computed(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.items();
    return (q ? all.filter((i) => i.name.toLowerCase().includes(q) || i.id === q) : all).slice(0, 50);
  });

  constructor() {
    // Follow external changes: loading a plan sets an id; clearing the id after a match empties the text.
    effect(() => {
      const id = this.selectedId();
      const q = untracked(() => this.query());
      if (id) {
        const name = this.store.nameOf(id);
        if (q !== name) this.query.set(name);
      } else if (q && untracked(() => this.items()).some((i) => i.name.toLowerCase() === q.trim().toLowerCase())) {
        this.query.set('');
      }
    });
  }

  onQuery(v: string): void {
    this.query.set(v);
    this.open.set(true);
    const exact = this.items().find((i) => i.name.toLowerCase() === v.trim().toLowerCase());
    this.selectedId.set(exact?.id ?? '');
  }

  pick(id: string): void {
    this.selectedId.set(id);
    this.query.set(this.store.nameOf(id));
    this.open.set(false);
  }

  pickFirst(ev: Event): void {
    ev.preventDefault();
    const first = this.matches()[0];
    if (first) this.pick(first.id);
  }

  closeSoon(): void {
    setTimeout(() => this.open.set(false), 150);
  }
}
