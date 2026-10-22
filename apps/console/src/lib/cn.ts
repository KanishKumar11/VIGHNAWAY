import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * tailwind-merge must know the token type scale; otherwise "text-body" is read as a colour and
 * removes "text-ink" (or the reverse) when both are passed.
 */
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['eyebrow', 'meta', 'body', 'title', 'eta', 'display', 'base', 'console-title', 'clock'],
      radius: ['sheet', 'card', 'chip', 'button', 'marker'],
      shadow: ['soft', 'sm', 'md', 'lg', 'panel', 'glow-teal', 'glow-danger'],
    },
  },
});

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
