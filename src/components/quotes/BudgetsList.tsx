import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle, FileText, User, Calendar, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { logActivity } from "@/lib/activityLogger";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const BudgetsList = () => {
  const queryClient = useQueryClient();
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [confirmFolio, setConfirmFolio] = useState<string>("");

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ["budgets-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quotes")
        .select(`
          id, folio, concepto, fecha_cotizacion, subtotal, total, created_at, status,
          clients!inner(id, nombre_cliente, razon_social, rfc)
        `)
        .eq("status", "presupuesto")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  const approveMutation = useMutation({
    mutationFn: async (budgetId: string) => {
      const { error } = await supabase
        .from("quotes")
        .update({ status: "borrador" })
        .eq("id", budgetId);
      if (error) throw error;
      return budgetId;
    },
    onSuccess: () => {
      toast.success(`Presupuesto ${confirmFolio} aprobado y convertido a cotización`);
      logActivity({
        section: "cotizaciones",
        action: "aprobar",
        entityType: "presupuesto",
        entityId: confirmId || undefined,
        entityName: confirmFolio,
        details: { convertido_a: "cotización (borrador)" },
      });
      queryClient.invalidateQueries({ queryKey: ["budgets-list"] });
      queryClient.invalidateQueries({ queryKey: ["quotes"] });
      setConfirmId(null);
    },
    onError: (err: any) => {
      toast.error(err.message || "Error al aprobar presupuesto");
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (budgets.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <FileText className="h-12 w-12 mx-auto mb-3 opacity-30" />
        <p className="font-medium">No hay presupuestos pendientes</p>
        <p className="text-sm mt-1">Los presupuestos creados desde Punto de Venta aparecerán aquí</p>
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-3">
        {budgets.map((budget: any) => (
          <Card key={budget.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-1 flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                      Presupuesto
                    </Badge>
                    <span className="font-bold text-sm">{budget.folio}</span>
                  </div>
                  <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <User className="h-3.5 w-3.5" />
                      {budget.clients?.nombre_cliente || "—"}
                    </span>
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {format(new Date(budget.fecha_cotizacion), "dd MMM yyyy", { locale: es })}
                    </span>
                    {budget.concepto && (
                      <span className="text-xs italic">{budget.concepto}</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground flex items-center gap-1">
                      <DollarSign className="h-3 w-3" />Total
                    </p>
                    <p className="font-bold text-lg">
                      ${(budget.total || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setConfirmId(budget.id);
                      setConfirmFolio(budget.folio);
                    }}
                    className="shrink-0"
                  >
                    <CheckCircle className="h-4 w-4 mr-1" />
                    Aprobar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <AlertDialog open={!!confirmId} onOpenChange={(open) => !open && setConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Aprobar presupuesto {confirmFolio}?</AlertDialogTitle>
            <AlertDialogDescription>
              El presupuesto se convertirá en una cotización en estado Borrador, lista para ser editada o aprobada.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmId && approveMutation.mutate(confirmId)}
              disabled={approveMutation.isPending}
            >
              {approveMutation.isPending ? "Aprobando..." : "Sí, aprobar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
