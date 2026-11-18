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

// Which features get used (GoatCounter events: a feature's name and, at most, the choice made, such as the view
// or the home size; nothing personal, nothing about the visitor). Same counter as the rent check's.
const countUse=(what,title)=>{try{window.goatcounter&&window.goatcounter.count&&window.goatcounter.count({path:location.host+'/dubai_map/event/'+what,title:title||what,event:true})}catch(e){}};
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
  L.DomEvent.on(a,'click',e=>{L.DomEvent.stop(e);fitDubai(true);countUse('all-dubai')})}
// "Near me": the map moves to where the visitor is (asked once by the browser). The position is used on this
// device only, never sent or stored; outside Dubai, the map stays and says so.
const mapNote=t=>{let n=document.querySelector('.mapNote');if(!n){n=document.createElement('div');n.className='mapNote';n.setAttribute('role','status');map.getContainer().parentNode.append(n)}
  n.textContent=t;n.hidden=false;clearTimeout(n._t);n._t=setTimeout(()=>{n.hidden=true},5000)};
let youAre=null;
if(navigator.geolocation){const a=L.DomUtil.create('a','near',map.zoomControl.getContainer());
  a.href='#';a.role='button';a.textContent=T('Near me');a.title=T('Show where I am');
  L.DomEvent.on(a,'click',e=>{L.DomEvent.stop(e);countUse('near-me');
    navigator.geolocation.getCurrentPosition(p=>{const ll=[p.coords.latitude,p.coords.longitude];
      if(ll[0]<24.6||ll[0]>25.45||ll[1]<54.85||ll[1]>56.4){mapNote(T('You seem to be outside Dubai.'));return}
      if(youAre)youAre.remove();youAre=L.circleMarker(ll,{className:'you',radius:7,weight:3,interactive:false}).addTo(map);
      map.setView(ll,14)},()=>mapNote(T('Your location isn’t available. Check that this site may use it.')),{timeout:10000,maximumAge:60000})})}
// A merged label names its busiest area and how many others it holds ("JLT +12"), so it says where it is.
// Names are shortened here, once (the label's CSS doesn't cut them again), so "+N" always shows.
const cut=(t,n)=>t.length>n?t.slice(0,n-1).trimEnd()+'…':t;
const groupName=g=>{const top=g.reduce((a,b)=>b.n>a.n?b:a,g[0]).a.label;return cut(T.place(top),22)+' +'+(g.length-1)};
const labelName=g=>g.length===1?cut(T.place(g[0].a.label),28):groupName(g);
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
  for(const [m,txt] of [['median',T('Rent')],['sale',T('Sale price')],['yield',T('Yield')],['hotels',T('Hotels')]]){
    const b=L.DomUtil.create('button','',g);b.type='button';b.dataset.m=m;b.textContent=txt;
    L.DomEvent.on(b,'click',e=>{L.DomEvent.stop(e);const sel=$('metric');if(sel.value===m)return;sel.value=m;sel.dispatchEvent(new Event('change'));countUse('view-'+m)})}
  const n=L.DomUtil.create('button','names',d);n.type='button';n.hidden=true;n.innerHTML='<span aria-hidden="true"><span lang="en">A</span>+<span lang="ar">ع</span></span><span class="vh">'+safe(T('Place names in English and Arabic'))+'</span>';
  n.title=T('Place names in English and Arabic');
  L.DomEvent.on(n,'click',e=>{L.DomEvent.stop(e);mapBoth=!mapBoth;try{localStorage.setItem('mapBoth',mapBoth?'1':'0')}catch(_){}applyMapLang();if(mapBoth)countUse('map-names-both')});
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
let BUDGET=null;const OUTSIDE=new Set(); // budget mode (draw): the yearly rent range, and the areas with a figure outside it
const cssVar=v=>{const m=/^var\((--[\w-]+)\)$/.exec(v||'');return m?getComputedStyle(document.documentElement).getPropertyValue(m[1]).trim():v};
function drawOutlines(){
  outlineLayer.clearLayers();if(!OUTLINES||!LABEL.colorOf)return;
  const byLabel=new Map(POINTS.map(p=>[p.a.label,p]));
  for(const o of OUTLINES){const p=byLabel.get(o.label);
    // Budget mode: an area with a figure but outside the budget keeps a faint grey outline, so the ones that fit stand out.
    if(!p){if(BUDGET&&OUTSIDE.has(o.label))L.polygon(o.rings.map(r=>r.map(([x,y])=>[y,x])),{pane:'outlines',interactive:false,color:'#8A7F72',weight:.6,opacity:.5,fillColor:'#5E564C',fillOpacity:.22,className:'outBudget'}).addTo(outlineLayer);continue}
    const hc=LABEL.metric==='hotels'&&!hotelPriced(),col=hc?'#C9A227':cssVar(LABEL.colorOf(p.v)); // hotels: gold leaf (prices keep the blue scale)
    // In budget mode the areas that fit light up: a gold-leaf edge and a stronger fill (cheap areas are the palest blues).
    L.polygon(o.rings.map(r=>r.map(([x,y])=>[y,x])),BUDGET?{pane:'outlines',interactive:false,color:'#C9A227',weight:2,opacity:.95,fillColor:col,fillOpacity:.6,className:'inBudget'}
      :{pane:'outlines',interactive:false,color:col,weight:1,opacity:.7,fillColor:col,fillOpacity:hc?.2:.32}).addTo(outlineLayer)}
}
// What changed since the previous publication (history.py), for the rent check's "since your last visit". Optional.
window.CHANGES=null;getJSON('data/changes.json').then(d=>{window.CHANGES=d;dispatchEvent(new Event('atlas:changes'))}).catch(()=>{});
function loadOutlines(){getJSON('data/outlines.json').then(d=>{OUTLINES=d.areas||[];NEAR=null;HOTEL_BY=null;if($('metric').value==='hotels')draw();drawOutlines();drawFocus();if(CMP)drawCompare();if(WALK)draw()}).catch(()=>{});loadTransit()}
// Focus on one area: tapping its label zooms to its official outline, darkens and dims everything else,
// rings the area in gold and opens its breakdown. Closing the breakdown (×, Escape, a tap on the map)
// brings the rest of the map back. Without an outline the map zooms to the area's point instead.
const focusLayer=L.layerGroup().addTo(map);let FOCUS=null,focusPopup=null;
const MARKERS=new Map(); // area label → its own (single) label marker at this zoom
const outlineOf=a=>OUTLINES&&OUTLINES.find(o=>o.label===a.label);
const outlineLatLngs=o=>o.rings.map(r=>r.map(([x,y])=>[y,x]));
function drawFocus(){
  focusLayer.clearLayers();map.getContainer().classList.toggle('focusing',!!FOCUS);if(!FOCUS)return;
  const o=outlineOf(FOCUS);if(!o)return;
  const rings=outlineLatLngs(o),world=[[-85,-179],[-85,179],[85,179],[85,-179]];
  L.polygon([world,...rings],{pane:'outlines',interactive:false,stroke:false,fillColor:'#000',fillOpacity:.42,className:'focusMask'}).addTo(focusLayer);
  L.polygon(rings,{pane:'outlines',interactive:false,color:'#C9A227',weight:3.5,opacity:1,fill:false,className:'focusRing'}).addTo(focusLayer);
}
function clearFocus(){if(!FOCUS)return;FOCUS=null;focusPopup=null;drawFocus();document.querySelectorAll('.rl.focus').forEach(e=>e.classList.remove('focus'))}
// The area's breakdown never covers the area. On a computer the card hangs from the area's top edge (the top of
// its outline, centred) instead of from its label in the middle; on a phone it is the sheet at the bottom. The card
// opens first, then the map fits the area into the room the card actually leaves (above the sheet, or under the
// card and clear of the buttons and legend), and fits again if photos make the card taller.
const focusBounds=a=>{const o=outlineOf(a);return o?L.latLngBounds(outlineLatLngs(o).flat()):L.latLng(a.lat,a.lng).toBounds(1800)};
const focusMaxH=()=>Math.max(220,Math.round(map.getSize().y*.58)); // leaves the area at least 40% of the map
function openArea(a){
  const b=focusBounds(a),at=L.latLng(b.getNorth(),b.getCenter().lng),html=popup(a);
  // A breakdown already open (e.g. the home changed): replace it without letting its closing end the focus.
  if(focusPopup&&map.hasLayer(focusPopup)){relabelKeep=true;map.closePopup(focusPopup);relabelKeep=false}
  focusPopup=L.popup({maxWidth:320,autoPan:false,focusCard:true,offset:L.point(0,-2)}).setLatLng(at).setContent(html).openOn(map);
  document.querySelectorAll('.rl').forEach(e=>e.classList.toggle('focus',e.dataset.area===a.label));
  requestAnimationFrame(()=>requestAnimationFrame(()=>fitFocus(a)));
}
function fitFocus(a){
  if(FOCUS!==a||!focusPopup||!map.hasLayer(focusPopup))return;
  const o=L.Popup.prototype.options,s=map.getSize(),tl0=o.autoPanPaddingTopLeft||L.point(10,10),br0=o.autoPanPaddingBottomRight||L.point(10,10);
  let tl,br;
  if(SHEET_MQ.matches){
    if(!sheetEl||sheetEl.hidden)return;
    const wrap=map.getContainer().parentNode;let box=map.getContainer().getBoundingClientRect();
    // The map off the top of the screen or low on it: bring its top up, as Compare does.
    if(box.top<-4||box.top>innerHeight*.2){const y=wrap.getBoundingClientRect().top+scrollY-8;let ln=null;try{ln=lenis}catch(_){} // lenis is set up later in the file
      if(ln)ln.scrollTo(y,{immediate:true,force:true});else scrollTo(0,y);box=map.getContainer().getBoundingClientRect()}
    const sheetTop=innerHeight-sheetEl.offsetHeight; // fixed to the bottom; measured from its size, not mid-animation
    const hidden=Math.max(0,box.bottom-sheetTop);
    tl=L.point(tl0.x,tl0.y);br=L.point(10,hidden+12);
    if(s.y-tl.y-br.y<120)tl=L.point(10,10); // a short strip: use it all, under the buttons if need be
  }else{
    // Above the area, or beside it (to its right) when that shows the area larger: maps on computers are wide.
    const card=focusPopup.getElement();if(!card)return;
    const b=focusBounds(a),place=side=>{card.classList.toggle('side',side);
      const w=card.offsetWidth,h=card.offsetHeight;
      focusPopup.options.offset=side?L.point(Math.round(w/2)+14,Math.round(h/2)):L.point(0,-2);
      focusPopup.setLatLng(side?L.latLng(b.getCenter().lat,b.getEast()):L.latLng(b.getNorth(),b.getCenter().lng));return {w,h}};
    const top=place(false),pTop={tl:L.point(tl0.x,tl0.y+top.h+8),br:L.point(br0.x,br0.y)};
    const side=place(true),pSide={tl:L.point(tl0.x,tl0.y),br:L.point(Math.max(br0.x,side.w+24),br0.y)};
    const z=p=>map._getBoundsCenterZoom(b,{paddingTopLeft:p.tl,paddingBottomRight:p.br,maxZoom:16}).zoom;
    const useSide=side.h<=s.y-tl0.y-br0.y-8&&z(pSide)>z(pTop);
    if(!useSide)place(false);
    ({tl,br}=useSide?pSide:pTop);
  }
  if(s.y-tl.y-br.y<60||s.x-tl.x-br.x<60)return;
  const t=map._getBoundsCenterZoom(focusBounds(a),{paddingTopLeft:tl,paddingBottomRight:br,maxZoom:16});
  const d=map.latLngToContainerPoint(t.center).distanceTo(map.latLngToContainerPoint(map.getCenter()));
  if(t.zoom===map.getZoom()&&d<4)return;
  if(FX)map.flyTo(t.center,t.zoom,{duration:.6});else map.setView(t.center,t.zoom,{animate:false});
}
function focusArea(a){
  if(a.lat==null)return;
  if(CMP||CMP_PICK)closeCompare(); // a single area replaces a comparison
  // Already in focus with its breakdown open (e.g. the rent check re-checking after a home change): nothing to do.
  if(FOCUS&&FOCUS.label===a.label&&focusPopup&&map.hasLayer(focusPopup))return;
  focusPopup=null;map.closePopup();FOCUS=a;drawFocus();countUse('area-focus');
  openArea(a);
}
window.focusArea=focusArea;
let relabelKeep=false;
map.on('popupclose',e=>{if(!relabelKeep&&FOCUS&&focusPopup&&e.popup===focusPopup)clearFocus()});
// Metro and Tram (data/transit.json: OpenStreetMap lines and stations, collector/transit.py; distances in
// transit.js). A "Metro" button on the zoom bar shows the lines and stations; the "Near Metro / Tram" filter keeps
// only the areas within a 10- or 20-minute walk of a station (straight line to the area's official boundary) and
// names the station where that home is cheapest. Tapping a station says what homes within a walk typically cost.
// Without the file (not fetched yet, or offline) the button and filter stay hidden and the map works as before.
map.createPane('transit');map.getPane('transit').style.zIndex=395;
const transitLayer=L.layerGroup();let TRANSIT=null,NEAR=null,WALK=0,transitOn=false;
const LINE_NAMES={'red-line':'Red Line','green-line':'Green Line','dubai-tram':'Dubai Tram'};
// Line colours from the map's own theme: Metro in the brand's oxblood, Tram in its gold leaf, so the two systems
// differ at a glance and sit with the header, the gold label edges and the blue price areas (OpenStreetMap's pure
// red and green clashed). At night, lighter tones of the same two. Which Metro line a station is on is in its
// tooltip and breakdown.
const LINE_COLOURS={light:{metro:'#6E2230',tram:'#B8901F'},dark:{metro:'#D99AA5',tram:'#D9B44A'}};
const lineColour=l=>LINE_COLOURS[document.documentElement.dataset.theme==='dark'?'dark':'light'][l.kind]||l.colour;
const lineName=l=>T.lang==='ar'&&l.name_ar?l.name_ar:LINE_NAMES[l.id]?T(LINE_NAMES[l.id]):l.name;
const stationName=s=>T.lang==='ar'&&s.name_ar?s.name_ar:s.name;
const outlinesByLabel=()=>new Map((OUTLINES||[]).map(o=>[o.label,o.rings.map(r=>r.map(([x,y])=>[y,x]))]));
const walkText=w=>w===20?T('20-minute walk'):T('10-minute walk');
function loadTransit(){getJSON('data/transit.json').then(d=>{if(!d||!(d.lines||[]).length)return;TRANSIT=d;NEAR=null;
  transitBtn.hidden=false;walkField.hidden=false;try{if(localStorage.getItem('transit')==='1')showTransit(true,false)}catch(e){}
  if(WALK)draw()}).catch(()=>{})}
