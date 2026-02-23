
# Corrección Crítica: Eliminar Descuento Doble de Stock

## Problema Confirmado

El trigger de base de datos `update_product_stock` se ejecuta automáticamente al insertar en `inventory_movements` y actualiza `products.current_stock`. Pero el código en `useQuoteActions.tsx` TAMBIEN actualiza manualmente ese mismo campo justo antes de insertar el movimiento. Resultado: cada venta descuenta el doble, cada cancelación devuelve el doble.

## Alcance de Cambios

**Un solo archivo**: `src/hooks/useQuoteActions.tsx`

Los demás archivos ya funcionan correctamente:
- `ProductEntryDialog.tsx`: solo actualiza manualmente como fallback si el movimiento falla (correcto)
- `WarehouseTransferDialog.tsx`: solo toca `warehouse_stock`, no `products.current_stock` (correcto)
- `QuickStockButtons.tsx`: solo inserta movimiento y lee resultado del trigger (correcto)

## Cambios Específicos

### 1. En la aprobación de venta (approveQuoteMutation, líneas 254-268)

**ELIMINAR** el bloque que obtiene stock del producto y lo actualiza manualmente:
```
// ELIMINAR ESTO (líneas 254-268):
const { data: product } = await supabase
  .from("products")
  .select("current_stock")
  .eq("id", item.product_id)
  .single();

if (product) {
  const newProductStock = (product.current_stock || 0) - item.cantidad;
  await supabase
    .from("products")
    .update({ current_stock: newProductStock })
    .eq("id", item.product_id);
}
```

El trigger `update_product_stock` ya hace esto al insertar el `inventory_movements` de tipo "salida" (líneas 287-300).

### 2. En la aprobación - validación estricta de almacén (línea 279)

**CAMBIAR** `Math.max(0, ...)` por validación real:
```
// ANTES (oculta faltantes):
const newWhStock = Math.max(0, (warehouseStockRow.current_stock || 0) - item.cantidad);

// DESPUÉS (bloquea si no hay stock):
const availableWhStock = warehouseStockRow.current_stock || 0;
if (availableWhStock < item.cantidad) {
  throw new Error(
    `Stock insuficiente en almacén para ${item.nombre_producto}: disponible ${availableWhStock}, solicitado ${item.cantidad}`
  );
}
const newWhStock = availableWhStock - item.cantidad;
```

### 3. En la cancelación de venta (cancelQuoteMutation, líneas 393-406)

**ELIMINAR** el bloque que obtiene stock del producto y lo actualiza manualmente:
```
// ELIMINAR ESTO (líneas 393-406):
const { data: product } = await supabase
  .from("products")
  .select("current_stock")
  .eq("id", item.product_id)
  .single();

if (product) {
  const newProductStock = (product.current_stock || 0) + item.cantidad;
  await supabase
    .from("products")
    .update({ current_stock: newProductStock })
    .eq("id", item.product_id);
}
```

El trigger ya hace esto al insertar el `inventory_movements` de tipo "entrada" (líneas 427-440).

## Lo que NO se toca (preservar registro actual)

- **No se modifican datos existentes** en la base de datos. Los valores actuales incorrectos de `products.current_stock` quedan intactos como evidencia para la reconciliación posterior.
- **No se eliminan movimientos históricos** en `inventory_movements`. Todo el historial de movimientos queda disponible para calcular exactamente cuánto se desvió cada producto.
- **No se altera el trigger** `update_product_stock`. Es la fuente única de verdad y funciona correctamente.

## Resultado esperado

A partir de esta corrección:
- Cada venta nueva descuenta exactamente 1 vez (no 2)
- Cada cancelación devuelve exactamente 1 vez (no 2)
- Los datos históricos incorrectos quedan preservados para reconciliación controlada posterior

## Sección Técnica

Archivos modificados: 1 (`src/hooks/useQuoteActions.tsx`)
- Líneas 254-268: eliminar update manual de `products.current_stock` en aprobación
- Línea 279: reemplazar `Math.max(0, ...)` por validación con error
- Líneas 393-406: eliminar update manual de `products.current_stock` en cancelación
