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