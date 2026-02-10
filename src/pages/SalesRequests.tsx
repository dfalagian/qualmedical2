import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Inbox, Link2 } from "lucide-react";
import { SalesRequestsCitioOrders } from "@/components/sales-requests/SalesRequestsCitioOrders";
import { SalesRequestsList } from "@/components/sales-requests/SalesRequestsList";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const SalesRequests = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("requests");

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const publicUrl = `${window.location.origin}/solicitud-venta`;

  const copyPublicUrl = () => {
    navigator.clipboard.writeText(publicUrl);
    toast.success("URL copiada al portapapeles");
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-xl md:text-3xl font-bold tracking-tight">
              Solicitud de Ventas
            </h2>
            <p className="text-sm md:text-base text-muted-foreground">
              Solicitudes de proveedores y órdenes de compra de CITIO
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={copyPublicUrl} className="gap-2 self-start">
            <Link2 className="h-4 w-4" />
            Copiar URL pública
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-lg">
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              <span className="hidden sm:inline">Solicitudes</span>
            </TabsTrigger>
            <TabsTrigger value="citio" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Órdenes CITIO</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="mt-4">
            <SalesRequestsList />
          </TabsContent>

          <TabsContent value="citio" className="mt-4">
            <SalesRequestsCitioOrders />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SalesRequests;
