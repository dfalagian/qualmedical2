import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const TAX_RATES = [
  { value: 0, label: "0%" },
  { value: 8, label: "8%" },
  { value: 16, label: "16%" },
];

interface PriceTypesEditorProps {
  priceType1: number;
  priceType2: number;
  priceType3: number;
  priceType4: number;
  priceType5: number;
  costPrice?: number;   // unit_price del producto (precio costo base)
  taxRate?: number;     // IVA persistido en DB
  precioPmp?: number;   // Precio medio ponderado persistido en DB
  resetKey?: string;    // Cambia cuando se abre un producto diferente; dispara la sincronización de precios
  onChange: (prices: {
    price_type_1: number;
    price_type_2: number;
    price_type_3: number;
    price_type_4: number;
    price_type_5: number;
    tax_rate: number;
    precio_pmp: number;
  }) => void;
}

type PriceKey = "price_type_1" | "price_type_2" | "price_type_3" | "price_type_4" | "price_type_5";

const PRICE_LABELS: Record<PriceKey, string> = {
  price_type_1: "Tipo 1",
  price_type_2: "Tipo 2",
  price_type_3: "Tipo 3",
  price_type_4: "Tipo 4",
  price_type_5: "Tipo 5",
};

const PRICE_KEYS: PriceKey[] = [
  "price_type_1",
  "price_type_2",
  "price_type_3",
  "price_type_4",
  "price_type_5",
];

// Precio con IVA almacenado → precio sin IVA
const removeTax = (priceWithTax: number, rate: number): number => {
  if (rate === 0 || priceWithTax <= 0) return priceWithTax;
  return priceWithTax / (1 + rate / 100);
};

// Precio sin IVA → precio con IVA
const addTax = (priceWithoutTax: number, rate: number): number => {
  return Math.round(priceWithoutTax * (1 + rate / 100) * 100) / 100;
};

// % de markup sobre el costo base
const toPercent = (costBase: number, priceWithoutTax: number): string => {
  if (costBase <= 0 || priceWithoutTax <= 0) return "0";
  return (((priceWithoutTax - costBase) / costBase) * 100).toFixed(2);
};

// Precio sin IVA desde costo base + %
const fromPercent = (costBase: number, percent: number): string => {
  return (Math.round(costBase * (1 + percent / 100) * 100) / 100).toFixed(2);
};

