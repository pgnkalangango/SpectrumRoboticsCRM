import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand",
  {
    variants: {
      variant: {
        default: "bg-brand text-white shadow-sm hover:bg-brand-deep",
        secondary: "bg-surface text-ink border border-line hover:bg-surface-2 hover:border-line-strong",
        soft: "bg-brand-tint text-brand-deep hover:bg-brand-tint/70 dark:text-brand-bright",
        ghost: "text-ink-2 hover:bg-surface-2 hover:text-ink",
        outline: "border border-line-strong text-ink hover:bg-surface-2",
        destructive: "bg-bad text-white hover:opacity-90",
        link: "text-brand underline-offset-4 hover:underline px-0",
        dark: "bg-ink text-white hover:bg-ink/90 dark:bg-surface-3 dark:text-ink",
      },
      size: {
        default: "h-9 px-3.5 text-sm [&_svg]:size-4",
        sm: "h-8 px-2.5 text-[13px] [&_svg]:size-3.5 rounded-md",
        lg: "h-11 px-5 text-[15px] [&_svg]:size-4.5",
        icon: "h-9 w-9 [&_svg]:size-4",
        "icon-sm": "h-8 w-8 [&_svg]:size-4 rounded-md",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, loading = false, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} disabled={disabled || loading} {...props}>
      {loading ? <Loader2 className="animate-spin" /> : null}
      {children}
    </Comp>
  );
});
Button.displayName = "Button";

export { Button, buttonVariants };
