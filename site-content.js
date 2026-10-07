'use strict';

window.SITE_CONTENT_READY = (async () => {
  const cfg = window.SUPABASE_CONFIG || {};
  const configured = /^https:\/\/.+\.supabase\.(co|net)$/.test(cfg.url || '') && cfg.key && !String(cfg.key).startsWith('PASTE_');
  if (!configured || !window.supabase) return null;

  const setText = (id, value) => { const el = document.getElementById(id); if (el && value != null && value !== '') el.textContent = value; };
  const setTextWithBreaks = (id, value) => {
    const el = document.getElementById(id); if (!el || value == null || value === '') return;
    el.replaceChildren();
    String(value).split(/\n/).forEach((part, i) => { if (i) el.append(document.createElement('br')); el.append(document.createTextNode(part)); });
  };
  const telHref = (phone) => 'tel:' + String(phone || '').replace(/[^+\d]/g, '');
  const mapHref = (address) => 'https://yandex.ru/maps/?text=' + encodeURIComponent('Цвет-База.рф ' + address);

  try {
    const client = window.supabase.createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data: row, error } = await client.from('site_settings').select('data').eq('id', 1).maybeSingle();
    if (error) throw error;
    const d = row?.data || {};

    setText('cms-topline-text', d.topline_text); setText('cms-topline-note', d.topline_note);
    setText('cms-hero-eyebrow', d.hero_eyebrow); setText('cms-hero-title-1', d.hero_title_1); setText('cms-hero-title-2', d.hero_title_2); setText('cms-hero-title-em', d.hero_title_em); setTextWithBreaks('cms-hero-text', d.hero_text); setText('cms-hero-button', d.hero_button); setText('cms-hero-hours', d.hero_hours);
    setText('cms-value1-title', d.value1_title); setText('cms-value1-text', d.value1_text); setText('cms-value2-title', d.value2_title); setText('cms-value2-text', d.value2_text); setText('cms-value3-title', d.value3_title); setText('cms-value3-text', d.value3_text);
    setText('cms-selection-eyebrow', d.selection_eyebrow); setText('cms-selection-title', d.selection_title); setTextWithBreaks('cms-selection-text', d.selection_text);
    setText('cms-catalog-eyebrow', d.catalog_eyebrow); setText('cms-catalog-title', d.catalog_title); setTextWithBreaks('cms-catalog-text', d.catalog_text); setText('cms-catalog-status', d.catalog_status);
    setText('cms-personal-eyebrow', d.personal_eyebrow); setText('cms-personal-title-1', d.personal_title_1); setText('cms-personal-title-em', d.personal_title_em); setText('cms-personal-text', d.personal_text); setText('cms-personal-button', d.personal_button);
    setText('cms-delivery-eyebrow', d.delivery_eyebrow); setText('cms-delivery-title', d.delivery_title); setTextWithBreaks('cms-delivery-text', d.delivery_text);
    for (let i=1;i<=3;i++){ setText(`cms-delivery${i}-title`, d[`delivery${i}_title`]); setText(`cms-delivery${i}-text`, d[`delivery${i}_text`]); }
    setText('cms-care-eyebrow', d.care_eyebrow); setTextWithBreaks('cms-care-title', d.care_title); setTextWithBreaks('cms-care-text', d.care_text);
    setText('cms-stores-eyebrow', d.stores_eyebrow); setText('cms-stores-title', d.stores_title); setTextWithBreaks('cms-stores-text', d.stores_text);
    setText('cms-contact-eyebrow', d.contact_eyebrow); setText('cms-contact-title-1', d.contact_title_1); setText('cms-contact-title-em', d.contact_title_em); setText('cms-contact-button', d.contact_button); setText('cms-footer-tagline', d.footer_tagline);

    if (d.phone) {
      for (const id of ['cms-header-phone','cms-contact-phone']) { const el=document.getElementById(id); if(el){el.textContent=d.phone; el.href=telHref(d.phone);} }
    }
    if (d.vk_url) {
      for (const id of ['cms-personal-button','cms-contact-button']) { const el=document.getElementById(id); if(el) el.href=d.vk_url; }
      window.CMS_VK_URL = d.vk_url;
    }

    const stores = [
      {n:1, city:d.store1_city, address:d.store1_address, hours:d.store1_hours},
      {n:2, city:d.store2_city, address:d.store2_address, hours:d.store2_hours}
    ];
    for (const s of stores) {
      if (!s.city || !s.address) continue;
      const full = `${s.city}, ${s.address}`;
      const hero = document.getElementById(`cms-store${s.n}-hero`);
      if (hero) { hero.textContent = `${s.city} · ${s.address}`; hero.dataset.address = full; hero.href = mapHref(full); }
      const card = document.getElementById(`cms-store${s.n}-card`);
      if (card) { card.dataset.address = full; card.href = mapHref(full); }
      setText(`cms-store${s.n}-meta`, `${s.city} · ${s.hours || ''}`.replace(/\s·\s$/, ''));
      setText(`cms-store${s.n}-address`, s.address);
    }

    return d;
  } catch (err) {
    console.warn('CMS-контент недоступен — оставляю тексты из HTML:', err?.message || err);
    return null;
  }
})();
