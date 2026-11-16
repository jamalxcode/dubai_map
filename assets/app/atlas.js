'use strict';
const $=id=>document.getElementById(id);
const fmt=n=>n==null||!isFinite(n)?'—':Number(n).toLocaleString('en-AE',{maximumFractionDigits:0});
const safe=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const kuwait=iso=>iso?new Date(iso).toLocaleString('en-GB',{timeZone:'Asia/Kuwait',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})+' Kuwait time':'—';
const median=xs=>{if(!xs.length)return null;const s=[...xs].sort((a,b)=>a-b),i=s.length>>1;return s.length%2?s[i]:(s[i-1]+s[i])/2};
const BANDS=['var(--b1)','var(--b2)','var(--b3)','var(--b4)','var(--b5)'];
const G=window.gsap,FX=!!G&&!matchMedia('(prefers-reduced-motion: reduce)').matches;
const TYPES=[['homes','Homes'],['flat','Flats'],['studio','Studios'],['villa','Villas'],['commercial','Commercial'],['all','Everything']];
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
const niceDate=d=>new Date(d+'T00:00:00+04:00').toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'Asia/Dubai'});

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
// Rent dial: share of AED 100k (full at 100k or more). Only for rents, not counts or yields.
const PIE_MAX=100000;
const pie=(v,metric)=>metric==='median'&&v>0?'<i class="pie" aria-hidden="true" style="--p:'+Math.min(100,Math.round(v/PIE_MAX*100))+'%"></i>':'';
// "All Dubai": back to the whole city (placed areas, leaving out far-off Hatta so the city isn't a dot).
function fitDubai(animate){const pts=(CACHE.homes||AREAS).filter(x=>x.lat!=null&&x.lng<55.7).map(x=>[x.lat,x.lng]);
  if(pts.length)map.fitBounds(pts,{padding:[30,30],animate:!!animate})}
L.Control.Fit=L.Control.extend({options:{position:'topleft'},onAdd(){
  const d=L.DomUtil.create('div','leaflet-bar'),a=L.DomUtil.create('a','fit',d);
  a.href='#';a.role='button';a.textContent='All Dubai';a.title='Show all of Dubai';
  L.DomEvent.on(a,'click',e=>{L.DomEvent.preventDefault(e);fitDubai(true)});
  L.DomEvent.disableClickPropagation(d);return d}});
new L.Control.Fit().addTo(map);
const groupName=g=>{if(g.length>3)return g.length+' areas';const top=g.reduce((a,b)=>b.n>a.n?b:a,g[0]).a.label;
  return (top.length>22?top.slice(0,21)+'…':top)+' +'+(g.length-1)};
// OpenStreetMap tile usage policy: this exact HTTPS URL, visible attribution, no bulk or offline use.
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap contributors</a>'}).addTo(map);
const layer=L.layerGroup().addTo(map);
let POINTS=[],LABEL={},animateLabels=true;
const compact=v=>v>=1e6?(v/1e6).toFixed(v>=1e7?0:2).replace(/\.?0+$/,'')+'M':v>=1e4?Math.round(v/1e3)+'k':v>=1e3?(v/1e3).toFixed(1).replace(/\.0$/,'')+'k':String(Math.round(v));
function labelText(v,metric){return metric==='yield'?Number(v).toFixed(1)+'%':metric==='n'?compact(v)+' contracts':metric==='median_sqm'?'AED '+fmt(v)+'/m²':'AED '+compact(v)}

