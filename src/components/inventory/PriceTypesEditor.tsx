import { useState, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Percent, Calculator, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface PriceTypesEditorProps {
  priceType1: number;
  priceType2: number;
  priceType3: number;
  priceType4: number;
  priceType5: number;
  onChange: (prices: {
    price_type_1: number;
    price_type_2: number;
    price_type_3: number;
    price_type_4: number;
    price_type_5: number;
  }) => void;
}

interface PriceTypeConfig {
  key: 'price_type_1' | 'price_type_2' | 'price_type_3' | 'price_type_4' | 'price_type_5';
  label: string;
  shortLabel: string;
}

const PRICE_TYPES: PriceTypeConfig[] = [
  { key: 'price_type_1', label: 'T1 - Público', shortLabel: 'Público' },
  { key: 'price_type_2', label: 'T2 - Mayoreo', shortLabel: 'Mayoreo' },
  { key: 'price_type_3', label: 'T3 - Distribuidor', shortLabel: 'Distribuidor' },
  { key: 'price_type_4', label: 'T4 - Especial', shortLabel: 'Especial' },
  { key: 'price_type_5', label: 'T5 - VIP', shortLabel: 'VIP' },
];

export function PriceTypesEditor({
  priceType1,
  priceType2,
  priceType3,
  priceType4,
  priceType5,
  onChange,
}: PriceTypesEditorProps) {
  // Estado local para los precios
  const [prices, setPrices] = useState({
    price_type_1: priceType1,
    price_type_2: priceType2,
    price_type_3: priceType3,
    price_type_4: priceType4,
    price_type_5: priceType5,
  });

  // Estado para los porcentajes (descuento sobre T1)
  const [percentages, setPercentages] = useState({
    price_type_2: 0,
    price_type_3: 0,
    price_type_4: 0,
    price_type_5: 0,
  });

  // Mostrar/ocultar campos de porcentaje
  const [showPercentages, setShowPercentages] = useState(false);

  // Sincronizar con props cuando cambian
  useEffect(() => {
    setPrices({
      price_type_1: priceType1,
      price_type_2: priceType2,
      price_type_3: priceType3,
      price_type_4: priceType4,
      price_type_5: priceType5,
    });
  }, [priceType1, priceType2, priceType3, priceType4, priceType5]);

  // Calcular porcentaje basado en precio base
  const calculatePercentage = (basePrice: number, currentPrice: number): number => {
    if (basePrice === 0 || currentPrice === 0) return 0;
    return Math.round(((basePrice - currentPrice) / basePrice) * 100);
  };

  // Calcular precio basado en porcentaje de descuento
  const calculatePriceFromPercentage = (basePrice: number, discountPercent: number): number => {
    return Math.round((basePrice * (1 - discountPercent / 100)) * 100) / 100;
  };

  // Manejar cambio de precio directo
  const handlePriceChange = (key: keyof typeof prices, value: number) => {
    const newPrices = { ...prices, [key]: value };
    setPrices(newPrices);
    onChange(newPrices);

    // Actualizar porcentaje calculado si es T2-T5
    if (key !== 'price_type_1' && prices.price_type_1 > 0) {
      const newPercent = calculatePercentage(prices.price_type_1, value);
      setPercentages(prev => ({
        ...prev,
        [key]: newPercent,
      }));
    }
  };

  // Manejar cambio de porcentaje
  const handlePercentageChange = (key: 'price_type_2' | 'price_type_3' | 'price_type_4' | 'price_type_5', percent: number) => {
    setPercentages(prev => ({ ...prev, [key]: percent }));
    
    if (prices.price_type_1 > 0) {
      const newPrice = calculatePriceFromPercentage(prices.price_type_1, percent);
      const newPrices = { ...prices, [key]: newPrice };
      setPrices(newPrices);
      onChange(newPrices);
    }
  };

  // Aplicar porcentajes a todos desde T1
  const applyAllPercentages = () => {
    if (prices.price_type_1 <= 0) return;
    
    const newPrices = {
      ...prices,
      price_type_2: calculatePriceFromPercentage(prices.price_type_1, percentages.price_type_2),
      price_type_3: calculatePriceFromPercentage(prices.price_type_1, percentages.price_type_3),
      price_type_4: calculatePriceFromPercentage(prices.price_type_1, percentages.price_type_4),
      price_type_5: calculatePriceFromPercentage(prices.price_type_1, percentages.price_type_5),
    };
    setPrices(newPrices);
    onChange(newPrices);
  };

  // Resetear porcentajes
  const resetPercentages = () => {
    setPercentages({
      price_type_2: 0,
      price_type_3: 0,
      price_type_4: 0,
      price_type_5: 0,
    });
  };

  return (
    <div className="border rounded-lg p-4 space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-sm font-medium">Tipos de Precio</Label>
        <Button
          type="button"
          variant={showPercentages ? "secondary" : "outline"}
          size="sm"
          onClick={() => setShowPercentages(!showPercentages)}
          className="h-7 text-xs gap-1"
        >
          <Percent className="h-3 w-3" />
          {showPercentages ? "Ocultar %" : "Ajustar por %"}
        </Button>
      </div>

      {showPercentages && (
        <div className="bg-muted/50 rounded-md p-3 space-y-2">
          <p className="text-xs text-muted-foreground">
            Define el % de descuento sobre el Precio Público (T1) para calcular automáticamente los demás precios.
          </p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={applyAllPercentages}
              disabled={prices.price_type_1 <= 0}
              className="h-7 text-xs gap-1"
            >
              <Calculator className="h-3 w-3" />
              Aplicar %
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={resetPercentages}
              className="h-7 text-xs gap-1"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {PRICE_TYPES.map((priceType, index) => {
          const isBase = index === 0;
          const priceKey = priceType.key;
          const currentPrice = prices[priceKey];
          
          return (
            <div 
              key={priceKey}
              className={cn(
                "grid gap-2",
                showPercentages && !isBase ? "grid-cols-[1fr,80px]" : "grid-cols-1"
              )}
            >
              <div className="flex items-center gap-2">
                <Label 
                  htmlFor={priceKey} 
                  className={cn(
                    "text-xs w-24 shrink-0",
                    isBase ? "text-primary font-medium" : "text-muted-foreground"
                  )}
                >
                  {priceType.label}
                  {isBase && " (Base)"}
                </Label>
                <div className="relative flex-1">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    id={priceKey}
                    type="number"
                    step="0.01"
                    min="0"
                    value={currentPrice || ""}
                    onChange={(e) => handlePriceChange(priceKey, parseFloat(e.target.value) || 0)}
                    className={cn(
                      "h-8 pl-6",
                      isBase && "border-primary/50 bg-primary/5"
                    )}
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Campo de porcentaje para T2-T5 */}
              {showPercentages && !isBase && (
                <div className="flex items-center gap-1">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={percentages[priceKey as keyof typeof percentages] || ""}
                    onChange={(e) => handlePercentageChange(
                      priceKey as 'price_type_2' | 'price_type_3' | 'price_type_4' | 'price_type_5',
                      parseFloat(e.target.value) || 0
                    )}
                    className="h-8 w-16 text-center text-xs"
                    placeholder="0"
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Indicador de descuentos calculados */}
      {prices.price_type_1 > 0 && (
        <div className="pt-2 border-t">
          <p className="text-xs text-muted-foreground mb-1">Descuentos vs T1:</p>
          <div className="flex flex-wrap gap-2">
            {PRICE_TYPES.slice(1).map((pt) => {
              const price = prices[pt.key];
              const discount = calculatePercentage(prices.price_type_1, price);
              return (
                <span 
                  key={pt.key}
                  className={cn(
                    "text-xs px-2 py-0.5 rounded-full",
                    discount > 0 
                      ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                      : "bg-muted text-muted-foreground"
                  )}
                >
                  {pt.shortLabel}: {discount > 0 ? `-${discount}%` : "0%"}
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
