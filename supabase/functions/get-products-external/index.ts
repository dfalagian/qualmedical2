import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Validate API Key
    const apiKey = req.headers.get('x-api-key')
    const expectedKey = Deno.env.get('EXTERNAL_API_KEY')

    if (!expectedKey) {
      console.error('EXTERNAL_API_KEY not configured')
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    if (!apiKey || apiKey !== expectedKey) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Invalid or missing x-api-key header.' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Parse query params
    const url = new URL(req.url)
    const sku = url.searchParams.get('sku')
    const name = url.searchParams.get('name')
    const category = url.searchParams.get('category')
    const brand = url.searchParams.get('brand')
    const productId = url.searchParams.get('id')
    const activeOnly = url.searchParams.get('active') !== 'false' // default true
    const catalogOnly = url.searchParams.get('catalog_only') // optional filter
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 1000)
    const offset = parseInt(url.searchParams.get('offset') || '0')

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Build query
    let query = supabase
      .from('products')
      .select(`
        id,
        sku,
        name,
        description,
        brand,
        category,
        barcode,
        unit,
        current_stock,
        minimum_stock,
        unit_price,
        price_with_tax,
        price_without_tax,
        price_type_1,
        price_type_2,
        price_type_3,
        price_type_4,
        price_type_5,
        tax_rate,
        clave_unidad,
        codigo_sat,
        image_url,
        is_active,
        created_at,
        updated_at,
        product_batches (
          id,
          batch_number,
          barcode,
          expiration_date,
          current_quantity,
          initial_quantity,
          is_active,
          received_at
        ),
        warehouse_stock (
          current_stock,
          warehouse_id,
          warehouses:warehouse_id (
            name,
            code
          )
        )
      `)

    // Apply filters
    if (activeOnly) {
      query = query.eq('is_active', true)
    }
    if (productId) {
      query = query.eq('id', productId)
    }
    if (sku) {
      query = query.ilike('sku', `%${sku}%`)
    }
    if (name) {
      query = query.ilike('name', `%${name}%`)
    }
    if (category) {
      query = query.ilike('category', `%${category}%`)
    }
    if (brand) {
      query = query.ilike('brand', `%${brand}%`)
    }

    query = query.order('name', { ascending: true }).range(offset, offset + limit - 1)

    const { data: products, error, count } = await query

    if (error) {
      console.error('Database query error:', error)
      return new Response(JSON.stringify({ error: 'Error querying products', details: error.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Format response
    const response = {
      success: true,
      count: products?.length || 0,
      offset,
      limit,
      filters_applied: {
        ...(sku && { sku }),
        ...(name && { name }),
        ...(category && { category }),
        ...(brand && { brand }),
        ...(productId && { id: productId }),
        active_only: activeOnly,
      },
      products: (products || []).map((p: any) => ({
        id: p.id,
        sku: p.sku,
        name: p.name,
        description: p.description,
        brand: p.brand,
        category: p.category,
        barcode: p.barcode,
        unit: p.unit,
        stock: {
          current: p.current_stock,
          minimum: p.minimum_stock,
        },
        pricing: {
          unit_price: p.unit_price,
          price_with_tax: p.price_with_tax,
          price_without_tax: p.price_without_tax,
          price_type_1: p.price_type_1,
          price_type_2: p.price_type_2,
          price_type_3: p.price_type_3,
          price_type_4: p.price_type_4,
          price_type_5: p.price_type_5,
          tax_rate: p.tax_rate,
        },
        sat: {
          clave_unidad: p.clave_unidad,
          codigo_sat: p.codigo_sat,
        },
        image_url: p.image_url,
        is_active: p.is_active,
        batches: (p.product_batches || [])
          .filter((b: any) => b.is_active)
          .map((b: any) => ({
            id: b.id,
            batch_number: b.batch_number,
            barcode: b.barcode,
            expiration_date: b.expiration_date,
            current_quantity: b.current_quantity,
            initial_quantity: b.initial_quantity,
            received_at: b.received_at,
          })),
        warehouse_stock: (p.warehouse_stock || [])
          .filter((ws: any) => ws.current_stock > 0)
          .map((ws: any) => ({
            warehouse_name: ws.warehouses?.name || null,
            warehouse_code: ws.warehouses?.code || null,
            current_stock: ws.current_stock,
          })),
        created_at: p.created_at,
        updated_at: p.updated_at,
      })),
    }

    return new Response(JSON.stringify(response), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error('Unexpected error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
