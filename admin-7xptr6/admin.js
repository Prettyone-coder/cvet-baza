'use strict';

const $ = (id) => document.getElementById(id);
const cfg = window.SUPABASE_CONFIG || {};
const configured = /^https:\/\/.+\.supabase\.(co|net)$/.test(cfg.url || '') && cfg.key && !String(cfg.key).startsWith('PASTE_');
const CATEGORIES = ['Букеты','Розы','Срезанные цветы','Сезонные','Композиции','Растения'];
let sb = null;
let products = [];
let editing = null;
let pendingDelete = null;
let pendingPhotoFile = null;
let removeCurrentPhoto = false;
let pendingHeroImageFile = null;
let resetHeroImage = false;
let toastTimer = null;

function show(id){$(id).classList.remove('hidden')}
function hide(id){$(id).classList.add('hidden')}
function money(n){return Number(n||0)>0?Number(n).toLocaleString('ru-RU')+' ₽':'По запросу'}
function safeText(v){return String(v ?? '')}
function adminMediaUrl(url){
  const value=String(url||'').trim();
  if(!value)return '';
  if(/^(https?:|data:|blob:)/i.test(value))return value;
  if(value.startsWith('../'))return value;
  return '../'+value.replace(/^\.\//,'').replace(/^\//,'');
}
function toast(message){const t=$('toast');t.textContent=message;t.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('show'),2600)}
function setBusy(button,busy,text){button.disabled=busy;if(!button.dataset.label)button.dataset.label=button.textContent;button.textContent=busy?text:button.dataset.label}
function slugName(file){const ext=(file.name.split('.').pop()||'jpg').toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg';return `${Date.now()}-${crypto.randomUUID()}.${ext}`}

function allCategories(){return [...new Set([...CATEGORIES,...products.map(p=>p.category).filter(Boolean)])].sort((a,b)=>a.localeCompare(b,'ru'))}
function initCategoryControls(){renderCategoryControls()}
function renderCategoryControls(){
  const cats=allCategories();
  $('category-options').replaceChildren(...cats.map(c=>{const o=document.createElement('option');o.value=c;return o}));
  const current=$('admin-category').value;
  $('admin-category').replaceChildren(Object.assign(document.createElement('option'),{value:'',textContent:'Все категории'}),...cats.map(c=>Object.assign(document.createElement('option'),{value:c,textContent:c})));
  if(cats.includes(current))$('admin-category').value=current;
}

async function boot(){
  initCategoryControls();
  if(!configured || !window.supabase){show('setup-screen');return}
  sb = window.supabase.createClient(cfg.url,cfg.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
  const {data:{session}} = await sb.auth.getSession();
  if(session){await enterApp(session.user)}else{show('login-screen')}
  sb.auth.onAuthStateChange((_event,session)=>{
    if(!session){hide('app');show('login-screen')}
  });
}

$('login-form').addEventListener('submit',async(e)=>{
  e.preventDefault();
  $('login-error').textContent='';
  const button=$('login-button');setBusy(button,true,'Входим…');
  const {data,error}=await sb.auth.signInWithPassword({email:$('login-email').value.trim(),password:$('login-password').value});
  setBusy(button,false,'Войти');
  if(error){$('login-error').textContent='Не удалось войти. Проверьте email и пароль.';return}
  hide('login-screen');await enterApp(data.user);
});

async function enterApp(user){
  $('user-email').textContent=user?.email||'Администратор';
  hide('login-screen');hide('setup-screen');show('app');
  await Promise.all([loadProducts(), loadSiteContent()]);
  switchView('catalog');
}

$('logout').addEventListener('click',async()=>{await sb.auth.signOut();hide('app');show('login-screen')});
$('refresh').addEventListener('click',loadProducts);
$('admin-search').addEventListener('input',renderProducts);
$('admin-category').addEventListener('change',renderProducts);
$('add-product').addEventListener('click',()=>openEditor());
document.querySelectorAll('[data-add]').forEach(b=>b.addEventListener('click',()=>openEditor()));
$('sidebar-toggle').addEventListener('click',()=>document.querySelector('.sidebar').classList.toggle('open'));

async function loadProducts(){
  show('loading');hide('empty');$('product-list').replaceChildren();
  const {data,error}=await sb.from('products').select('*').order('sort_order',{ascending:true}).order('created_at',{ascending:false});
  hide('loading');
  if(error){toast('Ошибка загрузки: '+error.message);return}
  products=Array.isArray(data)?data:[];
  renderCategoryControls();updateStats();renderShowcase();renderProducts();
}

function updateStats(){
  $('stat-total').textContent=products.length;
  $('stat-active').textContent=products.filter(p=>p.available).length;
  $('stat-featured').textContent=products.filter(p=>p.featured).length;
  $('stat-no-photo').textContent=products.filter(p=>!p.image_url).length;
}

function renderProducts(){
  const q=$('admin-search').value.trim().toLocaleLowerCase('ru');
  const cat=$('admin-category').value;
  const filtered=products.filter(p=>(!cat||p.category===cat)&&(!q||safeText(p.name).toLocaleLowerCase('ru').includes(q)));
  $('product-list').replaceChildren(...filtered.map(productRow));
  if(!filtered.length)show('empty');else hide('empty');
}

function productRow(p){
  const row=document.createElement('article');row.className='product-row';
  const thumb=document.createElement('div');thumb.className='thumb';
  if(p.image_url){const img=document.createElement('img');img.src=adminMediaUrl(p.image_url);img.alt='';img.loading='lazy';img.onerror=()=>{thumb.replaceChildren(document.createTextNode('цб'))};thumb.append(img)}else thumb.textContent='цб';

  const name=document.createElement('div');name.className='product-name';
  const nb=document.createElement('b');nb.textContent=p.name;const ns=document.createElement('small');ns.textContent=p.unit?'Поштучный товар':'Готовый товар';name.append(nb,ns);
  const cat=document.createElement('div');cat.className='row-category row-meta';cat.textContent=p.category;
  const price=document.createElement('div');price.className='price';price.textContent=money(p.price);
  const status=document.createElement('div');status.className='row-status';
  const avail=document.createElement('span');avail.className='badge'+((p.published!==false&&p.available)?'':' off');avail.textContent=p.published===false?'● Скрыт':(p.available?'● В наличии':'● Нет в наличии');status.append(avail);
  if(p.featured){const feat=document.createElement('span');feat.className='badge featured';feat.textContent='Главная';status.append(feat)}
  const actions=document.createElement('div');actions.className='row-actions';
  const edit=document.createElement('button');edit.type='button';edit.title='Редактировать';edit.textContent='✎';edit.onclick=()=>openEditor(p);
  const del=document.createElement('button');del.type='button';del.className='delete';del.title='Удалить';del.textContent='⌫';del.onclick=()=>askDelete(p);
  actions.append(edit,del);row.append(thumb,name,cat,price,status,actions);return row;
}

function openEditor(p=null){
  editing=p;pendingPhotoFile=null;removeCurrentPhoto=false;$('product-form').reset();
  $('product-id').value=p?.id??'';$('current-image-url').value=p?.image_url||'';$('current-image-path').value=p?.image_path||'';
  $('product-name').value=p?.name||'';$('product-category').value=p?.category||'Букеты';$('product-price').value=Number(p?.price||0);$('product-sort').value=Number(p?.sort_order??100);$('product-description').value=p?.description||'';
  $('product-available').checked=p?.available??true;$('product-published').checked=p?.published??true;$('product-unit').checked=p?.unit??false;
  $('editor-title').textContent=p?'Редактировать товар':'Новый товар';$('form-error').textContent='';renderPhotoPreview(adminMediaUrl(p?.image_url||''));$('editor').showModal();setTimeout(()=>$('product-name').focus(),50);
}
function closeEditor(){if($('editor').open)$('editor').close()}
$('editor-close').addEventListener('click',closeEditor);$('cancel-edit').addEventListener('click',closeEditor);
$('editor').addEventListener('click',e=>{if(e.target===$('editor')){const r=$('editor').getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)closeEditor()}});

function formatBytes(bytes){
  if(bytes<1024)return `${bytes} Б`;
  if(bytes<1024*1024)return `${(bytes/1024).toFixed(0)} КБ`;
  return `${(bytes/(1024*1024)).toFixed(1)} МБ`;
}

function loadImageForCompression(file){
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(file);
    const img=new Image();
    img.onload=()=>{URL.revokeObjectURL(url);resolve(img)};
    img.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('Не удалось прочитать изображение.'))};
    img.src=url;
  });
}

