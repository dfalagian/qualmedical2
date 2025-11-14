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
            "group toast group-[.toaster]:bg-card group-[.toaster]:text-foreground group-[.toaster]:border-2 group-[.toaster]:border-border group-[.toaster]:shadow-2xl group-[.toaster]:font-medium group-[.toaster]:backdrop-blur-md",
          description: "group-[.toast]:text-muted-foreground group-[.toast]:font-medium",
          actionButton: "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground group-[.toast]:font-semibold",
          cancelButton: "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
          success: "group-[.toaster]:!bg-emerald-50 dark:group-[.toaster]:!bg-emerald-950 group-[.toaster]:border-emerald-500 group-[.toaster]:text-emerald-900 dark:group-[.toaster]:text-emerald-100",
          error: "group-[.toaster]:!bg-red-50 dark:group-[.toaster]:!bg-red-950 group-[.toaster]:border-red-500 group-[.toaster]:text-red-900 dark:group-[.toaster]:text-red-100",
          warning: "group-[.toaster]:!bg-amber-50 dark:group-[.toaster]:!bg-amber-950 group-[.toaster]:border-amber-500 group-[.toaster]:text-amber-900 dark:group-[.toaster]:text-amber-100",
          info: "group-[.toaster]:!bg-blue-50 dark:group-[.toaster]:!bg-blue-950 group-[.toaster]:border-blue-500 group-[.toaster]:text-blue-900 dark:group-[.toaster]:text-blue-100",
        },
      }}
      {...props}
    />
  );
};

export { Toaster, toast };
