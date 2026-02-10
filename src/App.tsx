import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { PWAInstallPrompt } from "@/components/PWAInstallPrompt";
import { AuthProvider } from "@/contexts/AuthContext";
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
import Inventory from "./pages/Inventory";
import MedicationsCatalogCITIO from "./pages/MedicationsCatalogCITIO";
import Quotes from "./pages/Quotes";
import PurchasesSales from "./pages/PurchasesSales";
import SalesRequests from "./pages/SalesRequests";
import PublicSalesRequest from "./pages/PublicSalesRequest";
import GeneralSuppliers from "./pages/GeneralSuppliers";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 1000 * 60 * 5, // 5 minutos
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <PWAInstallPrompt />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Auth />} />
            <Route path="/auth" element={<Auth />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <Dashboard />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/documents"
              element={
                <ProtectedRoute>
                  <Documents />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/documents-admin"
              element={
                <ProtectedRoute>
                  <DocumentsAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/constancia-fiscal-admin"
              element={
                <ProtectedRoute>
                  <ConstanciaFiscalAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/comprobante-domicilio-admin"
              element={
                <ProtectedRoute>
                  <ComprobanteDomicilioAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/aviso-funcionamiento-admin"
              element={
                <ProtectedRoute>
                  <AvisoFuncionamientoAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/datos-bancarios-admin"
              element={
                <ProtectedRoute>
                  <DatosBancariosAdmin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/invoices"
              element={
                <ProtectedRoute>
                  <Invoices />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/messages"
              element={
                <ProtectedRoute>
                  <Messages />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/orders"
              element={
                <ProtectedRoute>
                  <PurchaseOrders />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/admin"
              element={
                <ProtectedRoute>
                  <Admin />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/medicine-counter"
              element={
                <ProtectedRoute>
                  <MedicineCounter />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/supplier-documents"
              element={
                <ProtectedRoute>
                  <SupplierDocuments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/database-backup"
              element={
                <ProtectedRoute>
                  <DatabaseBackup />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/payments"
              element={
                <ProtectedRoute>
                  <Payments />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/inventory"
              element={
                <ProtectedRoute>
                  <Inventory />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/medications-citio"
              element={
                <ProtectedRoute>
                  <MedicationsCatalogCITIO />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/quotes"
              element={
                <ProtectedRoute>
                  <Quotes />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/purchases-sales"
              element={
                <ProtectedRoute>
                  <PurchasesSales />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/general-suppliers"
              element={
                <ProtectedRoute>
                  <GeneralSuppliers />
                </ProtectedRoute>
              }
            />
            <Route
              path="/dashboard/sales-requests"
              element={
                <ProtectedRoute>
                  <SalesRequests />
                </ProtectedRoute>
              }
            />
            {/* Public route - no auth */}
            <Route path="/solicitud-venta" element={<PublicSalesRequest />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;

