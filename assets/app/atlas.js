'use strict';
const $=id=>document.getElementById(id);
const fmt=n=>n==null||!isFinite(n)?'—':Number(n).toLocaleString('en-AE',{maximumFractionDigits:0});
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kuwait=iso=>iso?T('{t} Kuwait time',{t:new Date(iso).toLocaleString(T.locale,{timeZone:'Asia/Kuwait',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}):'—';
const median=xs=>{if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b),i=s.length>>1;return s.length%2?s[i]:(s[i-1]+s[i])/2};
const BANDS=['var(--b1)','var(--b2)','var(--b3)','var(--b4)','var(--b5)','var(--b6)']; // the price key, low to high
const G=window.gsap,FX=!!G&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
const TYPES=[['homes',T('Homes')],['flat',T('Flats')],['studio',T('Studios')],['villa',T('Villas')],['commercial',T('Commercial')],['all',T('Everything')]];
const KIND_IN={homes:['flat','studio','villa'],flat:['flat'],studio:['studio'],villa:['villa'],commercial:['commercial'],all:null};

/*<staleness>*/
// How old the newest data is, and whether to warn. Dubai Data publishes weekly with a few days' lag,
// Dubai Data's daily pages run a few days behind DLD; past a week something is stuck (the weekly
// export fallback alone can be up to ~14 days). Daily contract sources should never be more than a week behind.
function staleness(meta,now){
  const through=meta&&(meta.data_through||meta.newest_start_date);
  if(!through||!/^\d{4}-\d{2}-\d{2}$/.test(through))return null;
  const days=Math.floor((now-Date.parse(through+'T00:00:00+04:00'))/864e5);
  const limit=7;
  return {through,days,limit,stale:days>limit};
}
/*</staleness>*/
const niceDate=d=>new Date(d+'T00:00:00+04:00').toLocaleDateString(T.locale,{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Dubai'});

/* Counter (React Bits "Counter", ported to plain JS + GSAP): digits roll like an odometer. */
function odometer(el,value,prefix){
  el.setAttribute('aria-label',value==null?'—':(prefix||'')+fmt(value));
  if(value==null){el.textContent='—';el._sig=null;return}
  const txt=fmt(value),sig=(prefix||'')+txt.replace(/\d/g,'0');
  if(el._sig!==sig){ // layout changed (more digits): rebuild columns
    el.innerHTML=(prefix?'<span class="fix cur">'+safe(prefix.trim())+'</span>':'')+'<span class="odo">'+[...txt].map(c=>/\d/.test(c)
      ?'<span class="col"><span class="strip">'+'0123456789'.split('').map(d=>'<span>'+d+'</span>').join('')+'</span></span>'
      :'<span class="fix">'+safe(c)+'</span>').join('')+'</span>';
    el._sig=sig;
  }
  const strips=el.querySelectorAll('.strip'),digits=txt.replace(/\D/g,'');
  strips.forEach((s,i)=>{const y=-(+digits[i])+'em';
    if(FX)G.to(s,{y,duration:.9+i*.06,ease:'power3.out',overwrite:true});else s.style.transform='translateY('+y+')'});
}

const map=L.map('map',{zoomControl:true,attributionControl:true}).setView([25.13,55.27],11);
// A small merged label (2-3 areas) names its busiest area, e.g. "International City Phase 1 +1", so nearby
// places stay findable by name when zoomed in; bigger groups cover a region and just count their areas.
// The three map views (rent, sale price, gross yield), one tap apart on the map's bar.
const VIEWS=['median','sale','yield'];
// Text on a price badge: espresso on the four lighter blues, ivory on the two darkest (contrast 4.5:1 or more on each).
const INK=['#2B2118','#2B2118','#2B2118','#2B2118','#FFFCF5','#FFFCF5'];
// The price key: six colours in equal steps between the 5th and 95th percentile of what is shown, so a few
// extreme areas don't stretch the key. Values below the 5th percentile take the lowest colour, above the
// 95th the highest (and a full dial). `vals` must be sorted ascending.
const TRIM=.05;
const THIN=10; // fewer contracts than this: shown, but marked as a thin figure
function scaleFor(vals){
  const at=q=>vals.length?vals[Math.round(q*(vals.length-1))]:0;
  const lo=at(TRIM),hi=Math.max(at(1-TRIM),lo+1);
  const band=v=>v<=lo?0:v>=hi?5:Math.min(5,Math.floor((v-lo)/(hi-lo)*6));
  return {lo,hi,band,colorOf:v=>BANDS[band(v)],inkOf:v=>INK[band(v)]};
}
// The same scale for any home type, for the rent check (assets/app/companion.js): top price and colour.
const SCALES={};
window.priceKey=unit=>{
  const k=TYPE+'|'+(unit||'');if(SCALES[k])return SCALES[k];
  const vals=(CACHE.homes||AREAS).map(a=>areaValue(a,'median',unit||'')).filter(v=>v>0).sort((a,b)=>a-b);
  const sc=scaleFor(vals),top=sc.hi||1;
  return SCALES[k]={top,color:sc.colorOf,share:v=>Math.min(100,Math.round(v/top*100))};
};
// "All Dubai": back to the whole city (placed areas, leaving out far-off Hatta so the city isn't a dot).
function fitDubai(animate){const pts=(CACHE.homes||AREAS).filter(x=>x.lat!=null&&x.lng<55.7).map(x=>[x.lat,x.lng]);
  if(pts.length)map.fitBounds(pts,{padding:[30,30],animate:!!animate})}
// "All Dubai" is the third button of the zoom bar (+, −, All Dubai).
{const a=L.DomUtil.create('a','fit',map.zoomControl.getContainer());
  a.href='#';a.role='button';a.textContent=T('All Dubai');a.title=T('Show all of Dubai');
  L.DomEvent.on(a,'click',e=>{L.DomEvent.stop(e);fitDubai(true)})}
// A merged label names its busiest area and how many others it holds ("JLT +12"), so it says where it is.
const groupName=g=>{const top=g.reduce((a,b)=>b.n>a.n?b:a,g[0]).a.label;
  return (top.length>22?top.slice(0,21)+'…':top)+' +'+(g.length-1)};
// Base map. Vector tiles (OpenFreeMap: OpenStreetMap data, free, no key) so place and street names can be
// shown in English, Arabic or both, chosen with the map's language button. MapLibre (1 MB) loads after the
// page is up; the rent labels don't wait for it. Without WebGL, or if the vector map can't load, the classic
// OpenStreetMap tiles are used instead (names as tagged locally, a mix) and the language button is hidden.
const OSM_ATTR='© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>';
// Detailed colour map (Liberty) by day, OpenFreeMap's own dark map at night; both free, no key.
const styleFor=()=>'https://tiles.openfreemap.org/styles/'+(document.documentElement.dataset.theme==='dark'?'dark':'liberty');
const NAME_FIELD={ // OpenMapTiles name fields; 'both' keeps the style's own (Latin and local script)
  en:['coalesce',['get','name:en'],['get','name_en'],['get','name:latin'],['get','name']],
  ar:['coalesce',['get','name:ar'],['get','name']]};
// Place names follow the page's language; one button on the map's bar shows both scripts instead (remembered).
let mapBoth=(()=>{try{return localStorage.getItem('mapBoth')==='1'}catch(e){return false}})();
const mapLangNow=()=>mapBoth?'both':T.lang==='ar'?'ar':'en';
let gl=null,glNames=[];
const readNames=()=>{glNames=gl.getStyle().layers.filter(l=>l.type==='symbol'&&l.layout&&/"name/.test(JSON.stringify(l.layout['text-field']||''))).map(l=>[l.id,l.layout['text-field']])};
// OpenFreeMap's dark map is near-black with sea and land almost the same; lift it to the site's night
// colours so the coast, the Palm and the roads read clearly under the rent labels.
function tuneDark(m){if(document.documentElement.dataset.theme!=='dark')return;
  const set=(test,type,prop,v)=>m.getStyle().layers.filter(l=>l.type===type&&test.test(l.id)).forEach(l=>{try{m.setPaintProperty(l.id,prop,v)}catch(e){}});
  set(/^background$/,'background','background-color','#1E252C');
  set(/water/,'fill','fill-color','#13304D');
  set(/landuse|landcover|park/,'fill','fill-color','#232C33');
  set(/building/,'fill','fill-color','#2B343C');
  set(/highway_(path|minor)|road_pier/,'line','line-color','#3C4752');
  set(/highway_(major|motorway)_(inner|subtle)/,'line','line-color','#56646F');
  set(/.*/,'symbol','text-color','#B9C4CE');set(/.*/,'symbol','text-halo-color','#1E252C')}
// Light/dark switch: load the matching style, then put the chosen name language back.
function restyleBase(){if(!gl)return;const want=styleFor();if(gl._styleUrl===want)return;gl._styleUrl=want;
  gl.setStyle(want,{diff:false});gl.once('style.load',()=>{readNames();tuneDark(gl);applyMapLang()})}
function applyMapLang(){
  const l=mapLangNow();
  if(gl)for(const [id,orig] of glNames)gl.setLayoutProperty(id,'text-field',NAME_FIELD[l]||orig);
  const b=namesBtn();if(b)b.setAttribute('aria-pressed',mapBoth);
}
// The map's one bar: what it shows (rent, sale price or gross yield; each view has its own key, 5th to 95th
// percentile of its values, and shows only when the data has it), then the place-names button.
L.Control.View=L.Control.extend({options:{position:'topright'},onAdd(){
  const d=L.DomUtil.create('div','leaflet-bar viewSw');
  const g=L.DomUtil.create('div','views',d);g.setAttribute('role','group');g.setAttribute('aria-label',T('Map shows'));
  for(const [m,txt] of [['median',T('Rent')],['sale',T('Sale price')],['yield',T('Yield')]]){
    const b=L.DomUtil.create('button','',g);b.type='button';b.dataset.m=m;b.textContent=txt;
    L.DomEvent.on(b,'click',e=>{L.DomEvent.stop(e);const sel=$('metric');if(sel.value===m)return;sel.value=m;sel.dispatchEvent(new Event('change'))})}
  const n=L.DomUtil.create('button','names',d);n.type='button';n.hidden=true;n.innerHTML='<span aria-hidden="true"><span lang="en">A</span>+<span lang="ar">ع</span></span><span class="vh">'+safe(T('Place names in English and Arabic'))+'</span>';
  n.title=T('Place names in English and Arabic');
  L.DomEvent.on(n,'click',e=>{L.DomEvent.stop(e);mapBoth=!mapBoth;try{localStorage.setItem('mapBoth',mapBoth?'1':'0')}catch(_){}applyMapLang()});
  L.DomEvent.disableClickPropagation(d);return d}});
const viewCtl=new L.Control.View().addTo(map);
// Phones: the map credits fold behind an "i" button (two wrapped lines of credits covered the map's bottom);
// one tap shows them in full. Wide screens show them as always.
L.Control.Credits=L.Control.extend({options:{position:'bottomright'},onAdd(){
  const b=L.DomUtil.create('button','credits leaflet-bar');b.type='button';b.textContent='i';b.setAttribute('aria-expanded','false');
  b.setAttribute('aria-label',T('Map credits'));b.title=T('Map credits');
  L.DomEvent.on(b,'click',e=>{L.DomEvent.stop(e);const on=map.getContainer().classList.toggle('creditsOpen');b.setAttribute('aria-expanded',on)});
  L.DomEvent.disableClickPropagation(b);return b}});
new L.Control.Credits().addTo(map);
const namesBtn=()=>viewCtl.getContainer().querySelector('.names');
function syncViews(){
  const sel=$('metric'),have=new Set([...sel.options].map(o=>o.value));
  viewCtl.getContainer().querySelectorAll('button').forEach(b=>{b.hidden=!have.has(b.dataset.m);b.setAttribute('aria-pressed',b.dataset.m===sel.value)});
}
// OpenStreetMap tile usage policy: this exact HTTPS URL, visible attribution, no bulk or offline use.
function rasterBase(){if(map._osm)return;map._osm=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:OSM_ATTR}).addTo(map);namesBtn().hidden=true}
const loadScript=src=>new Promise((ok,fail)=>{const s=document.createElement('script');s.src=src;s.onload=ok;s.onerror=fail;document.head.append(s)});
async function vectorBase(){
  try{
    const css=document.createElement('link');css.rel='stylesheet';css.href='assets/vendor/maplibre/maplibre-gl.css';document.head.append(css);
    await loadScript('assets/vendor/maplibre/maplibre-gl.js');await loadScript('assets/vendor/maplibre/leaflet-maplibre-gl.js');
    if(!window.maplibregl||(maplibregl.supported&&!maplibregl.supported()))throw Error('no WebGL');
    // Arabic needs shaping and right-to-left order, which MapLibre leaves to this plugin.
    try{maplibregl.setRTLTextPlugin('assets/vendor/maplibre/mapbox-gl-rtl-text.js',true)}catch(e){}
    const layer=L.maplibreGL({style:styleFor(),interactive:false,attribution:'<a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> © <a href="https://www.openmaptiles.org/" target="_blank" rel="noopener">OpenMapTiles</a> '+OSM_ATTR}).addTo(map);
    const m=layer.getMaplibreMap();
    const fail=setTimeout(()=>{map.removeLayer(layer);rasterBase()},12000); // style or tiles unreachable
    m.on('error',e=>{if(!gl&&!e.sourceId){clearTimeout(fail);map.removeLayer(layer);rasterBase()}}); // the style itself, not one tile
    m.once('load',()=>{clearTimeout(fail);gl=m;gl._styleUrl=styleFor();
      readNames();tuneDark(m);map.getContainer().classList.add('glBase');
      namesBtn().hidden=false;applyMapLang();popupMargins();
      if(LABEL.metric)renderLabels()}); // rent labels step out from under the button that just appeared
  }catch(e){rasterBase()}
}

const layer=L.layerGroup().addTo(map);
// Community outlines (official Dubai Municipality boundaries, data/outlines.json), shaded with each area's
// price-key colour for the current view, under the labels. Loaded after the data; the map works without them.
map.createPane('outlines');map.getPane('outlines').style.zIndex=390;map.getPane('outlines').style.pointerEvents='none';
const outlineLayer=L.layerGroup().addTo(map);let OUTLINES=null;
const cssVar=v=>{const m=/^var\((--[\w-]+)\)$/.exec(v||'');return m?getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim():v};
function drawOutlines(){
  outlineLayer.clearLayers();if(!OUTLINES||!LABEL.colorOf)return;
  const byLabel=new Map(POINTS.map(p=>[p.a.label,p]));
  for(const o of OUTLINES){const p=byLabel.get(o.label);if(!p)continue;
    const col=cssVar(LABEL.colorOf(p.v));
    L.polygon(o.rings.map(r=>r.map(([x,y])=>[y,x])),{pane:'outlines',interactive:false,color:col,weight:1,opacity:.7,fillColor:col,fillOpacity:.32}).addTo(outlineLayer)}
}
function loadOutlines(){getJSON('data/outlines.json').then(d=>{OUTLINES=d.areas||[];drawOutlines()}).catch(()=>{})}
let POINTS=[],LABEL={},animateLabels=true;
const pct=v=>Number(v).toFixed(1)+'%'; // yields: always one decimal
const compact=v=>v>=1e6?(v/1e6).toFixed(v>=1e7?0:2).replace(/\.?0+$/,'')+'M':v>=1e4?Math.round(v/1e3)+'k':v>=1e3?(v/1e3).toFixed(1).replace(/\.0$/,'')+'k':String(Math.round(v));
let probe=null;const BOXES=new Map();
function labelBox(top,sub){
  const k=document.documentElement.dataset.theme+'|'+top+'|'+sub;if(BOXES.has(k))return BOXES.get(k);
  if(!probe){probe=document.createElement('div');probe.className='rl';probe.setAttribute('aria-hidden','true');
    probe.style.cssText='visibility:hidden;left:-9999px;top:0;transform:none'}
  probe.innerHTML='<b></b><small></small>';probe.firstChild.textContent=top;probe.lastChild.textContent=sub;
  map.getContainer().append(probe); // only while measuring, so it is never taken for a real label
  const r={w:Math.ceil(probe.offsetWidth)+2,h:Math.ceil(probe.offsetHeight)+2};probe.remove();BOXES.set(k,r);return r;
}
function labelText(v,metric){return metric==='sale'?'AED '+compact(v):metric==='yield'?Number(v).toFixed(1)+'%':metric==='n'?T('{n} contracts',{n:compact(v)}):metric==='median_sqm'?'AED '+fmt(v)+'/m²':'AED '+compact(v)}

// Labels that would overlap at this zoom merge into one label with the contract-weighted average.
function renderLabels(){
  layer.clearLayers();if(!POINTS.length)return;
  const {metric,colorOf}=LABEL;
  // Where labels go (merging, splitting, avoiding the controls) is decided in labels.js, in pixels.
  // Label boxes are measured as drawn (a hidden label with the same styles), so labels keep clear of each other
  // and of the map's buttons in either theme and language.
  const size=(members,val)=>labelBox(labelText(val,metric),members.length===1?members[0].a.label:groupName(members));
  const items=POINTS.map(p=>{const pt=map.latLngToLayerPoint([p.a.lat,p.a.lng]);return Object.assign({x:pt.x,y:pt.y,lat:p.a.lat,lng:p.a.lng},p)});
  const box=map.getContainer().getBoundingClientRect();
  const blocks=[...map.getContainer().parentNode.querySelectorAll('.leaflet-control,.legend')].map(e=>e.getBoundingClientRect())
    .filter(r=>r.width&&r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top)
    .map(r=>{const c=map.containerPointToLayerPoint([r.left-box.left+r.width/2,r.top-box.top+r.height/2]);return {x:c.x,y:c.y,w:r.width,h:r.height}});
  const v0=map.containerPointToLayerPoint([0,0]),ms=map.getSize(),view={x0:v0.x,y0:v0.y,x1:v0.x+ms.x,y1:v0.y+ms.y};
  const cl=RentLabels.place(items,size,{pad:6,sum:metric==='n',blocks,view});
  const added=[];
  for(const c of cl){const g=c.members,moved=c.lx!==c.x||c.ly!==c.y,pos=moved?map.layerPointToLatLng([c.lx,c.ly]):L.latLng(c.lat,c.lng);
    if(moved){L.polyline([[c.lat,c.lng],pos],{className:'leader',weight:1.5,interactive:false}).addTo(layer);
      L.circleMarker([c.lat,c.lng],{className:'leader dot',radius:3,weight:1.5,interactive:false}).addTo(layer)}
    // The figure sits on a badge in its price-key colour, so the price reads at a glance; the area name underneath.
    const html='<div class="rl'+(c.single?'':' grp')+(g.every(o=>o.thin)?' thin':'')+'" style="--c:'+colorOf(c.val)+';--on:'+LABEL.inkOf(c.val)+'" tabindex="0"><b>'+safe(labelText(c.val,metric))+'</b><small>'+safe(c.single?g[0].a.label:groupName(g))+'</small></div>';
    const m=L.marker(pos,{icon:L.divIcon({className:'rl-wrap',html,iconSize:[0,0]}),riseOnHover:true,keyboard:false,title:c.single?g[0].a.label:g.map(o=>o.a.label).join(', ')}).addTo(layer);
    added.push(m);
    // Keyboard: the label is a button. Enter or Space opens its breakdown, or zooms into a group.
    const el=m.getElement()&&m.getElement().firstChild;
    // Its spoken name is its visible text (rent and area), as WCAG 2.5.3 asks; the marker title lists a group's areas.
    if(el){el.setAttribute('role','button');
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(c.single)m.openPopup();else m.fire('click')}})}
    // The breakdown's tip sits above the label, so the label stays visible under it.
    if(c.single)m.bindPopup(popup(g[0].a),{maxWidth:320,offset:L.point(0,-18)});
    else m.on('click',()=>{const b=L.latLngBounds(g.map(o=>[o.a.lat,o.a.lng])),z=map.getBoundsZoom(b,false,L.point(140,140));
      if(z<=map.getZoom()||map.getZoom()>=16)L.popup({maxWidth:320}).setLatLng([c.lat,c.lng]).setContent('<span class="t">'+T.count(g.length,'area')+'</span>'+(metric==='n'?safe(labelText(c.val,metric)):T('Typical {v}',{v:safe(labelText(c.val,metric))}))+'<br>'+[...g].sort((x,y)=>y.n-x.n).map(o=>safe(o.a.label)+': <b>'+safe(labelText(o.v,metric))+'</b>').join('<br>')).openOn(map);
      else map.fitBounds(b,{padding:[70,70],maxZoom:16})});
  }
  // Labels answer a filter change by settling in from the centre; plain zooming redraws instantly.
  if(FX&&animateLabels){animateLabels=false;
    const els=added.map(m=>m.getElement()&&m.getElement().firstChild).filter(Boolean);
    G.fromTo(els,{opacity:0},{opacity:1,duration:.35,ease:'power1.out',stagger:{each:.008,from:'center'}});}
}
map.on('zoomend',renderLabels);
// After a pan, place the labels again (clear of the buttons and inside the edges), except while a breakdown is
// open: redrawing would close it. It is placed again once the breakdown closes.
map.on('moveend',()=>{if(!map._popup&&LABEL.metric)renderLabels()});
map.on('popupclose',()=>setTimeout(()=>{if(!map._popup&&LABEL.metric)renderLabels()},0));
// Label boxes are measured with the label fonts: once they have loaded, place the labels again.
if(document.fonts&&document.fonts.ready)document.fonts.ready.then(()=>{BOXES.clear();if(LABEL.metric)renderLabels()});