function canvasToBlob(canvas,type,quality){
  return new Promise((resolve,reject)=>{
    canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Не удалось сжать изображение.')),type,quality);
  });
}

async function compressProductImage(file){
  const allowed=['image/jpeg','image/png','image/webp'];
  if(!allowed.includes(file.type)){
    throw new Error('Поддерживаются JPG, PNG и WebP. Если фото HEIC/HEIF — сначала сохраните его как JPG.');
  }
  if(file.size>25*1024*1024)throw new Error('Исходное фото больше 25 МБ.');

  const img=await loadImageForCompression(file);
  const maxSide=1600;
  const scale=Math.min(1,maxSide/Math.max(img.naturalWidth,img.naturalHeight));
  const width=Math.max(1,Math.round(img.naturalWidth*scale));
  const height=Math.max(1,Math.round(img.naturalHeight*scale));

  // Уже небольшое и оптимизированное фото можно не пережимать лишний раз.
  if(scale===1 && file.size<=700*1024 && file.type==='image/webp')return file;

  const canvas=document.createElement('canvas');
  canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d',{alpha:true});
  if(!ctx)throw new Error('Браузер не смог подготовить фото.');
  ctx.imageSmoothingEnabled=true;
  ctx.imageSmoothingQuality='high';
  ctx.drawImage(img,0,0,width,height);

  const target=1200*1024;
  let quality=.84;
  let blob=await canvasToBlob(canvas,'image/webp',quality);
  while(blob.size>target && quality>.58){
    quality-=.08;
    blob=await canvasToBlob(canvas,'image/webp',quality);
  }

  const base=(file.name.replace(/\.[^.]+$/,'')||'product').replace(/[^\p{L}\p{N}_-]+/gu,'-');
  return new File([blob],`${base}.webp`,{type:'image/webp',lastModified:Date.now()});
}

