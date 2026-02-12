import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ShoppingCart, Inbox, FileSpreadsheet } from "lucide-react";
import { SalesRequestsCitioOrders } from "@/components/sales-requests/SalesRequestsCitioOrders";
import { SalesRequestsList } from "@/components/sales-requests/SalesRequestsList";
import { CipiRequestsList } from "@/components/sales-requests/CipiRequestsList";

const SalesRequests = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("requests");

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div className="space-y-1">
            <h2 className="text-xl md:text-3xl font-bold tracking-tight">
              Solicitud de Ventas
            </h2>
            <p className="text-sm md:text-base text-muted-foreground">
              Solicitudes de proveedores, órdenes CITIO, CIPI y CIPI Pro
            </p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="requests" className="flex items-center gap-2">
              <Inbox className="h-4 w-4" />
              <span className="hidden sm:inline">Solicitudes</span>
            </TabsTrigger>
            <TabsTrigger value="citio" className="flex items-center gap-2">
              <ShoppingCart className="h-4 w-4" />
              <span className="hidden sm:inline">Órdenes CITIO</span>
            </TabsTrigger>
            <TabsTrigger value="cipi" className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">CIPI</span>
            </TabsTrigger>
            <TabsTrigger value="cipi_pro" className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">CIPI Pro</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="requests" className="mt-4">
            <SalesRequestsList />
          </TabsContent>

          <TabsContent value="citio" className="mt-4">
            <SalesRequestsCitioOrders />
          </TabsContent>

          <TabsContent value="cipi" className="mt-4">
            <CipiRequestsList type="cipi" title="Solicitudes CIPI" />
          </TabsContent>

          <TabsContent value="cipi_pro" className="mt-4">
            <CipiRequestsList type="cipi_pro" title="Solicitudes CIPI Pro" />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default SalesRequests;
