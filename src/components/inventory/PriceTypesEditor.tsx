import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Calculator, RotateCcw } from "lucide-react";
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
  key:
    | "price_type_1"
    | "price_type_2"
    | "price_type_3"
    | "price_type_4"
    | "price_type_5";
  label: string;
  shortLabel: string;
  isBase?: boolean;
}

const PRICE_TYPES: PriceTypeConfig[] = [
  { key: "price_type_1", label: "T1 - Público", shortLabel: "Público", isBase: true },
  { key: "price_type_2", label: "T2 - Mayoreo", shortLabel: "Mayoreo" },
  { key: "price_type_3", label: "T3 - Distribuidor", shortLabel: "Distribuidor" },
  { key: "price_type_4", label: "T4 - Especial", shortLabel: "Especial" },
  { key: "price_type_5", label: "T5 - VIP", shortLabel: "VIP" },
];

type PricesState = {
  price_type_1: number;
  price_type_2: number;
  price_type_3: number;
  price_type_4: number;
  price_type_5: number;
};

type PercentagesState = {
  price_type_2: number;
  price_type_3: number;
  price_type_4: number;
  price_type_5: number;
};

const calculatePercentage = (basePrice: number, currentPrice: number): number => {
  if (basePrice <= 0 || currentPrice <= 0) return 0;
  return Math.round(((basePrice - currentPrice) / basePrice) * 100);
};

const calculatePriceFromPercentage = (
  basePrice: number,
  discountPercent: number
): number => {
  return Math.round(basePrice * (1 - discountPercent / 100) * 100) / 100;
};

export function PriceTypesEditor({
  priceType1,
  priceType2,
  priceType3,
  priceType4,
  priceType5,
  onChange,
}: PriceTypesEditorProps) {
  const [prices, setPrices] = useState<PricesState>({
    price_type_1: priceType1,
    price_type_2: priceType2,
    price_type_3: priceType3,
    price_type_4: priceType4,
    price_type_5: priceType5,
  });

  const [percentages, setPercentages] = useState<PercentagesState>({
    price_type_2: 0,
    price_type_3: 0,
    price_type_4: 0,
    price_type_5: 0,
  });

  // Sincronizar con props cuando cambian (al abrir edición)
  useEffect(() => {
    setPrices({
      price_type_1: priceType1,
      price_type_2: priceType2,
      price_type_3: priceType3,
      price_type_4: priceType4,
      price_type_5: priceType5,
    });
  }, [priceType1, priceType2, priceType3, priceType4, priceType5]);

  // Mantener % visibles siempre, calculados vs T1
  useEffect(() => {
    if (prices.price_type_1 <= 0) {
      setPercentages({
        price_type_2: 0,
        price_type_3: 0,
        price_type_4: 0,
        price_type_5: 0,
      });
      return;
    }

    setPercentages({
      price_type_2: calculatePercentage(prices.price_type_1, prices.price_type_2),
      price_type_3: calculatePercentage(prices.price_type_1, prices.price_type_3),
      price_type_4: calculatePercentage(prices.price_type_1, prices.price_type_4),
      price_type_5: calculatePercentage(prices.price_type_1, prices.price_type_5),
    });
  }, [
    prices.price_type_1,
    prices.price_type_2,
    prices.price_type_3,
    prices.price_type_4,
    prices.price_type_5,
  ]);

  const handlePriceChange = (key: keyof PricesState, value: number) => {
    const newPrices = { ...prices, [key]: value } as PricesState;
    setPrices(newPrices);
    onChange(newPrices);
  };

  const handlePercentageChange = (
    key: keyof PercentagesState,
    percent: number
  ) => {
    const safePercent = Math.max(0, Math.min(100, Number.isFinite(percent) ? percent : 0));
    setPercentages((prev) => ({ ...prev, [key]: safePercent }));

    if (prices.price_type_1 > 0) {
      const newPrice = calculatePriceFromPercentage(prices.price_type_1, safePercent);
      const newPrices = { ...prices, [key]: newPrice } as PricesState;
      setPrices(newPrices);
      onChange(newPrices);
    }
  };

  const applyAllPercentages = () => {
    if (prices.price_type_1 <= 0) return;

    const newPrices: PricesState = {
      ...prices,
      price_type_2: calculatePriceFromPercentage(prices.price_type_1, percentages.price_type_2),
      price_type_3: calculatePriceFromPercentage(prices.price_type_1, percentages.price_type_3),
      price_type_4: calculatePriceFromPercentage(prices.price_type_1, percentages.price_type_4),
      price_type_5: calculatePriceFromPercentage(prices.price_type_1, percentages.price_type_5),
    };

    setPrices(newPrices);
    onChange(newPrices);
  };

  const resetPercentages = () => {
    setPercentages({
      price_type_2: 0,
      price_type_3: 0,
      price_type_4: 0,
      price_type_5: 0,
    });
  };

  return (
    <div className="border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <div>
          <Label className="text-sm font-medium">Tipos de Precio</Label>
          <p className="text-xs text-muted-foreground">
            Ajusta T2T5 por % de descuento vs T1.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={applyAllPercentages}
            disabled={prices.price_type_1 <= 0}
            className="h-8 text-xs gap-1"
          >
            <Calculator className="h-3 w-3" />
            Aplicar %
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={resetPercentages}
            className="h-8 text-xs gap-1"
          >
            <RotateCcw className="h-3 w-3" />
            Reset
          </Button>
        </div>
      </div>

      <div className="grid gap-2">
        {PRICE_TYPES.map((priceType) => {
          const priceKey = priceType.key;
          const currentPrice = prices[priceKey];
          const isBase = !!priceType.isBase;

          return (
            <div
              key={priceKey}
              className={cn(
                "grid items-center gap-2",
                "grid-cols-[120px,1fr,84px]"
              )}
            >
              <Label
                htmlFor={priceKey}
                className={cn(
                  "text-xs",
                  isBase ? "text-primary font-medium" : "text-muted-foreground"
                )}
              >
                {priceType.label}
                {isBase && " (Base)"}
              </Label>

              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                  $
                </span>
                <Input
                  id={priceKey}
                  type="number"
                  step="0.01"
                  min="0"
                  value={currentPrice || ""}
                  onChange={(e) =>
                    handlePriceChange(priceKey, parseFloat(e.target.value) || 0)
                  }
                  className={cn(
                    "h-8 pl-6",
                    isBase && "border-primary/50 bg-primary/5"
                  )}
                  placeholder="0.00"
                />
              </div>

              {isBase ? (
                <div />
              ) : (
                <div className="flex items-center justify-end gap-1">
                  <Input
                    type="number"
                    step="1"
                    min="0"
                    max="100"
                    value={percentages[priceKey as keyof PercentagesState] || ""}
                    onChange={(e) =>
                      handlePercentageChange(
                        priceKey as keyof PercentagesState,
                        parseFloat(e.target.value) || 0
                      )
                    }
                    className="h-8 w-[64px] text-center text-xs"
                    placeholder="0"
                    aria-label={`% descuento ${priceType.shortLabel}`}
                  />
                  <span className="text-xs text-muted-foreground">%</span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
