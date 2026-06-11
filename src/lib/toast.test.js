import { describe, it, expect, vi } from 'vitest';
import { toast, onToast, TOAST_DURATION_MS, TOAST_ERROR_DURATION_MS } from './toast.js';

describe('toast bus', () => {
  it('delivers a toast to subscribers with defaults', () => {
    const seen = [];
    const off = onToast((t) => seen.push(t));
    toast('hello');
    off();
    expect(seen).toHaveLength(1);
    expect(seen[0].message).toBe('hello');
    expect(seen[0].kind).toBe('info');
    expect(seen[0].duration).toBe(TOAST_DURATION_MS);
  });

  it('stops delivering after unsubscribe', () => {
    const fn = vi.fn();
    const off = onToast(fn);
    toast('one');
    off();
    toast('two');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('errors get the longer default duration', () => {
    const seen = [];
    const off = onToast((t) => seen.push(t));
    toast.error('boom');
    off();
    expect(seen[0].kind).toBe('error');
    expect(seen[0].duration).toBe(TOAST_ERROR_DURATION_MS);
  });

  it('success helper sets kind, explicit duration wins', () => {
    const seen = [];
    const off = onToast((t) => seen.push(t));
    toast.success('saved', { duration: 1234 });
    off();
    expect(seen[0].kind).toBe('success');
    expect(seen[0].duration).toBe(1234);
  });

  it('ignores empty messages and mints unique ids', () => {
    const seen = [];
    const off = onToast((t) => seen.push(t));
    expect(toast('')).toBeNull();
    const a = toast('a');
    const b = toast('b');
    off();
    expect(seen).toHaveLength(2);
    expect(a).not.toBe(b);
  });
});

describe('toast actions', () => {
  it('passes an action through to subscribers, defaults to null', () => {
    const seen = [];
    const off = onToast((t) => seen.push(t));
    const onClick = () => {};
    toast('Removed Sol Ring', { action: { label: 'Undo', onClick } });
    toast('plain');
    off();
    expect(seen[0].action).toEqual({ label: 'Undo', onClick });
    expect(seen[1].action).toBeNull();
  });
});