// Labels that would overlap at this zoom merge into one label with the contract-weighted average.
function renderLabels(){
  layer.clearLayers();if(!POINTS.length)return;
  const {metric,colorOf}=LABEL;
  // Where labels go (merging, splitting, avoiding the controls) is decided in labels.js, in pixels.
  const size=(members,val)=>{const single=members.length===1,top=labelText(val,metric)+(single||metric==='n'?'':' avg'),sub=single?members[0].a.label:groupName(members);
    return {w:Math.max(top.length*8.4+(metric==='median'?14:0),Math.min(sub.length,26)*5.8)+26,h:38}};
  const items=POINTS.map(p=>{const pt=map.latLngToLayerPoint([p.a.lat,p.a.lng]);return Object.assign({x:pt.x,y:pt.y,lat:p.a.lat,lng:p.a.lng},p)});
  const box=map.getContainer().getBoundingClientRect();
  const blocks=[...map.getContainer().parentNode.querySelectorAll('.leaflet-control,.legend')].map(e=>e.getBoundingClientRect())
    .filter(r=>r.width&&r.left<box.right&&r.right>box.left&&r.top<box.bottom&&r.bottom>box.top)
    .map(r=>{const c=map.containerPointToLayerPoint([r.left-box.left+r.width/2,r.top-box.top+r.height/2]);return {x:c.x,y:c.y,w:r.width,h:r.height}});
  const cl=RentLabels.place(items,size,{pad:6,sum:metric==='n',blocks});
  const added=[];
  for(const c of cl){const g=c.members,moved=c.lx!==c.x||c.ly!==c.y,pos=moved?map.layerPointToLatLng([c.lx,c.ly]):L.latLng(c.lat,c.lng);
    if(moved){L.polyline([[c.lat,c.lng],pos],{className:'leader',weight:1.5,interactive:false}).addTo(layer);
      L.circleMarker([c.lat,c.lng],{className:'leader dot',radius:3,weight:1.5,interactive:false}).addTo(layer)}
    // Rent labels fill from the left in proportion to the rent (AED 100k = full), a second cue next to the dial.
    const fill=metric==='median'&&c.val>0?';--f:'+Math.min(100,Math.round(c.val/PIE_MAX*100))+'%':'';
    const html='<div class="rl'+(c.single?'':' grp')+(fill?' rent':'')+'" style="--c:'+colorOf(c.val)+fill+'" tabindex="0"><b>'+pie(c.val,metric)+safe(labelText(c.val,metric))+(c.single||metric==='n'?'':'<span class="avg">avg</span>')+'</b><small>'+safe(c.single?g[0].a.label:groupName(g))+'</small></div>';
    const m=L.marker(pos,{icon:L.divIcon({className:'rl-wrap',html,iconSize:[0,0]}),riseOnHover:true,keyboard:false,title:c.single?g[0].a.label:g.map(o=>o.a.label).join(', ')}).addTo(layer);
    added.push(m);
    // Keyboard: the label is a button. Enter or Space opens its breakdown, or zooms into a group.
    const el=m.getElement()&&m.getElement().firstChild;
    // Its spoken name is its visible text (rent and area), as WCAG 2.5.3 asks; the marker title lists a group's areas.
    if(el){el.setAttribute('role','button');
      el.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();if(c.single)m.openPopup();else m.fire('click')}})}
    if(c.single)m.bindPopup(popup(g[0].a),{maxWidth:320});
    else m.on('click',()=>{const b=L.latLngBounds(g.map(o=>[o.a.lat,o.a.lng])),z=map.getBoundsZoom(b,false,L.point(140,140));
      if(z<=map.getZoom()||map.getZoom()>=16)L.popup({maxWidth:320}).setLatLng([c.lat,c.lng]).setContent('<span class="t">'+g.length+' areas</span>'+safe(labelText(c.val,metric))+(metric==='n'?'':' average')+'<br>'+[...g].sort((x,y)=>y.n-x.n).map(o=>safe(o.a.label)+': <b>'+safe(labelText(o.v,metric))+'</b>').join('<br>')).openOn(map);
      else map.fitBounds(b,{padding:[70,70],maxZoom:16})});
  }
  // Labels answer a filter change by settling in from the centre; plain zooming redraws instantly.
  if(FX&&animateLabels){animateLabels=false;
    const els=added.map(m=>m.getElement()&&m.getElement().firstChild).filter(Boolean);
    G.fromTo(els,{opacity:0},{opacity:1,duration:.35,ease:'power1.out',stagger:{each:.008,from:'center'}});}
}
map.on('zoomend',renderLabels);

