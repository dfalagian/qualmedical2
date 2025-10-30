import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import { DashboardLayout } from "@/components/dashboard/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, Loader2, RefreshCw } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { PaymentProofUpload } from "@/components/payments/PaymentProofUpload";

const Payments = () => {
  const { loading, isAdmin, user } = useAuth();
  const queryClient = useQueryClient();

  const { data: pagos, isLoading, error: pagosError } = useQuery({
    queryKey: ["pagos"],
    queryFn: async () => {
      // Primero obtener los pagos básicos
      const { data: pagosData, error: pagosErr } = await supabase
        .from("pagos")
        .select("*")
        .order("created_at", { ascending: false });

      if (pagosErr) throw pagosErr;
      if (!pagosData) return [];

      // Enriquecer con datos relacionados
      const enrichedPagos = await Promise.all(
        pagosData.map(async (pago: any) => {
          // Obtener profile
          const { data: profile } = await supabase
            .from("profiles")
            .select("full_name, company_name, rfc")
            .eq("id", pago.supplier_id)
            .single();

          // Obtener datos bancarios con nombre del banco
          const { data: bankData } = await supabase
            .from("documents")
            .select("nombre_cliente, numero_cuenta, numero_cuenta_clabe, nombre_banco, image_urls")
            .eq("id", pago.datos_bancarios_id)
            .single();

          // Obtener factura
          const { data: invoice } = await supabase
            .from("invoices")
            .select("invoice_number, amount, fecha_emision")
            .eq("id", pago.invoice_id)
            .single();

          // Obtener régimen fiscal de la constancia fiscal del proveedor
          const { data: constanciaFiscal } = await supabase
            .from("documents")
            .select("regimen_fiscal")
            .eq("supplier_id", pago.supplier_id)
            .eq("document_type", "constancia_fiscal")
            .eq("status", "aprobado")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          return {
            ...pago,
            profiles: profile,
            datos_bancarios: bankData,
            invoices: invoice,
            regimen_fiscal: constanciaFiscal?.regimen_fiscal || null,
          };
        })
      );

      return enrichedPagos;
    },
  });

  const generatePaymentsMutation = useMutation({
    mutationFn: async () => {
      // Buscar todos los proveedores con datos bancarios aprobados
      const { data: approvedBankDocs, error: bankError } = await supabase
        .from("documents")
        .select("id, supplier_id, nombre_banco")
        .eq("document_type", "datos_bancarios")
        .eq("status", "aprobado");

      if (bankError) throw bankError;

      if (!approvedBankDocs || approvedBankDocs.length === 0) {
        throw new Error("No hay datos bancarios aprobados");
      }

      let totalCreated = 0;

      // Para cada documento bancario aprobado, buscar facturas pendientes
      for (const bankDoc of approvedBankDocs) {
        const { data: invoices, error: invoicesError } = await supabase
          .from("invoices")
          .select("id, amount")
          .eq("supplier_id", bankDoc.supplier_id)
          .eq("status", "pendiente");

        if (invoicesError) throw invoicesError;

        if (invoices && invoices.length > 0) {
          // Crear registros de pago para facturas que no tengan pago aún
          const pagos = invoices.map(invoice => ({
            supplier_id: bankDoc.supplier_id,
            datos_bancarios_id: bankDoc.id,
            invoice_id: invoice.id,
            amount: invoice.amount,
            status: "pendiente",
            nombre_banco: bankDoc.nombre_banco || null,
            created_by: user?.id,
          }));

          const { error: pagosError } = await supabase
            .from("pagos")
            .upsert(pagos, { onConflict: 'invoice_id', ignoreDuplicates: true });

          if (pagosError && !pagosError.message.includes("duplicate")) {
            console.error("Error creando pagos:", pagosError);
          } else {
            totalCreated += invoices.length;
          }
        }
      }

      return totalCreated;
    },
    onSuccess: (count) => {
      if (count > 0) {
        toast.success(`Se generaron ${count} registros de pago`);
      } else {
        toast.info("No hay nuevos pagos para generar");
      }
      queryClient.invalidateQueries({ queryKey: ["pagos"] });
    },
    onError: (error: any) => {
      toast.error(error.message || "Error al generar pagos");
    },
  });

  const handleExportExcel = () => {
    if (!pagos || pagos.length === 0) {
      toast.error("No hay pagos para exportar");
      return;
    }

    const excelData = pagos.map((pago: any) => ({
      "Proveedor": pago.profiles?.full_name || pago.profiles?.company_name || "N/A",
      "RFC": pago.profiles?.rfc || "N/A",
      "Régimen Fiscal": pago.regimen_fiscal || "N/A",
      "Nombre Banco": pago.datos_bancarios?.nombre_banco || pago.nombre_banco || "N/A",
      "Cliente Bancario": pago.datos_bancarios?.nombre_cliente || "N/A",
      "Número de Cuenta": pago.datos_bancarios?.numero_cuenta || "N/A",
      "CLABE": pago.datos_bancarios?.numero_cuenta_clabe || "N/A",
      "Número de Factura": pago.invoices?.invoice_number || "N/A",
      "Importe Factura": pago.invoices?.amount || 0,
      "Fecha Emisión Factura": pago.invoices?.fecha_emision 
        ? new Date(pago.invoices.fecha_emision).toLocaleDateString() 
        : "N/A",
      "Estado Pago": pago.status,
      "Fecha Pago": pago.fecha_pago 
        ? new Date(pago.fecha_pago).toLocaleDateString() 
        : "N/A",
      "Fecha Creación": new Date(pago.created_at).toLocaleDateString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pagos");

    // Ajustar ancho de columnas
    const columnWidths = [
      { wch: 30 }, // Proveedor
      { wch: 15 }, // RFC
      { wch: 25 }, // Régimen Fiscal
      { wch: 20 }, // Nombre Banco
      { wch: 30 }, // Cliente Bancario
      { wch: 20 }, // Número de Cuenta
      { wch: 20 }, // CLABE
      { wch: 20 }, // Número de Factura
      { wch: 15 }, // Importe
      { wch: 15 }, // Fecha Emisión
      { wch: 15 }, // Estado
      { wch: 15 }, // Fecha Pago
      { wch: 15 }, // Fecha Creación
    ];
    worksheet["!cols"] = columnWidths;

    XLSX.writeFile(workbook, `pagos_${new Date().toISOString().split("T")[0]}.xlsx`);
    toast.success("Archivo Excel exportado correctamente");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/dashboard" />;
  }

  return (
    <DashboardLayout>
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-bold">Pagos</h1>
            <p className="text-muted-foreground mt-2">
              Gestión de pagos generados por la aprobación de datos bancarios y facturas
            </p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => generatePaymentsMutation.mutate()} 
              disabled={generatePaymentsMutation.isPending}
              variant="outline"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${generatePaymentsMutation.isPending ? 'animate-spin' : ''}`} />
              Sincronizar Pagos
            </Button>
            <Button onClick={handleExportExcel} disabled={!pagos || pagos.length === 0}>
              <Download className="h-4 w-4 mr-2" />
              Exportar a Excel
            </Button>
          </div>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Régimen Fiscal</TableHead>
                <TableHead>Banco</TableHead>
                <TableHead>Cliente Bancario</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>CLABE</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha Pago</TableHead>
                <TableHead>Comprobante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={11} className="text-center">
                    <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                  </TableCell>
                </TableRow>
              ) : pagos && pagos.length > 0 ? (
                pagos.map((pago: any) => (
                  <TableRow key={pago.id}>
                    <TableCell>
                      <div className="font-medium">
                        {pago.profiles?.full_name || pago.profiles?.company_name || "N/A"}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {pago.profiles?.rfc || "Sin RFC"}
                      </div>
                    </TableCell>
                    <TableCell className="text-sm">
                      {pago.regimen_fiscal || "N/A"}
                    </TableCell>
                    <TableCell>
                      {pago.datos_bancarios?.nombre_banco || pago.nombre_banco || "N/A"}
                    </TableCell>
                    <TableCell>{pago.datos_bancarios?.nombre_cliente || "N/A"}</TableCell>
                    <TableCell className="font-mono text-sm">
                      {pago.datos_bancarios?.numero_cuenta || "N/A"}
                    </TableCell>
                    <TableCell className="font-mono text-sm">
                      {pago.datos_bancarios?.numero_cuenta_clabe || "N/A"}
                    </TableCell>
                    <TableCell>{pago.invoices?.invoice_number || "N/A"}</TableCell>
                    <TableCell className="font-semibold">
                      ${parseFloat(pago.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={pago.status === "pagado" ? "default" : "secondary"}
                        className={pago.status === "pagado" ? "bg-green-600 hover:bg-green-700" : ""}
                      >
                        {pago.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {pago.fecha_pago 
                        ? new Date(pago.fecha_pago).toLocaleDateString('es-MX')
                        : "-"
                      }
                    </TableCell>
                    <TableCell>
                      <PaymentProofUpload 
                        pagoId={pago.id}
                        supplierId={pago.supplier_id}
                        hasProof={!!pago.comprobante_pago_url}
                        proofUrl={pago.comprobante_pago_url}
                      />
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={11} className="text-center text-muted-foreground">
                    No hay pagos registrados
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
      </div>
    </DashboardLayout>
  );
};

export default Payments;
