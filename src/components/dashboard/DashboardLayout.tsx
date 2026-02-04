import { ReactNode, useState } from "react";
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
  Search,
  Menu,
  X,
  Database,
  CreditCard,
  Package,
  Pill,
  FileSpreadsheet
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLocation, Link } from "react-router-dom";
import { DashboardHeader } from "./DashboardHeader";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

interface DashboardLayoutProps {
  children: ReactNode;
}

export const DashboardLayout = ({ children }: DashboardLayoutProps) => {
  const {
    user,
    session,
    loading,
    roleLoading,
    isAdmin,
    isContador,
    isContadorProveedor,
    userRole,
  } = useAuth();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Esperar a que termine la carga inicial Y que tengamos el rol definido
  // Esto evita el race condition donde el componente se renderiza antes de tener el rol
  if (loading || roleLoading || !userRole) {
    const message = loading ? "Cargando..." : "Cargando permisos...";

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="h-8 w-8 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">{message}</p>
        </div>
      </div>
    );
  }

  if (!user || !session) {
    return <Navigate to="/auth" replace />;
  }

  // Para rol inventario_rfid, forzamos que solo pueda estar en Inventario RFID
  if (userRole === "inventario_rfid" && location.pathname !== "/dashboard/inventory") {
    return <Navigate to="/dashboard/inventory" replace />;
  }

  // Navegación para rol Contador (interno) - solo acceso a Contador de Medicamentos
  const contadorNavigation = [
    { name: "Contador de Medicamentos", href: "/dashboard/medicine-counter", icon: Camera },
  ];

  // Navegación para Contador Proveedor (sub-usuario) - contador + órdenes de compra
  const contadorProveedorNavigation = [
    { name: "Contador de Medicamentos", href: "/dashboard/medicine-counter", icon: Camera },
    { name: "Órdenes de Compra", href: "/dashboard/orders", icon: ShoppingCart },
  ];

  // Navegación para rol Inventario RFID - solo acceso a Inventario
  const inventarioRfidNavigation = [
    { name: "Inventario", href: "/dashboard/inventory", icon: Package },
  ];

  // Navegación completa para Admin y Proveedor
  const fullNavigation = [
    { name: "Inicio", href: "/dashboard", icon: Home },
    ...(isAdmin ? [
      { name: "Buscador de Proveedores", href: "/dashboard/supplier-documents", icon: Search },
    ] : []),
    { name: "Documentos", href: "/dashboard/documents", icon: FileText },
    { name: "Facturas", href: "/dashboard/invoices", icon: Receipt },
    { name: "Mensajes", href: "/dashboard/messages", icon: MessageSquare },
    ...(!isAdmin ? [
      { name: "Conteos de Medicamentos", href: "/dashboard/medicine-counter", icon: Camera },
    ] : []),
    ...(isAdmin ? [
      { name: "Contador de Medicamentos", href: "/dashboard/medicine-counter", icon: Camera },
      { name: "Validación Actas", href: "/dashboard/documents-admin", icon: FileText },
      { name: "Validación Constancias", href: "/dashboard/constancia-fiscal-admin", icon: FileText },
      { name: "Validación Domicilios", href: "/dashboard/comprobante-domicilio-admin", icon: FileText },
      { name: "Validación Avisos", href: "/dashboard/aviso-funcionamiento-admin", icon: FileText },
      { name: "Validación Datos Bancarios", href: "/dashboard/datos-bancarios-admin", icon: FileText },
      { name: "Pagos", href: "/dashboard/payments", icon: CreditCard },
      { name: "Inventario", href: "/dashboard/inventory", icon: Package },
      { name: "Cotizaciones", href: "/dashboard/quotes", icon: FileSpreadsheet },
      { name: "Catálogo", href: "/dashboard/medications-citio", icon: Pill },
      { name: "Órdenes de Compra", href: "/dashboard/orders", icon: ShoppingCart },
      { name: "Administración", href: "/dashboard/admin", icon: Settings },
      { name: "Backup BD", href: "/dashboard/database-backup", icon: Database },
    ] : []),
  ];

  // Determinar navegación según rol
  let navigation = fullNavigation;
  switch (userRole) {
    case "contador":
      navigation = contadorNavigation;
      break;
    case "contador_proveedor":
      navigation = contadorProveedorNavigation;
      break;
    case "inventario_rfid":
      navigation = inventarioRfidNavigation;
      break;
    default:
      navigation = fullNavigation;
  }

  const NavigationItems = ({ onItemClick }: { onItemClick?: () => void }) => (
    <>
      {navigation.map((item) => {
        const Icon = item.icon;
        const isActive = location.pathname === item.href;
        
        return (
          <Link
            key={item.name}
            to={item.href}
            onClick={onItemClick}
            className={cn(
              "flex items-center gap-2 md:gap-3 px-3 md:px-4 py-2.5 md:py-3 rounded-lg transition-all duration-200 text-sm md:text-base",
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
    </>
  );

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <DashboardHeader />

      <div className="container mx-auto px-3 md:px-4 overflow-x-hidden">
        <div className="flex gap-4 md:gap-6 py-3 md:py-6 overflow-x-hidden">
          {/* Desktop Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <nav className="space-y-1 sticky top-6">
              <NavigationItems />
            </nav>
          </aside>

          {/* Mobile Menu Button */}
          <div className="lg:hidden fixed bottom-4 right-4 z-50">
            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
              <SheetTrigger asChild>
                <Button
                  size="lg"
                  className="rounded-full h-12 w-12 md:h-14 md:w-14 shadow-xl hover:shadow-2xl transition-shadow"
                >
                  <Menu className="h-5 w-5 md:h-6 md:w-6" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[280px] md:w-72 p-0">
                <div className="flex items-center justify-between p-4 border-b bg-card">
                  <h2 className="font-semibold text-base md:text-lg">Menú</h2>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <X className="h-5 w-5" />
                  </Button>
                </div>
                <nav className="space-y-1 p-3 md:p-4">
                  <NavigationItems onItemClick={() => setMobileMenuOpen(false)} />
                </nav>
              </SheetContent>
            </Sheet>
          </div>

          {/* Main Content */}
          <main className="flex-1 min-w-0 w-full overflow-x-hidden">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
};