(async () => {
    if (location.origin !== 'https://omakanta.kanta.fi') throw new Error('Avaa OmaKannan uusi versio osoitteessa https://omakanta.kanta.fi.');
    if (window.kantainDownload?.running) throw new Error('Yhdistetty haku on jo käynnissä.');
    const now = new Date();
    const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const data = { format: 'kantain-laboratoriot-v1', start: '2010-05-01', end, exportedAt: now.toISOString(), complete: false, expectedEvents: null, events: [], filterOptions: [], errors: [], warnings: [] };
    const bundle = { format: 'kantain-kaikki-v1', start: data.start, end, exportedAt: data.exportedAt, complete: false, visits: [], prescriptions: [], labs: data, errors: [] };
    const base = '/api/arkistopalvelu/v2/laboratoriotutkimukset';
    const controller = new AbortController();
    const signal = controller.signal;
    const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
    const state = { running: true, data: bundle, progress: 'Aloitetaan', cancel: () => controller.abort() };
    window.kantainDownload = state;
    state.save = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `kantain_${data.start}_${data.end}${bundle.complete ? '' : '_KESKENERAINEN'}.json`;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    async function get(path) {
        for (let attempt = 0; attempt < 3; attempt++) {
            signal.throwIfAborted();
            const request = new AbortController();
            const abort = () => request.abort();
            signal.addEventListener('abort', abort, { once: true });
            const timer = setTimeout(abort, 45000);
            try {
                const response = await fetch(path, { credentials: 'same-origin', headers: { Accept: 'application/json' }, signal: request.signal, redirect: 'error' });
                if (response.status === 401 || response.status === 403) throw new Error('Kirjautuminen on vanhentunut tai tietoon ei ole käyttöoikeutta.');
                if ((response.status === 429 || response.status >= 500) && attempt < 2) {
                    await pause(Math.min(30000, Math.max(1000 * (attempt + 1), Number(response.headers.get('Retry-After') || 0) * 1000)));
                    continue;
                }
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                if (!response.headers.get('content-type')?.includes('json')) throw new Error('OmaKanta ei palauttanut JSON-tietoja. Kirjaudu tarvittaessa uudelleen.');
                return await response.json();
            } finally {
                clearTimeout(timer);
                signal.removeEventListener('abort', abort);
            }
        }
    }
    const progress = message => { console.log(message); state.progress = message; };
    try {
        const visits = new Map();
        try {
            let pages = 1;
            for (let page = 1; page <= pages; page++) {
                const query = new URLSearchParams({ alkuaika: data.start, loppuaika: data.end, page, size: 30, tyhjatKaynnit: false, jarjestys: 'VIIMEKSI_PAIVITETTY_ENSIN' });
                const list = await get(`/api/arkistopalvelu/v2/palvelutapahtumat?${query}`);
                if (!Array.isArray(list.palvelutapahtumat) || !Number.isInteger(list.maxPages) || list.maxPages > 10000) throw new Error('Käyntiluettelon rakenne on muuttunut.');
                pages = Math.max(1, list.maxPages);
                for (const visit of list.palvelutapahtumat) {
                    if (visits.has(visit.tempSetId)) throw new Error('Käyntiluettelo muuttui kesken haun. Suorita haku uudelleen.');
                    visits.set(visit.tempSetId, { tempSetId: visit.tempSetId, tunniste: visit.tunniste, alkuPvm: visit.alkuPvm });
                    bundle.visits.push({ ...visit, pvm: visit.alkuPvm, pvmStr: new Date(visit.alkuPvm).toLocaleDateString('fi-FI') });
                }
                progress(`Käyntien linkitys ${page}/${pages}`);
            }
        } catch (error) {
            bundle.errors.push(`Potilaskäyntien luettelo: ${error.message}`);
        }
        try {
            for (const [index, visit] of bundle.visits.entries()) {
                visit.details = await get(`/api/arkistopalvelu/v2/palvelutapahtumat/${encodeURIComponent(visit.tempSetId)}/terveystiedot`);
                if (!visit.details || typeof visit.details !== 'object') throw new Error('Potilastietojen rakenne on muuttunut.');
                progress(`Potilaskäynnit ${index + 1}/${bundle.visits.length}`);
                await pause(75);
            }
        } catch (error) { bundle.errors.push(`Potilaskäyntien sisältö: ${error.message}`); }
        try {
            const query = new URLSearchParams({ alkuaika: data.start, loppuaika: data.end });
            const list = await get(`/api/resepti/hae-rakenteiset-yksilointitiedot?${query}`);
            if (!Array.isArray(list)) throw new Error('Reseptiluettelon rakenne on muuttunut.');
            bundle.prescriptions = list;
            for (const [index, item] of list.entries()) {
                if (!item.setId || !item.aikaleima || !item.oid) throw new Error('Reseptin tunnistetiedot puuttuvat.');
                const versionQuery = new URLSearchParams({ setId: item.setId, maarayspvm: item.aikaleima.split('T')[0] });
                item.versions = await get(`/api/resepti/hae-laakemaarayksen-versiot?${versionQuery}`);
                const logQuery = new URLSearchParams({ oidit: item.oid, kieli: 'fi' });
                item.logs = await get(`/api/resepti/hae-lokitiedot?${logQuery}`);
                if (!item.versions || !item.logs) throw new Error('Reseptin tarkemmat tiedot puuttuvat.');
                progress(`Reseptit ${index + 1}/${list.length}`);
                await pause(75);
            }
        } catch (error) { bundle.errors.push(`Reseptit: ${error.message}`); }
        const keys = new Set();
        let maxPages = 1;
        for (let page = 1; page <= maxPages; page++) {
            const query = new URLSearchParams({ page, size: 20, alkuaika: data.start, loppuaika: data.end });
            const list = await get(`${base}/tutkimukset?${query}`);
            if (!Array.isArray(list.value) || !Number.isInteger(list.maxPages) || !Number.isInteger(list.tutkimuksetSize)) throw new Error('Laboratoriolistauksen rakenne on muuttunut.');
            if (data.expectedEvents !== null && data.expectedEvents !== list.tutkimuksetSize) throw new Error('Tulosten määrä muuttui haun aikana. Suorita haku uudelleen.');
            maxPages = Math.max(1, list.maxPages);
            if (maxPages > 10000) throw new Error('Virheellinen sivumäärä.');
            data.expectedEvents = list.tutkimuksetSize;
            data.filterOptions = list.options?.filterOptions || data.filterOptions;
            for (const event of list.value) {
                const key = `${event.tunniste}/${event.ajankohdanAvain}`;
                if (!keys.has(key)) { keys.add(key); data.events.push(event); }
            }
            progress(`Tuloslista ${page}/${maxPages}: ${data.events.length}/${data.expectedEvents}`);
        }
        if (data.events.length !== data.expectedEvents) throw new Error('Kaikkia tuloskokonaisuuksia ei saatu. Suorita haku uudelleen.');
        for (const [eventIndex, event] of data.events.entries()) {
            const path = `${base}/${encodeURIComponent(event.tunniste)}/tutkimukset/${encodeURIComponent(event.ajankohdanAvain)}`;
            const query = new URLSearchParams({ alkuaika: event.hakuvali.start, loppuaika: event.hakuvali.end });
            event.details = await get(`${path}?${query}`);
            event.linkedVisit = visits.get(event.details.palvelutapahtumanId) || null;
            if (!Array.isArray(event.details.tehdytTutkimukset)) throw new Error('Tuloskokonaisuuden rakenne on muuttunut.');
            event.studies = {};
            for (const item of event.details.tehdytTutkimukset) {
                const study = await get(`${path}/tutkimus/${encodeURIComponent(item.index)}?${query}`);
                if (!study.tutkimusYhteenveto || !study.tutkimuksenTarkemmatTiedot) throw new Error('Tutkimuksen rakenne on muuttunut.');
                if (study.nimi !== item.tutkimuksenNimi || JSON.stringify(study.tutkimusYhteenveto.tulos) !== JSON.stringify(item.tutkimustulos?.tulos)) throw new Error('Tutkimustiedot muuttuivat haun aikana. Suorita haku uudelleen.');
                event.studies[item.index] = study;
                await pause(75);
            }
            progress(`Tuloskokonaisuus ${eventIndex + 1}/${data.events.length}`);
        }
        data.complete = true;
    } catch (error) {
        data.errors.push(signal.aborted ? 'Haku keskeytettiin.' : error.message);
        progress(`Haku jäi kesken: ${data.errors.at(-1)}`);
    } finally {
        data.finishedAt = new Date().toISOString();
        bundle.errors.push(...data.errors.map(error => `Laboratoriotulokset: ${error}`));
        bundle.complete = data.complete && bundle.errors.length === 0;
        bundle.finishedAt = data.finishedAt;
        state.running = false;
        state.save();
        progress(bundle.complete ? `Valmis: ${bundle.visits.length} käyntiä, ${bundle.prescriptions.length} reseptiä ja ${data.events.length} laboratoriokokonaisuutta. Valitse Kantaimessa yksi tietue ja avaa tallennettu tiedosto.` : `Keskeneräinen tiedosto tallennettu. ${bundle.errors.join(' ')}`);
    }
})();
