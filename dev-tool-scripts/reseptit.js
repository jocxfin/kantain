(async () => {
    const headers = { 'Accept': '*/*' };
    const results = [];
  
    // muuta nämä aikavälit jos haluat hakea eri aikavälejä
    const ranges = [
      ['2010-05-01', '2025-08-06']
    ];
  
    console.log('Aloitetaan reseptitietojen lataus...');
    let totalProcessed = 0;
    let totalItems = 0;
    
    for (const [start, end] of ranges) {
      console.log(`Haetaan reseptejä aikaväliltä ${start} - ${end}`);
      const listUrl = `/api/resepti/hae-rakenteiset-yksilointitiedot?alkuaika=${start}&loppuaika=${end}`;
      const listResp = await fetch(listUrl, { credentials: 'include', headers });
      if (!listResp.ok) {
        console.warn(`List ${start}→${end} failed: ${listResp.status}`);
        continue;
      }
      const items = await listResp.json();
      totalItems += items.length;
      
      console.log(`Löydettiin ${items.length} reseptiä. Ladataan yksityiskohtia...`);
  
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const date = item.aikaleima.split('T')[0];

        let versions = null;
        try {
          const url = `/api/resepti/hae-laakemaarayksen-versiot?setId=${item.setId}&maarayspvm=${date}`;
          const r = await fetch(url, { credentials: 'include', headers });
          if (r.ok) versions = await r.json();
          else console.warn(`Versions ${item.setId} → ${r.status}`);
        } catch {
          console.warn(`Bad JSON for versions ${item.setId}`);
        }

        let logs = null;
        try {
          const url = `/api/resepti/hae-lokitiedot?oidit=${item.oid}&kieli=fi`;
          const r = await fetch(url, { credentials: 'include', headers });
          if (r.ok) logs = await r.json();
          else console.warn(`Logs ${item.oid} → ${r.status}`);
        } catch {
          console.warn(`Bad JSON for logs ${item.oid}`);
        }
  
        results.push({ ...item, versions, logs });
        totalProcessed++;
        if (totalProcessed % 3 === 0) {
          console.log(`Käsitelty ${totalProcessed}/${totalItems} reseptiä...`);
        }
      }
    }
  
    console.log(`Valmis! Ladattiin yhteensä ${totalProcessed} reseptiä.`);
    console.log('Luodaan JSON-tiedostoa...');
    
    const blob = new Blob([JSON.stringify(results)], { type: 'application/json' });
    const dl = document.createElement('a');
    dl.href = URL.createObjectURL(blob);
    dl.download = `reseptit_${ranges[0][0]}_${ranges[0][1]}.json`;
    document.body.appendChild(dl);
    dl.click();
    document.body.removeChild(dl);
    
    console.log(`${dl.download} -tiedosto ladattu!`);
  })();
  