import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle, Calendar, DollarSign } from "lucide-react";
import { format, addDays } from "date-fns";
import { es } from "date-fns/locale";

interface SplitPaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceAmount: number;
  paidAmount: number;
  onConfirm: (installments: number, dates: string[]) => Promise<void>;
  isLoading?: boolean;
}

export function SplitPaymentDialog({
  open,
  onOpenChange,
  invoiceAmount,
  paidAmount,
  onConfirm,
  isLoading = false,
}: SplitPaymentDialogProps) {
  const [selectedInstallments, setSelectedInstallments] = useState<string>("2");
  const [dates, setDates] = useState<string[]>([]);
  const remainingAmount = invoiceAmount - paidAmount;
  const installmentCount = parseInt(selectedInstallments);
  const installmentAmount = remainingAmount / installmentCount;

  const handleDateChange = (index: number, value: string) => {
    const newDates = [...dates];
    newDates[index] = value;
    setDates(newDates);
  };

  const handleConfirm = async () => {
    // Validar que todas las fechas estén completas
    const requiredDates = dates.slice(0, installmentCount);
    if (requiredDates.length < installmentCount || requiredDates.some(d => !d)) {
      return;
    }
    await onConfirm(installmentCount, requiredDates);
  };

  // Generar fechas predeterminadas (cada 15 días desde hoy)
  const getDefaultDates = (count: number) => {
    return Array.from({ length: count }, (_, i) => 
      format(addDays(new Date(), (i + 1) * 15), "yyyy-MM-dd")
    );
  };

  // Actualizar fechas cuando cambia el número de cuotas
  const handleInstallmentsChange = (value: string) => {
    setSelectedInstallments(value);
    const count = parseInt(value);
    setDates(getDefaultDates(count));
  };

  // Inicializar fechas al abrir
  useState(() => {
    if (open && dates.length === 0) {
      setDates(getDefaultDates(2));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Diferencia en Monto de Pago
          </DialogTitle>
          <DialogDescription>
            El comprobante de pago es menor al monto de la factura
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Resumen de montos */}
          <div className="rounded-lg border bg-muted/50 p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span>Monto de factura:</span>
              <span className="font-medium">${invoiceAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="flex justify-between text-sm text-green-600">
              <span>Monto pagado:</span>
              <span className="font-medium">-${paidAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="border-t pt-2 flex justify-between text-sm font-semibold">
              <span>Saldo pendiente:</span>
              <span className="text-amber-600">${remainingAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}</span>
            </div>
          </div>

          {/* Selector de número de cuotas */}
          <div className="space-y-3">
            <Label>¿En cuántos pagos desea dividir el saldo?</Label>
            <RadioGroup
              value={selectedInstallments}
              onValueChange={handleInstallmentsChange}
              className="grid grid-cols-4 gap-2"
            >
              {[2, 3, 4, 5].map((num) => (
                <div key={num}>
                  <RadioGroupItem
                    value={num.toString()}
                    id={`installment-${num}`}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={`installment-${num}`}
                    className="flex flex-col items-center justify-center rounded-lg border-2 border-muted bg-popover p-3 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary cursor-pointer"
                  >
                    <span className="text-xl font-bold">{num}</span>
                    <span className="text-xs text-muted-foreground">pagos</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Monto por cuota */}
          <div className="flex items-center gap-2 p-3 bg-primary/10 rounded-lg">
            <DollarSign className="h-5 w-5 text-primary" />
            <div>
              <p className="text-sm text-muted-foreground">Monto por cuota:</p>
              <p className="font-semibold text-primary">
                ${installmentAmount.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Fechas de pago */}
          <div className="space-y-3">
            <Label className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Fechas de pago programadas
            </Label>
            <div className="space-y-2">
              {Array.from({ length: installmentCount }).map((_, index) => (
                <div key={index} className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-16">
                    Cuota {index + 1}:
                  </span>
                  <Input
                    type="date"
                    value={dates[index] || ""}
                    onChange={(e) => handleDateChange(index, e.target.value)}
                    min={format(new Date(), "yyyy-MM-dd")}
                    className="flex-1"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
            className="w-full sm:w-auto"
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || dates.slice(0, installmentCount).some(d => !d)}
            className="w-full sm:w-auto"
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Procesando...
              </>
            ) : (
              `Dividir en ${installmentCount} pagos`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}