$('product-image').addEventListener('change',async()=>{
  const input=$('product-image');
  const file=input.files?.[0];if(!file)return;
  $('form-error').textContent='';
  try{
    const compressed=await compressProductImage(file);
    pendingPhotoFile=compressed;removeCurrentPhoto=false;
    renderPhotoPreview(URL.createObjectURL(compressed));
    if(compressed!==file || compressed.size<file.size){
      toast(`Фото сжато: ${formatBytes(file.size)} → ${formatBytes(compressed.size)}`);
    }
  }catch(err){
    pendingPhotoFile=null;
    input.value='';
    $('form-error').textContent=err?.message||'Не удалось обработать фото.';
  }
});
$('remove-photo').addEventListener('click',()=>{pendingPhotoFile=null;removeCurrentPhoto=true;$('product-image').value='';renderPhotoPreview('')});
function renderPhotoPreview(url){
  const box=$('photo-preview');box.replaceChildren();
  if(url){const img=document.createElement('img');img.src=url;img.alt='Предпросмотр';box.append(img);show('remove-photo')}
  else{const d=document.createElement('div');const b=document.createElement('b');b.textContent='цб';const s=document.createElement('span');s.textContent='Фото товара';d.append(b,s);box.append(d);hide('remove-photo')}
}

async function uploadPhoto(file,folder='products'){
  const path=`${folder}/${slugName(file)}`;
  const {error}=await sb.storage.from(cfg.bucket||'product-images').upload(path,file,{cacheControl:'3600',upsert:false,contentType:file.type||undefined});
  if(error)throw error;
  const {data}=sb.storage.from(cfg.bucket||'product-images').getPublicUrl(path);
  return {path,url:data.publicUrl};
}
async function deletePhoto(path){if(!path)return;const {error}=await sb.storage.from(cfg.bucket||'product-images').remove([path]);if(error)console.warn('Не удалось удалить старое фото:',error.message)}

