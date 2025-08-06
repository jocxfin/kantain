(async () => {
    const headers = { 'Accept': '*/*' };
    const results = [];
    // muuta nämä aikavälit jos haluat hakea eri aikavälejä
    const ranges = [
      ['2010-05-01', '2025-08-06']
    ];
  
    console.log('Aloitetaan palvelutapahtumien lataus...');
    let totalProcessed = 0;
    
    for (const [start, end] of ranges) {
      console.log(`Haetaan tapahtumia aikaväliltä ${start} - ${end}`);
      const listUrl = `/api/arkistopalvelu/palvelutapahtumat?alkuaika=${start}&loppuaika=${end}`;
      const listResp = await fetch(listUrl, { credentials: 'include', headers });
      if (!listResp.ok) continue;
      const events = await listResp.json();
      
      console.log(`Löydettiin ${events.length} tapahtumaa. Ladataan yksityiskohtia...`);
      
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const id = ev.tempSetId;
        const detailsUrl = `/api/arkistopalvelu/palvelutapahtumat/${id}/terveystiedot?vainTutkimuksia=false`;
        const detResp = await fetch(detailsUrl, { credentials: 'include', headers });
        if (!detResp.ok) {
          console.warn(`Skipped ${id}: ${detResp.status}`);
          continue;
        }
        let details;
        try {
          details = await detResp.json();
        } catch {
          console.warn(`Invalid JSON for ${id}`);
          continue;
        }
        results.push({ ...ev, details });
        totalProcessed++;
        if (totalProcessed % 5 === 0) {
          console.log(`Käsitelty ${totalProcessed}/${events.length} tapahtumaa...`);
        }
      }
    }
  
    console.log(`Valmis! Ladattiin yhteensä ${totalProcessed} palvelutapahtumaa.`);
    console.log('Luodaan JSON-tiedostoa...');
    
    const blob = new Blob([JSON.stringify(results)], { type: 'application/json' });
    const dl = document.createElement('a');
    dl.href = URL.createObjectURL(blob);
    dl.download = `palvelutapahtumat_${ranges[0][0]}_${ranges[0][1]}.json`;
    document.body.appendChild(dl);
    dl.click();
    document.body.removeChild(dl);
    
    console.log(`${dl.download} -tiedosto ladattu!`);
  })();
  