// The headline number ("typical"): the contract-weighted average of the medians on screen.
function viewStat(){
  const metric=LABEL.metric,b=map.getBounds(),vis=POINTS.filter(p=>b.contains([p.a.lat,p.a.lng])),N=vis.reduce((s,p)=>s+p.n,0);
  const what=metric==='n'?T('Contracts'):metric==='median_sqm'?T('Typical rent per m²'):metric==='yield'?T('Typical gross yield'):metric==='sale'?T('Typical sale price'):T('Typical yearly rent');
  $('medLabel').textContent=T('{what} in view',{what})+(vis.length?' · '+T.count(vis.length,'area')+T(', ')+($('unit').value?T.unit($('unit').value):TYPENAME()).toLowerCase():'');
  if(!vis.length||!N){odometer($('med'),null);
    const perUnitOnly=!$('unit').value&&AREAS.some(a=>a.median_kind==='unit'&&a.lat!=null&&b.contains([a.lat,a.lng]));
    $('medLabel').textContent=perUnitOnly?T('Areas here have figures per unit only: pick a unit (e.g. 1 bed) to see them.'):T('Nothing to show here for {type}. Zoom out to see more.',{type:TYPENAME().toLowerCase()});return}
  const v=metric==='n'?N:vis.reduce((s,p)=>s+p.v*p.n,0)/N;
  if(metric==='yield'){$('med').textContent=v.toFixed(1)+'%';$('med')._sig=null;return}
  const step=metric==='median_sqm'?1:metric==='sale'?1000:100;
  odometer($('med'),metric==='n'?v:Math.round(v/step)*step,metric==='n'?'':'AED ');
}
map.on('moveend',viewStat);