// The headline number: contract-weighted average of what is on screen.
function viewStat(){
  const metric=LABEL.metric,b=map.getBounds(),vis=POINTS.filter(p=>b.contains([p.a.lat,p.a.lng])),N=vis.reduce((s,p)=>s+p.n,0);
  const what=metric==='n'?'Contracts':metric==='median_sqm'?'Average rent per m² ':metric==='yield'?'Average gross yield':'Average yearly rent';
  $('medLabel').textContent=what+' in view'+(vis.length?' · '+vis.length+' areas, '+($('unit').value||TYPENAME()).toLowerCase():'');
  if(!vis.length||!N){odometer($('med'),null);$('medPie').hidden=true;
    const perUnitOnly=!$('unit').value&&AREAS.some(a=>a.median_kind==='unit'&&a.lat!=null&&b.contains([a.lat,a.lng]));
    $('medLabel').textContent=perUnitOnly?'Areas here have figures per unit only: pick a unit (e.g. 1 bed) to see them.':'Nothing to show here for '+TYPENAME().toLowerCase()+'. Zoom out to see more.';return}
  const v=metric==='n'?N:vis.reduce((s,p)=>s+p.v*p.n,0)/N;
  const mp=$('medPie');mp.hidden=metric!=='median';mp.style.setProperty('--p',Math.min(100,Math.round(v/PIE_MAX*100))+'%');
  if(metric==='yield'){$('med').textContent=v.toFixed(1)+'%';$('med')._sig=null;return}
  odometer($('med'),metric==='n'?v:Math.round(v/(metric==='median_sqm'?1:100))*(metric==='median_sqm'?1:100),metric==='n'?'':'AED ');
}
map.on('moveend',viewStat);

let AREAS=[],ROWS=[],META={},view=[],AGG=false,TYPE='homes';
const CACHE={};
const TYPENAME=()=>(TYPES.find(t=>t[0]===TYPE)||TYPES[0])[1];
async function getJSON(p){const r=await fetch(p,{cache:'no-cache'});if(!r.ok)throw Error(p+' '+r.status);return r.json()}

async function init(){
  try{[META,{areas:AREAS},{rows:ROWS}]=await Promise.all([getJSON('data/meta.json'),getJSON('data/areas.json'),getJSON('data/latest.json')])}
  catch(e){$('rows').innerHTML='<tr><td>The rent data could not be loaded. Reload the page; if it keeps failing, the daily update has not run yet.</td></tr>';window.atlasState='error';dispatchEvent(new Event('atlas:error'));return}
  CACHE.homes=AREAS;
  AGG=META.mode==='aggregate';
  buildTypes();
  const age=staleness(META,Date.now());
  $('newestLabel').textContent=AGG?'Data runs through':'Newest contract start';
  $('newest').textContent=age?niceDate(age.through):'—';
  $('fresh').innerHTML=(AGG?'Weekly':'Daily')+'<small>Updated '+safe(kuwait(META.generated_at))+'</small>';
  $('updated').textContent=AGG?'Median yearly rent by area and unit, last 12 months':'Contracts that started in the last 30 days, newest first';
  $('tableTitle').textContent=AGG?'Rents by area':'Newest contracts';
  if(AGG){const o=$('metric').querySelector('option[value=median_sqm]');o.value='yield';o.textContent='Gross rental yield'}
  if(age&&age.stale){
    $('staleText').innerHTML='<b>This data is '+age.days+' days old</b> (to '+safe(niceDate(age.through))+').<span class="more"> '+
      (AGG?'Dubai Data has not published a newer update yet, so changes since then are not shown.':'The daily update has not brought in newer contracts, so changes since then are not shown.')+'</span>';
    let hidden=false;try{hidden=sessionStorage.getItem('staleHidden')===age.through}catch(e){}
    if(!hidden){$('stale').classList.add('on');setTimeout(()=>map.invalidateSize(),0)}
  }
  sources();
  const un=META.unmatched_areas||[];$('unmatchedN').textContent=un.length;
  $('unmatched').innerHTML=un.map(x=>'<li>'+safe(x.area)+' <span class="muted">('+fmt(x.n)+')</span></li>').join('')||'<li class="muted">None</li>';
  $('foot').textContent=META.source||'';
  fillUnits();draw();intro();
  window.atlasState='ready';dispatchEvent(new Event('atlas:ready')); // assets/app/companion.js takes it from here
}