$('product-form').addEventListener('submit',async(e)=>{
  e.preventDefault();$('form-error').textContent='';
  const name=$('product-name').value.trim(),category=$('product-category').value.trim();
  if(!name||!category){$('form-error').textContent='Заполните название и категорию.';return}
  const button=$('save-product');setBusy(button,true,'Сохраняю…');
  let image_url=$('current-image-url').value,image_path=$('current-image-path').value,uploadedNewPath='';
  try{
    if(pendingPhotoFile){const uploaded=await uploadPhoto(pendingPhotoFile);uploadedNewPath=uploaded.path;image_url=uploaded.url;image_path=uploaded.path}
    else if(removeCurrentPhoto){image_url='';image_path=''}
    const payload={name,category,price:Math.max(0,Number($('product-price').value)||0),description:$('product-description').value.trim(),image_url,image_path,available:$('product-available').checked,published:$('product-published').checked,unit:$('product-unit').checked,featured:editing?.featured??false,featured_order:editing?.featured_order??null,sort_order:Number($('product-sort').value)||100,updated_at:new Date().toISOString()};
    let result;
    if(editing?.id) result=await sb.from('products').update(payload).eq('id',editing.id).select().single();
    else result=await sb.from('products').insert(payload).select().single();
    if(result.error)throw result.error;
    const oldPath=$('current-image-path').value;
    if((pendingPhotoFile||removeCurrentPhoto)&&oldPath&&oldPath!==image_path)await deletePhoto(oldPath);
    closeEditor();toast(editing?'Товар обновлён':'Товар добавлен');await loadProducts();
  }catch(err){if(uploadedNewPath)await deletePhoto(uploadedNewPath);$('form-error').textContent=err?.message||'Не удалось сохранить товар.'}
  finally{setBusy(button,false,'Сохранить товар')}
});


function renderShowcase(){
  const selected=[...products].filter(p=>p.featured).sort((a,b)=>(a.featured_order??999)-(b.featured_order??999)||(a.sort_order??100)-(b.sort_order??100)).slice(0,4);
  for(let i=1;i<=4;i++){
    const select=$(`featured-slot-${i}`);
    const current=selected[i-1]?.id?String(selected[i-1].id):'';
    const options=[Object.assign(document.createElement('option'),{value:'',textContent:'— Пусто —'})];
    for(const p of products){
      const label=`${p.name}${p.published===false?' · скрыт':''}${!p.image_url?' · без фото':''}`;
      options.push(Object.assign(document.createElement('option'),{value:String(p.id),textContent:label}));
    }
    select.replaceChildren(...options);select.value=current;
  }
}

$('save-showcase').addEventListener('click',async()=>{
  $('showcase-error').textContent='';
  const ids=[1,2,3,4].map(i=>$(`featured-slot-${i}`).value).filter(Boolean);
  if(new Set(ids).size!==ids.length){$('showcase-error').textContent='Один и тот же товар нельзя поставить в две позиции.';return}
  const button=$('save-showcase');setBusy(button,true,'Сохраняю…');
  try{
    const {error:clearError}=await sb.from('products').update({featured:false,featured_order:null,updated_at:new Date().toISOString()}).eq('featured',true);
    if(clearError)throw clearError;
    for(let i=0;i<ids.length;i++){
      const {error}=await sb.from('products').update({featured:true,featured_order:i+1,updated_at:new Date().toISOString()}).eq('id',ids[i]);
      if(error)throw error;
    }
    toast('Главная витрина обновлена');await loadProducts();
  }catch(err){$('showcase-error').textContent=err?.message||'Не удалось сохранить витрину.'}
  finally{setBusy(button,false,'Сохранить витрину')}
});

function askDelete(p){pendingDelete=p;$('confirm-text').textContent=`«${p.name}» исчезнет из каталога. Это действие нельзя отменить.`;$('confirm-dialog').showModal()}
$('confirm-cancel').addEventListener('click',()=>{$('confirm-dialog').close();pendingDelete=null});
$('confirm-delete').addEventListener('click',async()=>{
  if(!pendingDelete)return;const button=$('confirm-delete');setBusy(button,true,'Удаляю…');
  const target=pendingDelete;const {error}=await sb.from('products').delete().eq('id',target.id);
  if(!error&&target.image_path)await deletePhoto(target.image_path);
  setBusy(button,false,'Удалить');$('confirm-dialog').close();pendingDelete=null;
  if(error){toast('Не удалось удалить: '+error.message);return}toast('Товар удалён');await loadProducts();
});


