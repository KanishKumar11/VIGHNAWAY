import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

/** shadcn/ui-style button on VIGHNAWAY tokens. Minimum touch height 48 px; press scales to 0.97. */
export const buttonVariants = cva(
  'vw-press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-button font-semibold disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent shadow-sm',
        secondary: 'border-2 border-shell-line bg-shell-raised text-ink-on-shell',
        panel: 'border-2 border-panel-line bg-panel text-ink',
        outline: 'border border-panel-line bg-panel-raised text-ink',
        ink: 'border-2 border-ink bg-ink text-panel',
        danger: 'border-2 border-danger-ink bg-danger-surface text-danger-ink',
        ghost: 'bg-transparent text-ink-on-shell',
      },
      size: {
        sm: 'min-h-10 px-3 text-body',
        md: 'min-h-12 px-4 text-base',
        lg: 'min-h-14 px-6 text-title',
        icon: 'size-12',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, asChild, type, ...props },
  ref,
) {
  const Comp = asChild ? Slot : 'button';
  return <Comp ref={ref} type={asChild ? undefined : (type ?? 'button')} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
