import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
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
import Payments from "./pages/Payments";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <PWAInstallPrompt />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Auth />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
          <Route path="/dashboard/documents" element={<ProtectedRoute><Documents /></ProtectedRoute>} />
          <Route path="/dashboard/documents-admin" element={<ProtectedRoute><DocumentsAdmin /></ProtectedRoute>} />
          <Route path="/dashboard/constancia-fiscal-admin" element={<ProtectedRoute><ConstanciaFiscalAdmin /></ProtectedRoute>} />
          <Route path="/dashboard/comprobante-domicilio-admin" element={<ProtectedRoute><ComprobanteDomicilioAdmin /></ProtectedRoute>} />
          <Route path="/dashboard/aviso-funcionamiento-admin" element={<ProtectedRoute><AvisoFuncionamientoAdmin /></ProtectedRoute>} />
          <Route path="/dashboard/datos-bancarios-admin" element={<ProtectedRoute><DatosBancariosAdmin /></ProtectedRoute>} />
          <Route path="/dashboard/invoices" element={<ProtectedRoute><Invoices /></ProtectedRoute>} />
          <Route path="/dashboard/messages" element={<ProtectedRoute><Messages /></ProtectedRoute>} />
          <Route path="/dashboard/orders" element={<ProtectedRoute><PurchaseOrders /></ProtectedRoute>} />
          <Route path="/dashboard/admin" element={<ProtectedRoute><Admin /></ProtectedRoute>} />
          <Route path="/dashboard/medicine-counter" element={<ProtectedRoute><MedicineCounter /></ProtectedRoute>} />
          <Route path="/dashboard/supplier-documents" element={<ProtectedRoute><SupplierDocuments /></ProtectedRoute>} />
          <Route path="/dashboard/database-backup" element={<ProtectedRoute><DatabaseBackup /></ProtectedRoute>} />
          <Route path="/dashboard/payments" element={<ProtectedRoute><Payments /></ProtectedRoute>} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