// Line and dot sizes by zoom: bold across the whole city, slimmer as the map zooms in, so close up they don't
// cover the streets and the base map's own track (scale 1 at zoom 11 and below, about half at zoom 16).
const transitScale=()=>{const z=map.getZoom();return z<=11?1:Math.max(.5,1-(z-11)*.1)};
let transitParts=[];
// Station dots: small when zoomed out (dozens of stations along a thin line), full size at zoom 13 and 14,
// a little smaller again close up.
const stationScale=()=>({8:.4,9:.45,10:.55,11:.65,12:.8,13:1,14:1,15:.9})[map.getZoom()]||(map.getZoom()<8?.4:.8);
function sizeTransit(){const k=transitScale(),d=stationScale();
  for(const [shape,base] of transitParts)shape instanceof L.CircleMarker?shape.setStyle({weight:Math.max(1,base.weight*d)}).setRadius(Math.max(2,base.radius*d)):shape.setStyle({weight:base.weight*k})}
function drawTransit(){
  transitLayer.clearLayers();transitParts=[];if(!TRANSIT)return;
  const dark=document.documentElement.dataset.theme==='dark',casing=dark?'#1E1712':'#F6F1E7';
  const add=(shape,base)=>{transitParts.push([shape,base]);return shape.addTo(transitLayer)};
  // An ivory casing (espresso at night) lifts each line off the blue price areas.
  for(const l of TRANSIT.lines){const tram=l.kind==='tram';
    for(const p of l.paths){add(L.polyline(p,{pane:'transit',interactive:false,color:casing,weight:tram?6:7.5,opacity:.95,lineCap:'round'}),{weight:tram?6:7.5});
      add(L.polyline(p,{pane:'transit',interactive:false,color:lineColour(l),weight:tram?3:4,opacity:1,lineCap:'round',className:'tline'}),{weight:tram?3:4})}}
  // Stations: paper dots ringed in their system's colour; interchanges larger with a thicker ring.
  for(const s of TRANSIT.stations){const lines=TRANSIT.lines.filter(l=>s.lines.includes(l.id)),swap=lines.length>1,tram=s.kind==='tram';
    const base={radius:swap?6:tram?3.6:4.5,weight:swap?3:2.2};
    const m=add(L.circleMarker([s.lat,s.lng],{pane:'transit',radius:base.radius,weight:base.weight,color:lines[0]?lineColour(lines[0]):casing,fillColor:casing,fillOpacity:1,className:'tstop'}),base)
      .bindTooltip(stationName(s)+' · '+lines.map(lineName).join(' / '),{direction:'top',offset:[0,-6]});
    m.on('click',()=>openStation(s))}
  sizeTransit();
}
map.on('zoomend',()=>{if(transitOn)sizeTransit()});
function showTransit(on,count){transitOn=on;transitBtn.setAttribute('aria-pressed',String(on));transitBtn.classList.toggle('on',on);
  try{localStorage.setItem('transit',on?'1':'0')}catch(e){}
  if(on){drawTransit();transitLayer.addTo(map)}else transitLayer.remove();
  if(count)countUse(on?'metro-on':'metro-off')}
// The nearest station to every placed area (once per data and outlines).
function nearMap(){if(!NEAR&&TRANSIT)NEAR=Transit.nearest(AREAS.filter(a=>a.lat!=null),outlinesByLabel(),TRANSIT.stations);return NEAR}
function openStation(s){
  const w=WALK||10,maxM=Transit.WALKS[w],unit=$('unit').value,metric=$('metric').value;
  const lines=TRANSIT.lines.filter(l=>s.lines.includes(l.id));
  const near=Transit.areasNear(s,AREAS.filter(a=>a.lat!=null),outlinesByLabel(),maxM);
  const vals=near.map(x=>{const a=AREAS.find(y=>y.label===x.label),v=a&&areaValue(a,metric,unit),bu=unit&&a?(a.by_unit.find(u=>u.u===unit)||{}):null;
    return v==null?null:{a,v,m:x.m,n:bu?(bu.n!=null?bu.n:Math.round(a.n/Math.max(1,a.by_unit.length)))||0:a.n}}).filter(Boolean).sort((x,y)=>x.v-y.v);
  const what=(unit?T.unit(unit):TYPENAME()).toLowerCase(),N=vals.reduce((t,x)=>t+x.n,0),avg=N?vals.reduce((t,x)=>t+x.v*x.n,0)/N:null;
  const html='<span class="t">'+safe(stationName(s))+'</span><p class="tlines">'+lines.map(l=>'<span class="tchip" style="--lc:'+lineColour(l)+'">'+safe(lineName(l))+'</span>').join(' ')+'</p>'+
    (avg!=null?'<p>'+T('Typical {what} within a {walk}: <b>{v}</b> ({n})',{what:safe(what),walk:walkText(w),v:safe(labelText(avg,metric)),n:T.count(vals.length,'area')})+'</p>'+
      '<ul class="tnear">'+vals.map(x=>'<li><button type="button" class="link" data-focus="'+safe(x.a.label)+'">'+safe(T.place(x.a.label))+'</button> <b>'+safe(labelText(x.v,metric))+'</b> <span class="muted">'+(x.m?T('{km} km',{km:(x.m/1000).toFixed(1)}):T('station inside'))+'</span></li>').join('')+'</ul>'
      :'<p>'+T('No area with figures for {what} within a {walk}.',{what:safe(what),walk:walkText(w)})+'</p>')+
    '<p class="muted tnote">'+T("Straight-line distance from the station to each area's official boundary. Lines and stations: © OpenStreetMap contributors.")+'</p>';
  clearFocus();L.popup({maxWidth:320}).setLatLng([s.lat,s.lng]).setContent(html).openOn(map);countUse('station');
}
// A tap on an area in a station's breakdown (pop-up or phone sheet) focuses that area.
document.addEventListener('click',e=>{const b=e.target.closest('[data-focus]');if(!b)return;const a=AREAS.find(x=>x.label===b.dataset.focus);if(a){closeSheet();focusArea(a)}});
// The Metro button: fourth on the zoom bar, after Near me.
const transitBtn=L.DomUtil.create('a','near metroBtn',map.zoomControl.getContainer());
transitBtn.href='#';transitBtn.role='button';transitBtn.textContent=T('Metro');transitBtn.title=T('Show Metro and Tram lines');transitBtn.hidden=true;transitBtn.setAttribute('aria-pressed','false');
L.DomEvent.on(transitBtn,'click',e=>{L.DomEvent.stop(e);showTransit(!transitOn,true)});
// The walk filter, next to the budget.
const walkField=(()=>{const f=document.createElement('label');f.className='field f-walk';f.hidden=true;
  f.innerHTML='<span>'+T('Near Metro / Tram')+'</span><select id="walk"><option value="0">'+T('Anywhere')+'</option><option value="10">'+T('10-minute walk')+'</option><option value="20">'+T('20-minute walk')+'</option></select>';
  document.querySelector('.controls .f-range').after(f);return f})();
