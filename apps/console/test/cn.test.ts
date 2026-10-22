import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/cn';

describe('cn', () => {
  it('keeps a token colour and a token text size together', () => {
    expect(cn('text-ink-on-shell', 'text-body')).toBe('text-ink-on-shell text-body');
    expect(cn('text-base text-ink', 'text-title')).toBe('text-ink text-title');
    expect(cn('text-ink', 'text-danger-ink')).toBe('text-danger-ink');
  });
});
