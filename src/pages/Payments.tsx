import { useState, useMemo } from "react";
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
import { Download, Loader2, RefreshCw, Filter, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { PaymentProofUpload } from "@/components/payments/PaymentProofUpload";

const Payments = () => {
  const { loading, isAdmin, user } = useAuth();
  const queryClient = useQueryClient();
  
  // Estados para los filtros
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterSupplier, setFilterSupplier] = useState<string>("all");
  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(undefined);
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>(undefined);

  // Query para obtener los comprobantes de pago individuales
  const { data: pagos, isLoading, error: pagosError } = useQuery({
    queryKey: ["pagos-con-comprobantes", user?.id, isAdmin],
    queryFn: async () => {
      // Primero obtener los pagos básicos
      let query = supabase
        .from("pagos")
        .select("*")
        .order("created_at", { ascending: false });
      
      // Si no es admin, filtrar solo pagos del proveedor
      if (!isAdmin && user?.id) {
        query = query.eq("supplier_id", user.id);
      }

      const { data: pagosData, error: pagosErr } = await query;

      if (pagosErr) throw pagosErr;
      if (!pagosData) return [];

      // Enriquecer con datos relacionados y expandir comprobantes
      const allPaymentRows: any[] = [];

      for (const pago of pagosData) {
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
          .not("regimen_fiscal", "is", null)
          .not("regimen_fiscal", "eq", "No encontrado")
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Obtener comprobantes de pago (payment_proofs) para este pago
        const { data: paymentProofs } = await supabase
          .from("payment_proofs")
          .select("*")
          .eq("pago_id", pago.id)
          .order("proof_number", { ascending: true });

        const baseData = {
          profiles: profile,
          datos_bancarios: bankData,
          invoices: invoice,
          regimen_fiscal: constanciaFiscal?.regimen_fiscal || null,
          supplier_id: pago.supplier_id,
          datos_bancarios_id: pago.datos_bancarios_id,
          invoice_id: pago.invoice_id,
          nombre_banco: pago.nombre_banco,
          original_pago_id: pago.id,
          invoice_amount: invoice?.amount || pago.amount,
        };

        // Si hay comprobantes de pago, crear una fila por cada uno
        if (paymentProofs && paymentProofs.length > 0) {
          for (const proof of paymentProofs) {
            allPaymentRows.push({
              ...baseData,
              id: proof.id,
              amount: proof.amount,
              status: "pagado",
              fecha_pago: proof.fecha_pago,
              created_at: proof.created_at,
              comprobante_pago_url: proof.comprobante_url,
              proof_number: proof.proof_number,
              is_proof: true,
              total_proofs: paymentProofs.length,
            });
          }

          // Calcular monto pendiente
          const totalPagado = paymentProofs.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
          const montoFactura = invoice?.amount || pago.amount;
          const restante = montoFactura - totalPagado;

          // Si hay monto restante, agregar fila de pendiente
          if (restante > 0.01) {
            allPaymentRows.push({
              ...baseData,
              id: `${pago.id}-pending`,
              amount: restante,
              status: "pendiente",
              fecha_pago: null,
              created_at: pago.created_at,
              comprobante_pago_url: null,
              proof_number: null,
              is_pending_remainder: true,
              total_proofs: paymentProofs.length,
            });
          }
        } else {
          // Si no hay comprobantes, mostrar el pago original
          allPaymentRows.push({
            ...baseData,
            ...pago,
            is_proof: false,
            total_proofs: 0,
          });
        }
      }

      // Ordenar por fecha de creación descendente
      return allPaymentRows.sort((a, b) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );
    },
  });

  // Obtener lista única de proveedores para el filtro
  const suppliers = useMemo(() => {
    if (!pagos) return [];
    const uniqueSuppliers = new Map();
    pagos.forEach((pago: any) => {
      const supplierId = pago.supplier_id;
      const supplierName = pago.profiles?.full_name || pago.profiles?.company_name || "N/A";
      if (supplierId && !uniqueSuppliers.has(supplierId)) {
        uniqueSuppliers.set(supplierId, { id: supplierId, name: supplierName });
      }
    });
    return Array.from(uniqueSuppliers.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [pagos]);

  // Filtrar pagos según los filtros seleccionados
  const filteredPagos = useMemo(() => {
    if (!pagos) return [];
    
    return pagos.filter((pago: any) => {
      // Filtro por estado
      if (filterStatus !== "all") {
        const pagoStatus = pago.is_pending_remainder ? "pendiente" : pago.status;
        if (pagoStatus !== filterStatus) return false;
      }
      
      // Filtro por proveedor
      if (filterSupplier !== "all" && pago.supplier_id !== filterSupplier) {
        return false;
      }
      
      // Filtro por fecha desde
      if (filterDateFrom) {
        const pagoDate = pago.fecha_pago ? new Date(pago.fecha_pago) : new Date(pago.created_at);
        if (pagoDate < filterDateFrom) return false;
      }
      
      // Filtro por fecha hasta
      if (filterDateTo) {
        const pagoDate = pago.fecha_pago ? new Date(pago.fecha_pago) : new Date(pago.created_at);
        const endOfDay = new Date(filterDateTo);
        endOfDay.setHours(23, 59, 59, 999);
        if (pagoDate > endOfDay) return false;
      }
      
      return true;
    });
  }, [pagos, filterStatus, filterSupplier, filterDateFrom, filterDateTo]);

  const clearFilters = () => {
    setFilterStatus("all");
    setFilterSupplier("all");
    setFilterDateFrom(undefined);
    setFilterDateTo(undefined);
  };

  const hasActiveFilters = filterStatus !== "all" || filterSupplier !== "all" || filterDateFrom || filterDateTo;

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

  // Función para formatear números con separador de miles (,) y decimales (.)
  const formatCurrency = (value: number): string => {
    return value.toLocaleString('es-ES', { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    });
  };

  // Función para calcular el remanente por pagar
  const calculateRemanente = (pago: any): string => {
    const totalFactura = parseFloat(pago.invoice_amount || pago.invoices?.amount || 0);
    const importePago = parseFloat(pago.amount || 0);
    
    // Si es un pago con múltiples comprobantes (is_proof)
    if (pago.is_proof || pago.is_pending_remainder) {
      // El remanente es el total de la factura menos todos los pagos anteriores (incluyendo el actual si es pagado)
      // Necesitamos calcular cuánto queda después de este pago
      if (pago.is_pending_remainder) {
        // Si es el resto pendiente, el remanente es 0 porque aún no se paga
        return "";
      }
      // Para pagos realizados, calculamos el remanente después de este pago
      const remanente = totalFactura - (pago.accumulated_paid || importePago);
      return remanente > 0.01 ? formatCurrency(remanente) : "0";
    }
    
    // Para pagos únicos, no hay remanente
    return "";
  };

  const handleExportExcel = () => {
    if (!filteredPagos || filteredPagos.length === 0) {
      toast.error("No hay pagos para exportar");
      return;
    }

    // Agrupar pagos por invoice_id para calcular acumulados
    const paymentsByInvoice: { [key: string]: any[] } = {};
    filteredPagos.forEach((pago: any) => {
      const invoiceId = pago.invoice_id;
      if (!paymentsByInvoice[invoiceId]) {
        paymentsByInvoice[invoiceId] = [];
      }
      paymentsByInvoice[invoiceId].push(pago);
    });

    // Calcular acumulado para cada pago
    Object.keys(paymentsByInvoice).forEach(invoiceId => {
      const invoicePayments = paymentsByInvoice[invoiceId]
        .filter((p: any) => p.is_proof && p.status === 'pagado')
        .sort((a: any, b: any) => a.proof_number - b.proof_number);
      
      let accumulated = 0;
      invoicePayments.forEach((pago: any) => {
        accumulated += parseFloat(pago.amount || 0);
        pago.accumulated_paid = accumulated;
      });
    });

    const excelData = filteredPagos.map((pago: any) => {
      const totalFactura = parseFloat(pago.invoice_amount || pago.invoices?.amount || 0);
      const importePago = parseFloat(pago.amount || 0);
      
      // Calcular remanente
      let remanente = "";
      if (pago.is_proof && pago.status === 'pagado') {
        const remanenteValue = totalFactura - (pago.accumulated_paid || importePago);
        remanente = remanenteValue > 0.01 ? formatCurrency(remanenteValue) : "0";
      } else if (pago.is_pending_remainder) {
        remanente = ""; // El resto pendiente no tiene remanente porque es lo que falta por pagar
      }

      return {
        "Proveedor": pago.profiles?.full_name || pago.profiles?.company_name || "N/A",
        "RFC": pago.profiles?.rfc || "N/A",
        "Régimen Fiscal": pago.regimen_fiscal || "N/A",
        "Nombre Banco": pago.datos_bancarios?.nombre_banco || pago.nombre_banco || "N/A",
        "Cliente Bancario": pago.datos_bancarios?.nombre_cliente || "N/A",
        "Número de Cuenta": pago.datos_bancarios?.numero_cuenta || "N/A",
        "CLABE": pago.datos_bancarios?.numero_cuenta_clabe || "N/A",
        "Fecha Emisión Factura": pago.invoices?.fecha_emision 
          ? new Date(pago.invoices.fecha_emision).toLocaleDateString('es-MX') 
          : "N/A",
        "Número de Factura": pago.invoices?.invoice_number || "N/A",
        "Importe Total Factura": formatCurrency(totalFactura),
        "Número de Pago": pago.is_proof 
          ? `Pago ${pago.proof_number}` 
          : (pago.is_pending_remainder ? "Resto pendiente" : "Pago único"),
        "Importe Pago": formatCurrency(importePago),
        "Remanente x pagar": remanente,
        "Estado Pago": pago.is_pending_remainder ? "pendiente" : pago.status,
        "Fecha Pago": pago.fecha_pago 
          ? new Date(pago.fecha_pago).toLocaleDateString('es-MX') 
          : "N/A",
        "Fecha Creación": new Date(pago.created_at).toLocaleDateString('es-MX'),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(excelData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Pagos");

    // Ajustar ancho de columnas según la nueva estructura
    const columnWidths = [
      { wch: 35 }, // Proveedor
      { wch: 15 }, // RFC
      { wch: 40 }, // Régimen Fiscal
      { wch: 20 }, // Nombre Banco
      { wch: 35 }, // Cliente Bancario
      { wch: 18 }, // Número de Cuenta
      { wch: 20 }, // CLABE
      { wch: 18 }, // Fecha Emisión Factura
      { wch: 40 }, // Número de Factura
      { wch: 20 }, // Importe Total Factura
      { wch: 15 }, // Número de Pago
      { wch: 18 }, // Importe Pago
      { wch: 18 }, // Remanente x pagar
      { wch: 12 }, // Estado Pago
      { wch: 12 }, // Fecha Pago
      { wch: 12 }, // Fecha Creación
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

        {/* Filtros */}
        <Card className="mb-4 p-4">
          <div className="flex flex-wrap gap-4 items-end">
            {/* Filtro por Estado */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">Estado</label>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="pendiente">Pendiente</SelectItem>
                  <SelectItem value="procesando">Procesando</SelectItem>
                  <SelectItem value="pagado">Pagado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Proveedor */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">Proveedor</label>
              <Select value={filterSupplier} onValueChange={setFilterSupplier}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los proveedores</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Filtro por Fecha Desde */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">Desde</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[150px] justify-start text-left font-normal",
                      !filterDateFrom && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filterDateFrom ? format(filterDateFrom, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDateFrom}
                    onSelect={setFilterDateFrom}
                    locale={es}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Filtro por Fecha Hasta */}
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-muted-foreground">Hasta</label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className={cn(
                      "w-[150px] justify-start text-left font-normal",
                      !filterDateTo && "text-muted-foreground"
                    )}
                  >
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {filterDateTo ? format(filterDateTo, "dd/MM/yyyy") : "Seleccionar"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={filterDateTo}
                    onSelect={setFilterDateTo}
                    locale={es}
                    className="pointer-events-auto"
                  />
                </PopoverContent>
              </Popover>
            </div>

            {/* Botón limpiar filtros */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="h-10">
                <X className="h-4 w-4 mr-1" />
                Limpiar
              </Button>
            )}
          </div>
          
          {hasActiveFilters && (
            <div className="mt-3 text-sm text-muted-foreground">
              Mostrando {filteredPagos.length} de {pagos?.length || 0} pagos
            </div>
          )}
        </Card>

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
              ) : filteredPagos && filteredPagos.length > 0 ? (
                filteredPagos.map((pago: any) => (
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
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <span>{pago.invoices?.invoice_number || "N/A"}</span>
                        {pago.is_proof && (
                          <Badge variant="outline" className="text-xs">
                            Pago {pago.proof_number}
                          </Badge>
                        )}
                        {pago.is_pending_remainder && (
                          <Badge variant="outline" className="text-xs text-amber-600 border-amber-500/30">
                            Resto
                          </Badge>
                        )}
                      </div>
                      {(pago.is_proof || pago.is_pending_remainder) && (
                        <div className="text-xs text-muted-foreground">
                          Total factura: ${parseFloat(pago.invoice_amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="font-semibold">
                      ${parseFloat(pago.amount || 0).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Badge 
                        variant={pago.status === "pagado" ? "default" : "secondary"}
                        className={
                          pago.status === "pagado" 
                            ? "bg-green-600 hover:bg-green-700" 
                            : pago.is_pending_remainder 
                              ? "bg-amber-500/20 text-amber-700 border-amber-500/30"
                              : ""
                        }
                      >
                        {pago.is_pending_remainder ? "Pendiente" : pago.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {pago.fecha_pago 
                        ? new Date(pago.fecha_pago).toLocaleDateString('es-MX')
                        : "-"
                      }
                    </TableCell>
                    <TableCell>
                      {pago.is_pending_remainder ? (
                        <span className="text-xs text-muted-foreground">-</span>
                      ) : (
                        <PaymentProofUpload 
                          pagoId={pago.original_pago_id || pago.id}
                          supplierId={pago.supplier_id}
                          hasProof={!!pago.comprobante_pago_url}
                          proofUrl={pago.comprobante_pago_url}
                        />
                      )}
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
