import { useState } from "react";
import { format, parse, isValid } from "date-fns";
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
  const [dateInputValue, setDateInputValue] = useState("");
  const [calendarOpen, setCalendarOpen] = useState(false);

  const handleConfirm = () => {
    if (!batchNumber.trim() || !expirationDate) return;
    
    const formattedDate = format(expirationDate, "yyyy-MM-dd");
    onConfirm(batchNumber.toUpperCase().trim(), formattedDate);
    
    // Reset form
    setBatchNumber("");
    setExpirationDate(undefined);
    setDateInputValue("");
    onOpenChange(false);
  };

  const handleCancel = () => {
    setBatchNumber("");
    setExpirationDate(undefined);
    setDateInputValue("");
    onOpenChange(false);
  };

  const handleDateInputChange = (value: string) => {
    setDateInputValue(value);
    
    // Try to parse the date in dd/MM/yyyy format
    if (value.length === 10) {
      const parsedDate = parse(value, "dd/MM/yyyy", new Date());
      if (isValid(parsedDate) && parsedDate >= new Date(new Date().setHours(0, 0, 0, 0))) {
        setExpirationDate(parsedDate);
      }
    }
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    setExpirationDate(date);
    if (date) {
      setDateInputValue(format(date, "dd/MM/yyyy"));
    }
    setCalendarOpen(false);
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
            <div className="flex gap-2">
              <Input
                value={dateInputValue}
                onChange={(e) => handleDateInputChange(e.target.value)}
                placeholder="dd/mm/aaaa"
                className="flex-1"
                maxLength={10}
              />
              <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="icon"
                    className="shrink-0"
                  >
                    <CalendarIcon className="h-4 w-4" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end">
                  <Calendar
                    mode="single"
                    selected={expirationDate}
                    onSelect={handleCalendarSelect}
                    disabled={(date) => date < new Date(new Date().setHours(0, 0, 0, 0))}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <p className="text-xs text-muted-foreground">
              Formato: dd/mm/aaaa (ej: 15/12/2025)
            </p>
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