$('walk').addEventListener('change',()=>{WALK=+$('walk').value;if(WALK&&!transitOn)showTransit(true,false);animateLabels=true;draw();countUse('walk-'+(WALK||'any'))});
// Compare two areas side by side (the collaborator chose it "within the main page"). "Compare" in an area's
// breakdown or the rent check starts it: a bar on the map asks for the second area (tap its label, or one of the
// nearest suggested). The comparison opens over the map (a panel on computers, a sheet on phones), the two areas
// outlined in the theme's gold leaf (A) and oxblood (B) with the rest of the map dimmed. It follows the Home picker,
// has its own link (?compare=A|B) and closes with ×, Escape or a tap on the map. Figures: RentInsights.compare.
let CMP=null,CMP_PICK=null;const cmpLayer=L.layerGroup().addTo(map);
const cmpColour=k=>k==='a'?'#C9A227':document.documentElement.dataset.theme==='dark'?'#D99AA5':'#6E2230';
const pickBar=(()=>{const d=document.createElement('div');d.className='cmpPick';d.hidden=true;d.setAttribute('role','status');map.getContainer().parentNode.append(d);return d})();
const cmpPanel=(()=>{const d=document.createElement('section');d.className='cmpPanel';d.setAttribute('data-lenis-prevent','');d.hidden=true;d.setAttribute('role','dialog');d.setAttribute('aria-label',T('Compare areas'));d.tabIndex=-1;map.getContainer().parentNode.append(d);return d})();
const byLabel=l=>AREAS.find(x=>x.label===l);
function startCompare(label){const a=byLabel(label);if(!a||a.lat==null)return;
  closeCompare(true);CMP_PICK=a;map.closePopup();closeSheet();clearFocus();
  const unit=$('unit').value;
  const sugg=AREAS.filter(x=>x!==a&&x.lat!=null&&RentInsights.unitFigure(x,unit)).map(x=>[x,RentInsights.km(a,x)]).sort((p,q)=>p[1]-q[1]).slice(0,3).map(p=>p[0]);
  pickBar.innerHTML='<p>'+T('Compare <b>{a}</b> with: tap another area on the map, or pick one nearby.',{a:safe(T.place(a.label))})+'</p><div class="cmpSugg">'+
    sugg.map(x=>'<button type="button" class="chip" data-cmp-b="'+safe(x.label)+'">'+safe(T.place(x.label))+'</button>').join('')+
    '<button type="button" class="link" data-cmp-cancel>'+T('Cancel')+'</button></div>';
  pickBar.hidden=false;map.getContainer().classList.add('picking');
  map.getContainer().parentNode.scrollIntoView({behavior:FX?'smooth':'auto',block:'center'});countUse('compare-start');
}
function stopPicking(){CMP_PICK=null;pickBar.hidden=true;map.getContainer().classList.remove('picking')}
pickBar.addEventListener('click',e=>{const b=e.target.closest('[data-cmp-b]');if(b&&CMP_PICK){openCompare(CMP_PICK,byLabel(b.dataset.cmpB));return}if(e.target.closest('[data-cmp-cancel]'))stopPicking()});
L.DomEvent.disableClickPropagation(pickBar);L.DomEvent.disableScrollPropagation(pickBar);
function cmpRings(x){const o=outlineOf(x);return o?outlineLatLngs(o):null}
function drawCompare(){cmpLayer.clearLayers();map.getContainer().classList.toggle('comparing',!!CMP);if(!CMP)return;
  const ra=cmpRings(CMP.a),rb=cmpRings(CMP.b),world=[[-85,-179],[-85,179],[85,179],[85,-179]];
  L.polygon([world,...(ra||[]),...(rb||[])],{pane:'outlines',interactive:false,stroke:false,fillColor:'#000',fillOpacity:.3}).addTo(cmpLayer);
  for(const [k,x,r] of [['a',CMP.a,ra],['b',CMP.b,rb]]){
    if(r)L.polygon(r,{pane:'outlines',interactive:false,color:cmpColour(k),weight:3.5,opacity:1,fillColor:cmpColour(k),fillOpacity:.12}).addTo(cmpLayer);
    else L.circleMarker([x.lat,x.lng],{pane:'outlines',interactive:false,radius:14,color:cmpColour(k),weight:3.5,fillOpacity:.12}).addTo(cmpLayer)}
}
function openCompare(a,b,{fit=true}={}){if(!a||!b||a===b)return;
  stopPicking();map.closePopup();closeSheet();clearFocus();const fresh=cmpPanel.hidden;CMP={a,b};drawCompare();
  // Phones: the map at the top of the screen, so the two areas show above the sheet.
  if(SHEET_MQ.matches){const w=map.getContainer().parentNode,y=w.getBoundingClientRect().top+scrollY-8;if(lenis)lenis.scrollTo(y,{immediate:true,force:true});else scrollTo(0,y)}
  cmpPanel.hidden=false;document.documentElement.classList.add('cmpOpen');renderCompare(fresh);
  if(fit){const pts=[...(cmpRings(a)||[[[a.lat,a.lng]]]).flat(),...(cmpRings(b)||[[[b.lat,b.lng]]]).flat()],s=map.getSize();
    const opts=SHEET_MQ.matches?{paddingTopLeft:L.point(56,20),paddingBottomRight:L.point(20,Math.max(0,Math.round(innerHeight*.6)-(innerHeight-s.y))+20),maxZoom:15}
      :{paddingTopLeft:L.point(70,60),paddingBottomRight:L.point(Math.min(420,s.x*.45)+30,30),maxZoom:15};
    map.flyToBounds(L.latLngBounds(pts),Object.assign({duration:FX?.7:0,animate:FX},opts))}
  writeURL();countUse('compare');cmpPanel.focus({preventScroll:true});
}
function closeCompare(quiet){if(!CMP&&!CMP_PICK)return;stopPicking();CMP=null;drawCompare();cmpPanel.hidden=true;document.documentElement.classList.remove('cmpOpen');if(!quiet)writeURL()}
function compareFromURL(){const v=new URLSearchParams(location.search).get('compare');if(!v)return;const [x,y]=v.split('|').map(byLabel);if(x&&y)openCompare(x,y,{fit:!new URLSearchParams(location.search).get('at')})}
function renderCompare(fresh){if(!CMP)return;
  const {a,b}=CMP,unit=$('unit').value,what=(unit?T.unit(unit):TYPENAME()).toLowerCase(),c=RentInsights.compare(a,b,unit);
  const nm=x=>safe(T.place(x.label)),aedF=v=>v==null?'—':'AED '+fmt(v),fa=c.fa||{},fb=c.fb||{};
  let head;
  if(c.cheaper){const x=c.cheaper==='a'?a:b,y=c.cheaper==='a'?b:a;head=T('<b>{x}</b> is <b>{diff}</b> a year cheaper than {y} for {what}: {pct}% less.',{x:nm(x),y:nm(y),diff:aedF(c.diff),pct:c.pct,what:safe(what)})}
  else if(c.fa&&c.fb)head=T('About the same for {what}: within 3% of each other.',{what:safe(what)});
  else head=T('No figure for {what} in {x}: pick another home size below.',{what:safe(what),x:nm(c.fa?b:a)});
  // A mirrored row: A's value | what it is | B's value, and under it two bars from the centre, each as long as its
  // value against the larger of the two. The better side (lower rent and price, higher yield; not within 3%) is bold.
  const row=(label,va,vb,ta,tb,better)=>{if(ta==='—'&&tb==='—')return '';
    const both=va!=null&&vb!=null&&va>0&&vb>0,mx=both?Math.max(va,vb):0,close=both&&Math.abs(va-vb)/mx<=.03;
    const win=!better||!both||close?'':better==='low'?(va<vb?'a':'b'):(va>vb?'a':'b');
    return '<div class="vsRow"><span class="vsVal a'+(win==='a'?' win':'')+'">'+ta+'</span><span class="vsLbl">'+label+'</span><span class="vsVal b'+(win==='b'?' win':'')+'">'+tb+'</span>'+
      (both?'<span class="vsBars" aria-hidden="true"><i class="a" style="--w:'+(va/mx).toFixed(3)+'"></i><i class="b" style="--w:'+(vb/mx).toFixed(3)+'"></i></span>':'')+'</div>'};
  const near=TRANSIT&&nearMap(),st=x=>{const n=near&&near.get(x.label);return n&&n.station?safe(stationName(n.station))+' <small>'+(n.m?T('{km} km',{km:(n.m/1000).toFixed(1)}):T('in the area'))+'</small>':'—'};
  const pct=v=>v==null?'—':Number(v).toFixed(1)+'%',chg=x=>x.rent_change&&x.rent_change.pct!=null?(x.rent_change.pct>0?'+':'')+x.rent_change.pct+'%':'—';
  const side=(k,x,f)=>'<div class="vsSide '+k+'" style="--k:'+cmpColour(k)+'"><h3>'+nm(x)+'</h3>'+
    '<p class="vsBig" data-v="'+(f.median||'')+'">'+(f.median?'AED '+fmt(f.median):'—')+'</p><p class="vsSub">'+(f.median?T('a year')+(f.n!=null?' · '+T.count(f.n,'contract'):''):safe(T('No figure for {what}',{what})))+'</p></div>';
  cmpPanel.innerHTML='<div class="cmpHead"><h2>'+T('Compare')+'</h2><button type="button" class="cmpBtn" data-cmp-swap title="'+T('Swap')+'" aria-label="'+T('Swap')+'">⇄</button><button type="button" class="cmpBtn" data-cmp-close aria-label="'+T('Close')+'">×</button></div>'+
    '<div class="vsHero">'+side('a',a,fa)+'<span class="vsMid" aria-hidden="true">'+T('vs')+'</span>'+side('b',b,fb)+'</div>'+
    '<p class="vsVerdict">'+head+'</p>'+
    '<section class="vsSec"><h4>'+safe(T('{what}, last 12 months',{what:unit?T.unit(unit):TYPENAME()}))+'</h4>'+
      row(T('Middle half pays'),null,null,fa.p25!=null?aedF(fa.p25)+'–'+fmt(fa.p75):'—',fb.p25!=null?aedF(fb.p25)+'–'+fmt(fb.p75):'—')+
      row(T('Typical sale price'),fa.sale,fb.sale,aedF(fa.sale),aedF(fb.sale),'low')+
      row(T('Gross yield'),fa.yield,fb.yield,pct(fa.yield),pct(fb.yield),'high')+
      row(T('Rent change'),null,null,chg(a),chg(b))+
      (TRANSIT?row(T('Nearest Metro or Tram'),null,null,st(a),st(b)):'')+'</section>'+
    (c.units.length?'<section class="vsSec"><h4>'+T('Typical yearly rent by home size')+'</h4>'+c.units.map(u=>row('<button type="button" class="link" data-cmp-unit="'+safe(u.u)+'"'+(u.u===unit?' aria-current="true"':'')+'>'+safe(T.unit(u.u,true))+'</button>',u.a,u.b,aedF(u.a),aedF(u.b),'low')).join('')+'</section>':'')+
    '<div class="vsFoot"><p>'+(c.km!=null?T('{km} km apart.',{km:c.km})+' ':'')+T('Lower rent and price, and higher yield, are in bold.')+'</p>'+
    '<p class="vsActs"><button type="button" class="btn" data-focus="'+safe(a.label)+'">'+T('Open {x}',{x:nm(a)})+'</button><button type="button" class="btn" data-focus="'+safe(b.label)+'">'+T('Open {x}',{x:nm(b)})+'</button><button type="button" class="link" data-cmp-share>'+T('Copy link')+'</button></p></div>';
  // No photos here: Commons photos near a point are often of people or interiors, which reads as random in a
  // side-by-side; each area's breakdown keeps its photo strip.
  animateCompare(fresh);
}
// Motion (GSAP; none with reduced motion): the panel slides in once, the two rents roll up like the header's
// figure (our version of React Bits' Counter), then the rows settle and their bars grow out from the centre.
function animateCompare(fresh){
  const big=[...cmpPanel.querySelectorAll('.vsBig')];
  for(const el of big){const v=+el.dataset.v;if(v)odometer(el,v,'AED ')}
  if(!FX)return;
  const tl=G.timeline({defaults:{ease:'power3.out'}});
  if(fresh)tl.fromTo(cmpPanel,SHEET_MQ.matches?{y:40,opacity:0}:{x:24,opacity:0},{x:0,y:0,opacity:1,duration:.42,clearProps:'transform,opacity'});
  tl.from(cmpPanel.querySelectorAll('.vsSide,.vsMid,.vsVerdict'),{y:8,opacity:0,duration:.35,stagger:.05},fresh?.12:0)
    .from(cmpPanel.querySelectorAll('.vsRow'),{y:6,opacity:0,duration:.3,stagger:.025},'-=.15')
    .from(cmpPanel.querySelectorAll('.vsBars i'),{scaleX:0,duration:.55,stagger:.02,ease:'power2.out'},'-=.3');
}
cmpPanel.addEventListener('click',async e=>{const t=e.target;
  if(t.closest('[data-cmp-close]'))return closeCompare();
  if(t.closest('[data-cmp-swap]')){CMP={a:CMP.b,b:CMP.a};drawCompare();renderCompare();writeURL();return}
  const u=t.closest('[data-cmp-unit]');if(u){const v=u.dataset.cmpUnit;if(typeof window.setMapHome==='function')window.setMapHome(v);return}
  const f=t.closest('[data-focus]');if(f){const x=byLabel(f.dataset.focus);closeCompare();if(x)focusArea(x);return}
  const sh=t.closest('[data-cmp-share]');if(sh){let ok=false;try{await navigator.clipboard.writeText(location.href);ok=true}catch(_){}sh.textContent=ok?T('Link copied'):location.href;countUse('compare-share')}});
