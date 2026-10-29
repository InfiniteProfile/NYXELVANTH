'use strict';

(() => {
  const BATCH_SIZE = 300n;
  const PREFETCH_DISTANCE = 200n;
  const MAX_PHYSICAL_ROWS = 600;
  const TAIL_ROWS = 24;
  const OVERSCAN_ROWS = 3;
  const REBASE_SHIFT_ROWS = 150n;
  const CACHE_LIMIT = 900;
  const NAME_SCAN_LIMIT = 2000n;

  const FIRST_NAMES = [
    'Nova', 'Lyra', 'Astra', 'Orion', 'Vega', 'Nyra', 'Caelum', 'Elara', 'Zev', 'Mira',
    'Kairo', 'Sora', 'Aerin', 'Lumen', 'Navi', 'Riven', 'Arden', 'Cyra', 'Eris', 'Auron',
    'Selene', 'Tarin', 'Vesper', 'Aven', 'Noa', 'Ione', 'Ciel', 'Zora', 'Kestrel', 'Ayla',
    'Rhea', 'Sol', 'Nox', 'Ari', 'Zephyr', 'Eon', 'Vanya', 'Indra', 'Lior', 'Maia'
  ];
  const LAST_NAMES = [
    'Vey', 'Solari', 'Aster', 'Quill', 'Voss', 'Caelum', 'Raye', 'Noctis', 'Vale', 'Serein',
    'Arclight', 'Kest', 'Morrow', 'Thorne', 'Eclipse', 'Auralis', 'Zenith', 'Virel', 'Stellan', 'Meridian',
    'Halcyon', 'Riven', 'Starling', 'Velorum', 'Emberlyn', 'Solis', 'Aether', 'Lunet', 'Calyx', 'Oriel',
    'Nerval', 'Duskryn', 'Alcyon', 'Verity', 'Astral', 'Lioren', 'Vantrel', 'Eryndor', 'Myrr', 'Cova'
  ];
  const PALETTE = ['#8a72ff', '#12ddff', '#cf6bff', '#f65b9a', '#5c8cff', '#36dfcf', '#a58bff', '#64d5ff'];
  const SECTORS = ['The Violet Reach', 'Cyan Meridian', 'The Quiet Nebula', 'Asterion Drift', 'The Far Lanterns', 'Eclipse Corridor', 'The Lucent Expanse', 'Orion Glass', 'The Blue Archive', 'Starlight Basin', 'The Nocturne Field', 'The Outer Halo'];
  const SIGNALS = ['Resonance stable', 'Archive synchronized', 'Signal luminous', 'Quantum calm', 'Starlink active', 'Orbit harmonized'];

  const feedViewport = document.getElementById('feedViewport');
  const universeView = document.getElementById('universeView');
  const profileView = document.getElementById('profileView');
  const stage = document.getElementById('listStage');
  const profileGrid = document.getElementById('profileGrid');
  const topSpacer = document.getElementById('topSpacer');
  const bottomSpacer = document.getElementById('bottomSpacer');
  const readyCount = document.getElementById('readyCount');
  const batchStatus = document.getElementById('batchStatus');
  const engineStatus = document.getElementById('engineStatus');
  const feedFootnote = document.getElementById('feedFootnote');
  const pageHeading = document.getElementById('pageHeading');
  const searchForm = document.getElementById('searchForm');
  const searchInput = document.getElementById('profileSearch');
  const searchMode = document.getElementById('searchMode');
  const searchHint = document.getElementById('searchHint');
  const searchFeedback = document.getElementById('searchFeedback');
  const toast = document.getElementById('toast');

  let generatedCount = 300n;
  let baseRow = 0n;
  let generationInProgress = false;
  let generationFailures = 0;
  let scrollFrame = 0;
  let toastTimer = 0;
  let lastRangeKey = '';
  let cachedLayout = { columns: 1, cardHeight: 252, rowGap: 10, pitch: 262 };
  const profileCache = new Map();

  function decimalId(value) {
    const raw = String(value).trim();
    if (!/^\d+$/.test(raw)) return null;
    const normalized = raw.replace(/^0+/, '');
    return normalized.length ? normalized : null;
  }

  function incrementDecimalId(value) {
    const digits = value.split('');
    let carry = 1;
    for (let i = digits.length - 1; i >= 0 && carry; i -= 1) {
      const next = digits[i].charCodeAt(0) - 48 + carry;
      digits[i] = String(next % 10);
      carry = next >= 10 ? 1 : 0;
    }
    if (carry) digits.unshift('1');
    return digits.join('');
  }

  function hashId(id) {
    let a = 2166136261;
    let b = 0x9e3779b9;
    for (let i = 0; i < id.length; i += 1) {
      const code = id.charCodeAt(i);
      a = Math.imul(a ^ code, 16777619) >>> 0;
      b = Math.imul(b ^ (code + i), 2246822519) >>> 0;
      b ^= b >>> 13;
    }
    a ^= a >>> 16;
    a = Math.imul(a, 0x7feb352d) >>> 0;
    a ^= a >>> 15;
    b ^= b >>> 16;
    b = Math.imul(b, 0x846ca68b) >>> 0;
    b ^= b >>> 16;
    return [a >>> 0, b >>> 0];
  }

  function identityForId(id) {
    const [hashA, hashB] = hashId(id);
    const first = FIRST_NAMES[hashA % FIRST_NAMES.length];
    const last = LAST_NAMES[hashB % LAST_NAMES.length];
    const mixed = (hashA ^ hashB) >>> 0;
    const signalMixed = (hashA ^ (hashB >>> 1)) >>> 0;
    return {
      id,
      first,
      last,
      name: `${first} ${last} #${id}`,
      initials: `${first.charAt(0)}${last.charAt(0)}`,
      palette: PALETTE[mixed % PALETTE.length],
      sector: SECTORS[(hashA + hashB) % SECTORS.length],
      signal: SIGNALS[signalMixed % SIGNALS.length],
      hashA,
      hashB
    };
  }

  function avatarDataUri(identity) {
    const { id, initials, palette, hashA, hashB } = identity;
    const safeTag = `n${hashA.toString(16)}${hashB.toString(16)}`;
    const c1 = palette;
    const c2 = PALETTE[(hashA + 3 * hashB) % PALETTE.length];
    const stars = [];
    let seed = (hashA ^ hashB) >>> 0;
    for (let i = 0; i < 12; i += 1) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const x = 13 + (seed % 214);
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const y = 13 + (seed % 214);
      const r = 0.6 + ((seed >>> 8) % 13) / 10;
      stars.push(`<circle cx="${x}" cy="${y}" r="${r.toFixed(1)}" fill="#fff" opacity="${(0.2 + ((seed >>> 17) % 7) / 10).toFixed(1)}"/>`);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240"><defs><linearGradient id="${safeTag}a" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient><radialGradient id="${safeTag}b"><stop stop-color="${c1}" stop-opacity=".52"/><stop offset="1" stop-color="#080817" stop-opacity="0"/></radialGradient><filter id="${safeTag}g"><feGaussianBlur stdDeviation="9"/></filter></defs><rect width="240" height="240" rx="42" fill="#09091b"/><circle cx="120" cy="110" r="118" fill="url(#${safeTag}b)"/>${stars.join('')}<circle cx="120" cy="89" r="42" fill="url(#${safeTag}a)" opacity=".95"/><path d="M40 224c7-48 39-74 80-74s73 26 80 74" fill="url(#${safeTag}a)"/><circle cx="120" cy="89" r="51" fill="none" stroke="#fff" stroke-opacity=".22" stroke-width="1.2"/><path d="M80 95c11 11 24 16 40 16s29-5 40-16" fill="none" stroke="#fff" stroke-opacity=".28" stroke-width="2" stroke-linecap="round"/><circle cx="78" cy="43" r="10" fill="${c2}" opacity=".42" filter="url(#${safeTag}g)"/><text x="120" y="218" text-anchor="middle" fill="#fff" fill-opacity=".75" font-size="15" letter-spacing="3" font-family="Arial,sans-serif">${initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function getProfile(id) {
    if (profileCache.has(id)) {
      const cached = profileCache.get(id);
      profileCache.delete(id);
      profileCache.set(id, cached);
      return cached;
    }
    const identity = identityForId(id);
    identity.avatar = avatarDataUri(identity);
    profileCache.set(id, identity);
    if (profileCache.size > CACHE_LIMIT) {
      const oldestKey = profileCache.keys().next().value;
      profileCache.delete(oldestKey);
    }
    return identity;
  }


  function fallbackAvatarDataUri(identity) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" rx="24" fill="#09091b"/><circle cx="60" cy="48" r="24" fill="${identity.palette}" fill-opacity=".8"/><path d="M17 112c4-26 21-39 43-39s39 13 43 39" fill="${identity.palette}" fill-opacity=".8"/><text x="60" y="111" text-anchor="middle" fill="#fff" fill-opacity=".8" font-size="9" font-family="Arial,sans-serif">${identity.initials}</text></svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function attachImageFallback(image, profile) {
    image.addEventListener('error', () => {
      if (image.dataset.fallbackApplied === 'true') {
        image.removeAttribute('src');
        return;
      }
      image.dataset.fallbackApplied = 'true';
      image.src = fallbackAvatarDataUri(profile);
    });
  }

  function formatCount(value) {
    return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function getColumns() {
    const width = window.innerWidth || profileGrid.clientWidth || feedViewport.clientWidth;
    if (width >= 1450) return 4;
    if (width >= 851) return 3;
    if (width >= 621) return 2;
    return 1;
  }

  function measureLayout() {
    const columns = getColumns();
    const sample = profileGrid.querySelector('.profile-card');
    let cardHeight = sample ? sample.getBoundingClientRect().height : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--card-height'));
    if (!Number.isFinite(cardHeight) || cardHeight <= 0) cardHeight = window.innerWidth <= 620 ? 252 : 282;
    const rowGap = parseFloat(getComputedStyle(profileGrid).rowGap) || 0;
    cachedLayout = { columns, cardHeight, rowGap, pitch: cardHeight + rowGap };
    profileGrid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
    return cachedLayout;
  }

  function countRows(count, columns) {
    if (count <= 0n) return 0n;
    return (count + BigInt(columns) - 1n) / BigInt(columns);
  }

  function physicalSpanRows() {
    const totalRows = countRows(generatedCount, cachedLayout.columns);
    const remaining = totalRows > baseRow ? totalRows - baseRow : 0n;
    const maxContentRows = BigInt(MAX_PHYSICAL_ROWS - TAIL_ROWS);
    if (remaining >= maxContentRows) return MAX_PHYSICAL_ROWS;
    return Math.max(1, Number(remaining) + TAIL_ROWS);
  }

  function stageOffsetTop() {
    return stage.getBoundingClientRect().top - feedViewport.getBoundingClientRect().top + feedViewport.scrollTop;
  }

  function makeSvgArrow() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', 'M5 12h13m-5-5 5 5-5 5');
    svg.appendChild(path);
    return svg;
  }

  function makeCard(id) {
    const profile = getProfile(id);
    const card = document.createElement('a');
    card.className = 'profile-card';
    card.href = `?profile=${encodeURIComponent(id)}`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', `Explore ${profile.name}, profile ID ${id}`);
    card.style.setProperty('--accent', profile.palette);

    const topline = document.createElement('div');
    topline.className = 'card-topline';
    const label = document.createElement('span');
    label.className = 'profile-label';
    label.textContent = 'IDENTITY SIGNAL';
    const number = document.createElement('span');
    number.className = 'profile-number';
    number.textContent = `#${id}`;
    topline.append(label, number);

    const avatarWrap = document.createElement('div');
    avatarWrap.className = 'avatar-wrap';
    const avatar = document.createElement('img');
    avatar.className = 'avatar';
    avatar.alt = `Generated portrait for ${profile.name}`;
    avatar.width = 82;
    avatar.height = 82;
    avatar.loading = 'lazy';
    avatar.decoding = 'async';
    avatar.src = profile.avatar;
    attachImageFallback(avatar, profile);
    avatarWrap.appendChild(avatar);

    const name = document.createElement('h3');
    name.className = 'card-name';
    name.textContent = profile.name;
    const sector = document.createElement('p');
    sector.className = 'card-sector';
    sector.textContent = profile.sector;

    const bottom = document.createElement('div');
    bottom.className = 'card-bottom';
    const state = document.createElement('span');
    state.className = 'card-state';
    state.textContent = 'Signal online';
    const explore = document.createElement('span');
    explore.className = 'explore-link';
    explore.append(document.createTextNode('Explore'), makeSvgArrow());
    bottom.append(state, explore);
    card.append(topline, avatarWrap, name, sector, bottom);
    return card;
  }

  function renderVisible(force = false) {
    if (profileView.hidden === false) return;
    const { columns, pitch } = cachedLayout;
    const span = physicalSpanRows();
    const offsetInStage = feedViewport.scrollTop - stageOffsetTop();
    const localScroll = Math.max(0, offsetInStage);
    const firstVisibleRow = Math.floor(localScroll / pitch);
    const lastVisibleRow = Math.ceil((localScroll + feedViewport.clientHeight) / pitch);
    const firstRow = Math.max(0, firstVisibleRow - OVERSCAN_ROWS);
    const endRow = Math.max(firstRow + 1, Math.min(span, lastVisibleRow + OVERSCAN_ROWS));
    const key = `${baseRow}:${firstRow}:${endRow}:${columns}:${generatedCount}`;
    if (!force && key === lastRangeKey) return;
    lastRangeKey = key;

    topSpacer.style.height = `${firstRow * pitch}px`;
    bottomSpacer.style.height = `${Math.max(0, span - endRow) * pitch}px`;
    const fragment = document.createDocumentFragment();
    let renderedCards = 0;
    for (let localRow = firstRow; localRow < endRow; localRow += 1) {
      const absoluteRow = baseRow + BigInt(localRow);
      for (let col = 0; col < columns; col += 1) {
        const index = absoluteRow * BigInt(columns) + BigInt(col);
        const idNumber = index + 1n;
        if (idNumber > generatedCount) break;
        fragment.appendChild(makeCard(idNumber.toString()));
        renderedCards += 1;
      }
    }
    profileGrid.replaceChildren(fragment);
    if (renderedCards > 0) {
      const newMeasure = measureLayout();
      if (newMeasure.columns !== columns || Math.abs(newMeasure.pitch - pitch) > 1) {
        lastRangeKey = '';
        renderVisible(true);
        return;
      }
    }
  }

  function updateCounts() {
    const formatted = formatCount(generatedCount);
    readyCount.textContent = `${formatted} ${generatedCount === 1n ? 'identity' : 'identities'} ready`;
    engineStatus.textContent = 'INFINITE ENGINE ACTIVE';
  }

  function refreshVirtualSpace() {
    lastRangeKey = '';
    renderVisible(true);
    maybeRequestBatch();
  }

  function requestAnimationTick() {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }

  async function generateNextBatch() {
    if (generationInProgress) return;
    generationInProgress = true;
    batchStatus.textContent = 'Preparing the next 300 identities…';
    feedFootnote.textContent = 'The identity engine is preparing the next batch in the background.';
    try {
      let id = incrementDecimalId(generatedCount.toString());
      for (let i = 0; i < Number(BATCH_SIZE); i += 1) {
        getProfile(id);
        id = incrementDecimalId(id);
        if (i > 0 && i % 60 === 0) await requestAnimationTick();
      }
      generatedCount += BATCH_SIZE;
      generationFailures = 0;
      updateCounts();
      batchStatus.textContent = 'Continuous generation enabled';
      feedFootnote.textContent = 'The next identities are prepared automatically as you explore.';
      refreshVirtualSpace();
    } catch (error) {
      generationFailures += 1;
      batchStatus.textContent = 'Recovering the generation engine…';
      feedFootnote.textContent = 'A temporary generation issue occurred. The engine will retry automatically.';
      console.error('NYXELVANTH batch generation failed:', error);
      setTimeout(() => {
        generationInProgress = false;
        maybeRequestBatch(true);
      }, Math.min(5000, 250 * (2 ** Math.min(generationFailures, 4))));
      return;
    }
    generationInProgress = false;
    // If a very fast scroll has already approached the new edge, continue preparing without waiting for another event.
    maybeRequestBatch();
  }

  function maybeRequestBatch(forceRetry = false) {
    if (profileView.hidden === false || generationInProgress) return;
    const { columns, pitch } = cachedLayout;
    const offsetInStage = feedViewport.scrollTop - stageOffsetTop();
    const localScroll = Math.max(0, offsetInStage);
    const visibleEndLocal = Math.ceil((localScroll + feedViewport.clientHeight) / pitch) + OVERSCAN_ROWS;
    const absoluteEndIndex = (baseRow + BigInt(Math.max(0, visibleEndLocal))) * BigInt(columns);
    const remaining = generatedCount - absoluteEndIndex;
    const closeToEdge = remaining <= PREFETCH_DISTANCE;
    if (closeToEdge || forceRetry) void generateNextBatch();
  }

  function maybeRebaseCoordinates() {
    if (profileView.hidden === false) return;
    const { pitch } = cachedLayout;
    const y = Math.max(0, feedViewport.scrollTop - stageOffsetTop());
    const localRow = Math.floor(y / pitch);
    const span = physicalSpanRows();
    const threshold = Math.min(span - TAIL_ROWS - 1, Math.max(35, Math.floor(span * 0.68)));
    const totalRows = countRows(generatedCount, cachedLayout.columns);

    if (localRow >= threshold && baseRow + REBASE_SHIFT_ROWS < totalRows) {
      const shift = Number(REBASE_SHIFT_ROWS);
      baseRow += REBASE_SHIFT_ROWS;
      feedViewport.scrollTop = Math.max(0, feedViewport.scrollTop - shift * pitch);
      lastRangeKey = '';
      return;
    }
    if (localRow < 30 && baseRow > 0n) {
      const shiftBig = baseRow < REBASE_SHIFT_ROWS ? baseRow : REBASE_SHIFT_ROWS;
      const shift = Number(shiftBig);
      baseRow -= shiftBig;
      feedViewport.scrollTop += shift * pitch;
      lastRangeKey = '';
    }
  }

  function onFeedScroll() {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      maybeRebaseCoordinates();
      renderVisible();
      maybeRequestBatch();
    });
  }

  function showToast(message) {
    toast.textContent = message;
    toast.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2400);
  }

  function goToProfile(id) {
    const url = new URL(window.location.href);
    url.searchParams.set('profile', id);
    url.hash = '';
    window.location.href = url.toString();
  }

  function setSearchFeedback(message, success = false) {
    searchFeedback.textContent = message;
    searchFeedback.hidden = false;
    searchFeedback.classList.toggle('success', success);
  }

  function normalizeName(value) {
    return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
  }

  function searchByName(query) {
    const normalizedQuery = normalizeName(query);
    const suffix = query.trim().match(/#([0-9]+)$/);
    if (suffix) {
      const id = decimalId(suffix[1]);
      if (!id) return { error: 'Profile IDs must be positive decimal numbers.' };
      const match = identityForId(id);
      if (normalizeName(match.name) === normalizedQuery) return { id, exact: true };
      return { error: 'That name and ID do not match. Use the complete generated name, including its #ID suffix.' };
    }

    const limit = generatedCount < NAME_SCAN_LIMIT ? generatedCount : NAME_SCAN_LIMIT;
    const lowerStart = 1n;
    const upperStart = generatedCount > NAME_SCAN_LIMIT ? generatedCount - NAME_SCAN_LIMIT + 1n : generatedCount + 1n;
    const ranges = [[lowerStart, limit]];
    if (generatedCount > NAME_SCAN_LIMIT) ranges.push([upperStart, generatedCount]);
    for (const [start, end] of ranges) {
      for (let id = start; id <= end; id += 1n) {
        const identity = identityForId(id.toString());
        if (normalizeName(identity.name).includes(normalizedQuery)) return { id: id.toString(), exact: false };
      }
    }
    return { error: `No partial name match was found in the first or most recent ${formatCount(NAME_SCAN_LIMIT)} prepared identities. Enter a full unique name ending in #ID to resolve any ID directly.` };
  }

  searchForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = searchInput.value.trim();
    searchFeedback.hidden = true;
    if (!query) {
      setSearchFeedback(searchMode.value === 'id' ? 'Enter a positive decimal profile ID to search.' : 'Enter a profile name. Full unique names include their #ID suffix.');
      searchInput.focus();
      return;
    }
    if (searchMode.value === 'id') {
      const id = decimalId(query);
      if (!id) {
        setSearchFeedback('Use digits only and enter a positive ID greater than zero. No rounding or scientific notation is accepted.');
        return;
      }
      goToProfile(id);
      return;
    }
    const result = searchByName(query);
    if (result.error) {
      setSearchFeedback(result.error);
      return;
    }
    if (!result.exact) showToast('A matching profile was found in the prepared identity window.');
    goToProfile(result.id);
  });

  searchMode.addEventListener('change', () => {
    const byName = searchMode.value === 'name';
    searchInput.placeholder = byName ? 'Enter name or full name · #ID…' : 'Find any profile ID…';
    searchInput.inputMode = byName ? 'search' : 'numeric';
    searchHint.textContent = byName
      ? 'Full generated names include a unique #ID suffix for direct lookup.'
      : 'Enter any positive decimal ID — even an extremely long one.';
    searchFeedback.hidden = true;
  });

  function makeFact(labelText, valueText) {
    const card = document.createElement('div');
    card.className = 'fact-card';
    const label = document.createElement('span');
    label.className = 'fact-label';
    label.textContent = labelText;
    const value = document.createElement('span');
    value.className = 'fact-value';
    value.textContent = valueText;
    card.append(label, value);
    return card;
  }

  function renderProfilePage(id) {
    const profile = getProfile(id);
    universeView.hidden = true;
    profileView.hidden = false;
    pageHeading.textContent = 'Identity details';
    searchInput.value = id;
    searchMode.value = 'id';
    searchInput.placeholder = 'Find any profile ID…';
    searchHint.textContent = 'Enter any positive decimal ID — even an extremely long one.';
    searchFeedback.hidden = true;
    document.title = `${profile.name} — NYXELVANTH`;
    feedViewport.setAttribute('aria-label', `Profile ${id}`);

    const wrapper = document.createElement('div');
    wrapper.className = 'profile-page-content';
    const back = document.createElement('a');
    back.className = 'back-link';
    back.href = './';
    const backIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    backIcon.setAttribute('viewBox', '0 0 24 24');
    backIcon.setAttribute('aria-hidden', 'true');
    const backPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    backPath.setAttribute('d', 'M19 12H5m6 7-7-7 7-7');
    backIcon.appendChild(backPath);
    back.append(backIcon, document.createTextNode('Return to the universe'));
    wrapper.appendChild(back);

    const hero = document.createElement('section');
    hero.className = 'profile-hero';
    hero.style.setProperty('--accent', profile.palette);
    const art = document.createElement('div');
    art.className = 'profile-art';
    const image = document.createElement('img');
    image.src = profile.avatar;
    image.alt = `Generated portrait for ${profile.name}`;
    image.width = 240;
    image.height = 240;
    image.decoding = 'async';
    attachImageFallback(image, profile);
    art.appendChild(image);

    const details = document.createElement('div');
    details.className = 'profile-details';
    const eyebrow = document.createElement('p');
    eyebrow.className = 'eyebrow';
    eyebrow.textContent = 'UNIQUE DIGITAL IDENTITY';
    const name = document.createElement('h2');
    name.textContent = `${profile.first} ${profile.last}`;
    const idLine = document.createElement('div');
    idLine.className = 'profile-idline';
    const idCaption = document.createElement('span');
    idCaption.textContent = 'PROFILE ID';
    const idChip = document.createElement('code');
    idChip.className = 'id-chip';
    idChip.textContent = id;
    idLine.append(idCaption, idChip);
    const description = document.createElement('p');
    description.className = 'profile-description';
    description.textContent = `${profile.first} ${profile.last} is an identity in the NYXELVANTH universe. This profile is derived deterministically from ID ${id}; reopening this exact ID recreates the same name, portrait, sector, and profile details without querying a remote database.`;
    const facts = document.createElement('div');
    facts.className = 'profile-facts';
    facts.append(
      makeFact('Home sector', profile.sector),
      makeFact('Signal status', profile.signal),
      makeFact('Identity key', `#${id}`)
    );
    details.append(eyebrow, name, idLine, description, facts);
    hero.append(art, details);
    wrapper.appendChild(hero);

    const lower = document.createElement('div');
    lower.className = 'profile-lower';
    const about = document.createElement('section');
    about.className = 'info-panel';
    const aboutTitle = document.createElement('h3');
    aboutTitle.textContent = 'About this identity';
    const aboutText = document.createElement('p');
    aboutText.textContent = `The numeric ID is the identity's permanent seed within this version of the generator. It is handled as a decimal string, so IDs beyond JavaScript's safe integer range are not rounded or converted to scientific notation.`;
    const copy = document.createElement('button');
    copy.type = 'button';
    copy.className = 'copy-id-button';
    copy.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/></svg><span>Copy profile ID</span>';
    copy.addEventListener('click', async () => {
      try {
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(id);
        } else {
          const area = document.createElement('textarea');
          area.value = id;
          area.setAttribute('readonly', '');
          area.style.position = 'fixed';
          area.style.opacity = '0';
          document.body.appendChild(area);
          area.select();
          const copied = document.execCommand('copy');
          area.remove();
          if (!copied) throw new Error('Clipboard permission unavailable');
        }
        showToast('Profile ID copied.');
      } catch (error) {
        showToast('Clipboard access was blocked by the browser. You can select and copy the ID above.');
      }
    });
    about.append(aboutTitle, aboutText, copy);

    const consistency = document.createElement('section');
    consistency.className = 'info-panel';
    const consistencyTitle = document.createElement('h3');
    consistencyTitle.textContent = 'Deterministic identity';
    const consistencyText = document.createElement('p');
    consistencyText.textContent = 'Every profile is created from its exact ID using the same local rules. No account, paid API, or external image service is needed. This is a generated identity rather than a user account stored in a shared database.';
    const note = document.createElement('p');
    note.className = 'profile-nav-note';
    note.textContent = 'The universe continues in both directions through virtualized scrolling. Use the search above to jump directly to another ID.';
    consistency.append(consistencyTitle, consistencyText, note);
    lower.append(about, consistency);
    wrapper.appendChild(lower);
    profileView.replaceChildren(wrapper);
    feedViewport.scrollTop = 0;
  }

  function initialize() {
    const params = new URLSearchParams(window.location.search);
    const requestedProfile = params.get('profile');
    const id = requestedProfile === null ? null : decimalId(requestedProfile);
    measureLayout();
    updateCounts();

    if (requestedProfile !== null && id) {
      renderProfilePage(id);
      return;
    }
    if (requestedProfile !== null && !id) {
      setSearchFeedback('The profile URL contains an invalid ID. Enter a positive decimal ID to continue.');
    }
    document.title = 'NYXELVANTH — One Universe. Infinite Identities.';
    profileView.hidden = true;
    universeView.hidden = false;
    pageHeading.textContent = 'Explore the infinite';
    renderVisible(true);
    feedViewport.addEventListener('scroll', onFeedScroll, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        lastRangeKey = '';
        renderVisible(true);
        maybeRequestBatch();
      }
    });
    window.addEventListener('resize', () => {
      const oldColumns = cachedLayout.columns;
      const oldPitch = cachedLayout.pitch;
      const oldOffset = Math.max(0, feedViewport.scrollTop - stageOffsetTop());
      const oldLogicalTop = baseRow * BigInt(oldColumns) + BigInt(Math.floor(oldOffset / Math.max(1, oldPitch)) * oldColumns);
      measureLayout();
      if (cachedLayout.columns !== oldColumns) {
        const newBaseLogicalRow = oldLogicalTop / BigInt(cachedLayout.columns);
        baseRow = newBaseLogicalRow > 50n ? newBaseLogicalRow - 50n : 0n;
        const localReset = newBaseLogicalRow - baseRow;
        feedViewport.scrollTop = Math.max(0, stageOffsetTop()) + Number(localReset) * cachedLayout.pitch;
      }
      lastRangeKey = '';
      renderVisible(true);
      maybeRequestBatch();
    }, { passive: true });
    maybeRequestBatch();
  }

  initialize();
})();