let AREAS=[],ROWS=[],META={},view=[],AGG=false,TYPE='homes';
const CACHE={};
const TYPENAME=()=>(TYPES.find(t=>t[0]===TYPE)||TYPES[0])[1];
async function getJSON(p){const r=await fetch(p,{cache:'no-cache'});if(!r.ok)throw Error(p+' '+r.status);return r.json()}

async function init(){
  try{[META,{areas:AREAS},{rows:ROWS}]=await Promise.all([getJSON('data/meta.json'),getJSON('data/areas.json'),getJSON('data/latest.json')])}
  catch(e){$('rows').innerHTML='<tr><td>'+T('The rent data could not be loaded. Reload the page; if it keeps failing, the daily update has not run yet.')+'</td></tr>';window.atlasState='error';dispatchEvent(new Event('atlas:error'));return}
  CACHE.homes=AREAS;
  AGG=META.mode==='aggregate';
  const age=staleness(META,Date.now());
  // Freshness in one small line under the key figures, not in big type.
  $('fresh').textContent=T('Data to {d} · updated {t} Kuwait time · new data is looked for three times a day',{d:age?niceDate(age.through):'—',
    t:META.generated_at?new Date(META.generated_at).toLocaleString(T.locale,{timeZone:'Asia/Kuwait',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'});
  $('updated').textContent=AGG?T('Median yearly rent by area and unit, last 12 months'):T('Contracts that started in the last 30 days, newest first');
  $('tableTitle').textContent=AGG?T('Rents by area'):T('Newest contracts');
  if(AGG){const o=$('metric').querySelector('option[value=median_sqm]');o.value='yield';o.textContent=T('Yield')}
  if(!AREAS.some(a=>a.sale_median||a.by_unit.some(u=>u.sale))){const o=$('metric').querySelector('option[value=sale]');if(o)o.remove()}
  if(age&&age.stale){
    $('staleText').innerHTML='<b>'+T('This data is {n} days old',{n:age.days})+'</b> '+safe(T('(to {d}).',{d:niceDate(age.through)}))+'<span class="more"> '+
      (AGG?T('Dubai Data has not published a newer update yet, so changes since then are not shown.'):T('The daily update has not brought in newer contracts, so changes since then are not shown.'))+'</span>';
    let hidden=false;try{hidden=sessionStorage.getItem('staleHidden')===age.through}catch(e){}
    if(!hidden){$('stale').classList.add('on');setTimeout(()=>map.invalidateSize(),0)}
  }
  sources();
  const un=META.unmatched_areas||[];$('unmatchedN').textContent=un.length;
  $('unmatched').innerHTML=un.map(x=>'<li>'+safe(x.area)+' <span class="muted">('+fmt(x.n)+')</span></li>').join('')||'<li class="muted">'+T('None')+'</li>';
  fillUnits();buildHome();draw();intro();
  window.atlasState='ready';dispatchEvent(new Event('atlas:ready')); // assets/app/companion.js takes it from here
}

function sources(){
  const s=META.sources||[];
  // Plainly, the sources the figures come from; every source's run status sits folded under "Data health".
  const inUse=s.filter(x=>/^(ok|in use)/.test(x.status||'')).map(x=>x.name);
  $('inUse').innerHTML=(inUse.length?inUse:[T('Dubai Land Department Ejari contracts')]).map(n=>'<li>'+safe(n)+'</li>').join('');
  $('sources').innerHTML=s.map(x=>{const st=x.status||'',cls=/^(ok|in use)/.test(st)?'status-ok':/^(off|no credentials|not run|standby)/.test(st)?'muted':'status-bad';
    return '<li>'+safe(x.name)+': <span class="'+cls+'">'+safe(x.status||T('not run yet'))+'</span>'+(x.last_ok_at?' <span class="muted">('+safe(T('last success {t}',{t:kuwait(x.last_ok_at)}))+')</span>':'')+'</li>'}).join('')||'<li>'+T('Dubai Land Department Ejari contracts')+'</li>';
}

// One home picker: all homes, each home size, and the other property types that have data (e.g. flats of any
// size). An option is a property type and a unit; it fills the type (TYPE) and the hidden #unit behind it.
// A type already covered by a unit (studios) isn't offered twice.
function buildHome(){
  const have=new Set((META.property_types||[{key:'homes'}]).filter(t=>t.key==='homes'||t.n>0).map(t=>t.key));
  const units=[...$('unit').options].map(o=>o.value).filter(Boolean);
  const opts=[['homes','',T('All homes')],...units.map(u=>['homes',u,T.unit(u)])];
  for(const [k,lbl] of TYPES)if(k!=='homes'&&have.has(k)&&!(k==='studio'&&units.some(u=>/^studio/i.test(u))))opts.push([k,'',k==='flat'?T('Flats, any size'):lbl]);
  $('home').innerHTML=opts.map(([k,u,l])=>'<option value="'+safe(k+'|'+u)+'">'+safe(l)+'</option>').join('');
  $('home').value='homes|'+$('unit').value;
}
async function setHome(k,u){
  if(k!==TYPE){TYPE=k;try{AREAS=CACHE[k]||(CACHE[k]=(await getJSON('data/areas_'+k+'.json')).areas)}catch(e){AREAS=[]}}
  unitChosen=true;fillUnits();$('unit').value=[...$('unit').options].some(o=>o.value===u)?u:'';animateLabels=true;draw();
}
// The rent check shares this picker: a visitor's choice here becomes the check's home (companion.js listens),
// and a check sets it here (window.setMapHome). Only the visitor's own change announces itself, so they don't loop.
$('home').addEventListener('change',e=>{const [k,u]=e.target.value.split('|');setHome(k,u||'');
  if(k==='homes')dispatchEvent(new CustomEvent('atlas:home',{detail:{unit:u||''}}))});
window.setMapHome=unit=>{const v='homes|'+(unit||'');if(TYPE==='homes'&&$('unit').value===(unit||''))return;
  if(![...$('home').options].some(o=>o.value===v))return;$('home').value=v;setHome('homes',unit||'')};
let unitChosen=false; // until the visitor picks a unit, the map starts on 1-bedroom: the one measure every area has
function fillUnits(){
  const keep=$('unit').value,units=new Map();
  AREAS.forEach(a=>a.by_unit.forEach(u=>units.set(u.u,(units.get(u.u)||0)+(u.n||0))));
  $('unit').innerHTML='<option value="">'+T('All units')+'</option>'+[...units].sort((a,b)=>b[1]-a[1]).map(([u])=>'<option value="'+safe(u)+'">'+safe(T.unit(u))+'</option>').join('');
  if(units.has(keep))$('unit').value=keep;
  else if(!unitChosen){const d=['1-bedroom apartments','1 bed'].find(x=>units.has(x));if(d)$('unit').value=d}
}

function areaValue(a,metric,unit){
  const u=unit?(a.by_unit.find(x=>x.u===unit)||{}):null;
  // Areas with no all-homes median (Continental Club's older districts) only appear when a unit is
  // picked: their headline is a 1-bedroom median, which must not be coloured or averaged with
  // other areas' all-homes medians.
  if(!u&&a.median_kind==='unit')return null;
  if(metric==='n')return u?u.n:a.n;
  if(metric==='median_sqm')return u?null:a.median_sqm;
  if(metric==='yield')return u?u.yield:a.yield_pct;
  if(metric==='sale')return u?u.sale:a.sale_median;
  return u?u.median:a.median;
}
// A small line chart with its scale: lowest and highest value on the left, first, middle and last month below.
function chart(pts,{label,stroke,h=40}){
  const w=250,gl=40,gb=14,pw=w-gl-4,ph=h-6,vs=pts.map(p=>p.v),lo=Math.min(...vs),hi=Math.max(...vs);
  const y=v=>(3+(hi===lo?.5:1-(v-lo)/(hi-lo))*ph).toFixed(1),x=i=>(gl+i*pw/(pts.length-1)).toFixed(1);
  const num=v=>v>=10000?fmt(Math.round(v/1000))+'k':fmt(Math.round(v));
  const d=pts.map((p,i)=>(i?'L':'M')+x(i)+','+y(p.v)).join('');
  const mid=pts.length>>1,ticks=[[0,'start'],[mid,'middle'],[pts.length-1,'end']];
  return '<svg class="chart" direction="ltr" width="'+w+'" height="'+(h+gb)+'" viewBox="0 0 '+w+' '+(h+gb)+'" role="img" aria-label="'+safe(label)+'">'+
    '<path d="M'+gl+',2V'+(h-1)+'H'+(w-2)+'" fill="none" stroke="var(--line)"/>'+
    (hi!==lo?'<text x="'+(gl-4)+'" y="'+(+y(hi)+3)+'" text-anchor="end">'+num(hi)+'</text>':'')+
    '<text x="'+(gl-4)+'" y="'+(+y(lo)+3)+'" text-anchor="end">'+num(lo)+'</text>'+
    ticks.map(([i,a])=>'<text x="'+x(i)+'" y="'+(h+gb-2)+'" text-anchor="'+a+'">'+safe(pts[i].m)+'</text>').join('')+
    '<path d="'+d+'" fill="none" stroke="'+stroke+'" stroke-width="2"/></svg>';
}
function spark(monthly){
  const pts=(monthly||[]).filter(m=>m.median).map(m=>({m:m.m,v:m.median}));if(pts.length<3)return '';
  return chart(pts,{label:T('Monthly median rent'),stroke:'#C9A227'})+'<br><small>'+safe(T('Monthly median, {a} to {b}',{a:pts[0].m,b:pts.at(-1).m}))+'</small><br>';
}
// Sale price per sq ft, month by month (Dubai Data, months with at least 5 sales), and the change on a year ago.
function saleTrend(a){
  const t=a.sale_trend||[];if(t.length<6)return '';
  const yoy=a.sale_yoy;
  return '<div class="trend"><small>'+T('Sale price per sq ft, {a} to {b}',{a:t[0].m,b:t.at(-1).m})+(yoy!=null?' · <b class="'+(yoy>0?'up':yoy<0?'down':'')+'">'+T('{sign}{v}% on a year ago',{sign:yoy>0?'+':'',v:yoy})+'</b>':'')+'</small>'+
    chart(t.map(x=>({m:x.m,v:x.psf})),{label:T('Sale price per sq ft, monthly'),stroke:'var(--gold-ink)'})+'</div>';
}
function popup(a){
  const types=Object.entries(a.reg_types||{}).map(([k,v])=>safe(k)+' '+fmt(v)).join(', ');
  const aed=v=>'<b>AED '+fmt(v)+'</b>';
  // With a home size picked, the breakdown leads with that home's figure (the one on the map's label),
  // highlights its row, and gives the all-homes figure on the line under it.
  const pick=$('unit').value,pu=pick&&TYPE==='homes'?a.by_unit.find(u=>u.u===pick&&u.median):null;
  const lead=pu?'<p class="lead">'+(pu.n!=null?T('{unit}: median {aed} a year from {n}',{unit:safe(T.unit(pu.u)),aed:aed(pu.median),n:T.count(pu.n,'contract')}):T('{unit}: median {aed} a year',{unit:safe(T.unit(pu.u)),aed:aed(pu.median)}))+
      (pu.yield!=null||pu.sale?'<br>'+[pu.yield!=null?T('Gross yield {v}%',{v:Number(pu.yield).toFixed(1)}):'',pu.sale?T('median sale price AED {v}',{v:fmt(pu.sale)}):''].filter(Boolean).join(T(', ')):'')+'</p>':'';
  // The area-wide figures: the main lines, or a smaller "All homes:" block under the picked home's figure.
  const main=
    (a.median_kind==='unit'?T('Median for {unit} {aed} a year (no all-homes median is published for this area); ',{unit:safe(T.unit(a.median_unit||'')).toLowerCase(),aed:aed(a.median)})
      :a.median_kind==='typical'?T('Typical {aed} a year (average of the bedroom medians below) from ',{aed:aed(a.median)}):T('Median {aed} a year from ',{aed:aed(a.median)}))+T.count(a.n,'contract')+
    (a.p25!=null?'<br>'+T('Middle half pay AED {a} to {b}',{a:fmt(a.p25),b:fmt(a.p75)}):'')+'<br>'+
    (a.median_sqm?T('AED {v} per m² a year',{v:fmt(a.median_sqm)})+'<br>':'')+
    (a.yield_pct!=null?T('Gross yield {v}%',{v:Number(a.yield_pct).toFixed(1)})+(a.sale_median?T(', median sale price AED {v}',{v:fmt(a.sale_median)}):'')+'<br>':'');
  return '<span class="t">'+safe(a.label)+'</span>'+(lead?lead+'<p class="allh">'+T('All homes:')+' '+main+'</p>':main)+
    (types?'<small>'+types+'</small><br>':'')+spark(a.monthly)+saleTrend(a)+
    (a.by_unit.length?'<table><tr><th>'+T('Unit')+'</th><th>'+T('Contracts')+'</th><th>'+T('Median AED')+'</th></tr>'+a.by_unit.slice(0,7).map(u=>'<tr'+(u.n!=null&&u.n<THIN?' class="thin'+(pu&&u.u===pu.u?' pick':'')+'" title="'+safe(T('Fewer than {n} contracts: a thin figure',{n:THIN}))+'"':pu&&u.u===pu.u?' class="pick"':'')+'><td>'+safe(T.unit(u.u))+'</td><td>'+fmt(u.n)+'</td><td>'+fmt(u.median)+'</td></tr>').join('')+'</table>'+(a.by_unit.some(u=>u.n!=null&&u.n<THIN)?'<small>'+T('Italic rows: fewer than {n} contracts, so treat them as a rough guide.',{n:THIN})+'</small><br>':''):'')+
    (a.top_projects&&a.top_projects.filter(p=>p.p!=='—').length?'<table><tr><th>'+T('Busiest buildings')+'</th><th>n</th><th>'+T('Median')+'</th></tr>'+a.top_projects.filter(p=>p.p!=='—').slice(0,5).map(p=>'<tr><td>'+safe(p.p)+'</td><td>'+fmt(p.n)+'</td><td>'+fmt(p.median)+'</td></tr>').join('')+'</table>':'')+
    (a.source==='ccp'?'<small>'+T('Figures:')+' <a href="https://continentalclub.ae/data-center/" target="_blank" rel="noopener">Continental Club Property</a>, CC BY 4.0'+(a.through?T(', to {d}',{d:safe(a.through)}):'')+'.</small><br>':'')+
    // See the place: Google links (open a new tab; Google allows these links without a key) and free photos
    // taken near the point (Wikimedia Commons, filled in when the breakdown opens; see loadPhotos).
    '<p class="see">'+[['https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(a.label+', Dubai'),T('Google Maps')],
      ['https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+a.lat+','+a.lng,T('Street View')],
      ['https://www.google.com/search?tbm=isch&q='+encodeURIComponent(a.label+' Dubai'),T('Photos on Google')]]
      .map(([u,t])=>'<a href="'+safe(u)+'" target="_blank" rel="noopener">'+t+'</a>').join('<span class="sep" aria-hidden="true">·</span>')+'</p>'+
    (a.lat!=null?'<div class="pics" data-lat="'+a.lat+'" data-lng="'+a.lng+'" aria-live="polite"></div>':'')+
    '<small>'+T('DLD area: {list}. The point is an approximate reference for the area, not a building.',{list:a.dld_areas.map(safe).join(', ')})+(a.url?' <a href="'+safe(a.url)+'" target="_blank" rel="noopener">'+T('Dubai Data page')+'</a>':'')+'</small>';
}

// Photos taken near an area's point: freely licensed, from Wikimedia Commons, each credited (author and
// licence) and linked to its page. Asked for only when a breakdown opens, once per point per visit; photos
// only (no maps, logos, plans or diagrams), within 1 km. Nothing found or no answer: nothing is shown.
const PHOTOS={},NOT_PHOTO=/\b(map|logo|flag|plan|diagram|chart|seal|icon|sign|route|course|schematic|location)\b/i;
const stripTags=h=>{const d=document.createElement('div');d.innerHTML=h||'';return d.textContent.replace(/\s+/g,' ').trim()};
function commonsPhotos(json,max=4){
  const pages=Object.values((json&&json.query&&json.query.pages)||{}).sort((p,q)=>(p.index||0)-(q.index||0));
  const out=[];
  for(const p of pages){const ii=p.imageinfo&&p.imageinfo[0];if(!ii||ii.mime!=='image/jpeg'||!ii.thumburl||NOT_PHOTO.test(p.title))continue;
    const m=ii.extmetadata||{},author=stripTags(m.Artist&&m.Artist.value).slice(0,40)||T('unknown author'),lic=stripTags(m.LicenseShortName&&m.LicenseShortName.value)||'';
    out.push({src:ii.thumburl,big:ii.thumburl.replace(/\/\d+px-/,'/960px-'),page:ii.descriptionurl,title:p.title.replace(/^File:/,'').replace(/\.[a-z]+$/i,''),author,lic});
    if(out.length>=max)break}
  return out;
}
function photosFor(lat,lng){
  const k=(+lat).toFixed(4)+','+(+lng).toFixed(4);
  if(!PHOTOS[k])PHOTOS[k]=fetch('https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({action:'query',format:'json',origin:'*',
      generator:'geosearch',ggscoord:lat+'|'+lng,ggsradius:'1000',ggslimit:'20',ggsnamespace:'6',prop:'imageinfo',
      iiprop:'url|mime|extmetadata',iiurlwidth:'330',iiextmetadatafilter:'Artist|LicenseShortName'}))
    .then(r=>r.ok?r.json():null).then(j=>commonsPhotos(j)).catch(()=>[]);
  return PHOTOS[k];
}
async function loadPhotos(e){
  await null; // after other popupopen handlers have set the final content
  const box=e.popup.getElement()&&e.popup.getElement().querySelector('.pics:not([data-done])');if(!box)return;
  box.dataset.done='1';box.classList.add('loading');
  const ph=await photosFor(box.dataset.lat,box.dataset.lng);
  if(!box.isConnected)return; // closed meanwhile (the box may have moved into the phone sheet: same element)
  box.classList.remove('loading');
  if(!ph.length){box.remove();return}
  box.innerHTML='<div class="strip">'+ph.map((p,i)=>'<a href="'+safe(p.page)+'" target="_blank" rel="noopener" data-i="'+i+'" data-big="'+safe(p.big)+'" data-title="'+safe(p.title)+'" data-credit="'+safe(p.author+(p.lic?', '+p.lic:''))+'" title="'+safe(p.title+' · '+p.author+(p.lic?' · '+p.lic:''))+'">'+
    '<img src="'+safe(p.src)+'" alt="'+safe(p.title)+'" loading="lazy" onerror="this.parentNode.remove()"><span>'+safe(p.author)+(p.lic?', '+safe(p.lic):'')+'</span></a>').join('')+'</div>'+
    '<small>'+T('Photos taken near this point, from Wikimedia Commons. Tap one to see it large, with its author and licence.')+'</small>';
}
map.on('popupopen',loadPhotos);
// Pop-ups keep clear of the map's buttons and legend (Leaflet draws controls above pop-ups): the map pans so the
// whole card sits inside these margins, measured from the controls as they are now. Pop-ups read their options
// from this shared object, so updating it covers every pop-up, bound or opened later.
function popupMargins(){
  const box=map.getContainer().getBoundingClientRect(),rects=sel=>[...map.getContainer().parentNode.querySelectorAll(sel)]
    .filter(e=>!e.hidden&&e.offsetParent).map(e=>e.getBoundingClientRect()).filter(r=>r.width);
  const left=Math.max(0,...rects('.leaflet-top.leaflet-left .leaflet-control').map(r=>r.right-box.left));
  const top=Math.max(0,...rects('.leaflet-top.leaflet-right .leaflet-control').map(r=>r.bottom-box.top));
  const bottom=Math.max(0,...rects('.legend').map(r=>box.bottom-r.top));
  const o=L.Popup.prototype.options;
  o.autoPanPaddingTopLeft=L.point(left+10,top+10);o.autoPanPaddingBottomRight=L.point(10,Math.min(bottom,box.height/3)+10);
}
map.whenReady(()=>setTimeout(popupMargins,0));addEventListener('resize',popupMargins);

// Phones and fold phones (860 px and narrower): an area's breakdown slides up from the bottom of the
// screen, full width and scrollable, instead of a small pop-up on the map. The Leaflet pop-up stays
// open but hidden (CSS) and its content moves into the sheet, so everything that hooks into pop-ups
// (photos, "Check a rent here") keeps working; closing either one closes both.
const SHEET_MQ=matchMedia('(max-width:860px)');
let sheetEl=null,sheetPopup=null,sheetReturn=null;
function sheet_(){
  if(sheetEl)return sheetEl;
  sheetEl=document.createElement('div');sheetEl.className='areaSheet';sheetEl.hidden=true;
  sheetEl.setAttribute('role','dialog');sheetEl.setAttribute('aria-label',T('Area details'));sheetEl.tabIndex=-1;
  sheetEl.innerHTML='<div class="grip" aria-hidden="true"></div><button type="button" class="sheetX" aria-label="'+T('Close')+'">×</button><div class="body leaflet-popup-content"></div>';
  document.body.append(sheetEl);
  sheetEl.querySelector('.sheetX').onclick=()=>closeSheet();
  // Swipe down on the top of the sheet to close it.
  let y0=null;
  sheetEl.addEventListener('touchstart',e=>{y0=sheetEl.scrollTop<=0?e.touches[0].clientY:null},{passive:true});
  sheetEl.addEventListener('touchmove',e=>{if(y0==null)return;const dy=e.touches[0].clientY-y0;if(dy>0)sheetEl.style.transform='translateY('+dy+'px)'},{passive:true});
  sheetEl.addEventListener('touchend',e=>{if(y0==null)return;const dy=e.changedTouches[0].clientY-y0;y0=null;sheetEl.style.transform='';if(dy>80)closeSheet()});
  return sheetEl;
}
function closeSheet(fromMap){
  if(!sheetEl||sheetEl.hidden)return;
  sheetEl.hidden=true;document.documentElement.classList.remove('sheetOpen');
  const p=sheetPopup;sheetPopup=null;if(!fromMap&&p&&map.hasLayer(p))map.closePopup(p);
  if(sheetReturn&&sheetReturn.isConnected)sheetReturn.focus({preventScroll:true});sheetReturn=null;
}
map.on('popupopen',async e=>{
  if(!SHEET_MQ.matches)return;
  await null;await null; // after loadPhotos has taken hold of its box, and the content is final
  const src=e.popup.getElement()&&e.popup.getElement().querySelector('.leaflet-popup-content');if(!src||!map.hasLayer(e.popup))return;
  const el=sheet_(),body=el.querySelector('.body');
  sheetReturn=document.activeElement&&document.activeElement.closest('.rl')?document.activeElement:null;
  body.replaceChildren(...src.childNodes);body.scrollTop=0;el.scrollTop=0;sheetPopup=e.popup;
  // On a phone the pictures come first: photos and the Google links right under the area's name.
  const head=body.querySelector('.t'),see=body.querySelector('.see'),pics=body.querySelector('.pics');
  if(head){if(see)head.after(see);if(pics)head.after(pics)}
  el.hidden=false;document.documentElement.classList.add('sheetOpen');
  el.focus({preventScroll:true});
});
map.on('popupclose',e=>{if(e.popup===sheetPopup)closeSheet(true)});
map.on('click',()=>closeSheet());
SHEET_MQ.addEventListener('change',()=>closeSheet());

// Photo viewer: a photo from an area's breakdown, large, with its author and licence and a link to its
// Commons page; swipe or use the arrows for the others; Escape or × closes it. Phones and desktop.
let viewer=null,vList=[],vAt=0,vReturn=null;
function showPhoto(i){
  vAt=(i+vList.length)%vList.length;const p=vList[vAt];
  const img=viewer.querySelector('img');img.src=p.big;img.alt=p.title;
  viewer.querySelector('.vCap').innerHTML='<b>'+safe(p.title)+'</b><br>'+safe(p.credit)+' · <a href="'+safe(p.page)+'" target="_blank" rel="noopener">'+T('View on Wikimedia Commons')+'</a>';
  viewer.querySelector('.vCount').textContent=vList.length>1?T('Photo {i} of {n}',{i:vAt+1,n:vList.length}):'';
  viewer.querySelectorAll('.vPrev,.vNext').forEach(b=>b.hidden=vList.length<2);
}
function closeViewer(){if(!viewer||viewer.hidden)return;viewer.hidden=true;document.documentElement.classList.remove('viewerOpen');if(vReturn&&vReturn.isConnected)vReturn.focus({preventScroll:true})}
function openViewer(list,i,from){
  if(!viewer){
    viewer=document.createElement('div');viewer.className='viewer';viewer.hidden=true;viewer.setAttribute('role','dialog');viewer.setAttribute('aria-modal','true');viewer.setAttribute('aria-label',T('Photo'));
    viewer.innerHTML='<button type="button" class="vX" aria-label="'+T('Close')+'">×</button><button type="button" class="vPrev" aria-label="'+T('Previous photo')+'">‹</button>'+
      '<figure><img alt=""><figcaption><span class="vCount"></span><span class="vCap"></span></figcaption></figure><button type="button" class="vNext" aria-label="'+T('Next photo')+'">›</button>';
    document.body.append(viewer);
    viewer.querySelector('.vX').onclick=closeViewer;
    viewer.querySelector('.vPrev').onclick=()=>showPhoto(vAt-1);
    viewer.querySelector('.vNext').onclick=()=>showPhoto(vAt+1);
    viewer.addEventListener('click',e=>{if(e.target===viewer)closeViewer()});
    let x0=null;
    viewer.addEventListener('touchstart',e=>{x0=e.touches[0].clientX},{passive:true});
    viewer.addEventListener('touchend',e=>{if(x0==null)return;const dx=e.changedTouches[0].clientX-x0;x0=null;if(Math.abs(dx)>50)showPhoto(vAt+((dx<0)!==(T.lang==='ar')?1:-1))});
  }
  vList=list;vReturn=from;viewer.hidden=false;document.documentElement.classList.add('viewerOpen');showPhoto(i);viewer.querySelector('.vX').focus();
}
document.addEventListener('click',e=>{
  const a=e.target.closest('.pics .strip a[data-big]');if(!a)return;
  e.preventDefault();
  const list=[...a.closest('.strip').querySelectorAll('a[data-big]')].map(x=>({big:x.dataset.big,title:x.dataset.title,credit:x.dataset.credit,page:x.href}));
  openViewer(list,[...a.closest('.strip').querySelectorAll('a[data-big]')].indexOf(a),a);
});
addEventListener('keydown',e=>{
  if(viewer&&!viewer.hidden){if(e.key==='Escape'){e.stopPropagation();closeViewer()}else if(e.key==='ArrowRight')showPhoto(vAt+(T.lang==='ar'?-1:1));else if(e.key==='ArrowLeft')showPhoto(vAt+(T.lang==='ar'?1:-1));return}
  if(e.key==='Escape')closeSheet();
},true);

// The legend folds to its colour bar; phones start folded, so more of the map shows.
const legendFolded=()=>{try{const v=localStorage.getItem('legendFolded');if(v)return v==='1'}catch(e){}return SHEET_MQ.matches};
$('legend').addEventListener('click',e=>{if(!e.target.closest('.t'))return;const now=!$('legend').classList.contains('folded');
  try{localStorage.setItem('legendFolded',now?'1':'0')}catch(_){}
  $('legend').classList.toggle('folded',now);e.target.closest('.t').setAttribute('aria-expanded',!now);popupMargins();renderLabels()});
L.DomEvent.disableClickPropagation($('legend'));
function draw(){
  // The finder above the table filters the table only; the map always shows every area.
  const q=$('search').value.trim().toLowerCase(),unit=$('unit').value,metric=$('metric').value,min=+$('min').value||0,max=+$('max').value||Infinity;
  const match=a=>!q||(a.label+' '+a.dld_areas.join(' ')+' '+(a.top_projects||[]).map(p=>p.p).join(' ')).toLowerCase().includes(q);
  const shown=AREAS.filter(a=>a.lat!=null);
  POINTS=[];for(const a of shown){const v=areaValue(a,metric,unit);if(v==null)continue;const bu=unit?(a.by_unit.find(u=>u.u===unit)||{}):null;
    // Weight for averages: the unit's contracts; where a source gives none per unit, a rough share of the area total.
    const n=bu?(bu.n!=null?bu.n:Math.round(a.n/Math.max(1,a.by_unit.length)))||0:a.n;
    // Thin: a figure from fewer than THIN contracts (where the source gives a count) is drawn dashed and italic.
    const thin=bu?(bu.n!=null&&bu.n<THIN):a.n<THIN;POINTS.push({a,v,n,thin})}
  const vals=POINTS.map(p=>p.v).sort((a,b)=>a-b);
  const sc=scaleFor(vals),colorOf=sc.colorOf;
  LABEL={metric,colorOf,inkOf:sc.inkOf,top:sc.hi||1,lo:sc.lo};renderLabels();viewStat();drawOutlines();setTimeout(popupMargins,0);
  const f=metric==='yield'?(v=>Number(v).toFixed(1)+'%'):metric==='n'?fmt:(v=>'AED '+compact(v));
  $('legend').hidden=!vals.length;
  // The key: a value at every step (the first and last also cover everything below and above them), and a
  // title button that folds the notes away, leaving just the colour bar (remembered on this device).
  const ticks=vals.length?Array.from({length:7},(_,i)=>f(sc.lo+(sc.hi-sc.lo)*i/6).replace(/^AED /,'')):[];
  $('legend').innerHTML='<button type="button" class="t" aria-expanded="'+!legendFolded()+'">'+(metric==='n'?T('Contracts'):metric==='yield'?T('Typical gross yield'):metric==='sale'?T('Typical sale price'):metric==='median_sqm'?T('Typical rent per m²'):T('Typical yearly rent'))+(metric==='yield'||metric==='n'?'':' <span class="u">(AED)</span>')+'<span class="chev" aria-hidden="true"></span></button>'+
    '<div class="ramp">'+BANDS.map(c=>'<i style="background:'+c+'"></i>').join('')+'</div><div class="ticks" title="'+safe(T('Below the first value: the lightest blue; above the last: the darkest'))+'">'+ticks.map(t=>'<span>'+t+'</span>').join('')+'</div>';
  $('legend').classList.toggle('folded',legendFolded());
  if(metric!=='median'&&AREAS.some(a=>a.lat!=null&&areaValue(a,'median',unit)!=null&&areaValue(a,metric,unit)==null))
    $('legend').insertAdjacentHTML('beforeend','<div class="note">'+T('Older districts have rents only, so they show in the rent view.')+'</div>');
  if(POINTS.some(p=>p.thin))$('legend').insertAdjacentHTML('beforeend','<div class="note"><span class="thinMark"></span>'+T('Dashed: fewer than {n} contracts',{n:THIN})+'</div>');
  syncViews();
  if(!$('unit').value&&AREAS.some(a=>a.median_kind==='unit'))$('legend').insertAdjacentHTML('beforeend','<div class="note">'+T('Older districts (no all-homes median): pick a unit to see them')+'</div>');
  const all=AREAS.reduce((s,a)=>s+a.n,0),placed=shown.reduce((s,a)=>s+a.n,0);
  odometer($('n12'),all);
  $('mapped').innerHTML=(all?safe((Math.floor(placed/all*1000)/10).toFixed(1))+'%':'—')+'<small>'+safe(T('of these contracts'))+'</small>';
  $('nAreas').textContent=fmt(shown.length);
  const kinds=KIND_IN[TYPE];
  const rowKind=r=>AGG?(/^studio/i.test(r.u)?'studio':/apartment/i.test(r.u)?'flat':null):(r.k||'flat');
  view=ROWS.filter(r=>(!kinds||kinds.includes(rowKind(r))||(AGG&&TYPE==='homes'))&&(!unit||r.u===unit)&&r.a>=min&&r.a<=max&&(!q||[r.c,r.ar,r.mp,r.p].filter(Boolean).join(' ').toLowerCase().includes(q)));
  table();
}
function table(){
  const tb=$('rows');tb.replaceChildren();
  const cell=(tr,v,r)=>{const td=document.createElement('td');td.textContent=v;if(r)td.className='r';tr.append(td)};
  if(AGG){
    const m=$('metric').value,one=$('unit').value; // one home size picked: it goes in the subtitle, not on every row
    $('tableTitle').textContent=m==='sale'?T('Sale prices by area'):m==='yield'?T('Yields by area'):T('Rents by area');
    $('updated').textContent=(m==='sale'?T('Median sale price by area and unit, from registered sales'):m==='yield'?T('Gross rental yield by area and unit'):T('Median yearly rent by area and unit, last 12 months'))+(one?' · '+T.unit(one):'')+(m==='yield'?'':' · AED');
    // Short headers (the subtitle says medians in AED). On phones only the view's own figure and contracts show
    // (class "opt" hides the rest); the CSV keeps every column.
    const o=k=>(k==='a'?m==='median':k==='s'?m==='sale':m==='yield')?'r':'r opt';
    $('thead').innerHTML='<tr><th>'+T('Area')+' <small>'+T('DLD area')+'</small></th>'+(one?'':'<th class="opt">'+T('Unit')+'</th>')+'<th class="'+o('a')+'">'+T('Rent')+'</th><th class="r">'+T('Contracts')+'</th><th class="'+o('s')+'">'+T('Sale price')+'</th><th class="'+o('y')+'">'+T('Yield')+'</th></tr>';
    // The view's own column leads: rows sorted by it, highest first, when sale price or yield is shown.
    const key=m==='sale'?'s':m==='yield'?'y':null,rows=key?[...view].sort((x,y)=>(y[key]??-1)-(x[key]??-1)):view;
    for(const r of rows){const tr=document.createElement('tr');{const td=document.createElement('td');td.className='w';td.append(r.c);if(r.ar&&r.ar!==r.c){const sm=document.createElement('small');sm.textContent=r.ar;td.append(sm)}tr.append(td)}if(!one){cell(tr,T.unit(r.u));tr.lastChild.className='u opt'}cell(tr,fmt(r.a),1);tr.lastChild.className=o('a');cell(tr,fmt(r.n),1);cell(tr,r.s?fmt(r.s):'',1);tr.lastChild.className=o('s');cell(tr,r.y!=null?pct(r.y):'',1);tr.lastChild.className=o('y');tb.append(tr)}
    if(!view.length)tb.innerHTML='<tr><td colspan="'+(one?5:6)+'">'+T('No areas match. Clear the search or widen the rent range.')+'</td></tr>';
    return;
  }
  $('thead').innerHTML='<tr><th>'+T('Start')+'</th><th>'+T('Area')+'</th><th>'+T('Building')+'</th><th>'+T('Unit')+'</th><th class="r">'+T('Yearly rent (AED)')+'</th><th class="r">m²</th><th class="r">'+T('AED per m²')+'</th><th>'+T('New or renewal')+'</th></tr>';
  for(const r of view.slice(0,500)){const tr=document.createElement('tr');
    cell(tr,r.s);cell(tr,r.c);cell(tr,r.p||r.mp||'');cell(tr,T.unit(r.u));tr.lastChild.className='u';cell(tr,fmt(r.a),1);cell(tr,r.sq?fmt(r.sq):'',1);cell(tr,r.sq?fmt(r.a/r.sq):'',1);cell(tr,r.t);tb.append(tr)}
  if(!view.length)tb.innerHTML='<tr><td colspan="8">'+T('No contracts match. Clear the search or widen the rent range.')+'</td></tr>';
  else if(view.length>500)tb.insertAdjacentHTML('beforeend','<tr><td colspan="8" class="muted">'+T('Showing the newest 500 of {n}. Download the CSV for all of them.',{n:fmt(view.length)})+'</td></tr>');
}

let typing;
['search','min','max'].forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(typing);typing=setTimeout(()=>{animateLabels=true;draw()},150)}));
$('metric').addEventListener('change',()=>{animateLabels=true;draw()});
const csvCell=x=>{const s=String(x??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
$('export').onclick=()=>{
  const [head,keys,name]=AGG?[['area','dld_area','unit','median_yearly_rent_aed','contracts_12m','median_sale_price_aed','gross_yield_pct'],['c','ar','u','a','n','s','y'],'dubai-real-estate-by-area.csv']
    :[['start','end','yearly_rent_aed','size_sqm','unit','new_or_renewal','dld_area','area','master_project','building','type'],['s','e','a','sq','u','t','ar','c','mp','p','k'],'dubai-ejari-rents.csv'];
  const url=URL.createObjectURL(new Blob([[head.join(','),...view.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('staleX').onclick=()=>{$('stale').classList.remove('on');try{sessionStorage.setItem('staleHidden',(staleness(META,Date.now())||{}).through||'')}catch(e){}map.invalidateSize()};

let lenis=null;
// Smooth scrolling (Lenis). The map and the table keep their own scrolling.
if(window.Lenis&&FX){lenis=new Lenis({lerp:.12,wheelMultiplier:1});G.ticker.add(t=>lenis.raf(t*1000));G.ticker.lagSmoothing(0)}

// One opening moment: the sign's title sets in letter by letter (React Bits SplitText, ported), then the number rolls up.
function intro(){
  if(!FX||T.lang==='ar')return; // splitting letters would break Arabic letter joining
  const h=$('title'),txt=h.textContent;h.setAttribute('aria-label',txt);
  h.innerHTML=txt.split(' ').map(w=>'<span style="display:inline-block;white-space:nowrap">'+[...w].map(c=>'<span class="ch" aria-hidden="true">'+safe(c)+'</span>').join('')+'</span>').join(' ');
  G.from('#title .ch',{yPercent:60,opacity:0,duration:.6,ease:'power3.out',stagger:.025});
}
// Dark / light mode. Follows the device until the visitor picks one; the choice is remembered on this device only.
const SUN='<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>';
const MOON='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
function paintToggle(){const dark=document.documentElement.dataset.theme==='dark',b=$('theme');
  b.querySelector('svg').innerHTML=dark?SUN:MOON;b.querySelector('span').textContent=dark?T('Light'):T('Dark');
  b.setAttribute('aria-label',dark?T('Switch to light mode'):T('Switch to dark mode'))}
function setTheme(t,save){document.documentElement.dataset.theme=t;if(save)try{localStorage.setItem('theme',t)}catch(e){}paintToggle();restyleBase();
  if(LABEL.metric)renderLabels()}
$('theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{let saved;try{saved=localStorage.getItem('theme')}catch(_){}if(!saved)setTheme(e.matches?'dark':'light',false)});
paintToggle();
// The base map comes after the rent data, and only once the map is on (or near) the screen: on phones the map
// sits below the first screen, so MapLibre (1 MB) isn't fetched by visitors who never scroll to it.
init().finally(()=>{loadOutlines();const el=$('map');if(!('IntersectionObserver' in window))return vectorBase();
  const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();vectorBase()}},{rootMargin:'400px'});io.observe(el)});
