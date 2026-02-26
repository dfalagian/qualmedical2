import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Receipt, MessageSquare, ShoppingCart } from "lucide-react";
import { EmailServerStatus } from "@/components/dashboard/EmailServerStatus";
import { Navigate } from "react-router-dom";
import { ManageContador } from "@/components/supplier/ManageContador";
import { LowStockCard } from "@/components/dashboard/LowStockCard";

const Dashboard = () => {
  const { user, isAdmin, isContador, isContadorProveedor, isSupplier } = useAuth();

  // Redirigir contadores (internos) directamente a su página
  if (isContador) {
    return <Navigate to="/dashboard/medicine-counter" replace />;
  }

  // Redirigir contador_proveedor (sub-usuario) directamente al conteo de medicamentos
  if (isContadorProveedor) {
    return <Navigate to="/dashboard/medicine-counter" replace />;
  }

  const stats = [
    {
      title: "Documentos",
      value: "0",
      description: "Documentos pendientes",
      icon: FileText,
      color: "text-primary",
    },
    {
      title: "Facturas",
      value: "0",
      description: "Facturas en proceso",
      icon: Receipt,
      color: "text-success",
    },
    {
      title: "Mensajes",
      value: "0",
      description: "Mensajes sin leer",
      icon: MessageSquare,
      color: "text-warning",
    },
    ...(isAdmin ? [{
      title: "Órdenes",
      value: "0",
      description: "Órdenes activas",
      icon: ShoppingCart,
      color: "text-accent",
    }] : []),
  ];

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
        <div className="space-y-1">
          <h2 className="text-xl md:text-3xl font-bold tracking-tight">
            Bienvenido
          </h2>
          <p className="text-sm md:text-base text-muted-foreground">
            {user?.email}
          </p>
        </div>

        <div className="grid gap-3 md:gap-4 grid-cols-2 lg:grid-cols-5">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="shadow-md hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 p-3 md:p-6">
                  <CardTitle className="text-xs md:text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent className="p-3 pt-0 md:p-6 md:pt-0">
                  <div className="text-xl md:text-2xl font-bold">{stat.value}</div>
                  <p className="text-[10px] md:text-xs text-muted-foreground line-clamp-1">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}

          {/* Tarjeta de Stock Bajo - Solo para admin */}
          {isAdmin && <LowStockCard />}
        </div>

        {isAdmin && <EmailServerStatus />}

        {/* Banner de contacto WhatsApp para proveedores */}
        {!isAdmin && (
          <div
            onClick={() => window.open("https://wa.me/525647599227", "_blank", "noopener,noreferrer")}
            role="button"
            tabIndex={0}
            className="flex items-center gap-3 p-4 rounded-lg bg-[#25D366]/10 border border-[#25D366]/30 hover:bg-[#25D366]/20 transition-colors cursor-pointer"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 shrink-0" fill="#25D366">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            <div>
              <p className="text-sm font-medium">Si tienes dudas sobre tus facturas, contáctanos</p>
              <p className="text-xs text-muted-foreground">+52 56 4759 9227</p>
            </div>
          </div>
        )}

        {/* Sección para que proveedores gestionen su contador */}
        {isSupplier && (
          <ManageContador />
        )}

        <Card className="shadow-md">
          <CardHeader className="p-4 md:p-6">
            <CardTitle className="text-base md:text-lg">Actividad Reciente</CardTitle>
            <CardDescription className="text-sm">
              No hay actividad reciente para mostrar
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4 pt-0 md:p-6 md:pt-0">
            <p className="text-xs md:text-sm text-muted-foreground text-center py-6 md:py-8">
              Comienza a usar el sistema para ver tu actividad aquí
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;