// --- CMS: контент сайта -----------------------------------------------------
const SITE_DEFAULTS = {
  topline_text:'Цветы и чувства — круглосуточно', topline_note:'Доставка · Самовывоз',
  phone:'+7 (987) 053-07-77', vk_url:'https://vk.ru/im?sel=-61006706',
  hero_eyebrow:'Для больших и маленьких поводов', hero_title_1:'Когда чувства', hero_title_2:'становятся', hero_title_em:'цветами.',
  hero_text:'Букеты с характером. Нежные признания.\nИ красота, которой хочется делиться.', hero_button:'Выбрать свой букет', hero_hours:'Ждём вас 24/7',
  hero_image_url:'assets/bouquet-1.jpg', hero_image_path:'', hero_caption_left:'Собрано с чувством', hero_caption_right:'Цвет-База.рф',
  value1_title:'24 / 7', value1_text:'Для спонтанных признаний', value2_title:'Ваш характер', value2_text:'Букет под настроение и повод', value3_title:'Рядом с вами', value3_text:'Доставка и два магазина',
  selection_eyebrow:'Выбор с настроением', selection_title:'Влюбиться с первого взгляда', selection_text:'Сборные букеты и композиции\nиз нашей коллекции.',
  catalog_eyebrow:'Ваша цветочная история', catalog_title:'Каталог цветов', catalog_text:'От одной розы до большого букета.\nВыберите то, что скажет за вас.', catalog_status:'Цены и наличие уточняйте у флориста',
  personal_eyebrow:'Особенный повод · Особенный букет', personal_title_1:'Есть чувства, для которых', personal_title_em:'нет шаблона.', personal_text:'Расскажите, кому выбираете цветы, какие оттенки любите и на какую сумму рассчитываете. Соберём вашу историю в букет.', personal_button:'Обсудить букет во ВКонтакте',
  delivery_eyebrow:'От нас — к дорогим вам людям', delivery_title:'Красиво. Лично. Вовремя.', delivery_text:'Адрес, время и стоимость доставки\nсогласуем при оформлении.',
  delivery1_title:'Ваш букет', delivery1_text:'Откройте карточку и нажмите «Заказать». Для штучных цветов укажите нужное количество.',
  delivery2_title:'Все детали', delivery2_text:'В сообщениях ВКонтакте уточним наличие, состав, стоимость и удобное время получения.',
  delivery3_title:'Доставка или самовывоз', delivery3_text:'Привезём по согласованному адресу или подготовим заказ к вашему приезду в магазин.',
  care_eyebrow:'Пусть красота остаётся', care_title:'Ещё немного заботы.', care_text:'Простые привычки, которые помогут\nсохранить свежесть букета.',
  stores_eyebrow:'Всегда есть повод зайти', stores_title:'Цветы рядом. В любое время.', stores_text:'Два магазина.\nКруглосуточно, без выходных.',
  store1_city:'Стерлитамак', store1_address:'Черноморская, 18', store1_hours:'24/7', store2_city:'Салават', store2_address:'ул. Ленина, 22', store2_hours:'24/7',
  contact_eyebrow:'Рядом, когда нужны цветы', contact_title_1:'Начнём с', contact_title_em:'«Хочу порадовать».', contact_button:'Написать во ВКонтакте', footer_tagline:'Цветы для ваших чувств'
};