export function PriceTypesEditor({
  priceType1,
  priceType2,
  priceType3,
  priceType4,
  priceType5,
  costPrice = 0,
  taxRate: taxRateProp = 16,
  precioPmp: precioPmpProp = 0,
  resetKey,
  onChange,
}: PriceTypesEditorProps) {
  const [taxRate, setTaxRate] = useState(taxRateProp);
  const [precioPmpStr, setPrecioPmpStr] = useState(precioPmpProp > 0 ? precioPmpProp.toFixed(2) : "");

  // Precios sin IVA editables (el valor almacenado en DB es CON IVA)
  const [manuals, setManuals] = useState<Record<PriceKey, string>>({
    price_type_1: "",
    price_type_2: "",
    price_type_3: "",
    price_type_4: "",
    price_type_5: "",
  });

  // Porcentajes de markup sobre el costo
  const [percentages, setPercentages] = useState<Record<PriceKey, string>>({
    price_type_1: "0",
    price_type_2: "0",
    price_type_3: "0",
    price_type_4: "0",
    price_type_5: "0",
  });

  // Sincronizar cuando se abre un producto diferente (resetKey cambia).
  // NO debe depender de priceType1..5 directamente porque onChange los actualiza
  // en cada teclazo, creando un loop que reinicia los campos mientras el usuario escribe.
  useEffect(() => {
    const rate = taxRateProp;
    const storedPrices: Record<PriceKey, number> = {
      price_type_1: priceType1,
      price_type_2: priceType2,
      price_type_3: priceType3,
      price_type_4: priceType4,
      price_type_5: priceType5,
    };

    const newManuals: Record<PriceKey, string> = {} as Record<PriceKey, string>;
    const newPercentages: Record<PriceKey, string> = {} as Record<PriceKey, string>;

    for (const key of PRICE_KEYS) {
      const stored = storedPrices[key];
      const withoutTax = stored > 0 ? removeTax(stored, rate) : 0;
      newManuals[key] = withoutTax > 0 ? withoutTax.toFixed(2) : "";
      newPercentages[key] = toPercent(costPrice, withoutTax);
    }

    setTaxRate(rate);
    setPrecioPmpStr(precioPmpProp > 0 ? precioPmpProp.toFixed(2) : "");
    setManuals(newManuals);
    setPercentages(newPercentages);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Recalcular porcentajes cuando cambia el costo base
  useEffect(() => {
    setPercentages((prev) => {
      const updated = { ...prev };
      for (const key of PRICE_KEYS) {
        const manual = parseFloat(manuals[key]) || 0;
        updated[key] = toPercent(costPrice, manual);
      }
      return updated;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [costPrice]);

  const buildPrices = (m: Record<PriceKey, string>, rate: number) => ({
    price_type_1: addTax(parseFloat(m.price_type_1) || 0, rate),
    price_type_2: addTax(parseFloat(m.price_type_2) || 0, rate),
    price_type_3: addTax(parseFloat(m.price_type_3) || 0, rate),
    price_type_4: addTax(parseFloat(m.price_type_4) || 0, rate),
    price_type_5: addTax(parseFloat(m.price_type_5) || 0, rate),
    tax_rate: rate,
    precio_pmp: parseFloat(precioPmpStr) || 0,
  });

  const handleManualChange = (key: PriceKey, value: string) => {
    const manual = parseFloat(value) || 0;
    const newManuals = { ...manuals, [key]: value };
    const newPercentages = { ...percentages, [key]: toPercent(costPrice, manual) };
    setManuals(newManuals);
    setPercentages(newPercentages);
    onChange(buildPrices(newManuals, taxRate));
  };

  const handlePercentageChange = (key: PriceKey, value: string) => {
    const percent = parseFloat(value) || 0;
    const newManual = costPrice > 0 ? fromPercent(costPrice, percent) : manuals[key];
    const newManuals = { ...manuals, [key]: newManual };
    const newPercentages = { ...percentages, [key]: value };
    setManuals(newManuals);
    setPercentages(newPercentages);
    onChange(buildPrices(newManuals, taxRate));
  };

  const handleTaxRateChange = (value: string) => {
    const newRate = parseInt(value);
    setTaxRate(newRate);
    onChange(buildPrices(manuals, newRate));
  };

  const handlePmpChange = (value: string) => {
    setPrecioPmpStr(value);
    onChange({
      ...buildPrices(manuals, taxRate),
      precio_pmp: parseFloat(value) || 0,
    });
  };

  return (
    <div className="border rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <Label className="text-sm font-medium">Tipos de Precio</Label>
          <p className="text-xs text-muted-foreground">
            Precio manual sin IVA + % de markup sobre el costo.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">IVA</Label>
          <Select value={taxRate.toString()} onValueChange={handleTaxRateChange}>
            <SelectTrigger className="h-8 w-20 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TAX_RATES.map((r) => (
                <SelectItem key={r.value} value={r.value.toString()}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Precio PMP */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">
            Precio Costo (referencia)
          </Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <Input
              type="number"
              step="0.01"
              value={costPrice > 0 ? costPrice.toFixed(2) : ""}
              readOnly
              className="h-8 pl-6 text-xs bg-muted/50 cursor-not-allowed"
              placeholder="0.00"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Precio PMP</Label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
            <Input
              type="text"
              inputMode="decimal"
              value={precioPmpStr}
              onChange={(e) => handlePmpChange(e.target.value)}
              className="h-8 pl-6 text-xs"
              placeholder="0.00"
            />
          </div>
        </div>
      </div>

      {/* Columnas header */}
      <div className="grid grid-cols-[80px,1fr,100px,90px] gap-2 items-center text-xs text-muted-foreground px-1">
        <span>Tipo</span>
        <span>Precio sin IVA</span>
        <span className="text-center">% Markup</span>
        <span className="text-right">Con IVA</span>
      </div>

      {/* 5 tipos de precio */}
      <div className="grid gap-2">
        {PRICE_KEYS.map((key) => {
          const manual = parseFloat(manuals[key]) || 0;
          const withTax = addTax(manual, taxRate);

          return (
            <div
              key={key}
              className="grid grid-cols-[80px,1fr,100px,90px] items-center gap-2"
            >
              <Label className="text-xs font-medium">{PRICE_LABELS[key]}</Label>

              <div className="relative">
                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                <Input
                  type="text"
                  inputMode="decimal"
                  value={manuals[key]}
                  onChange={(e) => handleManualChange(key, e.target.value)}
                  className="h-8 pl-6 text-xs"
                  placeholder="0.00"
                />
              </div>

              <div className="flex items-center gap-1">
                <Input
                  type="text"
                  inputMode="decimal"
                  value={percentages[key]}
                  onChange={(e) => handlePercentageChange(key, e.target.value)}
                  className="h-8 text-center text-xs"
                  placeholder="0"
                  disabled={costPrice <= 0}
                  title={costPrice <= 0 ? "Ingresa el Precio Costo para usar porcentajes" : undefined}
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>

              <div className="text-right">
                {manual > 0 ? (
                  <span className="text-xs font-semibold text-primary">
                    ${withTax.toFixed(2)}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">—</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {costPrice <= 0 && (
        <p className="text-xs text-amber-600">
          Ingresa el Precio Costo para calcular porcentajes de markup automáticamente.
        </p>
      )}
    </div>
  );
}