function sources(){
  const s=META.sources||[];
  $('sources').innerHTML=s.map(x=>{const st=x.status||'',cls=/^(ok|in use)/.test(st)?'status-ok':/^(off|no credentials|not run|standby)/.test(st)?'muted':'status-bad';
    return '<li>'+safe(x.name)+': <span class="'+cls+'">'+safe(x.status||'not run yet')+'</span>'+(x.last_ok_at?' <span class="muted">(last success '+safe(kuwait(x.last_ok_at))+')</span>':'')+'</li>'}).join('')||'<li>Dubai Land Department Ejari contracts</li>';
}

// Only the property types that have data get a button, so every button works.
function buildTypes(){
  const have=new Set((META.property_types||[{key:'homes'}]).filter(t=>t.key==='homes'||t.n>0).map(t=>t.key));
  const seg=$('types');
  TYPES.filter(([k])=>have.has(k)).forEach(([k,lbl])=>{const b=document.createElement('button');b.type='button';b.textContent=lbl;b.dataset.k=k;
    b.setAttribute('aria-pressed',k===TYPE);b.onclick=()=>setType(k);seg.append(b)});
  const missing=TYPES.filter(([k])=>!have.has(k)).map(([,l])=>l);
  if(missing.length){$('typesNote').hidden=false;
    $('typesNote').textContent=missing.join(', ').replace(/, ([^,]*)$/,' and $1')+' will appear once daily contract data is switched on.'}
  requestAnimationFrame(()=>movePlate(false));
}
function movePlate(anim){
  const b=$('types').querySelector('button[aria-pressed="true"]');if(!b)return;
  const x=b.offsetLeft,w=b.offsetWidth;
  if(FX&&anim)G.to('#plate',{x,width:w,duration:.38,ease:'power3.inOut'});else{G?G.set('#plate',{x,width:w}):Object.assign($('plate').style,{transform:'translateX('+x+'px)',width:w+'px'})}
}
addEventListener('resize',()=>movePlate(false));
async function setType(k){
  if(k===TYPE)return;TYPE=k;
  document.querySelectorAll('#types button').forEach(b=>b.setAttribute('aria-pressed',b.dataset.k===k));movePlate(true);
  try{AREAS=CACHE[k]||(CACHE[k]=(await getJSON('data/areas_'+k+'.json')).areas)}catch(e){AREAS=[]}
  fillUnits();animateLabels=true;draw();
}
let unitChosen=false; // until the visitor picks a unit, the map starts on 1-bedroom: the one measure every area has
function fillUnits(){
  const keep=$('unit').value,units=new Map();
  AREAS.forEach(a=>a.by_unit.forEach(u=>units.set(u.u,(units.get(u.u)||0)+(u.n||0))));
  $('unit').innerHTML='<option value="">All units</option>'+[...units].sort((a,b)=>b[1]-a[1]).map(([u])=>'<option>'+safe(u)+'</option>').join('');
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
  return u?u.median:a.median;
}
function spark(monthly){
  const pts=(monthly||[]).filter(m=>m.median);if(pts.length<3)return '';
  const vs=pts.map(m=>m.median),lo=Math.min(...vs),hi=Math.max(...vs),w=230,h=40;
  const d=pts.map((m,i)=>(i?'L':'M')+(i*w/(pts.length-1)).toFixed(1)+','+(h-4-(hi===lo?.5:(m.median-lo)/(hi-lo))*(h-8)).toFixed(1)).join('');
  return '<svg width="'+w+'" height="'+h+'" viewBox="0 0 '+w+' '+h+'" role="img" aria-label="Monthly median rent"><path d="'+d+'" fill="none" stroke="#1546A0" stroke-width="2"/></svg><br><small>Monthly median, '+safe(pts[0].m)+' to '+safe(pts.at(-1).m)+'</small><br>';
}
function popup(a){
  const types=Object.entries(a.reg_types||{}).map(([k,v])=>safe(k)+' '+fmt(v)).join(', ');
  return '<span class="t">'+safe(a.label)+'</span>'+
    (a.median_kind==='unit'?'Median for '+safe(String(a.median_unit||'').toLowerCase())+' <b>AED '+fmt(a.median)+'</b> a year (no all-homes median is published for this area); '
      :a.median_kind==='typical'?'Typical <b>AED '+fmt(a.median)+'</b> a year (average of the bedroom medians below) from ':'Median <b>AED '+fmt(a.median)+'</b> a year from ')+fmt(a.n)+' contracts'+(a.p25!=null?'<br>Middle half pay AED '+fmt(a.p25)+' to '+fmt(a.p75):'')+'<br>'+
    (a.median_sqm?'AED '+fmt(a.median_sqm)+' per m² a year<br>':'')+
    (a.yield_pct!=null?'Gross yield '+a.yield_pct+'%'+(a.sale_median?', median sale price AED '+fmt(a.sale_median):'')+'<br>':'')+
    (types?'<small>'+types+'</small><br>':'')+spark(a.monthly)+
    (a.by_unit.length?'<table><tr><th>Unit</th><th>Contracts</th><th>Median AED</th></tr>'+a.by_unit.slice(0,7).map(u=>'<tr><td>'+safe(u.u)+'</td><td>'+fmt(u.n)+'</td><td>'+fmt(u.median)+'</td></tr>').join('')+'</table>':'')+
    (a.top_projects&&a.top_projects.filter(p=>p.p!=='—').length?'<table><tr><th>Busiest buildings</th><th>n</th><th>Median</th></tr>'+a.top_projects.filter(p=>p.p!=='—').slice(0,5).map(p=>'<tr><td>'+safe(p.p)+'</td><td>'+fmt(p.n)+'</td><td>'+fmt(p.median)+'</td></tr>').join('')+'</table>':'')+
    (a.source==='ccp'?'<small>Figures: <a href="https://continentalclub.ae/data-center/" target="_blank" rel="noopener">Continental Club Property</a>, CC BY 4.0'+(a.through?', to '+safe(a.through):'')+'.</small><br>':'')+
    '<small>DLD area: '+a.dld_areas.map(safe).join(', ')+'. The point is an approximate reference for the area, not a building.'+(a.url?' <a href="'+safe(a.url)+'" target="_blank" rel="noopener">Dubai Data page</a>':'')+'</small>';
}