L.DomEvent.disableClickPropagation(cmpPanel);L.DomEvent.disableScrollPropagation(cmpPanel);
addEventListener('keydown',e=>{if(e.key==='Escape'&&(CMP||CMP_PICK)&&!document.querySelector('.areaSheet:not([hidden])'))closeCompare()});
map.on('click',()=>{if(CMP_PICK)return;if(CMP)closeCompare()});
window.startCompare=startCompare;
// Hotels (the collaborator: "a hotels option where rent and sale price are"). A fourth view on the map's bar, shown
// once data/hotels.json loads: every hotel, hotel apartment, hostel and guest house OpenStreetMap knows in Dubai
// (collector/hotels.py, weekly) as small gold-ringed dots, and per-area counts on plain paper labels (counts, not
// prices, so not on the blue scale). The key carries Dubai's official monthly average room rate and occupancy
// (DET via Dubai Pulse, collector/hotel_stats.py) when that file exists. Nightly prices are not shown: booking
// sites' prices are theirs; each hotel links out to look them up.
let HOTELS=null,HOTEL_STATS=null,HOTEL_BY=null,HOTEL_PRICES=null;const hotelLayer=L.layerGroup();
// Nightly prices (LiteAPI, data/hotel_prices.json): each hotel's average over sample nights; an area's figure is the
// median of its hotels' averages. Without that file the view counts places (oxblood badges); with it, prices (blue).
const hotelPriced=()=>!!(HOTELS&&HOTELS.some(h=>h.price));
function attachPrices(){if(!HOTELS)return;const m=new Map(((HOTEL_PRICES&&HOTEL_PRICES.hotels)||[]).map(r=>[r[0]+'|'+r[1]+'|'+r[2],r]));
  HOTELS.forEach(h=>{const r=m.get(h.name+'|'+h.lat+'|'+h.lng);h.price=r?r[3]:null;h.priceN=r?r[4]:0;h.priceLo=r?r[5]:null;h.priceHi=r?r[6]:null});HOTEL_BY=null}
const HOTEL_KIND={hotel:'Hotel',apartments:'Hotel apartments',hostel:'Hostel',guest:'Guest house'};
const hotelName=h=>T.lang==='ar'&&h.name_ar?h.name_ar:h.name;
function loadHotels(){
  getJSON('data/hotels.json').then(d=>{if(!d||!(d.hotels||[]).length)return;
    HOTELS=d.hotels.map((h,i)=>({i,name:h[0],name_ar:h[1],kind:h[2],stars:h[3],lat:h[4],lng:h[5]}));attachPrices();
    const sel=$('metric');if(![...sel.options].some(o=>o.value==='hotels')){const o=document.createElement('option');o.value='hotels';o.textContent=T('Hotels');sel.append(o)}
    if(new URLSearchParams(location.search).get('view')==='hotels')sel.value='hotels';
    syncViews();if(sel.value==='hotels')draw()}).catch(()=>{});
  getJSON('data/hotel_stats.json').then(d=>{HOTEL_STATS=d&&d.latest?d:null;if($('metric').value==='hotels')draw()}).catch(()=>{});
  getJSON('data/hotel_prices.json').then(d=>{if(!d||!(d.hotels||[]).length)return;HOTEL_PRICES=d;attachPrices();if($('metric').value==='hotels')draw()}).catch(()=>{});
}
// Which area each hotel is in (official outline, else the nearest area point within 1.5 km); once per data and outlines.
function hotelsBy(){if(!HOTEL_BY&&HOTELS){HOTEL_BY=new Map();const lab=Transit.assign(HOTELS,AREAS.filter(a=>a.lat!=null),outlinesByLabel());
  HOTELS.forEach((h,i)=>{h.area=lab[i];if(!lab[i])return;const g=HOTEL_BY.get(lab[i])||{n:0,list:[],prices:[]};g.n++;g.list.push(h);if(h.price)g.prices.push(h.price);HOTEL_BY.set(lab[i],g)});
  HOTEL_BY.forEach(g=>{g.typical=g.prices.length?Math.round(median(g.prices)):null})}return HOTEL_BY}
function drawHotels(){hotelLayer.clearLayers();if(!HOTELS||$('metric').value!=='hotels'){hotelLayer.remove();return}
  const dark=document.documentElement.dataset.theme==='dark';
  for(const h of HOTELS){const r=h.stars>=5?4.5:h.stars>=4?4:3.2;
    L.circleMarker([h.lat,h.lng],{pane:'transit',radius:r,weight:1.4,color:dark?'#F6F1E7':'#521825',fillColor:'#C9A227',fillOpacity:1,className:'hdot'})
      .bindTooltip(hotelName(h)+(h.stars?' · '+'★'.repeat(Math.round(h.stars)):'')+(h.price?' · '+T('AED {v} a night',{v:fmt(h.price)}):''),{direction:'top',offset:[0,-4]})
      .on('click',()=>openHotel(h)).addTo(hotelLayer)}
  hotelLayer.addTo(map)}
function openHotel(h){
  const q=encodeURIComponent(h.name+' Dubai'),area=h.area?byLabel(h.area):null;
  const html='<span class="t">'+safe(hotelName(h))+'</span>'+(T.lang!=='ar'&&h.name_ar?'<p class="muted" lang="ar">'+safe(h.name_ar)+'</p>':'')+
    '<p>'+T(HOTEL_KIND[h.kind]||'Hotel')+(h.stars?' · <span aria-label="'+safe(T('{n} stars',{n:h.stars}))+'">'+'★'.repeat(Math.round(h.stars))+'</span>':'')+(area?' · '+safe(T.place(area.label)):'')+'</p>'+hotelPrice(h)+
    '<p class="see hlinks"><a href="https://www.google.com/maps/search/?api=1&query='+q+'" target="_blank" rel="noopener">'+T('Google Maps')+'</a><span class="sep" aria-hidden="true">·</span>'+
    '<a href="https://www.booking.com/searchresults.html?ss='+q+'" target="_blank" rel="noopener">'+T('Prices on Booking.com')+'</a></p>'+
    '<p class="muted tnote">'+T('Place: © OpenStreetMap contributors. Prices are set by the booking site, not this page.')+'</p>';
  clearFocus();L.popup({maxWidth:300}).setLatLng([h.lat,h.lng]).setContent(html).openOn(map);countUse('hotel');
}
// A hotel's price line: its average a night, the range of the sample nights, and what was priced.
function hotelPrice(h){
  if(!HOTEL_PRICES)return '';
  if(!h.price)return '<p class="muted">'+T('No price from our hotel price source for this place yet.')+'</p>';
  return '<p class="lead">'+T('Average {aed} a night',{aed:'<b>AED '+fmt(h.price)+'</b>'})+'</p><p class="muted">'+
    T('Cheapest room for 2 adults, {n} sample nights over the next month (AED {lo} to {hi}); checked {d}.',{n:h.priceN,lo:fmt(h.priceLo),hi:fmt(h.priceHi),d:safe(HOTEL_PRICES.fetched)})+'</p>'}
function hotelLegend(){
  return '<div class="t">'+T('Hotels per area')+'</div>'+hotelNotes()}
function hotelNotes(){
  const st=HOTEL_STATS&&HOTEL_STATS.latest,mon=st?new Date(st.month+'-01T00:00:00').toLocaleDateString(T.lang==='ar'?'ar-AE':'en-GB',{month:'long',year:'numeric'}):'';
  const np=HOTELS?HOTELS.filter(h=>h.price).length:0;
  return '<div class="hkey"><i aria-hidden="true"></i>'+T('{n} hotels, hotel apartments, hostels and guest houses',{n:fmt(HOTELS?HOTELS.length:0)})+'</div>'+
    (st&&st.adr?'<div class="hstat"><b>'+T('Official average room rate: AED {adr} a night',{adr:fmt(Math.round(st.adr))})+'</b><span>'+T('{month}, all of Dubai',{month:safe(mon)})+(st.occupancy!=null?' · '+T('{occ}% of rooms taken',{occ:Math.round(st.occupancy)}):'')+'</span></div>'
      :'<div class="note">'+T("Dubai's official average room rate (DET) shows here once Dubai Pulse access is granted.")+'</div>')+
    (np?'<div class="note">'+T('Prices: {n} places, the cheapest room for 2 adults a night, averaged over sample nights in the next month; an area shows the median of its hotels. Checked {d}.',{n:fmt(np),d:safe(HOTEL_PRICES.fetched)})+'</div>':'')+
    '<div class="note">'+(np?T('Hotels: © OpenStreetMap contributors. Prices: LiteAPI. Tap a hotel for its price and links.'):T('Hotels: © OpenStreetMap contributors. Nightly prices are on booking sites; tap a hotel for links.'))+'</div>';
}
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
function labelText(v,metric){return metric==='hotels'?(hotelPriced()?T('AED {v} a night',{v:compact(v)}):T.count(Math.round(v),'hotel')):metric==='sale'?'AED '+compact(v):metric==='yield'?Number(v).toFixed(1)+'%':metric==='n'?T('{n} contracts',{n:compact(v)}):metric==='median_sqm'?'AED '+fmt(v)+'/m²':'AED '+compact(v)}