function switchView(view){
  const content=view==='content';
  $('catalog-view').classList.toggle('hidden',content);
  $('content-view').classList.toggle('hidden',!content);
  $('view-title').textContent=content?'Контент сайта':'Каталог товаров';
  $('add-product').classList.toggle('hidden',content);
  document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.classList.toggle('active',b.dataset.view===view));
  document.querySelector('.sidebar')?.classList.remove('open');
}
document.querySelectorAll('.nav-item[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));


function renderHeroImagePreview(url){
  const box=$('hero-image-preview'); if(!box)return;
  box.replaceChildren();
  const resolved=adminMediaUrl(url);
  if(resolved){
    const img=document.createElement('img'); img.src=resolved; img.alt='Главное фото';
    img.onerror=()=>{box.replaceChildren(Object.assign(document.createElement('span'),{textContent:'Фото недоступно'}))};
    box.append(img);
  }else{
    box.append(Object.assign(document.createElement('span'),{textContent:'Главное фото'}));
  }
}

$('hero-image-input')?.addEventListener('change',async()=>{
  const input=$('hero-image-input'); const file=input.files?.[0]; if(!file)return;
  $('content-error').textContent='';
  try{
    const compressed=await compressProductImage(file);
    pendingHeroImageFile=compressed; resetHeroImage=false;
    renderHeroImagePreview(URL.createObjectURL(compressed));
    toast(`Главное фото подготовлено: ${formatBytes(file.size)} → ${formatBytes(compressed.size)}`);
  }catch(err){
    pendingHeroImageFile=null; input.value='';
    $('content-error').textContent=err?.message||'Не удалось обработать главное фото.';
  }
});

$('hero-image-reset')?.addEventListener('click',()=>{
  pendingHeroImageFile=null; resetHeroImage=true;
  if($('hero-image-input'))$('hero-image-input').value='';
  if($('hero-image-url'))$('hero-image-url').value=SITE_DEFAULTS.hero_image_url;
  if($('hero-image-path'))$('hero-image-path').value='';
  renderHeroImagePreview(SITE_DEFAULTS.hero_image_url);
  toast('После сохранения вернётся исходное фото');
});

async function loadSiteContent(){
  const form=$('site-content-form'); if(!form) return;
  let data={...SITE_DEFAULTS};
  try{
    const {data:row,error}=await sb.from('site_settings').select('data').eq('id',1).maybeSingle();
    if(error) throw error;
    if(row?.data && typeof row.data==='object') data={...data,...row.data};
    $('content-error').textContent='';
  }catch(err){
    $('content-error').textContent='Таблица CMS ещё не подключена. Сначала запустите cms-update.sql в Supabase.';
  }
  for(const el of form.elements){ if(el.name && Object.prototype.hasOwnProperty.call(data,el.name)) el.value=data[el.name] ?? ''; }
  pendingHeroImageFile=null; resetHeroImage=false;
  if($('hero-image-input'))$('hero-image-input').value='';
  renderHeroImagePreview(data.hero_image_url || SITE_DEFAULTS.hero_image_url);
}

$('site-content-form')?.addEventListener('submit',async(e)=>{
  e.preventDefault(); $('content-error').textContent='';
  const form=e.currentTarget; const data={};
  for(const el of form.elements){ if(el.name) data[el.name]=el.value.trim(); }
  const buttons=[...form.querySelectorAll('button[type="submit"]')]; buttons.forEach(b=>setBusy(b,true,'Сохраняю…'));
  const oldHeroPath=$('hero-image-path')?.value||'';
  let uploadedHeroPath='';
  try{
    if(pendingHeroImageFile){
      const uploaded=await uploadPhoto(pendingHeroImageFile,'site');
      uploadedHeroPath=uploaded.path;
      data.hero_image_url=uploaded.url;
      data.hero_image_path=uploaded.path;
    }else if(resetHeroImage){
      data.hero_image_url=SITE_DEFAULTS.hero_image_url;
      data.hero_image_path='';
    }
    const {error}=await sb.from('site_settings').upsert({id:1,data,updated_at:new Date().toISOString()},{onConflict:'id'});
    if(error)throw error;
    if((pendingHeroImageFile||resetHeroImage)&&oldHeroPath&&oldHeroPath!==data.hero_image_path)await deletePhoto(oldHeroPath);
    if($('hero-image-url'))$('hero-image-url').value=data.hero_image_url||SITE_DEFAULTS.hero_image_url;
    if($('hero-image-path'))$('hero-image-path').value=data.hero_image_path||'';
    pendingHeroImageFile=null; resetHeroImage=false;
    if($('hero-image-input'))$('hero-image-input').value='';
    renderHeroImagePreview(data.hero_image_url||SITE_DEFAULTS.hero_image_url);
    $('content-status').textContent='Сохранено. Обновите открытую страницу сайта, чтобы увидеть изменения.';
    toast('Контент сайта сохранён');
  }catch(err){
    if(uploadedHeroPath)await deletePhoto(uploadedHeroPath);
    $('content-error').textContent=err?.message||'Не удалось сохранить контент.';
  }finally{
    buttons.forEach(b=>setBusy(b,false,'Сохранить контент'));
  }
});

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.querySelector('.sidebar.open'))document.querySelector('.sidebar').classList.remove('open')});
boot();
