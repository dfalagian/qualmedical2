import { ReactNode } from "react";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { 
  FileText, 
  Receipt, 
  MessageSquare, 
  ShoppingCart, 
  Settings,
  Home,
  Camera,
  Search
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, Link } from "react-router-dom";
import { DashboardHeader } from "./DashboardHeader";

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const { user, loading, isAdmin, userRole } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Cargando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  const navigation = [
    { name: "Inicio", href: "/dashboard", icon: Home },
    ...(isAdmin ? [
      { name: "Buscador de Proveedores", href: "/dashboard/supplier-documents", icon: Search },
    ] : []),
    { name: "Documentos", href: "/dashboard/documents", icon: FileText },
    { name: "Facturas", href: "/dashboard/invoices", icon: Receipt },
    { name: "Mensajes", href: "/dashboard/messages", icon: MessageSquare },
    { name: "Contador de Medicamentos", href: "/dashboard/medicine-counter", icon: Camera },
    ...(isAdmin ? [
      { name: "Validación Actas", href: "/dashboard/documents-admin", icon: FileText },
      { name: "Validación Constancias", href: "/dashboard/constancia-fiscal-admin", icon: FileText },
      { name: "Validación Domicilios", href: "/dashboard/comprobante-domicilio-admin", icon: FileText },
      { name: "Validación Avisos", href: "/dashboard/aviso-funcionamiento-admin", icon: FileText },
      { name: "Órdenes de Compra", href: "/dashboard/orders", icon: ShoppingCart },
      { name: "Administración", href: "/dashboard/admin", icon: Settings },
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader />

      <div className="container flex gap-6 py-6">
        {/* Sidebar */}
        <aside className="w-64 shrink-0">
          <nav className="space-y-1">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.href;
              
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                    isActive
                      ? "bg-gradient-primary text-primary-foreground shadow-md"
                      : "text-foreground hover:bg-accent/20 hover:text-accent-foreground"
                  )}
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          {children}
        </main>
      </div>
    </div>
  );
};