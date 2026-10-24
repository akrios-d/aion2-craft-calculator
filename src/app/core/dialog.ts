import { Directive, ElementRef, Injectable, inject, signal } from '@angular/core';

export interface DialogState {
  message: string;
  kind: 'prompt' | 'confirm';
  value: string;
  danger: boolean;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  readonly state = signal<DialogState | null>(null);
  private resolver: ((result: string | boolean | null) => void) | null = null;

  /** Resolves with the entered text, or null when cancelled. */
  prompt(message: string, value = ''): Promise<string | null> {
    return this.open({ message, kind: 'prompt', value, danger: false }) as Promise<string | null>;
  }

  confirm(message: string, danger = false): Promise<boolean> {
    return this.open({ message, kind: 'confirm', value: '', danger }) as Promise<boolean>;
  }

  setValue(value: string): void {
    this.state.update((s) => (s ? { ...s, value } : s));
  }

  accept(): void {
    const s = this.state();
    if (!s) return;
    this.close(s.kind === 'prompt' ? s.value : true);
  }

  cancel(): void {
    const s = this.state();
    if (s) this.close(s.kind === 'prompt' ? null : false);
  }

  private open(state: DialogState): Promise<string | boolean | null> {
    this.resolver?.(state.kind === 'prompt' ? null : false);
    this.state.set(state);
    return new Promise((resolve) => (this.resolver = resolve));
  }

  private close(result: string | boolean | null): void {
    const resolve = this.resolver;
    this.resolver = null;
    this.state.set(null);
    resolve?.(result);
  }
}

@Directive({ selector: '[appAutofocus]' })
export class AutofocusDirective {
  constructor() {
    const el = inject<ElementRef<HTMLInputElement>>(ElementRef).nativeElement;
    queueMicrotask(() => { el.focus(); el.select(); });
  }
}
