import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Receipt, FileSpreadsheet, BarChart3 } from "lucide-react";
import { PurchasesBySupplier } from "@/components/purchases-sales/PurchasesBySupplier";
import { SalesSummary } from "@/components/purchases-sales/SalesSummary";
import { PurchasesSalesComparison } from "@/components/purchases-sales/PurchasesSalesComparison";

const PurchasesSales = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("purchases");

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
        <div className="space-y-1">
          <h2 className="text-xl md:text-3xl font-bold tracking-tight">
            Compras-Ventas
          </h2>
          <p className="text-sm md:text-base text-muted-foreground">
            Compara las facturas de compra con las ventas realizadas
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 max-w-lg">
            <TabsTrigger value="purchases" className="flex items-center gap-2">
              <Receipt className="h-4 w-4" />
              <span className="hidden sm:inline">Compras</span>
            </TabsTrigger>
            <TabsTrigger value="sales" className="flex items-center gap-2">
              <FileSpreadsheet className="h-4 w-4" />
              <span className="hidden sm:inline">Ventas</span>
            </TabsTrigger>
            <TabsTrigger value="comparison" className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4" />
              <span className="hidden sm:inline">Comparar</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="purchases" className="mt-4">
            <PurchasesBySupplier />
          </TabsContent>

          <TabsContent value="sales" className="mt-4">
            <SalesSummary />
          </TabsContent>

          <TabsContent value="comparison" className="mt-4">
            <PurchasesSalesComparison />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default PurchasesSales;
