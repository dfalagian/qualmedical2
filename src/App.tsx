import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Dashboard from "./pages/Dashboard";
import Documents from "./pages/Documents";
import DocumentsAdmin from "./pages/DocumentsAdmin";
import ConstanciaFiscalAdmin from "./pages/ConstanciaFiscalAdmin";
import ComprobanteDomicilioAdmin from "./pages/ComprobanteDomicilioAdmin";
import AvisoFuncionamientoAdmin from "./pages/AvisoFuncionamientoAdmin";
import DatosBancariosAdmin from "./pages/DatosBancariosAdmin";
import Invoices from "./pages/Invoices";
import Messages from "./pages/Messages";
import PurchaseOrders from "./pages/PurchaseOrders";
import Admin from "./pages/Admin";
import MedicineCounter from "./pages/MedicineCounter";
import SupplierDocuments from "./pages/SupplierDocuments";
import DatabaseBackup from "./pages/DatabaseBackup";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Auth />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/documents" element={<Documents />} />
          <Route path="/dashboard/documents-admin" element={<DocumentsAdmin />} />
          <Route path="/dashboard/constancia-fiscal-admin" element={<ConstanciaFiscalAdmin />} />
          <Route path="/dashboard/comprobante-domicilio-admin" element={<ComprobanteDomicilioAdmin />} />
          <Route path="/dashboard/aviso-funcionamiento-admin" element={<AvisoFuncionamientoAdmin />} />
          <Route path="/dashboard/datos-bancarios-admin" element={<DatosBancariosAdmin />} />
          <Route path="/dashboard/invoices" element={<Invoices />} />
          <Route path="/dashboard/messages" element={<Messages />} />
          <Route path="/dashboard/orders" element={<PurchaseOrders />} />
          <Route path="/dashboard/admin" element={<Admin />} />
          <Route path="/dashboard/medicine-counter" element={<MedicineCounter />} />
          <Route path="/dashboard/supplier-documents" element={<SupplierDocuments />} />
          <Route path="/dashboard/database-backup" element={<DatabaseBackup />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
