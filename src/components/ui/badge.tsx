import { mergeProps } from "@base-ui/react/merge-props"
import { useRender } from "@base-ui/react/use-render"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "group/badge inline-flex h-auto w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-[var(--radius-pill)] border border-transparent px-2 py-1 text-xs font-semibold whitespace-nowrap transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 has-data-[icon=inline-end]:pr-1.5 has-data-[icon=inline-start]:pl-1.5 aria-invalid:border-destructive aria-invalid:ring-destructive/20 [&>svg]:pointer-events-none [&>svg]:size-3!",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground [a]:hover:bg-primary/80",
        secondary:
          "bg-surface-sunken text-ink-500 [a]:hover:bg-surface-hover",
        destructive:
          "bg-expense-soft text-expense-strong [a]:hover:bg-expense-soft/80",
        outline:
          "border-hairline text-ink-700 [a]:hover:bg-surface-hover",
        ghost: "text-ink-500 hover:bg-surface-hover",
        link: "text-primary underline-offset-4 hover:underline",
        accent: "bg-accent-soft text-[var(--accent)]",
        income: "bg-income-soft text-income",
        expense: "bg-expense-soft text-expense-strong",
        review: "bg-review-soft text-review",
        uncat: "bg-uncat-soft text-uncat",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  })
}

export { Badge, badgeVariants }
