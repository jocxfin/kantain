(async () => {
    const headers = { 'Accept': '*/*' };
    const results = [];

    function stdDate(date) {
      const year = date.getFullYear();
      const month = String(date.getMonth() + 1).padStart(2, "0");
      const day = String(date.getDate()).padStart(2, "0");
      
      return `${year}-${month}-${day}`;
    }
    // haetaan aloituspäivämäärä ja päivämäärä tänään. muuta aloituspäivämäärää jos haluat hakea vain tietyn päivämäärän jälkeisiä tietoja
    const startDate = new Date('2010-05-01');
    const today = new Date();
    
    const queryRanges = [
      [stdDate(startDate), stdDate(today)]
    ];

    console.log('Aloitetaan palvelutapahtumien lataus...');
    console.log(`Haetaan tapahtumia aikaväliltä ${queryRanges[0][0]} - ${queryRanges[0][1]}`);

    async function fetchEventList(start, end) {
      const listUrl = `/api/arkistopalvelu/palvelutapahtumat?alkuaika=${start}&loppuaika=${end}`;
      const listResp = await fetch(listUrl, { credentials: 'include', headers });
      if (!listResp.ok) {
        console.warn(`Failed to fetch event list for ${start}-${end}: ${listResp.status}`);
        return [];
      }
      return await listResp.json();
    }

    async function fetchEventDetails(eventId) {
      const detailsUrl = `/api/arkistopalvelu/palvelutapahtumat/${eventId}/terveystiedot?vainTutkimuksia=false`;
      const detResp = await fetch(detailsUrl, { credentials: 'include', headers });
      if (!detResp.ok) {
        console.warn(`Skipped ${eventId}: ${detResp.status}`);
        return null;
      }
      try {
        return await detResp.json();
      } catch {
        console.warn(`Invalid JSON for ${eventId}`);
        return null;
      }
    }

    async function processEvents(events) {
      let totalProcessed = 0;
      
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const id = ev.tempSetId;
        
        const details = await fetchEventDetails(id);
        if (details) {
          results.push({ ...ev, details });
        }
        
        totalProcessed++;
        if (totalProcessed % 5 === 0) {
          console.log(`Käsitelty ${totalProcessed}/${events.length} tapahtumaa...`);
        }
      }
      
      return totalProcessed;
    }

    let totalProcessed = 0;
    
    for (const [start, end] of queryRanges) {
      const events = await fetchEventList(start, end);
      
      if (events.length > 0) {
        console.log(`Löydettiin ${events.length} tapahtumaa. Ladataan yksityiskohtia...`);
        const processed = await processEvents(events);
        totalProcessed += processed;
      } else {
        console.log('Ei tapahtumia tälle aikavälille.');
      }
    }

    console.log(`Valmis! Ladattiin yhteensä ${totalProcessed} palvelutapahtumaa.`);
    console.log('Luodaan JSON-tiedostoa...');
    
    const blob = new Blob([JSON.stringify(results)], { type: 'application/json' });
    const dl = document.createElement('a');
    dl.href = URL.createObjectURL(blob);
    dl.download = `palvelutapahtumat_${queryRanges[0][0]}_${queryRanges[0][1]}.json`;
    document.body.appendChild(dl);
    dl.click();
    document.body.removeChild(dl);
    
    console.log(`${dl.download} -tiedosto ladattu!`);
  })();
  