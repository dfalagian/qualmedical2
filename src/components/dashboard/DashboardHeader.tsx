import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import qualmedicalLogo from "@/assets/qualmedical-logo.jpg";

export const DashboardHeader = () => {
  const { signOut, isAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card shadow-sm">
      <div className="container flex h-14 md:h-16 items-center justify-between px-3 md:px-4">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          <img 
            src={qualmedicalLogo} 
            alt="QualMedical Farma" 
            className="h-8 md:h-10 w-auto shrink-0"
          />
          <div className="border-l pl-2 md:pl-3 border-border min-w-0">
            <h1 className="text-sm md:text-lg font-bold text-foreground truncate">Portal de Proveedores</h1>
            <p className="text-[10px] md:text-xs text-muted-foreground truncate">
              {isAdmin ? "Panel Administrativo" : "Área de Proveedor"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={signOut} size="sm" className="shrink-0">
          <LogOut className="h-4 w-4 md:mr-2" />
          <span className="hidden md:inline">Cerrar Sesión</span>
        </Button>
      </div>
    </header>
  );
};