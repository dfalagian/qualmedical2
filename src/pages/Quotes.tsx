import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientsManagement } from "@/components/quotes/ClientsManagement";
import { QuotesManagement } from "@/components/quotes/QuotesManagement";
import { Users, FileText } from "lucide-react";

const Quotes = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("quotes");

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <DashboardLayout>
      <div className="space-y-4 md:space-y-6 pb-20 md:pb-6">
        <div className="space-y-1">
          <h2 className="text-xl md:text-3xl font-bold tracking-tight">
            Cotizaciones
          </h2>
          <p className="text-sm md:text-base text-muted-foreground">
            Gestiona clientes y genera cotizaciones de medicamentos
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 max-w-md">
            <TabsTrigger value="quotes" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              <span className="hidden sm:inline">Cotizaciones</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Clientes</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="quotes" className="mt-4">
            <QuotesManagement />
          </TabsContent>

          <TabsContent value="clients" className="mt-4">
            <ClientsManagement />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
};

export default Quotes;