function draw(){
  const q=$('search').value.trim().toLowerCase(),unit=$('unit').value,metric=$('metric').value,min=+$('min').value||0,max=+$('max').value||Infinity;
  const match=a=>!q||(a.label+' '+a.dld_areas.join(' ')+' '+(a.top_projects||[]).map(p=>p.p).join(' ')).toLowerCase().includes(q);
  const shown=AREAS.filter(a=>a.lat!=null&&match(a));
  POINTS=[];for(const a of shown){const v=areaValue(a,metric,unit);if(v==null)continue;const bu=unit?(a.by_unit.find(u=>u.u===unit)||{}):null;
    // Weight for averages: the unit's contracts; where a source gives none per unit, a rough share of the area total.
    const n=bu?(bu.n!=null?bu.n:Math.round(a.n/Math.max(1,a.by_unit.length)))||0:a.n;POINTS.push({a,v,n})}
  const vals=POINTS.map(p=>p.v).sort((a,b)=>a-b);
  const cuts=[...new Set([.2,.4,.6,.8].map(p=>vals[Math.floor(p*(vals.length-1))]))].filter(v=>v!=null);
  const colorOf=v=>BANDS[Math.min(4,Math.round(cuts.filter(c=>v>c).length*4/Math.max(1,cuts.length)))];
  LABEL={metric,colorOf};renderLabels();viewStat();
  const f=metric==='yield'?(v=>Number(v).toFixed(1)+'%'):metric==='n'?fmt:(v=>'AED '+compact(v));
  $('legend').hidden=!vals.length;
  $('legend').innerHTML='<div class="t">'+(metric==='n'?'Contracts':metric==='yield'?'Gross yield':metric==='median_sqm'?'Rent per m²':AREAS.some(a=>a.median_kind==='typical')?'Typical yearly rent':'Median yearly rent')+'</div><div class="ramp">'+BANDS.map(c=>'<i style="background:'+c+'"></i>').join('')+'</div><div class="ends"><span>'+(vals.length?f(vals[0]):'')+'</span><span>'+(vals.length?f(vals.at(-1)):'')+'</span></div>';
  if(metric==='median')$('legend').insertAdjacentHTML('beforeend','<div class="note"><i class="pie" aria-hidden="true" style="--p:60%"></i>Dial fills up to AED 100k</div>');
  if(!$('unit').value&&AREAS.some(a=>a.median_kind==='unit'))$('legend').insertAdjacentHTML('beforeend','<div class="note">Older districts (no all-homes median): pick a unit to see them</div>');
  const inArea=AREAS.filter(match);
  odometer($('n12'),inArea.reduce((s,a)=>s+a.n,0));odometer($('mapped'),shown.reduce((s,a)=>s+a.n,0));
  const kinds=KIND_IN[TYPE];
  const rowKind=r=>AGG?(/^studio/i.test(r.u)?'studio':/apartment/i.test(r.u)?'flat':null):(r.k||'flat');
  view=ROWS.filter(r=>(!kinds||kinds.includes(rowKind(r))||(AGG&&TYPE==='homes'))&&(!unit||r.u===unit)&&r.a>=min&&r.a<=max&&(!q||[r.c,r.ar,r.mp,r.p].filter(Boolean).join(' ').toLowerCase().includes(q)));
  table();
}
function table(){
  const tb=$('rows');tb.replaceChildren();
  const cell=(tr,v,r)=>{const td=document.createElement('td');td.textContent=v;if(r)td.className='r';tr.append(td)};
  if(AGG){
    $('thead').innerHTML='<tr><th>Area</th><th>DLD area</th><th>Unit</th><th class="r">Median yearly rent (AED)</th><th class="r">Contracts</th><th class="r">Gross yield</th></tr>';
    for(const r of view){const tr=document.createElement('tr');cell(tr,r.c);cell(tr,r.ar);cell(tr,r.u);cell(tr,fmt(r.a),1);cell(tr,fmt(r.n),1);cell(tr,r.y!=null?r.y+'%':'',1);tb.append(tr)}
    if(!view.length)tb.innerHTML='<tr><td colspan="6">No areas match. Clear the search or widen the rent range.</td></tr>';
    return;
  }
  $('thead').innerHTML='<tr><th>Start</th><th>Area</th><th>Building</th><th>Unit</th><th class="r">Yearly rent (AED)</th><th class="r">m²</th><th class="r">AED per m²</th><th>New or renewal</th></tr>';
  for(const r of view.slice(0,500)){const tr=document.createElement('tr');
    cell(tr,r.s);cell(tr,r.c);cell(tr,r.p||r.mp||'');cell(tr,r.u);cell(tr,fmt(r.a),1);cell(tr,r.sq?fmt(r.sq):'',1);cell(tr,r.sq?fmt(r.a/r.sq):'',1);cell(tr,r.t);tb.append(tr)}
  if(!view.length)tb.innerHTML='<tr><td colspan="8">No contracts match. Clear the search or widen the rent range.</td></tr>';
  else if(view.length>500)tb.insertAdjacentHTML('beforeend','<tr><td colspan="8" class="muted">Showing the newest 500 of '+fmt(view.length)+'. Download the CSV for all of them.</td></tr>');
}

