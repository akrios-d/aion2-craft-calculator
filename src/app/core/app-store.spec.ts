import { TestBed } from '@angular/core/testing';
import { AppStore } from './app-store';

describe('AppStore undo/redo', () => {
  it('undoes and redoes user actions', () => {
    const store = TestBed.inject(AppStore);
    expect(store.canUndo()).toBe(false);
    store.setKinah(100);
    store.setKinah(250);
    expect(store.data().kinah).toBe(250);
    store.undo();
    expect(store.data().kinah).toBe(100);
    expect(store.canRedo()).toBe(true);
    store.redo();
    expect(store.data().kinah).toBe(250);
    store.undo();
    store.setKinah(5);
    expect(store.canRedo()).toBe(false);
  });
});
