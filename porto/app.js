/* Porto + Braga – rejseguide. Al tekst og data ligger i trip.json. */
(() => {
  'use strict';

  const TZ_TRIP = 'Europe/Lisbon';
  const TZ_HOME = 'Europe/Copenhagen';
  const KEY_PW = 'porto-kode';
  const KEY_KASSE = 'porto-kasse';
  const KEY_SECRET = 'porto-hemmelig';
  const KEY_SCROLL = 'porto-scroll';

  // Vi genskaber selv scroll-positionen, når indholdet er tegnet. Ellers
  // hopper browseren til toppen og tilbage, fordi siden bygges af JS.
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';

  let trip = null;
  let secret = null;
  let selectedDay = 'tor';

  // ---------- Hjælpere ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ext = (url, label, cls = '') => url ? `<a href="${esc(url)}" target="_blank" rel="noopener"${cls ? ` class="${cls}"` : ''}>${esc(label)}</a>` : '';
  const mapsLink = (url) => url ? `<a class="maplink" href="${esc(url)}" target="_blank" rel="noopener">Maps</a>` : '';

  const store = {
    get(key, fallback) { try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; } },
    set(key, val) { try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* privat vindue o.l. */ } },
    del(key) { try { localStorage.removeItem(key); } catch { /* ignorer */ } },
  };

  // ?now=2026-10-09T16:00:00+01:00 gør det muligt at teste "I dag"-visningen.
  const nowOverride = (() => {
    const q = new URLSearchParams(location.search).get('now');
    const d = q ? new Date(q) : null;
    return d && !isNaN(d) ? d.getTime() - Date.now() : 0;
  })();
  const now = () => new Date(Date.now() + nowOverride);

  function localParts(date, tz) {
    const f = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
    const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: Number(p.hour) * 60 + Number(p.minute) };
  }
  const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };

  function splitDuration(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    return { d: Math.floor(s / 86400), h: Math.floor(s / 3600) % 24, m: Math.floor(s / 60) % 60, s: s % 60 };
  }
  function humanUntil(ms) {
    const { d, h, m } = splitDuration(ms);
    if (d > 0) return `om ${d} ${d === 1 ? 'dag' : 'dage'} og ${h} t`;
    if (h > 0) return `om ${h} t ${m} min`;
    return m > 0 ? `om ${m} min` : 'nu';
  }

  const eur = new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'EUR' });

  // ---------- Adgangskode + dekryptering ----------
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  async function decryptSecret(password) {
    const s = trip.secret;
    if (!s || !s.data) return {};
    const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(s.salt), iterations: 150000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']
    );
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(s.iv) }, key, b64(s.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  const normPw = (s) => String(s || '').trim().toUpperCase();

  async function tryUnlock(pw) {
    try { secret = await decryptSecret(normPw(pw)); return true; } catch { return false; }
  }

  function showGate() {
    const gate = $('#gate');
    gate.hidden = false;
    const input = $('#gate-input');
    input.focus();
    $('#gate-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = $('#gate-form button');
      btn.disabled = true;
      const ok = await tryUnlock(input.value);
      btn.disabled = false;
      if (ok) {
        store.set(KEY_PW, normPw(input.value));
        store.set(KEY_SECRET, { iv: trip.secret.iv, secret });
        gate.hidden = true;
        startApp();
      } else {
        $('#gate-error').hidden = false;
        input.select();
      }
    });
  }

  // ---------- Fælles byggeklodser ----------
  function countdownHTML(iso, doneText) {
    return `<div class="countdown" data-countdown="${esc(iso)}" data-done="${esc(doneText)}">
      <div><b data-u="d">–</b><span>dage</span></div>
      <div><b data-u="h">–</b><span>timer</span></div>
      <div><b data-u="m">–</b><span>min</span></div>
      <div><b data-u="s">–</b><span>sek</span></div>
    </div>`;
  }
  function tickCountdowns() {
    document.querySelectorAll('[data-countdown]').forEach((el) => {
      const ms = new Date(el.dataset.countdown) - now();
      if (ms <= 0) { el.outerHTML = `<p class="countdown-done">${esc(el.dataset.done)}</p>`; return; }
      const parts = splitDuration(ms);
      for (const u of ['d', 'h', 'm', 's']) {
        const b = el.querySelector(`[data-u="${u}"]`);
        const v = u === 'd' ? String(parts[u]) : String(parts[u]).padStart(2, '0');
        if (b.textContent !== v) b.textContent = v;
      }
    });
    document.querySelectorAll('[data-until]').forEach((el) => {
      const ms = new Date(el.dataset.until) - now();
      el.textContent = ms > 0 ? `Afgang ${humanUntil(ms)}` : el.dataset.done;
    });
  }

  function photoFigure(id, cls = '') {
    const p = trip.photos[id];
    if (!p) return '';
    return `<figure class="${cls}">
      <img src="${esc(p.src)}"${p.srcLarge && p.srcLarge !== p.src ? ` srcset="${esc(p.src)} 800w, ${esc(p.srcLarge)} 1600w" sizes="(min-width: 1080px) 1080px, 100vw"` : ''} alt="${esc(p.alt)}" loading="lazy" decoding="async">
      ${creditLine(p)}
    </figure>`;
  }
  const creditLine = (p) => `<p class="credit">${esc(p.caption)}. Foto: ${esc(p.author)} / ${ext(p.source, 'Wikimedia Commons')}, ${ext(p.licenseUrl, p.license)}.</p>`;

  const note = (label, text, warn = false) => `<div class="note${warn ? ' note-warn' : ''}"><p class="label">${esc(label)}</p><p>${esc(text)}</p></div>`;

  // ---------- Hero ----------
  function renderHero() {
    const m = trip.meta, b = trip.base;
    const p = trip.photos[m.heroPhoto];
    $('#hero').innerHTML = `
      <h1 class="hero-title">${esc(m.title)}</h1>
      <p class="hero-sub">${esc(m.subtitle)}</p>
      <p class="hero-dates">${esc(m.dates)}</p>
      <div class="hero-photo">
        <img src="${esc(p.src)}" srcset="${esc(p.src)} 800w, ${esc(p.srcLarge)} 1600w" sizes="(min-width: 1080px) 1080px, 100vw" alt="${esc(p.alt)}" fetchpriority="high">
      </div>
      <div class="countdown-card">
        <p class="label">Nedtælling</p>
        ${countdownHTML(m.countdownTo, 'Vi er afsted. God tur!')}
        <p class="countdown-sub">${esc(m.countdownLabel)}</p>
      </div>
      ${creditLine(p)}
      <div class="card base-card">
        <p class="label">${esc(b.label)}</p>
        <p class="addr">${esc(b.address)}</p>
        <p class="muted" style="margin:0">${esc(b.arrival)} · ${esc(b.departure)}</p>
        <div class="btn-row"><a class="btn btn-primary" href="${esc(b.maps)}" target="_blank" rel="noopener">${esc(b.mapsLabel)}</a></div>
      </div>`;
  }

  // ---------- Tidslinje: nu / næste ----------
  function dayState(day, minutes) {
    const items = day.items.map((it, i) => {
      const start = toMin(it.start);
      const next = day.items[i + 1];
      const end = it.end ? toMin(it.end) : next ? toMin(next.start) : start + 60;
      return { it, i, start, end };
    });
    const current = items.find((x) => minutes >= x.start && minutes < x.end) || null;
    const upcoming = items.find((x) => x.start > minutes) || null;
    return { items, current, upcoming };
  }

  // ---------- Fly ----------
  function renderFlights() {
    const f = trip.flights;
    const names = (secret && secret.names) || {};
    const plane = '<svg width="34" height="14" viewBox="0 0 34 14" aria-hidden="true"><path d="M1 7h30M25 2l6 5-6 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const tzLabel = (tz) => tz === TZ_HOME ? 'dansk tid' : 'Porto-tid';
    const pass = (leg) => `
      <article class="pass">
        <div class="pass-top"><p class="label">${esc(leg.label)} · ${esc(leg.date)}</p><b>${esc(leg.flight)}</b></div>
        <div class="pass-body">
          <div class="route">
            <div>
              <div class="code">${esc(leg.from.code)}</div>
              <div class="city">${esc(leg.from.city)}</div>
              <div class="time">${esc(leg.from.time)}</div>
              <div class="tz">${tzLabel(leg.from.tz)}</div>
              ${leg.from.terminal ? `<div class="term">${esc(leg.from.terminal)}</div>` : ''}
            </div>
            <div class="plane">${plane}${esc(leg.duration)}</div>
            <div class="to">
              <div class="code">${esc(leg.to.code)}</div>
              <div class="city">${esc(leg.to.city)}</div>
              <div class="time">${esc(leg.to.time)}</div>
              <div class="tz">${tzLabel(leg.to.tz)}</div>
              ${leg.to.terminal ? `<div class="term">${esc(leg.to.terminal)}</div>` : ''}
            </div>
          </div>
          <dl class="pass-meta">
            <div><dt>Bagage</dt><dd>Kun håndbagage, 10 kg</dd></div>
            <div><dt>Boarding</dt><dd>Priority</dd></div>
            <div><dt>Sæde</dt><dd>Ingen reservation</dd></div>
            <div><dt>Check-in</dt><dd>Online, påkrævet</dd></div>
            ${secret && secret.bookingRef ? `<div><dt>Booking</dt><dd>${esc(secret.bookingRef)}</dd></div>` : ''}
          </dl>
          <div class="pass-tear"></div>
        </div>
        <div class="pass-foot">
          <p class="pass-count" data-until="${esc(leg.from.iso)}" data-done="Flyet er lettet">&nbsp;</p>
          ${note('Husk', leg.reminder, true)}
          <div class="btn-row">
            <button class="btn btn-sm btn-primary" data-ics="${esc(leg.id)}">Tilføj til kalender</button>
            <a class="btn btn-sm" href="${esc(f.checkinUrl)}" target="_blank" rel="noopener">${esc(f.checkinLabel)}</a>
          </div>
        </div>
      </article>`;

    $('#fly').innerHTML = `
      <div class="section-head"><p class="label">Fly · ${esc(f.airline)}</p><h2>Afgang og hjemrejse</h2><p class="intro">${esc(f.bookingNote)}</p></div>
      <div class="grid grid-2">${f.legs.map(pass).join('')}</div>
      <div class="grid grid-2" style="margin-top:14px">
        <div class="card">
          <p class="label">Bookingreference</p>
          <p class="bookref">${esc((secret && secret.bookingRef) || '––––––')}</p>
          <p class="label" style="margin-top:14px">Rejsende</p>
          <ul class="pax">${trip.travelers.map((n) => `<li><b>${esc(n)}</b><span>${esc(names[n] || '')}</span></li>`).join('')}</ul>
        </div>
        <div class="card">
          <p class="label">Bagage og vilkår (gælder alle)</p>
          <ul class="baglist">${f.baggage.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
        </div>
      </div>`;

    $('#fly').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-ics]');
      if (btn) downloadICS(f.legs.find((l) => l.id === btn.dataset.ics));
    });
  }

  function downloadICS(leg) {
    const z = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const icsEsc = (s) => String(s).replace(/\\/g, '\\\\').replace(/[,;]/g, (c) => '\\' + c).replace(/\n/g, '\\n');
    const ref = secret && secret.bookingRef ? `Booking: ${secret.bookingRef}. ` : '';
    const lines = [
      'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Porto-guide//DA', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT',
      `UID:${leg.flight}-${z(leg.from.iso)}@porto-guide`,
      `DTSTAMP:${z(new Date().toISOString())}`,
      `DTSTART:${z(leg.from.iso)}`,
      `DTEND:${z(leg.to.iso)}`,
      `SUMMARY:${icsEsc(`${leg.flight} ${leg.from.city} → ${leg.to.city}`)}`,
      `LOCATION:${icsEsc(`${leg.from.city} (${leg.from.code})${leg.from.terminal ? ' ' + leg.from.terminal : ''}`)}`,
      `DESCRIPTION:${icsEsc(`${trip.flights.airline} ${leg.flight}. ${ref}Ankomst ${leg.to.code}${leg.to.terminal ? ' ' + leg.to.terminal : ''} kl. ${leg.to.time}. Kun håndbagage (max 10 kg). Online check-in er påkrævet før gate. ${leg.reminder}`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Fly i dag', 'TRIGGER:-PT3H', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR',
    ];
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${leg.flight}-${leg.id}.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- Program ----------
  function renderProgram() {
    const todayDate = localParts(now(), TZ_TRIP).date;
    const today = trip.days.find((d) => d.date === todayDate);
    if (today) selectedDay = today.id;

    $('#program').innerHTML = `
      <div class="section-head"><p class="label">Dagsprogrammer</p><h2>Dag for dag</h2><p class="intro">Alle tider er lokale (Porto-tid). Tiderne er planforslag, medmindre andet står.</p></div>
      <div class="tabs" role="tablist">
        ${trip.days.map((d) => `<button class="tab" role="tab" id="tab-${esc(d.id)}" aria-controls="panel-${esc(d.id)}" aria-selected="${d.id === selectedDay}" data-day="${esc(d.id)}">${esc(d.tab)}${d.date === todayDate ? '<span class="dot" title="I dag"></span>' : ''}</button>`).join('')}
      </div>
      ${trip.days.map((d) => `
        <div class="card day-panel" role="tabpanel" id="panel-${esc(d.id)}" aria-labelledby="tab-${esc(d.id)}" ${d.id === selectedDay ? '' : 'hidden'}>
          <div class="day-head"><p class="label">${esc(d.kicker)}</p><h3>${esc(d.title)}</h3><p class="muted" style="margin:0">${esc(d.intro)}</p></div>
          <ol class="timeline">
            ${d.items.map((it, i) => `
              <li class="tl-item${it.highlight ? ' is-highlight' : ''}" data-day="${esc(d.id)}" data-i="${i}">
                <div class="tl-time">${esc(it.time)}</div>
                <div class="tl-body">
                  <h4>${esc(it.title)}</h4>
                  <p>${esc(it.text)}</p>
                  <div class="tl-foot">
                    ${it.price ? `<span class="price">${esc(it.price)}</span>` : ''}
                    ${it.booking ? '<span class="tag-book">Reservér</span>' : ''}
                    ${mapsLink(it.maps)}
                  </div>
                </div>
              </li>`).join('')}
          </ol>
          ${d.notes.map((n) => note(n.label, n.text, /vigtigste|skrider/i.test(n.label))).join('')}
          ${d.links.length ? `<div class="day-links">${d.links.map((l) => ext(l.url, l.label)).join('')}</div>` : ''}
        </div>`).join('')}`;

    $('#program').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (tab) selectDay(tab.dataset.day);
    });
    $('#program .tabs').addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
      const ids = trip.days.map((d) => d.id);
      const i = ids.indexOf(selectedDay) + (e.key === 'ArrowRight' ? 1 : -1);
      const id = ids[(i + ids.length) % ids.length];
      selectDay(id);
      $(`#tab-${id}`).focus();
    });
  }

  function selectDay(id) {
    selectedDay = id;
    document.querySelectorAll('#program .tab').forEach((t) => t.setAttribute('aria-selected', String(t.dataset.day === id)));
    document.querySelectorAll('#program .day-panel').forEach((p) => { p.hidden = p.id !== `panel-${id}`; });
  }

  function markTimeline() {
    const lp = localParts(now(), TZ_TRIP);
    document.querySelectorAll('.tl-item').forEach((li) => li.classList.remove('is-past', 'is-now', 'is-next'));
    const day = trip.days.find((d) => d.date === lp.date);
    if (!day) return;
    const { items, current, upcoming } = dayState(day, lp.minutes);
    items.forEach((x) => {
      const li = document.querySelector(`.tl-item[data-day="${day.id}"][data-i="${x.i}"]`);
      if (!li) return;
      if (current && x.i === current.i) li.classList.add('is-now');
      else if (upcoming && x.i === upcoming.i) li.classList.add('is-next');
      else if (x.end <= lp.minutes) li.classList.add('is-past');
    });
  }

  // ---------- Historier ----------
  function renderStories() {
    const dayName = Object.fromEntries(trip.days.map((d) => [d.id, d.tab]));
    $('#historier').innerHTML = `
      <div class="section-head"><p class="label">Historier</p><h2>Det, I skal kigge efter</h2><p class="intro">Tryk på et kort for at folde historien ud.</p></div>
      ${trip.stories.map((sd) => `
        <div class="storyday">
          <p class="label">${esc(sd.kicker || dayName[sd.day])}</p>
          <h3>${esc(sd.title)}</h3>
          <p class="muted">${esc(sd.intro)}</p>
          ${sd.photo ? photoFigure(sd.photo, 'day-photo') : ''}
          <div class="grid grid-2">
            ${sd.items.map((s) => {
              const p = s.photo && trip.photos[s.photo];
              return `
              <details class="story">
                <summary>
                  ${p ? `<img class="thumb" src="${esc(p.thumb || p.src)}" alt="" width="52" height="52">` : '<span class="thumb thumb-tile" aria-hidden="true"></span>'}
                  <h4>${esc(s.title)}</h4>
                  <span class="chev" aria-hidden="true">+</span>
                </summary>
                <div class="story-body">
                  ${p ? photoFigure(s.photo) : ''}
                  <p>${esc(s.text)}</p>
                  ${s.url ? ext(s.url, 'Læs mere / praktisk information', 'btn btn-sm btn-copper') : ''}
                </div>
              </details>`;
            }).join('')}
          </div>
          ${sd.extra ? note(sd.extra.label, sd.extra.text) : ''}
        </div>`).join('')}`;
  }

  // ---------- Kampdag ----------
  function renderMatch() {
    const m = trip.matchday;
    $('#kamp').innerHTML = `
      <div class="match">
        <div class="match-grid">
          <div>
            <p class="label">Kampdag · ${esc(m.kickoffLabel)}</p>
            <h2>${esc(m.title)}</h2>
            <p class="vs">${esc(m.venue)} · ${esc(m.expectedEnd)}</p>
            <p class="label" style="margin-top:6px">Nedtælling til kickoff</p>
            ${countdownHTML(m.kickoff, 'Kampen er i gang, eller spillet. Forza!')}
            ${note('Hjem efter kampen', m.note)}
            <p class="small" style="margin-top:12px;opacity:.9">${esc(m.tickets)}</p>
            <div class="btn-row">
              <a class="btn btn-sm" href="${esc(m.maps)}" target="_blank" rel="noopener">Stadion i Maps</a>
              <a class="btn btn-sm" href="${esc(m.url)}" target="_blank" rel="noopener">Om stadion</a>
              <a class="btn btn-sm" href="#program" data-goto-day="fre">Fredagens program</a>
            </div>
          </div>
          ${photoFigure('braga-stadion')}
        </div>
      </div>`;
  }

  // ---------- Kort ----------
  function renderMap() {
    const m = trip.map;
    $('#kort').innerHTML = `
      <div class="section-head"><p class="label">Interaktivt kort</p><h2>Alle stop</h2><p class="intro">Farvekodet pr. dag. Tryk på en markør for Maps-link.</p></div>
      <div class="map-views">
        <button class="btn btn-sm" data-view="porto">Porto</button>
        <button class="btn btn-sm" data-view="braga">Braga</button>
        <button class="btn btn-sm" data-view="all">Hele turen</button>
      </div>
      <div id="map" role="region" aria-label="Kort over turens stop"></div>
      <div class="map-legend">${Object.entries(m.legend).map(([k, v]) => `<button data-group="${esc(k)}" aria-pressed="true"><i style="background:${esc(m.colors[k])}"></i>${esc(v)}</button>`).join('')}</div>
      <p class="caveat" style="margin-top:.6rem">${esc(m.note)}</p>`;
  }

  function initMap() {
    const el = $('#map');
    if (!window.L) { el.innerHTML = '<p style="padding:16px">Kortet kunne ikke indlæses. Brug Maps-linkene i programmet.</p>'; return; }
    const m = trip.map;
    const map = L.map(el, { scrollWheelZoom: false, tap: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>-bidragydere',
    }).addTo(map);
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');

    const layers = {};
    const bounds = { all: [], porto: [], braga: [] };
    m.points.forEach((p) => {
      const color = m.colors[p.group] || '#333';
      const icon = L.divIcon({ className: '', html: `<div class="pin" style="background:${esc(color)}"></div>`, iconSize: [22, 22], iconAnchor: [11, 22], popupAnchor: [0, -20] });
      const marker = L.marker([p.lat, p.lng], { icon, title: p.name })
        .bindPopup(`<b>${esc(p.name)}</b><br><span style="color:${esc(color)};font-weight:600">${esc(m.legend[p.group] || '')}</span><br><a href="${esc(p.maps)}" target="_blank" rel="noopener">Åbn i Maps ↗</a><br><small>Placering omtrentlig</small>`);
      (layers[p.group] ||= L.layerGroup().addTo(map)).addLayer(marker);
      bounds.all.push([p.lat, p.lng]);
      (p.lat > 41.4 ? bounds.braga : bounds.porto).push([p.lat, p.lng]);
    });
    // Porto-visningen uden lufthavnen, så byen fylder skærmen.
    const portoTight = m.points.filter((p) => p.lat < 41.2).map((p) => [p.lat, p.lng]);
    const views = { porto: portoTight, braga: bounds.braga, all: bounds.all };
    const fit = (v) => map.fitBounds(views[v], { padding: [28, 28] });
    fit('porto');

    $('#kort').addEventListener('click', (e) => {
      const v = e.target.closest('[data-view]');
      if (v) fit(v.dataset.view);
      const g = e.target.closest('[data-group]');
      if (g) {
        const layer = layers[g.dataset.group];
        const on = map.hasLayer(layer);
        on ? map.removeLayer(layer) : map.addLayer(layer);
        g.classList.toggle('off', on);
        g.setAttribute('aria-pressed', String(!on));
      }
    });
  }

  // ---------- Alternativer + links ----------
  function renderAlternatives() {
    const a = trip.alternatives;
    $('#alternativer').innerHTML = `
      <div class="section-head"><p class="label">Alternativer</p><h2>${esc(a.title)}</h2></div>
      <div class="grid grid-3">
        ${a.items.map((x) => `<div class="card"><h3>${esc(x.name)}</h3><p class="muted" style="margin:.3rem 0 .5rem">${esc(x.text)}</p>${mapsLink(x.maps)}</div>`).join('')}
      </div>
      <p class="caveat" style="margin-top:.8rem">${esc(a.note)}</p>`;
  }

  function renderLinks() {
    $('#links').innerHTML = `
      <div class="section-head"><p class="label">Links</p><h2>Kort, booking og kilder</h2></div>
      <div class="grid">
        ${trip.links.map((g) => `
          <div class="card">
            <p class="label">${esc(g.group)}</p>
            <ul class="linklist">${g.items.map((l) => `<li>${ext(l.url, l.label)}</li>`).join('')}</ul>
          </div>`).join('')}
      </div>`;
  }

  // ---------- Fælleskasse ----------
  function parseAmount(s) {
    let t = String(s).trim().replace(/\s|€/g, '');
    if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
    const n = Number(t);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  }

  function computeKasse(expenses, people) {
    const bal = Object.fromEntries(people.map((p) => [p, 0]));
    for (const e of expenses) {
      const split = e.split.filter((p) => p in bal);
      if (!split.length || !(e.payer in bal)) continue;
      const base = Math.floor(e.cents / split.length);
      let rest = e.cents - base * split.length;
      bal[e.payer] += e.cents;
      split.forEach((p) => { bal[p] -= base + (rest-- > 0 ? 1 : 0); });
    }
    const cred = people.filter((p) => bal[p] > 0).map((p) => ({ p, v: bal[p] })).sort((a, b) => b.v - a.v);
    const debt = people.filter((p) => bal[p] < 0).map((p) => ({ p, v: -bal[p] })).sort((a, b) => b.v - a.v);
    const moves = [];
    let i = 0, j = 0;
    while (i < debt.length && j < cred.length) {
      const v = Math.min(debt[i].v, cred[j].v);
      if (v > 0) moves.push({ from: debt[i].p, to: cred[j].p, cents: v });
      debt[i].v -= v; cred[j].v -= v;
      if (debt[i].v === 0) i++;
      if (cred[j].v === 0) j++;
    }
    return { bal, moves };
  }

  function renderKasse() {
    const people = trip.travelers;
    const el = $('#kasse');
    el.innerHTML = `
      <div class="section-head"><p class="label">Fælleskasse</p><h2>Hvem skylder hvem?</h2><p class="intro">Skriv udlæg ind, efterhånden som de sker. Alt gemmes kun i denne browser, så lad én person føre kassen.</p></div>
      <div class="grid grid-2">
        <form class="card" id="kasse-form" autocomplete="off">
          <p class="label">Nyt udlæg</p>
          <div class="form-row">
            <div class="field"><label for="k-desc">Hvad</label><input id="k-desc" placeholder="Fx MUU-middag" maxlength="60"></div>
            <div class="field"><label for="k-amt">Beløb (€)</label><input id="k-amt" inputmode="decimal" placeholder="0,00" required></div>
          </div>
          <div class="field" style="margin-top:10px"><label for="k-payer">Betalt af</label>
            <select id="k-payer">${people.map((p) => `<option>${esc(p)}</option>`).join('')}</select></div>
          <div class="field" style="margin-top:10px"><label>Deles mellem</label>
            <div class="who">${people.map((p) => `<label><input type="checkbox" name="split" value="${esc(p)}" checked>${esc(p)}</label>`).join('')}</div></div>
          <div class="btn-row"><button class="btn btn-primary" type="submit">Tilføj udlæg</button></div>
          <p id="k-err" class="small" style="color:#a3261b;margin:.5rem 0 0" hidden></p>
        </form>
        <div class="card" id="kasse-result"></div>
      </div>
      <div class="card" style="margin-top:14px" id="kasse-list"></div>`;

    const draw = () => {
      const exps = store.get(KEY_KASSE, []);
      const { bal, moves } = computeKasse(exps, people);
      const total = exps.reduce((s, e) => s + e.cents, 0);
      $('#kasse-result').innerHTML = `
        <p class="label">Status · i alt ${eur.format(total / 100)}</p>
        <ul class="balances">${people.map((p) => `<li><span>${esc(p)}</span><span class="${bal[p] > 0 ? 'pos' : bal[p] < 0 ? 'neg' : ''}">${bal[p] > 0 ? '+' : ''}${eur.format(bal[p] / 100)}</span></li>`).join('')}</ul>
        <p class="label" style="margin-top:14px">Sådan gøres det op</p>
        ${moves.length ? `<ul class="settle" style="list-style:none;padding:0;margin:0">${moves.map((m) => `<li>${esc(m.from)} → ${esc(m.to)} <b>${eur.format(m.cents / 100)}</b></li>`).join('')}</ul>` : '<p class="muted">Alle er kvit.</p>'}`;
      $('#kasse-list').innerHTML = `
        <p class="label">Udlæg (${exps.length})</p>
        ${exps.length ? `<ul class="exp-list">${exps.map((e) => `
          <li><span><b>${esc(e.desc || 'Udlæg')}</b><br><span class="small muted">${esc(e.payer)} betalte · deles af ${e.split.length === people.length ? 'alle fem' : esc(e.split.join(', '))}</span></span>
          <span class="amt">${eur.format(e.cents / 100)}</span>
          <button type="button" data-del="${esc(e.id)}" aria-label="Slet udlæg">×</button></li>`).join('')}</ul>
          <div class="btn-row"><button type="button" class="btn btn-sm" id="k-clear">Nulstil kassen</button></div>` : '<p class="muted" style="margin:0">Ingen udlæg endnu.</p>'}`;
    };

    $('#kasse-form').addEventListener('submit', (e) => {
      e.preventDefault();
      const cents = parseAmount($('#k-amt').value);
      const split = [...el.querySelectorAll('input[name=split]:checked')].map((x) => x.value);
      const err = $('#k-err');
      if (!cents) { err.textContent = 'Skriv et gyldigt beløb, fx 45,50.'; err.hidden = false; return; }
      if (!split.length) { err.textContent = 'Vælg mindst én at dele med.'; err.hidden = false; return; }
      err.hidden = true;
      const exps = store.get(KEY_KASSE, []);
      exps.unshift({ id: String(Date.now()), desc: $('#k-desc').value.trim(), cents, payer: $('#k-payer').value, split });
      store.set(KEY_KASSE, exps);
      $('#k-desc').value = ''; $('#k-amt').value = '';
      draw();
    });
    $('#kasse-list').addEventListener('click', (e) => {
      const del = e.target.closest('[data-del]');
      if (del) { store.set(KEY_KASSE, store.get(KEY_KASSE, []).filter((x) => x.id !== del.dataset.del)); draw(); }
      if (e.target.closest('#k-clear') && confirm('Slet alle udlæg i denne browser?')) { store.del(KEY_KASSE); draw(); }
    });
    draw();
  }

  // ---------- Kreditering + kilder ----------
  function renderFooter() {
    const s = trip.sources;
    $('#kilder').innerHTML = `
      <div class="section-head"><p class="label">Billedkreditering og kildegrundlag</p><h2>Kilder</h2></div>
      <div class="grid grid-2">
        <div class="card">
          <p class="label">Fotos (Wikimedia Commons)</p>
          <ul class="credits">${Object.values(trip.photos).map((p) => `<li><b>${esc(p.caption)}</b>: ${esc(p.author)}, ${ext(p.source, 'Wikimedia Commons')}. Licens: ${ext(p.licenseUrl, p.license)}.</li>`).join('')}</ul>
          <p class="caveat" style="margin-top:.6rem">${esc(s.photoNote)}</p>
        </div>
        <div class="card">
          <p class="label">Kildegrundlag</p>
          <p>${esc(s.researched)}</p>
          <p>${esc(s.overrides)}</p>
          <p class="small muted" style="margin:0">Kort: © OpenStreetMap-bidragydere, vist med Leaflet. Skrifttyper: Fraunces og Inter (SIL Open Font License).</p>
        </div>
      </div>
      <div class="footer-mark"><div class="tiles"></div>${esc(trip.meta.footer)}
        <div class="btn-row" style="justify-content:center"><button class="btn btn-sm" id="lock">Lås siden igen</button></div>
      </div>`;
    $('#lock').addEventListener('click', () => { store.del(KEY_PW); store.del(KEY_SECRET); location.reload(); });
  }

  // ---------- Navigation ----------
  function wireNav() {
    const nav = $('.topnav');
    const chipsEl = $('#navchips');
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Egen håndtering af interne links: scroller præcist under den faste menu
    // og kan ikke afbrydes af menu-markeringen nedenfor.
    document.addEventListener('click', (e) => {
      const a = e.target.closest('a[href^="#"]');
      if (!a) return;
      if (a.dataset.gotoDay) selectDay(a.dataset.gotoDay);
      const id = a.getAttribute('href').slice(1);
      const target = id === 'top' ? document.body : document.getElementById(id);
      if (!target) return;
      e.preventDefault();
      const y = id === 'top' ? 0 : target.getBoundingClientRect().top + scrollY - nav.offsetHeight - 8;
      scrollTo({ top: Math.max(0, y), behavior: reduce ? 'auto' : 'smooth' });
      history.replaceState(null, '', id === 'top' ? location.pathname + location.search : `#${id}`);
    });

    // Markér aktiv sektion. Rul kun selve menubjælken vandret, aldrig siden.
    const chips = [...chipsEl.querySelectorAll('a')];
    const byId = Object.fromEntries(chips.map((c) => [c.getAttribute('href').slice(1), c]));
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        const c = byId[en.target.id];
        if (!c || c.classList.contains('active')) return;
        chips.forEach((x) => x.classList.remove('active'));
        c.classList.add('active');
        chipsEl.scrollLeft = c.offsetLeft - chipsEl.offsetLeft - (chipsEl.clientWidth - c.offsetWidth) / 2;
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    document.querySelectorAll('main > section, main > footer').forEach((s) => io.observe(s));
  }

  // ---------- Start ----------
  function startApp() {
    $('#app').hidden = false;
    renderHero();
    renderFlights();
    renderProgram();
    markTimeline();
    renderStories();
    renderMatch();
    renderMap();
    renderAlternatives();
    renderLinks();
    renderKasse();
    renderFooter();
    wireNav();
    initMap();
    tickCountdowns();
    setInterval(tickCountdowns, 1000);
    setInterval(markTimeline, 30000);
    let saved = null;
    try { saved = JSON.parse(sessionStorage.getItem(KEY_SCROLL)); } catch { /* ignorer */ }
    const hashTarget = location.hash && document.getElementById(location.hash.slice(1));
    if (saved && saved.path === location.pathname + location.search + location.hash) scrollTo(0, saved.y);
    else if (hashTarget) scrollTo(0, hashTarget.getBoundingClientRect().top + scrollY - $('.topnav').offsetHeight - 8);
    addEventListener('pagehide', () => {
      try { sessionStorage.setItem(KEY_SCROLL, JSON.stringify({ path: location.pathname + location.search + location.hash, y: scrollY })); } catch { /* ignorer */ }
    });
    $('#boot')?.remove();
  }

  async function boot() {
    try {
      const res = await fetch('trip.json', { cache: 'no-cache' });
      trip = await res.json();
    } catch {
      document.body.innerHTML = '<p style="padding:24px;font-family:sans-serif">Kunne ikke indlæse trip.json. Åbn siden via en webserver (se README).</p>';
      return;
    }
    // Genbesøg: brug den gemte, dekrypterede version, så vi slipper for
    // den langsomme nøgleudledning. Ny kryptering (ny iv) kræver ny kode.
    const cached = store.get(KEY_SECRET, null);
    const saved = store.get(KEY_PW, null);
    if (saved && cached && cached.iv === trip.secret.iv) { secret = cached.secret; startApp(); return; }
    if (saved && await tryUnlock(saved)) { store.set(KEY_SECRET, { iv: trip.secret.iv, secret }); startApp(); return; }
    $('#boot')?.remove();
    showGate();
  }

  boot();
})();
