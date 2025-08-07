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

    console.log('Aloitetaan reseptitietojen lataus...');
    console.log(`Haetaan reseptejä aikaväliltä ${queryRanges[0][0]} - ${queryRanges[0][1]}`);

    async function fetchPrescriptionList(start, end) {
      const listUrl = `/api/resepti/hae-rakenteiset-yksilointitiedot?alkuaika=${start}&loppuaika=${end}`;
      const listResp = await fetch(listUrl, { credentials: 'include', headers });
      if (!listResp.ok) {
        console.warn(`List ${start}→${end} failed: ${listResp.status}`);
        return [];
      }
      return await listResp.json();
    }

    async function fetchPrescriptionVersions(setId, date) {
      try {
        const url = `/api/resepti/hae-laakemaarayksen-versiot?setId=${setId}&maarayspvm=${date}`;
        const r = await fetch(url, { credentials: 'include', headers });
        if (r.ok) return await r.json();
        else {
          console.warn(`Versions ${setId} → ${r.status}`);
          return null;
        }
      } catch {
        console.warn(`Bad JSON for versions ${setId}`);
        return null;
      }
    }

    async function fetchPrescriptionLogs(oid) {
      try {
        const url = `/api/resepti/hae-lokitiedot?oidit=${oid}&kieli=fi`;
        const r = await fetch(url, { credentials: 'include', headers });
        if (r.ok) return await r.json();
        else {
          console.warn(`Logs ${oid} → ${r.status}`);
          return null;
        }
      } catch {
        console.warn(`Bad JSON for logs ${oid}`);
        return null;
      }
    }

    async function processPrescriptions(items) {
      let totalProcessed = 0;
      
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        const date = item.aikaleima.split('T')[0];

        const versions = await fetchPrescriptionVersions(item.setId, date);
        const logs = await fetchPrescriptionLogs(item.oid);

        results.push({ ...item, versions, logs });
        totalProcessed++;
        if (totalProcessed % 3 === 0) {
          console.log(`Käsitelty ${totalProcessed}/${items.length} reseptiä...`);
        }
      }
      
      return totalProcessed;
    }

    let totalProcessed = 0;
    let totalItems = 0;
    
    for (const [start, end] of queryRanges) {
      const items = await fetchPrescriptionList(start, end);
      totalItems += items.length;
      
      if (items.length > 0) {
        console.log(`Löydettiin ${items.length} reseptiä. Ladataan yksityiskohtia...`);
        const processed = await processPrescriptions(items);
        totalProcessed += processed;
      } else {
        console.log('Ei reseptejä löytynyt tälle aikavälille.');
      }
    }

    console.log(`Valmis! Ladattiin yhteensä ${totalProcessed} reseptiä.`);
    console.log('Luodaan JSON-tiedostoa...');
    
    const blob = new Blob([JSON.stringify(results)], { type: 'application/json' });
    const dl = document.createElement('a');
    dl.href = URL.createObjectURL(blob);
    dl.download = `reseptit_${queryRanges[0][0]}_${queryRanges[0][1]}.json`;
    document.body.appendChild(dl);
    dl.click();
    document.body.removeChild(dl);
    
    console.log(`${dl.download} -tiedosto ladattu!`);
  })();
  