import { describe, it, expect, vi } from 'vitest';
import { confirmDialog, onConfirmRequest } from './confirm.js';

describe('confirmDialog', () => {
  it('resolves true when the host confirms', async () => {
    const off = onConfirmRequest((req) => req.resolve(true));
    await expect(confirmDialog('Sure?')).resolves.toBe(true);
    off();
  });

  it('resolves false when the host cancels', async () => {
    const off = onConfirmRequest((req) => req.resolve(false));
    await expect(confirmDialog('Sure?')).resolves.toBe(false);
    off();
  });

  it('passes message and labels through to the host', async () => {
    const seen = [];
    const off = onConfirmRequest((req) => {
      seen.push(req);
      req.resolve(true);
    });
    await confirmDialog('Delete it?', { confirmLabel: 'Delete', cancelLabel: 'Keep' });
    off();
    expect(seen[0].message).toBe('Delete it?');
    expect(seen[0].confirmLabel).toBe('Delete');
    expect(seen[0].cancelLabel).toBe('Keep');
  });

  it('defaults labels to Confirm / Cancel', async () => {
    const seen = [];
    const off = onConfirmRequest((req) => {
      seen.push(req);
      req.resolve(true);
    });
    await confirmDialog('Go?');
    off();
    expect(seen[0].confirmLabel).toBe('Confirm');
    expect(seen[0].cancelLabel).toBe('Cancel');
  });

  it('without a host, falls back to window.confirm when present', async () => {
    const original = globalThis.window;
    globalThis.window = { confirm: vi.fn(() => true) };
    try {
      await expect(confirmDialog('Sure?')).resolves.toBe(true);
      expect(globalThis.window.confirm).toHaveBeenCalledWith('Sure?');
    } finally {
      globalThis.window = original;
    }
  });

  it('without a host or window.confirm, resolves false (safe default)', async () => {
    const original = globalThis.window;
    globalThis.window = {};
    try {
      await expect(confirmDialog('Sure?')).resolves.toBe(false);
    } finally {
      globalThis.window = original;
    }
  });
});
