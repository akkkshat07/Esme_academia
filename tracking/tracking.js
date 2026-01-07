(function(){
  // waits for your dashboard structure and wires listeners
  function wire(){
    const email = localStorage.getItem('currentUserEmail') || '';
    const cards = document.querySelectorAll('.video-card');
    if (!cards.length || !email) return false;

    cards.forEach(card => {
      const title = (card.querySelector('h3')?.textContent || '').trim();
      const video = card.querySelector('video');
      const btn = card.querySelector('.complete-btn') || card.querySelector('.mark-complete-btn');

      let start = null, watched = 0, lastPos = 0;
      if (video) {
        video.addEventListener('play', ()=>{ start = Date.now(); });
        video.addEventListener('pause', ()=>{ if(start){ watched += (Date.now()-start)/1000; start=null; lastPos = Math.round(video.currentTime||0); send('pause'); }});
        video.addEventListener('ended', ()=>{ if(start){ watched += (Date.now()-start)/1000; start=null; lastPos = Math.round(video.duration||0); send('ended', 100); }});
      }
      if (btn) btn.addEventListener('click', ()=> send('manual-complete', 100));

      async function send(event, percentOverride){
        const durLbl = card.querySelector('.duration-label')?.textContent || '';
        const m = /(\d+)\s*seconds/.exec(durLbl);
        const duration = m ? Number(m[1]) : 0;
        const percent = percentOverride ?? (duration ? Math.min(100, Math.round((watched/duration)*100)) : 0);

        fetch('http://localhost:3002/api/progress', {
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({
            email, title,
            watched_seconds: Math.round(watched),
            last_position_seconds: lastPos,
            percent_watched: percent,
            event
          })
        }).catch(()=>{});
      }
    });
    return true;
  }

  const ready = setInterval(()=>{ if (wire()) clearInterval(ready); }, 1000);
})();
