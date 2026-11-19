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

  window.Crust = {
    api: {
      getMenu: () => call('GET', { action: 'menu' }),
      post: (body) => call('POST', body)
    },
    isConfigured,
    h,
    fill,
    money,
    price
  };
})();
