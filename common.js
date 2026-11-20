// Shared helpers for the order page and the admin page.
(function () {
  const CFG = window.CRUST_CONFIG || {};

  function isConfigured() {
    return typeof CFG.SCRIPT_URL === 'string' && /^https:\/\/script\.google\.com\//.test(CFG.SCRIPT_URL);
  }

  async function call(method, payload) {
    if (!isConfigured()) {
      throw new Error("This page isn't connected yet. Paste the Apps Script Web App URL into config.js.");
    }
    let res;
    try {
      res = method === 'GET'
        ? await fetch(CFG.SCRIPT_URL + '?' + new URLSearchParams(payload))
        // Sent as plain text on purpose: Apps Script can't answer the extra
        // "preflight" check browsers make for JSON requests.
        : await fetch(CFG.SCRIPT_URL, { method: 'POST', body: JSON.stringify(payload) });
    } catch (e) {
      throw new Error("Couldn't reach the order system. Check your connection and try again.");
    }
    let data;
    try {
      data = await res.json();
    } catch (e) {
      throw new Error('The order system sent back an unexpected response. Make sure the script is deployed with access set to "Anyone".');
    }
    if (!data.ok) {
      const err = new Error(data.error || 'Something went wrong.');
      err.code = data.code || null;
      throw err;
    }
    return data;
  }

  // Tiny element builder: h('p', {class: 'x'}, 'text', childEl)
  const PROPS = ['value', 'checked', 'disabled', 'hidden', 'selected'];
  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (PROPS.includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  // Replace an element's contents; accepts nested arrays and skips empty values.
  function fill(el, ...kids) {
    el.replaceChildren();
    for (const kid of kids.flat(Infinity)) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }

  function money(n) {
    return '$' + (Math.round(Number(n || 0) * 100) / 100).toFixed(2);
  }

  // "$10" for whole dollars, "$9.50" otherwise
  function price(n) {
    const v = Math.round(Number(n || 0) * 100) / 100;
    return '$' + (Number.isInteger(v) ? String(v) : v.toFixed(2));
  }

  /* ---------- Images stored in Google Drive ----------
   * Tries Google's fast image links first; if those ever stop working,
   * falls back to loading the image through the Apps Script. */
  const imageCache = {};
  function driveImg(id, opts) {
    opts = opts || {};
    const w = opts.width || 1200;
    const el = h('img', { alt: opts.alt || '', class: opts.class, loading: opts.lazy === false ? null : 'lazy', decoding: 'async' });
    if (opts.preview) { el.src = opts.preview; return el; }
    if (imageCache[id]) { el.src = imageCache[id]; return el; }
    const sources = [
      'https://lh3.googleusercontent.com/d/' + encodeURIComponent(id) + '=w' + w,
      'https://drive.google.com/thumbnail?id=' + encodeURIComponent(id) + '&sz=w' + w
    ];
    let i = 0;
    el.addEventListener('error', async function onErr() {
      i++;
      if (i < sources.length) { el.src = sources[i]; return; }
      el.removeEventListener('error', onErr);
      try {
        const d = await call('GET', { action: 'image', id });
        imageCache[id] = 'data:' + d.mime + ';base64,' + d.data;
        el.src = imageCache[id];
      } catch (e) {
        el.hidden = true;
      }
    });
    el.src = sources[0];
    return el;
  }

  /* ---------- Payment links ---------- */
  function payLinks(payments, amount, orderNo) {
    const out = [];
    const amt = amount ? Number(amount).toFixed(2) : '';
    const v = (payments && payments.venmo) || {}, c = (payments && payments.cashapp) || {};
    if (v.handle) {
      let url = 'https://venmo.com/u/' + encodeURIComponent(v.handle);
      if (amt) url += '?txn=pay&amount=' + amt + '&note=' + encodeURIComponent('Crust In Time order #' + orderNo);
      out.push({ key: 'venmo', label: 'Venmo', handle: '@' + v.handle, qr: v.qr, url });
    }
    if (c.handle) {
      out.push({ key: 'cashapp', label: 'Cash App', handle: '$' + c.handle, qr: c.qr,
        url: 'https://cash.app/$' + encodeURIComponent(c.handle) + (amt ? '/' + amt : '') });
    }
    return out;
  }

  /* ---------- Weekly pickup (same rule as the script; used for the editor preview) ---------- */
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function nextPickup(w, now) {
    const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' })
      .format(now || new Date()).split('-').map(Number);
    const today = Date.UTC(parts[0], parts[1] - 1, parts[2]);
    const DAY = 86400000;
    const gap = ((Number(w.pickupDay) - Number(w.cutoffDay)) % 7 + 7) % 7;
    const label = (t) => { const d = new Date(t); return DAYS[d.getUTCDay()] + ', ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCDate(); };
    const ymd = (t) => new Date(t).toISOString().slice(0, 10);
    for (let k = 0; k < 400; k++) {
      const t = today + k * DAY;
      if (new Date(t).getUTCDay() !== Number(w.pickupDay)) continue;
      const cutoff = t - gap * DAY;
      if (cutoff < today) continue;
      if ((w.skipDates || []).includes(ymd(t))) continue;
      return { date: ymd(t), label: label(t) + (w.time ? ' (' + w.time + ')' : ''), cutoffLabel: label(cutoff) };
    }
    return null;
  }

  window.Crust = {
    api: {
      getMenu: (key) => call('GET', key ? { action: 'menu', d: key } : { action: 'menu' }),
      post: (body) => call('POST', body)
    },
    isConfigured,
    h,
    fill,
    money,
    price,
    driveImg,
    payLinks,
    nextPickup,
    DAYS
  };
})();
