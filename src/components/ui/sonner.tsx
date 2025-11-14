import { useTheme } from "next-themes";
import { Toaster as Sonner, toast } from "sonner";

type ToasterProps = React.ComponentProps<typeof Sonner>;

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      duration={10000}
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-2 group-[.toaster]:border-border group-[.toaster]:shadow-2xl group-[.toaster]:font-medium",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:font-medium",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:font-semibold",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:bg-success/10 group-[.toaster]:border-success group-[.toaster]:text-success",
          error: "group-[.toaster]:bg-destructive/10 group-[.toaster]:border-destructive group-[.toaster]:text-destructive",
          warning: "group-[.toaster]:bg-warning/10 group-[.toaster]:border-warning group-[.toaster]:text-warning",
          info: "group-[.toaster]:bg-primary/10 group-[.toaster]:border-primary group-[.toaster]:text-primary",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
