import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { FileText, Receipt, MessageSquare, ShoppingCart } from "lucide-react";

const Dashboard = () => {
  const { user, isAdmin } = useAuth();

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
      <div className="space-y-6">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">
            Bienvenido, {user?.email}
          </h2>
          <p className="text-muted-foreground">
            Aquí está el resumen de tu actividad
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="shadow-md hover:shadow-lg transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {stat.title}
                  </CardTitle>
                  <Icon className={`h-4 w-4 ${stat.color}`} />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{stat.value}</div>
                  <p className="text-xs text-muted-foreground">
                    {stat.description}
                  </p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        <Card className="shadow-md">
          <CardHeader>
            <CardTitle>Actividad Reciente</CardTitle>
            <CardDescription>
              No hay actividad reciente para mostrar
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground text-center py-8">
              Comienza a usar el sistema para ver tu actividad aquí
            </p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Dashboard;