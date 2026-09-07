// Tiny DOM helpers — no framework, no virtual DOM.
export const h = (tag, props = {}, children = []) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class' || k === 'className') {
      el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    } else if (k === 'style' && typeof v === 'object') {
      Object.assign(el.style, v);
    } else if (k === 'dataset' && typeof v === 'object') {
      for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv;
    } else if (k.startsWith('on') && typeof v === 'function') {
      el.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (k === 'html') {
      el.innerHTML = v;
    } else if (k in el && typeof v !== 'object') {
      try { el[k] = v; } catch { el.setAttribute(k, v); }
    } else if (v === true) {
      el.setAttribute(k, '');
    } else {
      el.setAttribute(k, v);
    }
  }
  appendChildren(el, children);
  return el;
};

const appendChildren = (el, children) => {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) { appendChildren(el, c); continue; }
    if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
};

// Tagged-template literal version: htm-style.
export const html = (strings, ...values) => {
  // Build DOM from template. Returns a single Node OR a DocumentFragment.
  const tpl = document.createElement('template');
  let raw = '';
  strings.forEach((s, i) => {
    raw += s;
    if (i < values.length) {
      const v = values[i];
      raw += v == null ? '' : (v instanceof Node ? '<!--NODE-->' : String(v));
    }
  });
  tpl.innerHTML = raw.trim();
  // Process event handlers & dynamic attributes via a marker attribute "onclick:fn"
  // We support simple @click="handler" syntax — pre-processed.
  // For brevity here we expect pre-bound values only.
  return tpl.content.childElementCount === 1 ? tpl.content.firstElementChild : tpl.content;
};

// Mount a node into a container, replacing existing content.
export const mount = (container, node) => {
  container.innerHTML = '';
  if (node) container.appendChild(node);
};

// Create a fragment from many children (for returning multiple siblings).
export const frag = (...nodes) => {
  const f = document.createDocumentFragment();
  for (const n of nodes) if (n) f.appendChild(n);
  return f;
};

// Conditional helper for inline UI: cn(cls, condition, fallback)
export const cn = (...args) => args.filter(Boolean).join(' ');
