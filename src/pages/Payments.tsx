import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
import { Download, Loader2 } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

const Payments = () => {
  const { loading, isAdmin } = useAuth();

  const { data: pagos, isLoading } = useQuery({
    queryKey: ["pagos"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pagos")
        .select(`
          *,
          profiles:supplier_id (
            full_name,
            company_name,
            rfc
          ),
          datos_bancarios:datos_bancarios_id (
            nombre_cliente,
            numero_cuenta,
            numero_cuenta_clabe
          ),
          invoices:invoice_id (
            invoice_number,
            amount,
            fecha_emision
          )
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
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
      "Cliente Bancario": pago.datos_bancarios?.nombre_cliente || "N/A",
      "Número de Cuenta": pago.datos_bancarios?.numero_cuenta || "N/A",
      "CLABE": pago.datos_bancarios?.numero_cuenta_clabe || "N/A",
      "Número de Factura": pago.invoices?.invoice_number || "N/A",
      "Importe Factura": pago.invoices?.amount || 0,
      "Fecha Emisión Factura": pago.invoices?.fecha_emision 
        ? new Date(pago.invoices.fecha_emision).toLocaleDateString() 
        : "N/A",
      "Estado Pago": pago.status,
      "Fecha Creación": new Date(pago.created_at).toLocaleDateString(),
    }));

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pagos");

    // Ajustar ancho de columnas
    const columnWidths = [
      { wch: 30 }, // Proveedor
      { wch: 15 }, // RFC
      { wch: 30 }, // Cliente Bancario
      { wch: 20 }, // Número de Cuenta
      { wch: 20 }, // CLABE
      { wch: 20 }, // Número de Factura
      { wch: 15 }, // Importe
      { wch: 15 }, // Fecha Emisión
      { wch: 15 }, // Estado
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
          <Button onClick={handleExportExcel} disabled={!pagos || pagos.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar a Excel
          </Button>
        </div>

        <Card>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Proveedor</TableHead>
                <TableHead>Cliente Bancario</TableHead>
                <TableHead>Cuenta</TableHead>
                <TableHead>CLABE</TableHead>
                <TableHead>Factura</TableHead>
                <TableHead>Importe</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead>Fecha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
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
                      <Badge variant={pago.status === "procesado" ? "default" : "secondary"}>
                        {pago.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(pago.created_at).toLocaleDateString('es-MX')}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center text-muted-foreground">
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
