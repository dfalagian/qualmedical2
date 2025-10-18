import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import qualmedicalLogo from "@/assets/qualmedical-logo.jpg";

export const DashboardHeader = () => {
  const { signOut, isAdmin } = useAuth();

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-card shadow-sm">
      <div className="container flex h-16 items-center justify-between">
        <div className="flex items-center gap-3">
          <img 
            src={qualmedicalLogo} 
            alt="QualMedical Farma" 
            className="h-10 w-auto"
          />
          <div className="border-l pl-3 border-border">
            <h1 className="text-lg font-bold text-foreground">Portal de Proveedores</h1>
            <p className="text-xs text-muted-foreground">
              {isAdmin ? "Panel Administrativo" : "Área de Proveedor"}
            </p>
          </div>
        </div>
        <Button variant="outline" onClick={signOut} size="sm">
          <LogOut className="mr-2 h-4 w-4" />
          Cerrar Sesión
        </Button>
      </div>
    </header>
  );
};