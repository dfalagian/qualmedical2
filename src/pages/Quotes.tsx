import { useState } from "react";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ClientsManagement } from "@/components/quotes/ClientsManagement";
import { QuotesManagement } from "@/components/quotes/QuotesManagement";
import { QuotesList } from "@/components/quotes/QuotesList";
import { QuoteInvoiceLinking } from "@/components/quotes/QuoteInvoiceLinking";
import { BudgetsList } from "@/components/quotes/BudgetsList";
import { Users, List, PlusCircle, Link2, ClipboardList } from "lucide-react";

interface QuoteToEdit {
  id: string;
  folio: string;
  concepto: string | null;
  fecha_cotizacion: string;
  fecha_entrega: string | null;
  factura_anterior: string | null;
  fecha_factura_anterior: string | null;
  monto_factura_anterior: number | null;
  client_id: string;
  client: {
    id: string;
    nombre_cliente: string;
    razon_social: string | null;
    rfc: string | null;
    cfdi: string | null;
  };
  items: Array<{
    id: string;
    product_id: string | null;
    batch_id: string | null;
    nombre_producto: string;
    marca: string | null;
    lote: string | null;
    fecha_caducidad: string | null;
    cantidad: number;
    precio_unitario: number;
    importe: number;
    tipo_precio: string | null;
    is_sub_product?: boolean;
    parent_item_id?: string | null;
  }>;
}

const Quotes = () => {
  const { isAdmin } = useAuth();
  const [activeTab, setActiveTab] = useState("budgets");
  const [quoteToEdit, setQuoteToEdit] = useState<QuoteToEdit | null>(null);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const handleEditQuote = (quote: QuoteToEdit) => {
    setQuoteToEdit(quote);
    setActiveTab("new");
  };

  const handleEditComplete = () => {
    setQuoteToEdit(null);
    setActiveTab("list");
  };

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

        <Tabs value={activeTab} onValueChange={(value) => {
          setActiveTab(value);
          if (value !== "new") {
            setQuoteToEdit(null);
          }
        }} className="w-full">
          <TabsList className="grid w-full grid-cols-5 max-w-3xl">
            <TabsTrigger value="budgets" className="flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              <span className="hidden sm:inline">Presupuestos</span>
            </TabsTrigger>
            <TabsTrigger value="list" className="flex items-center gap-2">
              <List className="h-4 w-4" />
              <span className="hidden sm:inline">Listado</span>
            </TabsTrigger>
            <TabsTrigger value="new" className="flex items-center gap-2">
              <PlusCircle className="h-4 w-4" />
              <span className="hidden sm:inline">{quoteToEdit ? "Editar" : "Nueva"}</span>
            </TabsTrigger>
            <TabsTrigger value="linking" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              <span className="hidden sm:inline">Vincular</span>
            </TabsTrigger>
            <TabsTrigger value="clients" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Clientes</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="budgets" className="mt-4">
            <BudgetsList />
          </TabsContent>

          <TabsContent value="list" className="mt-4">
            <QuotesList onEditQuote={handleEditQuote} />
          </TabsContent>

          <TabsContent value="new" className="mt-4">
            <QuotesManagement 
              quoteToEdit={quoteToEdit} 
              onEditComplete={handleEditComplete}
            />
          </TabsContent>

          <TabsContent value="linking" className="mt-4">
            <QuoteInvoiceLinking />
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
