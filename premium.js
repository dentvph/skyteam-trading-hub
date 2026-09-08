'use strict';
(() => {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  if ('IntersectionObserver' in window && !reduced.matches) {
    document.documentElement.classList.add('motion-ready');
    const observer = new IntersectionObserver(entries => entries.forEach(entry => {
      if (entry.isIntersecting) { entry.target.classList.add('show'); observer.unobserve(entry.target); }
    }), {threshold: .06});
    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }
  const scenarios = [
    {title:'Trend & pullback', context:'Trend', focus:'Pullback', note:'A pullback changes the short-term direction. Study whether the broader structure still holds.', values:[34,41,37,49,58,53,63,70,65,57,61,73,79,72,85,92]},
    {title:'Inside the range', context:'Range', focus:'Boundaries', note:'Price moves between boundaries. Study both sides of the range instead of assuming every move will continue.', values:[51,62,73,68,55,43,48,61,72,66,54,44,52,68,61,56]},
    {title:'A shift in structure', context:'Reversal', focus:'Transition', note:'A previous direction begins to change. Study the structure and the possibility of a failed reversal.', values:[91,84,88,76,69,74,61,55,59,50,62,68,64,75,70,80]}
  ];
  const svg = document.getElementById('market-chart');
  const ns = 'http://www.w3.org/2000/svg';
  function node(name, attrs, parent) {
    const el=document.createElementNS(ns,name);
    Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));
    (parent||svg).appendChild(el);return el;
  }
  function draw(index) {
    const item=scenarios[index];svg.replaceChildren();
    svg.setAttribute('aria-label','Illustrative candlestick chart: '+item.title+'. No actual market prices.');
    const defs=node('defs',{});
    [['up','#e9d7a9','#b69656'],['down','#6c9f93','#2c554c']].forEach(([id,a,b])=>{
      const g=node('linearGradient',{id,x1:'0%',y1:'0%',x2:'100%',y2:'100%'},defs);
      node('stop',{offset:'0%','stop-color':a},g);node('stop',{offset:'100%','stop-color':b},g);
    });
    for(let y=45;y<=260;y+=50)node('path',{d:'M15 '+y+' H585',stroke:'#97b4a6','stroke-opacity':'.13','stroke-dasharray':'3 6'});
    for(let x=30;x<580;x+=70)node('path',{d:'M'+x+' 20 V275',stroke:'#97b4a6','stroke-opacity':'.07'});
    const points=[];
    item.values.forEach((close,i)=>{
      const open=i?item.values[i-1]:29,x=27+i*35,y=265-Math.max(open,close)*2.2,h=Math.max(7,Math.abs(close-open)*2.2),up=close>=open;
      const g=node('g',{'class':'candle'});
      node('path',{d:'M'+(x+9)+' '+(y-12)+' V'+(y+h+15),stroke:up?'#e4ca92':'#73a69a','stroke-width':'2'},g);
      node('rect',{x,y,width:18,height:h,rx:2,fill:'url(#'+(up?'up':'down')+')'},g);
      node('path',{d:'M'+(x+18)+' '+y+' l5 -5 v'+h+' l-5 5Z',fill:up?'#80693f':'#214d42'},g);
      node('path',{d:'M'+x+' '+y+' l5 -5 h18 l-5 5Z',fill:up?'#fff0c7':'#aacfc0'},g);
      points.push((x+9)+','+(265-close*2.2));
      node('rect',{x,y:279-(11+(i*13)%23),width:19,height:11+(i*13)%23,fill:up?'#d4b979':'#659387',opacity:'.2'},g);
    });
    node('polyline',{points:points.join(' '),fill:'none',stroke:'#c6d9cd','stroke-opacity':'.25','stroke-width':'1','stroke-dasharray':'3 5'});
    document.getElementById('scenario-title').textContent=item.title;
    document.getElementById('context-stat').textContent=item.context;
    document.getElementById('focus-stat').textContent=item.focus;
    document.getElementById('scenario-note').textContent=item.note;
    document.querySelector('.chart-tag').textContent='STUDY 0'+(index+1);
    document.querySelector('.terminal-label span:last-child').textContent='0'+(index+1)+' / 03';
    document.querySelectorAll('[data-scenario]').forEach((button,i)=>button.setAttribute('aria-pressed',String(i===index)));
  }
  document.querySelectorAll('[data-scenario]').forEach(button=>button.addEventListener('click',()=>draw(Number(button.dataset.scenario))));
  draw(0);
  const lessons=['Before the entry: market preparation','Confirm the idea. Define the invalidation.','After the trade: review the process'];
  document.querySelectorAll('[data-lesson]').forEach(button=>button.addEventListener('click',()=>{
    document.querySelectorAll('[data-lesson]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));
    document.querySelector('.video-copy h3').textContent=lessons[Number(button.dataset.lesson)];
  }));
  const scene=document.querySelector('.scene'),screen=document.querySelector('.screen');
  let frame=0;
  scene.addEventListener('pointermove',event=>{
    if(reduced.matches || event.pointerType!=='mouse' || innerWidth<901)return;
    cancelAnimationFrame(frame);
    frame=requestAnimationFrame(()=>{
      const r=scene.getBoundingClientRect(),x=(event.clientX-r.left)/r.width-.5,y=(event.clientY-r.top)/r.height-.5;
      screen.style.transform='rotateY('+(-13+x*12)+'deg) rotateX('+(9-y*10)+'deg) rotateZ(-2deg)';
    });
  });
  scene.addEventListener('pointerleave',()=>{cancelAnimationFrame(frame);screen.style.transform='';});
  reduced.addEventListener('change',()=>{screen.style.transform='';});
})();
