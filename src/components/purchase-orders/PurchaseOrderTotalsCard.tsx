import React from "react";

interface PurchaseOrderTotalsCardProps {
  subtotal: number;
  totalIva: number;
  total: number;
}

export const PurchaseOrderTotalsCard = React.memo(
  ({ subtotal, totalIva, total }: PurchaseOrderTotalsCardProps) => {
    return (
      <div className="flex justify-end">
        <div className="w-72 bg-muted/50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Subtotal:</span>
            <span>${subtotal.toFixed(2)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>IVA (16%):</span>
            <span>${totalIva.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-bold text-lg pt-2 border-t">
            <span>Total:</span>
            <span className="text-primary">${total.toFixed(2)} MXN</span>
          </div>
        </div>
      </div>
    );
  },
);

PurchaseOrderTotalsCard.displayName = "PurchaseOrderTotalsCard";