// Labels that would overlap at this zoom merge into one label with the contract-weighted average.
function renderLabels(){
  layer.clearLayers();if(!POINTS.length)return;
  const {metric,colorOf}=LABEL;
  // Where labels go (merging, splitting, avoiding the controls) is decided in labels.js, in pixels.
  // Label boxes are measured as drawn (a hidden label with the same styles), so labels keep clear of each other
  // and of the map's buttons in either theme and language.
  const size=(members,val)=>labelBox(labelText(val,metric),labelName(members));
  const items=POINTS.map(p=>{const pt=map.latLngToLayerPoint([p.a.lat,p.a.lng]);return Object.assign({x:pt.x,y:pt.y,lat:p.a.lat,lng:p.a.lng},p)});
  const box=map.getContainer().getBoundingClientRect();
  const blocks=[...map.getContainer().parentNode.querySelectorAll('.leaflet-control,.legend,.mapWideBtn')].map(e=>e.getBoundingClientRect())
    .filter(r=>r.width&&r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top)
    .map(r=>{const c=map.containerPointToLayerPoint([r.left-box.left+r.width/2,r.top-box.top+r.height/2]);return {x:c.x,y:c.y,w:r.width,h:r.height}});
  const v0=map.containerPointToLayerPoint([0,0]),ms=map.getSize(),view={x0:v0.x,y0:v0.y,x1:v0.x+ms.x,y1:v0.y+ms.y};
  const cl=RentLabels.place(items,size,{pad:6,sum:metric==='n'||(metric==='hotels'&&!hotelPriced()),blocks,view});
  const added=[];MARKERS.clear();
  for(const c of cl){const g=c.members,moved=c.lx!==c.x||c.ly!==c.y,pos=moved?map.layerPointToLatLng([c.lx,c.ly]):L.latLng(c.lat,c.lng);
    if(moved){L.polyline([[c.lat,c.lng],pos],{className:'leader',weight:1.5,interactive:false}).addTo(layer);
      L.circleMarker([c.lat,c.lng],{className:'leader dot',radius:3,weight:1.5,interactive:false}).addTo(layer)}
    // The figure sits on a badge in its price-key colour, so the price reads at a glance; the area name underneath.
    const html='<div class="rl'+(c.single?'':' grp')+(g.every(o=>o.thin)?' thin':'')+(c.single&&FOCUS&&g[0].a.label===FOCUS.label?' focus':'')+'"'+(c.single?' data-area="'+safe(g[0].a.label)+'"':'')+' style="--c:'+colorOf(c.val)+';--on:'+LABEL.inkOf(c.val)+'" tabindex="0"><b>'+safe(labelText(c.val,metric))+'</b><small>'+safe(labelName(g))+'</small></div>';
    const m=L.marker(pos,{icon:L.divIcon({className:'rl-wrap',html,iconSize:[0,0]}),riseOnHover:true,keyboard:false,title:c.single?g[0].a.label:g.map(o=>o.a.label).join(', ')}).addTo(layer);
    added.push(m);
    // Keyboard: the label is a button. Enter or Space opens its breakdown, or zooms into a group.
    const el=m.getElement()&&m.getElement().firstChild;
    // Its spoken name is its visible text (rent and area), as WCAG 2.5.3 asks; the marker title lists a group's areas.
    if(el){el.setAttribute('role','button');
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();m.fire('click')}})}
    // The breakdown's tip sits above the label, so the label stays visible under it.
    // One area: zoom to it and set it apart (focusArea); the breakdown opens once the map has arrived.
    if(c.single){MARKERS.set(g[0].a.label,m);m.on('click',()=>{if(CMP_PICK){if(CMP_PICK.label!==g[0].a.label)openCompare(CMP_PICK,g[0].a);return}if(FOCUS&&FOCUS.label===g[0].a.label&&m.isPopupOpen())return;focusArea(g[0].a)})}
    else m.on('click',()=>{const b=L.latLngBounds(g.map(o=>[o.a.lat,o.a.lng])),z=map.getBoundsZoom(b,false,L.point(140,140));
      if(z<=map.getZoom()||map.getZoom()>=16)L.popup({maxWidth:320}).setLatLng([c.lat,c.lng]).setContent('<span class="t">'+T.count(g.length,'area')+'</span>'+((metric==='n'||(metric==='hotels'&&!hotelPriced()))?safe(labelText(c.val,metric)):T('Typical {v}',{v:safe(labelText(c.val,metric))}))+'<br>'+[...g].sort((x,y)=>y.n-x.n).map(o=>safe(T.place(o.a.label))+': <b>'+safe(labelText(o.v,metric))+'</b>').join('<br>')).openOn(map);
      else{clearFocus();map.closePopup();map.flyToBounds(b,{padding:[70,70],maxZoom:16,duration:FX?.6:0,animate:!!FX})}});
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
  if(metric==='hotels'&&hotelPriced()){$('medLabel').textContent=T('Typical hotel price a night in view')+(vis.length?' · '+T.count(vis.length,'area'):'');odometer($('med'),N?Math.round(vis.reduce((s,p)=>s+p.v*p.n,0)/N/10)*10:null,'AED ');return}
  // Until hotel prices exist the figure is a count: it says so in the number itself ("809 places"), so it is never
  // read as a price in the spot where prices go.
  if(metric==='hotels'){const n=vis.reduce((t,p)=>t+p.v,0);$('medLabel').textContent=T('Places to stay in view')+(vis.length?' · '+T.count(vis.length,'area'):'')+' · '+T('no nightly prices yet');
    const m=$('med');m._sig=null;m.textContent=n?fmt(n)+' '+(n===1?T('place'):T('places')):'—';m.setAttribute('aria-label',m.textContent);return}
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
  $('fresh').textContent=T('Data to {d} · updated {t} (Kuwait time) · checked for new data three times a day',{d:age?niceDate(age.through):'—',
    t:META.generated_at?new Date(META.generated_at).toLocaleString(T.locale,{timeZone:'Asia/Kuwait',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'—'});
  $('updated').textContent=AGG?T('Median yearly rent by area and unit, last 12 months'):T('Contracts that started in the last 30 days, newest first');
  $('tableTitle').textContent=AGG?T('Rents by area'):T('Newest contracts');
  if(AGG){const o=$('metric').querySelector('option[value=median_sqm]');o.value='yield';o.textContent=T('Yield')}
  if(!AREAS.some(a=>a.sale_median||a.by_unit.some(u=>u.sale))){const o=$('metric').querySelector('option[value=sale]');if(o)o.remove()}
  // Backup source in use (build.py: Dubai Data stuck for 10+ days): say so, plainly, in the warning sign.
  if(META.backup){
    $('staleText').innerHTML='<b>'+T('Backup figures in use.')+'</b> '+safe(T('Dubai Data has not updated since {d}, so every area now comes from Continental Club Property, by official DLD area: 1-bedroom medians, and fewer areas than usual.',{d:niceDate(META.backup.since)}));
    $('stale').classList.add('on');setTimeout(()=>map.invalidateSize(),0);
  }else if(age&&age.stale){
    $('staleText').innerHTML='<b>'+T('This data is {n} days old',{n:age.days})+'</b> '+safe(T('(to {d}).',{d:niceDate(age.through)}))+'<span class="more"> '+
      (AGG?T('Dubai Data has not published a newer update yet, so changes since then are not shown.'):T('The daily update has not brought in newer contracts, so changes since then are not shown.'))+'</span>';
    let hidden=false;try{hidden=sessionStorage.getItem('staleHidden')===age.through}catch(e){}
    if(!hidden){$('stale').classList.add('on');setTimeout(()=>map.invalidateSize(),0)}
  }
  sources();
  const un=META.unmatched_areas||[];$('unmatchedN').textContent=un.length;
  $('unmatched').innerHTML=un.map(x=>'<li>'+safe(x.area)+' <span class="muted">('+fmt(x.n)+')</span></li>').join('')||'<li class="muted">'+T('None')+'</li>';
  fillUnits();buildHome();const later=readURL();draw();if(later)later();intro();
  window.atlasState='ready';dispatchEvent(new Event('atlas:ready')); // assets/app/companion.js takes it from here
}

function sources(){
  const s=META.sources||[];
  // Plainly, the sources the figures come from; every source's run status sits folded under "Data health".
  const ok=s.filter(x=>/^(ok|in use)/.test(x.status||'')),checks=ok.filter(x=>/cross-check/i.test(x.name)),figs=ok.filter(x=>!/cross-check/i.test(x.name));
  const li=xs=>xs.map(x=>'<li>'+safe(x.name.replace(/,?\s*cross-check$/i,''))+'</li>').join('');
  $('inUse').innerHTML='<p class="srcH">'+T('Figures from')+'</p><ul>'+(figs.length?li(figs):'<li>'+T('Dubai Land Department Ejari contracts')+'</li>')+'</ul>'+
    (checks.length?'<p class="srcH">'+T('Checked against')+'</p><ul>'+li(checks)+'</ul>':'');
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
$('home').addEventListener('change',e=>{const [k,u]=e.target.value.split('|');setHome(k,u||'');countUse('home',k+(u?': '+u:''));
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
  if(metric==='hotels'){const g=hotelsBy(),x=g&&g.get(a.label);return !x?null:hotelPriced()?x.typical:x.n} // places, not prices: any home size
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
// Notes from our own history (history.py) and the cross-checks: change since an earlier publication,
// a big jump not yet confirmed, other sources more than 15% away.
const sinceNote=c=>c&&c.pct!=null?'<small class="chg '+(c.pct>0?'up':c.pct<0?'down':'')+'">'+T('Rent {sign}{pct}% since {date}',{sign:c.pct>0?'+':'',pct:c.pct,date:niceDate(c.since)})+'</small>':'';
const jumpNote=j=>j?'<small class="jump">'+T('Changed {pct}% since the previous update (from AED {from}): waiting for the next update to confirm it.',{pct:(j.pct>0?'+':'')+j.pct,from:fmt(j.from)})+'</small>':'';
function popup(a){
  const types=Object.entries(a.reg_types||{}).map(([k,v])=>safe(k)+' '+fmt(v)).join(', ');
  const aed=v=>'<b>AED '+fmt(v)+'</b>';
  // With a home size picked, the breakdown leads with that home's figure (the one on the map's label),
  // highlights its row, and gives the all-homes figure on the line under it.
  const pick=$('unit').value,pu=pick&&TYPE==='homes'?a.by_unit.find(u=>u.u===pick&&u.median):null;
  const lead=pu?'<p class="lead">'+(pu.n!=null?T('{unit}: median {aed} a year from {n}',{unit:safe(T.unit(pu.u)),aed:aed(pu.median),n:T.count(pu.n,'contract')}):T('{unit}: median {aed} a year',{unit:safe(T.unit(pu.u)),aed:aed(pu.median)}))+
      (pu.yield!=null||pu.sale?'<br>'+[pu.yield!=null?T('Gross yield {v}%',{v:Number(pu.yield).toFixed(1)}):'',pu.sale?T('median sale price AED {v}',{v:fmt(pu.sale)}):''].filter(Boolean).join(T(', ')):'')+(pu.chg?'<br>'+sinceNote(pu.chg):'')+(pu.unconfirmed?'<br>'+jumpNote(pu.unconfirmed):'')+'</p>':'';
  // The area-wide figures: the main lines, or a smaller "All homes:" block under the picked home's figure.
  const main=
    (a.median_kind==='unit'?T('Median for {unit} {aed} a year (no all-homes median is published for this area); ',{unit:safe(T.unit(a.median_unit||'')).toLowerCase(),aed:aed(a.median)})
      :a.median_kind==='typical'?T('Typical {aed} a year (average of the bedroom medians below) from ',{aed:aed(a.median)}):T('Median {aed} a year from ',{aed:aed(a.median)}))+T.count(a.n,'contract')+
    (a.p25!=null?'<br>'+T('Middle half pay AED {a} to {b}',{a:fmt(a.p25),b:fmt(a.p75)}):'')+'<br>'+
    (a.median_sqm?T('AED {v} per m² a year',{v:fmt(a.median_sqm)})+'<br>':'')+
    (a.yield_pct!=null?T('Gross yield {v}%',{v:Number(a.yield_pct).toFixed(1)})+(a.sale_median?T(', median sale price AED {v}',{v:fmt(a.sale_median)}):'')+'<br>':'')+
    (a.rent_change?sinceNote(a.rent_change)+'<br>':'')+(a.unconfirmed?jumpNote(a.unconfirmed)+'<br>':'');
  // In the Hotels view the card leads with the area's places to stay; its rents fold away under them.
  const hv=$('metric').value==='hotels'&&!!HOTELS,figs=(lead?lead+'<p class="allh">'+T('All homes:')+' '+main+'</p>':main)+
    (types?'<small>'+types+'</small><br>':'')+spark(a.monthly)+saleTrend(a)+(hv?'':areaHotels(a))+
    (a.by_unit.length?'<table><tr><th>'+T('Unit')+'</th><th>'+T('Contracts')+'</th><th>'+T('Median AED')+'</th></tr>'+a.by_unit.slice(0,7).map(u=>'<tr'+(u.n!=null&&u.n<THIN?' class="thin'+(pu&&u.u===pu.u?' pick':'')+'" title="'+safe(T('Fewer than {n} contracts: a thin figure',{n:THIN}))+'"':pu&&u.u===pu.u?' class="pick"':'')+'><td>'+safe(T.unit(u.u))+'</td><td>'+fmt(u.n)+'</td><td>'+fmt(u.median)+'</td></tr>').join('')+'</table>'+(a.by_unit.some(u=>u.n!=null&&u.n<THIN)?'<small>'+T('Italic rows: fewer than {n} contracts, so treat them as a rough guide.',{n:THIN})+'</small><br>':''):'')+
    (a.top_projects&&a.top_projects.filter(p=>p.p!=='—').length?'<table><tr><th>'+T('Busiest buildings')+'</th><th>n</th><th>'+T('Median')+'</th></tr>'+a.top_projects.filter(p=>p.p!=='—').slice(0,5).map(p=>'<tr><td>'+safe(p.p)+'</td><td>'+fmt(p.n)+'</td><td>'+fmt(p.median)+'</td></tr>').join('')+'</table>':'')+
    (a.source==='ccp'?'<small>'+T('Figures:')+' <a href="https://continentalclub.ae/data-center/" target="_blank" rel="noopener">Continental Club Property</a>, CC BY 4.0'+(a.through?T(', to {d}',{d:safe(a.through)}):'')+'.</small><br>':'');
  return '<span class="t" data-label="'+safe(a.label)+'">'+safe(T.place(a.label))+'</span>'+
    (hv?hotelSection(a)+'<details class="rentMore"><summary>'+T('Rents in this area')+'</summary>'+figs+'</details>':figs)+
    // See the place: Google links (open a new tab; Google allows these links without a key) and free photos
    // taken near the point (Wikimedia Commons, filled in when the breakdown opens; see loadPhotos).
    '<p class="see">'+[['https://www.google.com/maps/search/?api=1&query='+encodeURIComponent(a.label+', Dubai'),T('Google Maps')],
      ['https://www.google.com/maps/@?api=1&map_action=pano&viewpoint='+a.lat+','+a.lng,T('Street View')],
      ['https://www.google.com/search?tbm=isch&q='+encodeURIComponent(a.label+' Dubai'),T('Photos on Google')]]
      .map(([u,t])=>'<a href="'+safe(u)+'" target="_blank" rel="noopener">'+t+'</a>').join('<span class="sep" aria-hidden="true">·</span>')+'</p>'+
    (a.lat!=null?'<div class="pics" data-lat="'+a.lat+'" data-lng="'+a.lng+'" aria-live="polite"></div>':'')+
    (a.staff?'<p class="staff"><small>'+T('An industrial zone: most homes here are staff accommodation, so rents run well below homes elsewhere. It is left out of comparisons with other areas.')+'</small></p>':'')+
    ((a.disagree||[]).length?'<p class="differ"><small>'+T('Other sources differ by more than 15%:')+' '+a.disagree.map(d=>T('{source}, {unit}: AED {theirs} (ours is {pct}%)',{source:safe(d.source),unit:safe(T.unit(d.unit)),theirs:fmt(d.theirs),pct:(d.pct>0?'+':'')+d.pct})).join('; ')+'. '+T('They count differently (new contracts only, or by DLD area), so treat both as a guide.')+'</small></p>':'')+
    '<small>'+T('DLD area: {list}. The point is an approximate reference for the area, not a building.',{list:a.dld_areas.map(safe).join(', ')})+(a.url?' <a href="'+safe(a.url)+'" target="_blank" rel="noopener">'+T('Dubai Data page')+'</a>':'')+'</small>';
}

// (Other views) Places to stay in the area (OpenStreetMap) and, with prices, their typical price a night.
function areaHotels(a){const g=HOTELS&&hotelsBy(),x=g&&g.get(a.label);if(!x)return '';
  return '<p class="hot">'+T('Places to stay: {n}',{n:fmt(x.n)})+(x.typical?' · '+T('typical {aed} a night ({k} with a price)',{aed:'<b>AED '+fmt(x.typical)+'</b>',k:x.prices.length}):'')+'</p>'}
// Hotels view: an area's card leads with its places to stay, dearest first once prices exist (else by stars),
// each a button that opens that place's own card.
const HOTEL_ROWS=12;
function hotelSection(a){
  const x=hotelsBy()&&hotelsBy().get(a.label);
  if(!x)return '<p class="lead">'+T('No places to stay are mapped in this area.')+'</p>';
  const list=[...x.list].sort((p,q)=>(q.price||0)-(p.price||0)||(q.stars||0)-(p.stars||0)||p.name.localeCompare(q.name));
  const stars=list.slice(0,HOTEL_ROWS).some(h=>h.stars); // no column of blanks when none of them has a rating
  const row=h=>'<tr><td><button type="button" class="hrow" data-h="'+h.i+'">'+safe(hotelName(h))+'</button><small>'+T(HOTEL_KIND[h.kind]||'Hotel')+'</small></td>'+
    (stars?'<td>'+(h.stars?'<span aria-label="'+safe(T('{n} stars',{n:h.stars}))+'">'+'★'.repeat(Math.round(h.stars))+'</span>':'')+'</td>':'')+
    (HOTEL_PRICES?'<td>'+(h.price?fmt(h.price):'—')+'</td>':'')+'</tr>';
  return '<p class="lead">'+(x.typical?T('Typical hotel price {aed} a night',{aed:'<b>AED '+fmt(x.typical)+'</b>'})+'<br>':'')+
      T('{n} places to stay',{n:fmt(x.n)})+(x.typical?T(', {k} with a price',{k:x.prices.length}):'')+'</p>'+
    (HOTEL_PRICES?'':'<p class="muted">'+T('Nightly prices show here once hotel prices are switched on.')+'</p>')+
    '<table class="htab"><tr><th>'+T('Place')+'</th>'+(stars?'<th>'+T('Stars')+'</th>':'')+(HOTEL_PRICES?'<th>'+T('AED a night')+'</th>':'')+'</tr>'+
      list.slice(0,HOTEL_ROWS).map(row).join('')+'</table>'+
    (list.length>HOTEL_ROWS?'<p class="muted">'+T('and {n} more: zoom in to see them on the map.',{n:list.length-HOTEL_ROWS})+'</p>':'')+
    '<p class="see hlinks"><a href="https://www.booking.com/searchresults.html?ss='+encodeURIComponent(a.label+', Dubai')+'" target="_blank" rel="noopener">'+T('Prices on Booking.com')+'</a></p>';
}
// Tapping a place in an area's list opens it (pop-ups and the phone sheet alike).
document.addEventListener('click',e=>{const b=e.target.closest&&e.target.closest('.hrow');if(!b||!HOTELS)return;
  const h=HOTELS[+b.dataset.h];if(!h)return;closeSheet();if(map.getZoom()<15)map.setView([h.lat,h.lng],15,{animate:false});openHotel(h)});
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
  refitPopup(e.popup);box.querySelectorAll('img').forEach(i=>i.addEventListener('load',()=>refitPopup(e.popup),{once:true}));
}
map.on('popupopen',loadPhotos);
map.on('popupopen',e=>{popupMargins();e.popup.options.maxHeight=e.popup.options.focusCard?Math.min(focusMaxH(),L.Popup.prototype.options.maxHeight):L.Popup.prototype.options.maxHeight;refitPopup(e.popup)});
// Pop-ups keep clear of the map's buttons and legend (Leaflet draws controls above pop-ups): the map pans so the
// whole card sits inside these margins, measured from the controls as they are now. Pop-ups read their options
// from this shared object, so updating it covers every pop-up, bound or opened later.
function popupMargins(){
  const box=map.getContainer().getBoundingClientRect(),rects=sel=>[...map.getContainer().parentNode.querySelectorAll(sel)]
    .filter(e=>!e.hidden&&e.offsetParent).map(e=>e.getBoundingClientRect()).filter(r=>r.width);
  const left=Math.max(0,...rects('.leaflet-top.leaflet-left .leaflet-control').map(r=>r.right-box.left));
  const top=Math.max(0,...rects('.leaflet-top.leaflet-right .leaflet-control').map(r=>r.bottom-box.top));
  const bottom=Math.max(0,...rects('.legend').map(r=>box.bottom-r.top));
  const o=L.Popup.prototype.options,bot=Math.min(bottom,box.height/3)+10;
  o.autoPanPaddingTopLeft=L.point(left+10,top+10);o.autoPanPaddingBottomRight=L.point(10,bot);
  // A breakdown never grows taller than the clear space (minus its tip and the label under it): beyond that its
  // content scrolls inside, so the map can always pan the whole card into view.
  o.maxHeight=Math.max(160,Math.floor(box.height-(top+10)-bot-44));
}
map.whenReady(()=>setTimeout(popupMargins,0));addEventListener('resize',popupMargins);
// A tab on the map's edge gives the map more room. Computers (two panes, 1,100 px and up): it slides the side
// panel away so the map fills the window, and back; the choice is remembered on this device. Narrower screens:
// it makes the map full screen until tapped again or Escape. Either way the map re-measures and labels re-place.
const WIDE_MQ=matchMedia('(min-width:1100px)');
const wideBtn=document.createElement('button');wideBtn.type='button';wideBtn.className='mapWideBtn';
wideBtn.innerHTML='<svg class="arr" viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>'+
  '<svg class="fs" viewBox="0 0 24 24" aria-hidden="true"><path class="open" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/><path class="shut" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
map.getContainer().parentNode.append(wideBtn);
const isWide=()=>document.documentElement.classList.contains('mapWide');
function paintWide(){const on=isWide(),desk=WIDE_MQ.matches;
  const t=desk?(on?T('Show the side panel'):T('Hide the side panel')):(on?T('Exit full screen'):T('Full-screen map'));
  wideBtn.setAttribute('aria-label',t);wideBtn.title=t;wideBtn.setAttribute('aria-pressed',String(on));wideBtn.classList.toggle('flip',on)}
function setWide(on,save,labelsLater){
  document.documentElement.classList.toggle('mapWide',on);paintWide();
  if(save&&WIDE_MQ.matches)try{localStorage.setItem('mapWide',on?'1':'0')}catch(e){}
  // Keep the same place in view: the centre stays put while the map grows or shrinks.
  const c=map.getCenter();map.invalidateSize({pan:false});map.setView(c,map.getZoom(),{animate:false});
  popupMargins();if(LABEL.metric&&!labelsLater)renderLabels();
  if(on&&!WIDE_MQ.matches)wideBtn.focus({preventScroll:true});
}
// The same change, animated with GSAP (skipped when the visitor asks for reduced motion). Only transforms move,
// so nothing is laid out or redrawn while it plays: the map is resized once, at the start (collapsing) or at the
// end (expanding), and the motion is the side panel sliding over it while the map slides by half the panel's
// width, which is exactly where its centre moves to. Narrow screens: the full-screen map is revealed from its old
// box with a clip, and back.
let wideAnim=null;
function animateWide(on){
  if(!FX){setWide(on,true);return}
  if(wideAnim){wideAnim.progress(1);wideAnim=null}
  const root=document.documentElement,pane=document.querySelector('.pane'),wrap=map.getContainer().parentNode;
  wideBtn.classList.toggle('flip',on); // the arrow turns as the move starts
  if(WIDE_MQ.matches){
    const rtl=root.dir==='rtl',sign=rtl?1:-1,side=rtl?'right':'left';
    // The panel, lifted out of the page where it stands, slides over the map; it has the page's background.
    const lift=(W,top)=>{pane.style.cssText='display:block;position:fixed;top:'+top+'px;'+side+':0;width:'+W+'px;z-index:1050;background:var(--bg);will-change:transform'};
    const done=()=>{wideAnim=null;pane.style.cssText='';G.set(wrap,{clearProps:'transform,willChange'})};
    if(on){
      const W=pane.getBoundingClientRect().width;pane._y=scrollY;lift(W,-scrollY);
      setWide(true,true,true);                    // map at full width now, centre kept; labels re-placed at the end
      G.set(wrap,{x:-sign*W/2,willChange:'transform'}); // drawn where it was, then slides into place
      wideAnim=G.timeline({defaults:{duration:.55,ease:'power3.inOut'},onComplete(){done();if(LABEL.metric)renderLabels()}})
        .to(pane,{x:sign*W},0).to(wrap,{x:0},0);
    }else{
      root.classList.remove('mapWide');const W=pane.getBoundingClientRect().width;root.classList.add('mapWide'); // its width when open
      const y=pane._y||0;lift(W,-y);G.set(pane,{x:sign*W});G.set(wrap,{willChange:'transform'}); // back where the reader left it
      wideAnim=G.timeline({defaults:{duration:.55,ease:'power3.inOut'},onComplete(){done();setWide(false,true);
        if(y){scrollTo(0,y);if(lenis){try{lenis.resize()}catch(e){}lenis.scrollTo(y,{immediate:true,force:true})}}}})
        .to(pane,{x:0},0).to(wrap,{x:-sign*W/2},0);
    }
    return;
  }
  // Narrow screens: clip from the map's box on the page to the whole screen, or back.
  const r=on?wrap.getBoundingClientRect():(wrap._from||wrap.getBoundingClientRect()),vw=innerWidth,vh=innerHeight;
  const box=`inset(${Math.max(0,r.top)}px ${Math.max(0,vw-r.right)}px ${Math.max(0,vh-r.bottom)}px ${Math.max(0,r.left)}px round 12px)`,full='inset(0px 0px 0px 0px round 0px)';
  if(on){wrap._from=r;wrap.parentNode.style.minHeight=r.height+'px'; // the page keeps its place under the map
    if(lenis)lenis.stop();setWide(true,false);
    wideAnim=G.fromTo(wrap,{clipPath:box},{clipPath:full,duration:.42,ease:'power3.out',onComplete(){wideAnim=null;wrap.style.clipPath=''}});
  }else{
    wideAnim=G.fromTo(wrap,{clipPath:full},{clipPath:box,duration:.36,ease:'power3.in',onComplete(){wideAnim=null;wrap.style.clipPath='';wrap.parentNode.style.minHeight='';
      setWide(false,false);if(lenis)lenis.start()}});
  }
}
wideBtn.addEventListener('click',()=>{const on=!isWide();animateWide(on);countUse(on?'map-wide':'map-narrow')});
// Full screen on a narrow screen never carries over to the two-pane layout, and vice versa.
WIDE_MQ.addEventListener('change',()=>{let saved=null;try{saved=localStorage.getItem('mapWide')}catch(e){}setWide(WIDE_MQ.matches&&saved==='1',false)});
addEventListener('keydown',e=>{if(e.key==='Escape'&&isWide()&&!WIDE_MQ.matches&&!document.querySelector('.areaSheet:not([hidden])'))animateWide(false)});
(()=>{let saved=null;try{saved=localStorage.getItem('mapWide')}catch(e){}if(WIDE_MQ.matches&&saved==='1')map.whenReady(()=>setWide(true,false));else paintWide()})();
// Re-lay out and pan an open breakdown after its content changed size (photos arriving): Leaflet only
// checks the size when content is set through it.
function refitPopup(p){try{if(p&&p.isOpen()&&!SHEET_MQ.matches){p._updateLayout();p._updatePosition();if(p===focusPopup&&FOCUS)fitFocus(FOCUS);else p._adjustPan()}}catch(e){}}

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
  if(e.key==='Escape'){closeSheet();
    // A focused area's breakdown on a computer: Escape closes it and gives the map back; focus returns to its label.
    if(FOCUS&&focusPopup&&map.hasLayer(focusPopup)){const lab=FOCUS.label;map.closePopup(focusPopup);
      const el=[...document.querySelectorAll('.rl[data-area]')].find(x=>x.dataset.area===lab);if(el)el.focus({preventScroll:true})}}
},true);

// The legend folds to its colour bar; phones start folded, so more of the map shows.
const legendFolded=()=>{try{const v=localStorage.getItem('legendFolded');if(v)return v==='1'}catch(e){}return SHEET_MQ.matches};
$('legend').addEventListener('click',e=>{if(!e.target.closest('.t'))return;const now=!$('legend').classList.contains('folded');
  try{localStorage.setItem('legendFolded',now?'1':'0')}catch(_){}
  $('legend').classList.toggle('folded',now);countUse(now?'legend-fold':'legend-unfold');e.target.closest('.t').setAttribute('aria-expanded',!now);popupMargins();renderLabels()});
L.DomEvent.disableClickPropagation($('legend'));
// The address keeps what the map shows (home, view, position), so a copied link opens the same map.
// Written without reloading; other parameters (lang, area, unit) are kept.
let urlT;
function writeURL(){if(!$('home').options.length)return;clearTimeout(urlT);urlT=setTimeout(()=>{try{const q=new URLSearchParams(location.search),c=map.getCenter();
  q.set('home',$('home').value.replace('|',':'));q.set('view',$('metric').value);q.set('at',c.lat.toFixed(4)+','+c.lng.toFixed(4)+','+map.getZoom());
  if(CMP)q.set('compare',CMP.a.label+'|'+CMP.b.label);else q.delete('compare');
  history.replaceState(history.state,'','?'+q.toString().replace(/%3A/g,':').replace(/%2C/g,',')+location.hash)}catch(e){}},300)}
map.on('moveend',writeURL);
function readURL(){
  const q=new URLSearchParams(location.search),v=q.get('view'),h=q.get('home'),at=(q.get('at')||'').split(',').map(Number);
  if(q.get('at')&&document.referrer&&!document.referrer.startsWith(location.origin))countUse('map-link-opened'); // a shared map link, from elsewhere
  if(v&&[...$('metric').options].some(o=>o.value===v))$('metric').value=v;
  if(at.length===3&&at.every(isFinite)&&Math.abs(at[0]-25.1)<1&&Math.abs(at[1]-55.3)<1.2)map.setView([at[0],at[1]],Math.min(18,Math.max(8,at[2])),{animate:false});
  if(h){const [k,u='']=h.split(':');if([...$('home').options].some(o=>o.value===k+'|'+u)){
    if(k==='homes'){$('unit').value=u;$('home').value=k+'|'+u;unitChosen=true}else return ()=>{$('home').value=k+'|'+u;setHome(k,u)}}}
}
// The line under the filters that says what the budget leaves on the map.
const budgetEl=(()=>{const p=document.createElement('p');p.id='budgetNote';p.className='budgetNote';p.hidden=true;p.setAttribute('aria-live','polite');
  (document.querySelector('.controls .f-walk')||document.querySelector('.controls .f-range')).after(p);return p})();
function budgetNote(unit,metric){
  if(!BUDGET){budgetEl.hidden=true;return}
  const what=(unit?T.unit(unit):TYPENAME()).toLowerCase(),a='AED '+fmt(BUDGET.lo),b=BUDGET.hi<Infinity?'AED '+fmt(BUDGET.hi):null;
  const range=b?(BUDGET.lo>0?T('{a} to {b}',{a,b}):T('up to {b}',{b})):T('from {a}',{a}),walk=WALK?walkText(WALK):'';
  let txt;
  if(!BUDGET.n)txt=WALK&&!BUDGET.walkOnly?T('<b>No area</b> fits {range} a year within a {walk} of a station for {what}. Try a longer walk, a higher maximum or another home size.',{range,walk,what})
    :WALK?T('<b>No area</b> with figures for {what} is within a {walk} of a station.',{what,walk})
    :T('<b>No area fits</b> {range} a year for {what}. Try a higher maximum or another home size.',{range,what});
  else txt=WALK&&!BUDGET.walkOnly?T('<b>{n} of {of} areas</b> fit your budget ({range} a year) within a {walk} of a Metro or Tram station ({what}).',{n:BUDGET.n,of:BUDGET.of,range,walk,what})
    :WALK?T('<b>{n} of {of} areas</b> are within a {walk} of a Metro or Tram station ({what}).',{n:BUDGET.n,of:BUDGET.of,walk,what})
    :T('<b>{n} of {of} areas</b> fit your budget ({range} a year, {what}).',{n:BUDGET.n,of:BUDGET.of,range,what});
  // The station where this home is cheapest, among the areas left on the map.
  if(WALK&&BUDGET.n&&TRANSIT){const best=Transit.stationRents(TRANSIT.stations,AREAS.filter(a=>a.lat!=null),outlinesByLabel(),POINTS.map(p=>({label:p.a.label,v:p.v,n:p.n})),Transit.WALKS[WALK])[0];
    if(best){const l=TRANSIT.lines.find(x=>best.station.lines.includes(x.id));
      txt+=' '+T('Lowest near a station: {station} ({line}), typical {v}.',{station:'<button type="button" class="link" data-station="'+safe(best.station.name)+'">'+safe(stationName(best.station))+'</button>',line:l?safe(lineName(l)):'',v:safe(labelText(best.v,metric))})}}
  budgetEl.innerHTML=txt+(BUDGET.swapped?' '+T('(Min was above Max, so they were swapped.)'):'');
  budgetEl.hidden=false;
}
budgetEl.addEventListener('click',e=>{const b=e.target.closest('[data-station]');if(!b||!TRANSIT)return;const s=TRANSIT.stations.find(x=>x.name===b.dataset.station);if(!s)return;
  if(!transitOn)showTransit(true,false);map.once('moveend',()=>setTimeout(()=>openStation(s),0));map.flyTo([s.lat,s.lng],Math.max(map.getZoom(),14),{duration:FX?.7:0})});
function draw(){
  // The finder above the table filters the table only; the map always shows every area.
  const q=$('search').value.trim().toLowerCase(),unit=$('unit').value,metric=$('metric').value,min=+$('min').value||0,max=+$('max').value||Infinity;
  const match=a=>!q||(a.label+' '+a.dld_areas.join(' ')+' '+(a.top_projects||[]).map(p=>p.p).join(' ')).toLowerCase().includes(q);
  const shown=AREAS.filter(a=>a.lat!=null);
  POINTS=[];for(const a of shown){const v=areaValue(a,metric,unit);if(v==null)continue;const bu=unit?(a.by_unit.find(u=>u.u===unit)||{}):null;
    // Weight for averages: the unit's contracts; where a source gives none per unit, a rough share of the area total.
    const n=metric==='hotels'?(hotelPriced()?((hotelsBy().get(a.label)||{prices:[]}).prices.length):v):bu?(bu.n!=null?bu.n:Math.round(a.n/Math.max(1,a.by_unit.length)))||0:a.n; // hotels: groups add hotels, not contracts
    // Thin: a figure from fewer than THIN contracts (where the source gives a count) is drawn dashed and italic.
    // A big jump not yet confirmed by the next publication is drawn the same way (dashed), and says so in its breakdown.
    const thin=metric==='hotels'?false:bu?(bu.n!=null&&bu.n<THIN)||!!bu.unconfirmed:a.n<THIN||(!!a.unconfirmed&&metric==='median');POINTS.push({a,v,n,thin})}
  const vals=POINTS.map(p=>p.v).sort((a,b)=>a-b);
  const hotelsView=metric==='hotels';
  // Hotels are counted places, not prices: their labels are plain paper cards (the blue scale is for prices only).
  const sc=hotelsView&&!hotelPriced()?{colorOf:()=>'var(--oxblood)',inkOf:()=>'#F6F1E7',lo:0,hi:1}:scaleFor(vals),colorOf=sc.colorOf;
  // Budget mode: with a yearly rent range set, only the areas whose rent for the chosen home falls inside it keep
  // their labels (and the averages); the others turn grey. Colours stay those of the whole map, so they still match
  // the key. The range is on rent whatever the view shows (sale price, yield): it is a rent budget.
  let lo=+$('min').value||0,hi=+$('max').value||Infinity;const swapped=hi<lo;if(swapped)[lo,hi]=[hi,lo];
  BUDGET=!hotelsView&&(lo>0||hi<Infinity)?{lo,hi,swapped}:null;OUTSIDE.clear(); // a rent budget doesn't apply to hotels
  const allN=POINTS.length;
  if(BUDGET)POINTS=POINTS.filter(p=>{const r=areaValue(p.a,'median',unit);const ok=r!=null&&r>=lo&&r<=hi;if(!ok)OUTSIDE.add(p.a.label);return ok});
  // Near Metro / Tram: only areas within the chosen walk of a station.
  const near=WALK&&nearMap();
  if(near){POINTS=POINTS.filter(p=>{const x=near.get(p.a.label);const ok=!!x&&x.m<=Transit.WALKS[WALK];if(!ok)OUTSIDE.add(p.a.label);return ok});if(!BUDGET)BUDGET={lo:0,hi:Infinity,walkOnly:true}}
  if(BUDGET){BUDGET.n=POINTS.length;BUDGET.of=allN}
  budgetNote(unit,metric);if(CMP)renderCompare();
  LABEL={metric,colorOf,inkOf:sc.inkOf,top:sc.hi||1,lo:sc.lo};
  // A change of home or view keeps a focused area in focus: its breakdown reopens with the new figures.
  const legendBox0=$('legend').hidden?'':$('legend').offsetWidth+'x'+$('legend').offsetHeight;
  const kept=FOCUS&&focusPopup?FOCUS:null;relabelKeep=!!kept;renderLabels();relabelKeep=false;if(kept){FOCUS=kept;drawFocus();openArea(kept)}
  viewStat();drawOutlines();drawHotels();setTimeout(popupMargins,0);
  const f=metric==='yield'?(v=>Number(v).toFixed(1)+'%'):metric==='n'?fmt:(v=>'AED '+compact(v));
  $('legend').hidden=!vals.length;
  // The key: a value at every step (the first and last also cover everything below and above them), and a
  // title button that folds the notes away, leaving just the colour bar (remembered on this device).
  const ticks=vals.length?Array.from({length:7},(_,i)=>f(sc.lo+(sc.hi-sc.lo)*i/6).replace(/^AED /,'')):[];
  $('legend').innerHTML='<button type="button" class="t" aria-expanded="'+!legendFolded()+'">'+(metric==='n'?T('Contracts'):metric==='hotels'?T('Typical hotel price a night'):metric==='yield'?T('Typical gross yield'):metric==='sale'?T('Typical sale price'):metric==='median_sqm'?T('Typical rent per m²'):T('Typical yearly rent'))+(metric==='yield'||metric==='n'?'':' <span class="u">(AED)</span>')+'<span class="chev" aria-hidden="true"></span></button>'+
    '<div class="ramp">'+BANDS.map(c=>'<i style="background:'+c+'"></i>').join('')+'</div><div class="ticks" title="'+safe(T('Below the first value: the lightest blue; above the last: the darkest'))+'">'+ticks.map(t=>'<span>'+t+'</span>').join('')+'</div>';
  $('legend').classList.toggle('folded',legendFolded());
  if(hotelsView&&!hotelPriced()){$('legend').innerHTML=hotelLegend();$('legend').hidden=false;$('legend').classList.remove('folded')}
  else if(hotelsView)$('legend').insertAdjacentHTML('beforeend',hotelNotes());
  else if(metric!=='median'&&AREAS.some(a=>a.lat!=null&&areaValue(a,'median',unit)!=null&&areaValue(a,metric,unit)==null))
    $('legend').insertAdjacentHTML('beforeend','<div class="note">'+T('Older districts have rents only, so they show in the rent view.')+'</div>');
  if(!hotelsView&&POINTS.some(p=>p.thin))$('legend').insertAdjacentHTML('beforeend','<div class="note"><span class="thinMark"></span>'+(POINTS.some(p=>p.a.unconfirmed||(p.a.by_unit||[]).some(u=>u.unconfirmed))?T('Dashed: fewer than {n} contracts, or a big change waiting to be confirmed',{n:THIN}):T('Dashed: fewer than {n} contracts',{n:THIN}))+'</div>');
  // All homes mixes studios with 5-bedroom homes, so the key spans a wide range: say so, and point to the picker.
  if(!hotelsView&&!unit&&TYPE==='homes'&&metric!=='yield')$('legend').insertAdjacentHTML('beforeend','<div class="note">'+T('Mixed home sizes: pick one for a fair comparison.')+'</div>');
  syncViews();
  if(!hotelsView&&!$('unit').value&&AREAS.some(a=>a.median_kind==='unit'))$('legend').insertAdjacentHTML('beforeend','<div class="note">'+T('Older districts (no all-homes median): pick a unit to see them')+'</div>');
  // Labels keep clear of the legend as it was when they were placed: if the legend changed size (another view's key), place them again.
  if(($('legend').hidden?'':$('legend').offsetWidth+'x'+$('legend').offsetHeight)!==legendBox0){relabelKeep=true;renderLabels();relabelKeep=false}
  const all=AREAS.reduce((s,a)=>s+a.n,0),placed=shown.reduce((s,a)=>s+a.n,0);
  odometer($('n12'),all);
  $('mapped').innerHTML=(all?safe((Math.floor(placed/all*1000)/10).toFixed(1))+'%':'—')+'<small>'+safe(T('of these contracts'))+'</small>';
  $('nAreas').textContent=fmt(shown.length);
  const kinds=KIND_IN[TYPE];
  const rowKind=r=>AGG?(/^studio/i.test(r.u)?'studio':/apartment/i.test(r.u)?'flat':null):(r.k||'flat');
  view=ROWS.filter(r=>(!kinds||kinds.includes(rowKind(r))||(AGG&&TYPE==='homes'))&&(!unit||r.u===unit)&&r.a>=min&&r.a<=max&&(!q||[r.c,r.ar,r.mp,r.p].filter(Boolean).join(' ').toLowerCase().includes(q)));
  table();writeURL();
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
    // Column headers sort the table (click again to reverse). Until one is clicked, the view's own column leads
    // (sale price or yield, highest first); the rent view keeps the busiest areas first.
    const key=SORT?SORT.k:m==='sale'?'s':m==='yield'?'y':null,dir=SORT?SORT.dir:-1;
    const th=(k,txt,cls)=>'<th class="'+(cls||'')+'" aria-sort="'+(key===k?(dir>0?'ascending':'descending'):'none')+'"><button type="button" class="sort" data-k="'+k+'">'+txt+'<span class="arr" aria-hidden="true">'+(key===k?(dir>0?'▲':'▼'):'')+'</span></button></th>';
    $('thead').innerHTML='<tr>'+th('c',T('Area')+' <small>'+T('DLD area')+'</small>','')+(one?'':'<th class="opt">'+T('Unit')+'</th>')+th('a',T('Rent'),o('a'))+th('n',T('Contracts'),'r')+th('s',T('Sale price'),o('s'))+th('y',T('Yield'),o('y'))+'</tr>';
    const rows=!key?view:[...view].sort(key==='c'?(x,y)=>dir*T.place(x.c).localeCompare(T.place(y.c)):(x,y)=>(x[key]==null)-(y[key]==null)||dir*((x[key]??0)-(y[key]??0)));
    // Rows of the same area in a run show its name once (the name stays for screen readers).
    let prev=null;
    for(const r of rows){const tr=document.createElement('tr');const same=r.c===prev;prev=r.c;if(same)tr.className='cont';
      {const td=document.createElement('td');td.className='w';if(same){const vh=document.createElement('span');vh.className='vh';vh.textContent=T.place(r.c);td.append(vh)}
        else{td.append(T.place(r.c));if(r.ar&&r.ar!==r.c){const sm=document.createElement('small');sm.textContent=T.place(r.ar);td.append(sm)}}tr.append(td)}if(!one){cell(tr,T.unit(r.u));tr.lastChild.className='u opt'}cell(tr,fmt(r.a),1);tr.lastChild.className=o('a');cell(tr,fmt(r.n),1);cell(tr,r.s?fmt(r.s):'',1);tr.lastChild.className=o('s');cell(tr,r.y!=null?pct(r.y):'',1);tr.lastChild.className=o('y');tb.append(tr)}
    if(!view.length)tb.innerHTML='<tr><td colspan="'+(one?5:6)+'">'+T('No areas match. Clear the search or widen the rent range.')+'</td></tr>';
    return;
  }
  $('thead').innerHTML='<tr><th>'+T('Start')+'</th><th>'+T('Area')+'</th><th>'+T('Building')+'</th><th>'+T('Unit')+'</th><th class="r">'+T('Yearly rent (AED)')+'</th><th class="r">m²</th><th class="r">'+T('AED per m²')+'</th><th>'+T('New or renewal')+'</th></tr>';
  for(const r of view.slice(0,500)){const tr=document.createElement('tr');
    cell(tr,r.s);cell(tr,r.c);cell(tr,r.p||r.mp||'');cell(tr,T.unit(r.u));tr.lastChild.className='u';cell(tr,fmt(r.a),1);cell(tr,r.sq?fmt(r.sq):'',1);cell(tr,r.sq?fmt(r.a/r.sq):'',1);cell(tr,r.t);tb.append(tr)}
  if(!view.length)tb.innerHTML='<tr><td colspan="8">'+T('No contracts match. Clear the search or widen the rent range.')+'</td></tr>';
  else if(view.length>500)tb.insertAdjacentHTML('beforeend','<tr><td colspan="8" class="muted">'+T('Showing the newest 500 of {n}. Download the CSV for all of them.',{n:fmt(view.length)})+'</td></tr>');
}

