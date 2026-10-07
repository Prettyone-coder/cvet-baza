'use strict';

// Загружает каталог из Supabase. Если Supabase ещё не настроен или недоступен,
// сайт продолжает работать на старом products.js.
window.PRODUCTS_READY = (async () => {
  const fallback = Array.isArray(window.PRODUCTS) ? window.PRODUCTS : [];
  const cfg = window.SUPABASE_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.(co|net)$/.test(cfg.url || '') && cfg.key && !String(cfg.key).startsWith('PASTE_');
  if (!configured || !window.supabase) return fallback;

  try {
    const client = window.supabase.createClient(cfg.url, cfg.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
    const { data, error } = await client
      .from('products')
      .select('id,name,category,price,description,image_url,available,published,unit,featured,featured_order,sort_order,created_at')
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!Array.isArray(data)) return fallback;

    window.PRODUCTS = data.map(p => ({
      ...p,
      image: p.image_url || ''
    }));
    return window.PRODUCTS;
  } catch (err) {
    console.warn('Supabase недоступен — использую products.js:', err?.message || err);
    window.PRODUCTS = fallback;
    return fallback;
  }
})();
