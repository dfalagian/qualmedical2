import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronRight, FileCheck, Calendar, DollarSign, AlertCircle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { InstallmentProofUpload } from "./InstallmentProofUpload";

interface PaymentInstallmentsProps {
  pagoId: string;
  supplierId: string;
  isAdmin: boolean;
}

interface Installment {
  id: string;
  installment_number: number;
  expected_amount: number;
  actual_amount: number | null;
  status: string;
  payment_date: string | null;
  comprobante_url: string | null;
  notes: string | null;
}

export function PaymentInstallments({ pagoId, supplierId, isAdmin }: PaymentInstallmentsProps) {
  const [isOpen, setIsOpen] = useState(false);

  const { data: installments, isLoading } = useQuery({
    queryKey: ["payment-installments", pagoId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("payment_installments")
        .select("*")
        .eq("pago_id", pagoId)
        .order("installment_number", { ascending: true });

      if (error) throw error;
      return data as Installment[];
    },
  });

  if (isLoading || !installments || installments.length === 0) {
    return null;
  }

  const paidCount = installments.filter(i => i.status === 'pagado').length;
  const pendingCount = installments.filter(i => i.status === 'pendiente').length;

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pagado':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Pagado</Badge>;
      case 'pendiente':
        return <Badge variant="outline" className="text-amber-600 border-amber-500/20">Pendiente</Badge>;
      case 'vencido':
        return <Badge variant="destructive">Vencido</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="mt-2">
      <CollapsibleTrigger asChild>
        <Button 
          variant="ghost" 
          size="sm" 
          className="w-full justify-between text-xs text-muted-foreground hover:text-foreground"
        >
          <span className="flex items-center gap-2">
            {isOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
            Ver cuotas ({paidCount}/{installments.length} pagadas)
          </span>
          {pendingCount > 0 && (
            <Badge variant="outline" className="text-amber-600 border-amber-500/20 text-xs">
              {pendingCount} pendientes
            </Badge>
          )}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="mt-2 space-y-2">
        {installments.map((installment) => (
          <div 
            key={installment.id} 
            className="rounded-lg border bg-card p-3 space-y-2"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  Cuota {installment.installment_number}
                </span>
                {getStatusBadge(installment.status)}
              </div>
              <div className="flex items-center gap-1">
                <DollarSign className="h-3 w-3 text-muted-foreground" />
                <span className="text-sm font-semibold">
                  ${installment.expected_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                <span>
                  {installment.payment_date 
                    ? format(new Date(installment.payment_date), "dd MMM yyyy", { locale: es })
                    : "Fecha pendiente"
                  }
                </span>
              </div>

              {installment.status === 'pendiente' && isAdmin && (
                <InstallmentProofUpload
                  installmentId={installment.id}
                  supplierId={supplierId}
                  expectedAmount={installment.expected_amount}
                  hasProof={!!installment.comprobante_url}
                  proofUrl={installment.comprobante_url}
                />
              )}

              {installment.status === 'pagado' && (
                <div className="flex items-center gap-1 text-green-600">
                  <CheckCircle className="h-3 w-3" />
                  <span>Comprobante adjunto</span>
                </div>
              )}
            </div>

            {installment.actual_amount && installment.actual_amount !== installment.expected_amount && (
              <div className="flex items-center gap-1 text-xs text-amber-600">
                <AlertCircle className="h-3 w-3" />
                <span>
                  Monto recibido: ${installment.actual_amount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}