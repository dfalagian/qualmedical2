import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Search, ShoppingCart, X, Store } from "lucide-react";
import { POSProductCard } from "./POSProductCard";
import { POSCart } from "./POSCart";
import { POSClientSelector } from "./POSClientSelector";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CartItem {
  product_id: string;
  name: string;
  sku: string;
  brand: string | null;
  category: string | null;
  cantidad: number;
  precio_unitario: number;
  importe: number;
  tipo_precio: string;
  current_stock: number;
}

export const POSInterface = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [priceType, setPriceType] = useState("1");
  const [showCart, setShowCart] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // Fetch products
  const { data: products = [] } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id, name, sku, brand, category, current_stock, price_type_1, price_type_2, price_type_3, price_type_4, price_type_5, unit_price, grupo_sat, image_url")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch warehouses for stock info
  const { data: warehouses = [] } = useQuery({
    queryKey: ["pos-warehouses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id, name")
        .eq("is_active", true)
        .order("name");
      if (error) throw error;
      return data || [];
    },
  });

  // Categories
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach((p) => {
      if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [products]);

  // Filter products
  const filteredProducts = useMemo(() => {
    let result = products;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(term) ||
          p.sku.toLowerCase().includes(term) ||
          (p.brand && p.brand.toLowerCase().includes(term))
      );
    }
    if (selectedCategory !== "all") {
      result = result.filter((p) => p.category === selectedCategory);
    }
    return result;
  }, [products, searchTerm, selectedCategory]);

  const getPrice = (product: any, type: string): number => {
    switch (type) {
      case "1": return product.price_type_1 || product.unit_price || 0;
      case "2": return product.price_type_2 || product.price_type_1 || 0;
      case "3": return product.price_type_3 || product.price_type_1 || 0;
      case "4": return product.price_type_4 || product.price_type_1 || 0;
      case "5": return product.price_type_5 || product.price_type_1 || 0;
      default: return product.price_type_1 || product.unit_price || 0;
    }
  };

  const addToCart = (product: any) => {
    const existing = cartItems.find((item) => item.product_id === product.id);
    const price = getPrice(product, priceType);

    if (existing) {
      if (existing.cantidad >= (product.current_stock || 0)) return;
      setCartItems(
        cartItems.map((item) =>
          item.product_id === product.id
            ? { ...item, cantidad: item.cantidad + 1, importe: (item.cantidad + 1) * item.precio_unitario }
            : item
        )
      );
    } else {
      setCartItems([
        ...cartItems,
        {
          product_id: product.id,
          name: product.name,
          sku: product.sku,
          brand: product.brand,
          category: product.category,
          cantidad: 1,
          precio_unitario: price,
          importe: price,
          tipo_precio: priceType,
          current_stock: product.current_stock || 0,
        },
      ]);
    }
  };

  const cartCount = cartItems.reduce((sum, item) => sum + item.cantidad, 0);

  return (
    <div className="space-y-4 pb-20 lg:pb-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Store className="h-7 w-7 text-primary" />
          <div>
            <h2 className="text-xl md:text-3xl font-bold tracking-tight">Punto de Venta</h2>
            <p className="text-sm text-muted-foreground">Crea cotizaciones de forma rápida</p>
          </div>
        </div>
        <Button
          size="lg"
          className="relative lg:hidden h-14 w-14 rounded-full"
          onClick={() => setShowCart(true)}
        >
          <ShoppingCart className="h-6 w-6" />
          {cartCount > 0 && (
            <Badge className="absolute -top-2 -right-2 h-6 w-6 rounded-full p-0 flex items-center justify-center text-xs">
              {cartCount}
            </Badge>
          )}
        </Button>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        {/* Left: Product Catalog */}
        <div className="flex-1 space-y-4">
          {/* Search + Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none" />
              <Input
                placeholder="Buscar producto, SKU o marca..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 h-12 text-base"
              />
              {searchTerm && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2"
                  onClick={() => setSearchTerm("")}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full sm:w-48 h-12">
                <SelectValue placeholder="Categoría" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas las categorías</SelectItem>
                {categories.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={priceType} onValueChange={setPriceType}>
              <SelectTrigger className="w-full sm:w-40 h-12">
                <SelectValue placeholder="Tipo precio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">T1 - Público</SelectItem>
                <SelectItem value="2">T2 - Mayoreo</SelectItem>
                <SelectItem value="3">T3 - Distribuidor</SelectItem>
                <SelectItem value="4">T4 - Especial</SelectItem>
                <SelectItem value="5">T5 - VIP</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
            {filteredProducts.map((product) => (
              <POSProductCard
                key={product.id}
                product={product}
                price={getPrice(product, priceType)}
                cartQuantity={cartItems.find((i) => i.product_id === product.id)?.cantidad || 0}
                onAdd={() => addToCart(product)}
              />
            ))}
            {filteredProducts.length === 0 && (
              <div className="col-span-full py-12 text-center text-muted-foreground">
                No se encontraron productos
              </div>
            )}
          </div>
        </div>

        {/* Right: Cart (desktop) */}
        <div className="hidden lg:block w-96 shrink-0">
          <div className="sticky top-6">
            <POSCart
              items={cartItems}
              setItems={setCartItems}
              priceType={priceType}
              selectedClientId={selectedClientId}
              setSelectedClientId={setSelectedClientId}
            />
          </div>
        </div>
      </div>

      {/* Mobile Cart Sheet */}
      {showCart && (
        <div className="fixed inset-0 z-50 bg-background lg:hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h3 className="font-semibold text-lg">Carrito ({cartCount})</h3>
            <Button variant="ghost" size="icon" onClick={() => setShowCart(false)}>
              <X className="h-5 w-5" />
            </Button>
          </div>
          <div className="p-4 overflow-y-auto" style={{ height: "calc(100vh - 65px)" }}>
            <POSCart
              items={cartItems}
              setItems={setCartItems}
              priceType={priceType}
              selectedClientId={selectedClientId}
              setSelectedClientId={setSelectedClientId}
              onClose={() => setShowCart(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
};