let typing,SORT=null; // SORT: {k, dir} once a column header is clicked; a new view goes back to its own order
$('thead').addEventListener('click',e=>{const b=e.target.closest('button.sort');if(!b)return;const k=b.dataset.k;
  SORT=SORT&&SORT.k===k?{k,dir:-SORT.dir}:{k,dir:k==='c'?1:-1};countUse('table-sort','sort: '+k);table();$('thead').querySelector('button[data-k="'+k+'"]').focus()});
['search','min','max'].forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(typing);typing=setTimeout(()=>{animateLabels=true;draw()},150)}));
// Counted once per visit each: the table finder and the rent range (not what was typed).
const once=new Set();['search','min','max'].forEach(id=>$(id).addEventListener('change',()=>{const k=id==='search'?'table-find':'rent-range';if(!once.has(k)){once.add(k);countUse(k)}}));
$('metric').addEventListener('change',()=>{SORT=null;animateLabels=true;draw()});
const csvCell=x=>{const s=String(x??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
$('export').onclick=()=>{
  const [head,keys,name]=AGG?[['area','dld_area','unit','median_yearly_rent_aed','contracts_12m','median_sale_price_aed','gross_yield_pct'],['c','ar','u','a','n','s','y'],'dubai-real-estate-by-area.csv']
    :[['start','end','yearly_rent_aed','size_sqm','unit','new_or_renewal','dld_area','area','master_project','building','type'],['s','e','a','sq','u','t','ar','c','mp','p','k'],'dubai-ejari-rents.csv'];
  const url=URL.createObjectURL(new Blob([[head.join(','),...view.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();countUse('csv');setTimeout(()=>URL.revokeObjectURL(url),1000)};
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
function setTheme(t,save){document.documentElement.dataset.theme=t;if(save)try{localStorage.setItem('theme',t)}catch(e){}paintToggle();if(transitOn)drawTransit();if(HOTELS)drawHotels();if(CMP)drawCompare();restyleBase();
  if(LABEL.metric)renderLabels()}
$('theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{let saved;try{saved=localStorage.getItem('theme')}catch(_){}if(!saved)setTheme(e.matches?'dark':'light',false)});
paintToggle();
// The base map comes after the rent data, and only once the map is on (or near) the screen: on phones the map
// sits below the first screen, so MapLibre (1 MB) isn't fetched by visitors who never scroll to it.
// The side panel's one entrance (GSAP): its sections settle in from just below, one after another, once per visit.
// Nothing else on the page moves on its own; reduced motion skips it.
if(FX){const secs=[...document.querySelectorAll('.controls,#companion,.facts,.fresh,.tableHead,.tableWrap')].filter(e=>e.offsetParent);
  if(secs.length)G.from(secs,{y:14,opacity:0,duration:.55,ease:'power2.out',stagger:.07,delay:.15,clearProps:'transform,opacity'})}
init().finally(()=>{loadOutlines();loadHotels();compareFromURL();const el=$('map');if(!('IntersectionObserver' in window))return vectorBase();
  const io=new IntersectionObserver(es=>{if(es.some(e=>e.isIntersecting)){io.disconnect();vectorBase()}},{rootMargin:'400px'});io.observe(el)});