let typing;
['search','min','max'].forEach(id=>$(id).addEventListener('input',()=>{clearTimeout(typing);typing=setTimeout(()=>{animateLabels=true;draw()},150)}));
['unit','metric'].forEach(id=>$(id).addEventListener('change',()=>{if(id==='unit')unitChosen=true;animateLabels=true;draw()}));
const csvCell=x=>{const s=String(x??'');return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};
$('export').onclick=()=>{
  const [head,keys,name]=AGG?[['area','dld_area','unit','median_yearly_rent_aed','contracts_12m','gross_yield_pct'],['c','ar','u','a','n','y'],'dubai-rents-by-area.csv']
    :[['start','end','yearly_rent_aed','size_sqm','unit','new_or_renewal','dld_area','area','master_project','building','type'],['s','e','a','sq','u','t','ar','c','mp','p','k'],'dubai-ejari-rents.csv'];
  const url=URL.createObjectURL(new Blob([[head.join(','),...view.map(r=>keys.map(k=>csvCell(r[k])).join(','))].join('\r\n')],{type:'text/csv;charset=utf-8'}));
  const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)};
$('staleX').onclick=()=>{$('stale').classList.remove('on');try{sessionStorage.setItem('staleHidden',(staleness(META,Date.now())||{}).through||'')}catch(e){}map.invalidateSize()};

