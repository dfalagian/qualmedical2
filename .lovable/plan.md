
# Plan: Corrección del Bug de Desaparición de Productos en la Grilla

## Resumen del Problema

Cuando agregas un producto a la orden de compra y luego seleccionas un segundo producto del Combobox, el primer producto desaparece visualmente de la grilla, aunque el estado interno se mantiene correctamente (los totales siguen sumando).

## Diagnóstico

Después de analizar el código, identifiqué las siguientes causas:

1. **ScrollArea con altura dinámica conflictiva**: El componente `ScrollArea` de Radix UI tiene un viewport interno con `h-full w-full` que depende del contenedor padre. Cuando el Popover del buscador se abre/cierra, el layout recalcula las dimensiones y el viewport puede colapsar momentáneamente.

2. **Estructura de flex conflictiva**: El contenedor usa `flex-1` con `overflow-hidden` que puede interferir con el cálculo de altura del ScrollArea cuando hay cambios en otros elementos del flex.

3. **Errores HMR residuales**: Los logs muestran intentos de cargar archivos inexistentes (`SelectedProductsTable.tsx`, `PurchaseOrderTotalsCard.tsx`), lo que indica caché corrupta del Hot Module Replacement.

## Solución Propuesta

### Archivo a modificar: `CreateSupplierOrderDialog.tsx`

Reestructurar el contenedor de la tabla de productos para usar una altura fija estable que no dependa de flexbox:

1. **Eliminar la dependencia de flex-1**: Cambiar el contenedor de la tabla para usar altura fija en lugar de `flex-1`
2. **Usar un contenedor wrapper estable**: Envolver la tabla en un div con `overflow-auto` en lugar de depender solo de ScrollArea
3. **Agregar una key al contenedor de la tabla**: Forzar que React mantenga la identidad del componente

### Cambios específicos:

```tsx
// ANTES (líneas 337-412):
<div className="flex-1 border rounded-lg overflow-hidden bg-background min-h-0">
  <ScrollArea className="h-[280px]">
    {selectedProducts.length > 0 ? (
      <Table>...</Table>
    ) : (
      <div>...</div>
    )}
  </ScrollArea>
</div>

// DESPUÉS:
<div className="border rounded-lg bg-background">
  <div className="h-[280px] overflow-auto">
    {selectedProducts.length > 0 ? (
      <Table>...</Table>
    ) : (
      <div>...</div>
    )}
  </div>
</div>
```

## Beneficios

- **Altura estable**: El contenedor tendrá siempre 280px independientemente del estado del Popover
- **Sin dependencia de ScrollArea**: Usar `overflow-auto` nativo es más predecible
- **Compatibilidad con Popover**: El portal del Popover no afectará el layout de la tabla

## Pasos de Implementación

1. Modificar el contenedor de la tabla en `CreateSupplierOrderDialog.tsx`
2. Reemplazar `ScrollArea` por un div con `overflow-auto`
3. Ajustar las clases CSS para mantener el mismo aspecto visual
4. Probar agregando múltiples productos para verificar que ya no desaparecen

---

**Sección Técnica**

El problema ocurre porque Radix UI ScrollArea crea un viewport interno (`ScrollAreaPrimitive.Viewport`) que usa `h-full w-full`. Cuando el Popover del Combobox se abre, React puede disparar un re-render del árbol y el viewport recalcula sus dimensiones basándose en el contenedor flex, que momentáneamente puede tener altura 0 durante la transición.

La solución elimina esta dependencia usando un contenedor con altura fija (`h-[280px]`) y scroll nativo del navegador (`overflow-auto`), que es más robusto ante cambios de layout.
