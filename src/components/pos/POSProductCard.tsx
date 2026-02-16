import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Package, AlertTriangle } from "lucide-react";

interface POSProductCardProps {
  product: {
    id: string;
    name: string;
    sku: string;
    brand: string | null;
    category: string | null;
    current_stock: number | null;
  };
  price: number;
  cartQuantity: number;
  onAdd: () => void;
}

export const POSProductCard = ({ product, price, cartQuantity, onAdd }: POSProductCardProps) => {
  const stock = product.current_stock || 0;
  const isOutOfStock = stock <= 0;
  const isLowStock = stock > 0 && stock <= 5;
  const remaining = stock - cartQuantity;

  return (
    <div
      className={`rounded-xl border-2 p-4 transition-all duration-200 ${
        isOutOfStock
          ? "border-destructive/30 bg-destructive/5 opacity-60"
          : cartQuantity > 0
          ? "border-primary bg-primary/5 shadow-md"
          : "border-border hover:border-primary/50 hover:shadow-md"
      }`}
    >
      <div className="flex flex-col h-full gap-3">
        {/* Top: Category + Stock */}
        <div className="flex items-start justify-between">
          <Badge variant="outline" className="text-xs font-normal">
            {product.category || "Sin categoría"}
          </Badge>
          <div className="flex items-center gap-1 text-xs">
            {isOutOfStock ? (
              <span className="text-destructive font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> Agotado
              </span>
            ) : isLowStock ? (
              <span className="text-warning font-medium flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" /> {stock} uds
              </span>
            ) : (
              <span className="text-muted-foreground flex items-center gap-1">
                <Package className="h-3 w-3" /> {stock} uds
              </span>
            )}
          </div>
        </div>

        {/* Name + Brand */}
        <div className="flex-1 min-h-0">
          <h4 className="font-semibold text-sm leading-tight line-clamp-2">{product.name}</h4>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xs text-muted-foreground">{product.sku}</span>
            {product.brand && (
              <span className="text-xs text-muted-foreground">• {product.brand}</span>
            )}
          </div>
        </div>

        {/* Price + Action */}
        <div className="flex items-center justify-between pt-1 border-t">
          <span className="text-lg font-bold text-primary">
            ${price.toLocaleString("es-MX", { minimumFractionDigits: 2 })}
          </span>
          <div className="flex items-center gap-2">
            {cartQuantity > 0 && (
              <Badge className="h-7 min-w-7 rounded-full flex items-center justify-center text-sm font-bold">
                {cartQuantity}
              </Badge>
            )}
            <Button
              size="lg"
              className="h-12 w-12 rounded-xl p-0"
              onClick={onAdd}
              disabled={isOutOfStock || remaining <= 0}
            >
              <Plus className="h-6 w-6" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