// Phone: filters live in a sheet that slides up.
const side=$('side'),scrim=$('scrim'),phone=matchMedia('(max-width:860px)');
let lenis=null;
function sheet(open){
  if(!phone.matches)return;
  side.classList.toggle('open',true);scrim.classList.toggle('on',open);$('openSheet').setAttribute('aria-expanded',open);
  if(lenis)open?lenis.stop():lenis.start();
  const done=()=>{if(!open)side.classList.remove('open')};
  if(FX){G.to(side,{y:0,yPercent:open?0:105,duration:open?.42:.3,ease:open?'power3.out':'power2.in',onComplete:done});G.to(scrim,{opacity:open?1:0,duration:.3})}
  else{side.style.transform=open?'none':'';scrim.style.opacity=open?1:0;done()}
  if(open)setTimeout(()=>$('search').focus({preventScroll:true}),350);
}
$('openSheet').onclick=()=>sheet(true);$('closeSheet').onclick=scrim.onclick=()=>sheet(false);
addEventListener('keydown',e=>{if(e.key==='Escape')sheet(false)});
phone.addEventListener('change',()=>{side.classList.remove('open');side.style.transform='';if(G)G.set(side,{clearProps:'transform'});scrim.classList.remove('on');setTimeout(()=>{map.invalidateSize();movePlate(false)},60)});
// The sheet's fields move into it only on phones; on wide screens they sit in the filter bar.
if(G)G.set(side,{y:0,yPercent:phone.matches?105:0});
phone.addEventListener('change',e=>{if(G)G.set(side,{y:0,yPercent:e.matches?105:0})});

// Smooth scrolling (Lenis). The map and the table keep their own scrolling.
if(window.Lenis&&FX){lenis=new Lenis({lerp:.12,wheelMultiplier:1});G.ticker.add(t=>lenis.raf(t*1000));G.ticker.lagSmoothing(0)}

// One opening moment: the sign's title sets in letter by letter (React Bits SplitText, ported), then the number rolls up.
function intro(){
  if(!FX)return;
  const h=$('title'),txt=h.textContent;h.setAttribute('aria-label',txt);
  h.innerHTML=txt.split(' ').map(w=>'<span style="display:inline-block;white-space:nowrap">'+[...w].map(c=>'<span class="ch" aria-hidden="true">'+safe(c)+'</span>').join('')+'</span>').join(' ');
  G.from('#title .ch',{yPercent:60,opacity:0,duration:.6,ease:'power3.out',stagger:.025});
}
// Dark / light mode. Follows the device until the visitor picks one; the choice is remembered on this device only.
const SUN='<circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/>';
const MOON='<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>';
function paintToggle(){const dark=document.documentElement.dataset.theme==='dark',b=$('theme');
  b.querySelector('svg').innerHTML=dark?SUN:MOON;b.querySelector('span').textContent=dark?'Light':'Dark';
  b.setAttribute('aria-label',dark?'Switch to light mode':'Switch to dark mode')}
function setTheme(t,save){document.documentElement.dataset.theme=t;if(save)try{localStorage.setItem('theme',t)}catch(e){}paintToggle();
  if(LABEL.metric)renderLabels()}
$('theme').onclick=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark',true);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change',e=>{let saved;try{saved=localStorage.getItem('theme')}catch(_){}if(!saved)setTheme(e.matches?'dark':'light',false)});
paintToggle();
init();
