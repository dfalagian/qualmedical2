import { useState } from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CalendarIcon } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

interface NewBatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productName: string;
  onConfirm: (batchNumber: string, expirationDate: string) => void;
}

export function NewBatchModal({ open, onOpenChange, productName, onConfirm }: NewBatchModalProps) {
  const [batchNumber, setBatchNumber] = useState("");
  const [expirationDate, setExpirationDate] = useState<Date | undefined>(undefined);
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleConfirm = () => {
    if (!batchNumber.trim() || !expirationDate) return;
    
    const formattedDate = format(expirationDate, "yyyy-MM-dd");
    onConfirm(batchNumber.toUpperCase().trim(), formattedDate);
    
    // Reset form
    setBatchNumber("");
    setExpirationDate(undefined);
    onOpenChange(false);
  };

  const handleCancel = () => {
    setBatchNumber("");
    setExpirationDate(undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Crear Nuevo Lote</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label className="text-sm text-muted-foreground">Producto</Label>
            <p className="font-medium">{productName}</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="batchNumber">Número de Lote</Label>
            <Input
              id="batchNumber"
              value={batchNumber}
              onChange={(e) => setBatchNumber(e.target.value.toUpperCase())}
              placeholder="Ej: LOT-2024-001"
              autoFocus
            />
          </div>

          <div className="space-y-2">
            <Label>Fecha de Caducidad</Label>
            <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    "w-full justify-start text-left font-normal",
                    !expirationDate && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {expirationDate 
                    ? format(expirationDate, "dd 'de' MMMM, yyyy", { locale: es }) 
                    : "Seleccionar fecha"
                  }
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  mode="single"
                  selected={expirationDate}
                  onSelect={(date) => {
                    setExpirationDate(date);
                    setCalendarOpen(false);
                  }}
                  disabled={(date) => date < new Date()}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={handleCancel}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!batchNumber.trim() || !expirationDate}
          >
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
