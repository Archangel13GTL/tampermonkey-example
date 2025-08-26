// ==UserScript==
// @name         NiceThumbsBuddy — Autoindex Gallery
// @namespace    archangel.nicethumbsbuddy
// @version      3.0.0
// @description  Transform bare Apache/Nginx directory listings into a rich gallery with smart folders, interactive sitemap, advanced sorting, and zoom.
// @author       Archangel13GTL
// @license      MIT
// @run-at       document-end
// @grant        GM_getValue
// @grant        GM_setValue
// @homepageURL  https://github.com/Archangel13GTL/tampermonkey-example
// @updateURL    https://github.com/Archangel13GTL/tampermonkey-example/releases/latest/download/NiceThumbsBuddy.user.js
// @downloadURL  https://github.com/Archangel13GTL/tampermonkey-example/releases/latest/download/NiceThumbsBuddy.user.js

// Common media folders
// @match        *://*/wp-content/uploads/*
// @match        *://*/wp-content/*/*
// @match        *://*/images/*
// @match        *://*/pictures/*
// @match        *://*/photos/*
// @match        *://*/gallery/*
// @match        *://*/uploads/*
// @match        *://*/files/*

// Apache "autoindex" often has sort params like ?C=, ?O=
// @match        *://*/*?C=*
// @match        *://*/*?O=*

// Optional (regex include) for plain "Index of /path" pages
// @include      /^https?:\/\/[^\/]+\/(?:[^?#]*\/)?(?:index\.html?)?$/
// ==/UserScript==

/*
 * NiceThumbsBuddy: "When your directories deserve better than naked listings."
 * 
 * Every folder has a story to tell. This script helps it tell that story with style.
 * 
 * "Knowledge isn't power until it is applied." - Dale Carnegie
 * (And directories aren't useful until they're navigable!)
 */

(function() {
  'use strict';

  // --------------------------- Config --------------------------------------
  const IMG_EXT = /\.(avif|webp|jpe?g|png|gif|bmp|svg)$/i;
  const FILE_EXT = /\.(avif|webp|jpe?g|png|gif|bmp|svg|heic|tif?f|mp4|mov|webm|mkv|pdf|zip|rar|7z|tar|gz)$/i;
  const CACHE_EXPIRY = 7200000; // metadata cache expiry (2 hours)

  // Preference helpers using GM_* if available, falling back to localStorage
  const storage = (typeof GM_getValue === 'function' && typeof GM_setValue === 'function')
    ? { get: GM_getValue, set: GM_setValue }
    : {
        get: (k) => localStorage.getItem(k),
        set: (k, v) => localStorage.setItem(k, v)
      };

  const getPref = (key, def) => {
    const v = storage.get(key);
    return v !== undefined && v !== null ? v : def;
  };

  const setPref = (key, val) => storage.set(key, val);

  // Local storage keys
  const LSK = {
    size: 'ntb:size',
    gap: 'ntb:gap',
    sort: 'ntb:sort',
    view: 'ntb:view',
    label: 'ntb:label',
    adv: 'ntb:advmeta',
    wheelZoom: 'ntb:wheelzoom',
    theme: 'ntb:theme',
    expandSitemap: 'ntb:expandmap'
  };

  const SELECTORS = [
    'pre a[href]',          // classic Apache
    'table a[href]',        // fancyindex styles
    'a[href]'               // fallback (filter later)
  ];

  // --------------------------- Utils ---------------------------------------
  const $ = (sel, ctx=document) => ctx.querySelector(sel);
  const $$ = (sel, ctx=document) => Array.from(ctx.querySelectorAll(sel));
  const abs = (href, base=location.href) => new URL(href, base).href;
  const isFunctionalLink = (a) => a && a.href && !a.href.startsWith('mailto:') && !a.href.startsWith('javascript:');
  const isDirHref = (href) => /\/$/.test(href.split('#')[0].split('?')[0]);
  const isImgHref = (href) => IMG_EXT.test(href.split('?')[0]);
  const isFileHref = (href) => FILE_EXT.test(href.split('?')[0]);
  
  // Natural sort that handles numbers correctly (e.g., "img2.jpg" comes before "img10.jpg")
  const nat = (function() {
    try { 
      return new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }).compare; 
    } catch(e) { 
      return (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }); 
    } 
  })();
  
  const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
  const fmtBytes = (n) => !Number.isFinite(n) ? '—' : (
    n < 1024 ? `${n} B` :
    n < 1048576 ? `${(n / 1024).toFixed(1)} KB` :
    n < 1073741824 ? `${(n / 1048576).toFixed(1)} MB` :
    `${(n / 1073741824).toFixed(2)} GB`
  );

  // Configurable limits with validation
  const MAX_ITEMS_PAGE = clamp(parseInt(getPref('ntb:maxitems', 12000), 10), 100, 50000); // per page safety guard
  const SCAN_CONCURRENCY = clamp(parseInt(getPref('ntb:concurrency', 4), 10), 1, 16);    // sitemap concurrent fetches
  const IO_THRESHOLD = clamp(parseFloat(getPref('ntb:iothreshold', 0.1)), 0, 1);         // intersection observer threshold
  
  // Shuffle array (for random sort)
  const shuffle = (array) => {
    const a = array.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  
  // Debounce function execution
  const debounce = (fn, ms = 150) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };

  // Throttle function execution (good for scroll handlers)
  const throttle = (fn, ms = 100) => {
    let lastCall = 0;
    return (...args) => {
      const now = Date.now();
      if (now - lastCall < ms) return;
      lastCall = now;
      return fn(...args);
    };
  };

  // Add UI controls to adjust limits and persist them
  function setupLimitControls() {
    const poll = setInterval(() => {
      const right = document.querySelector('.ntb-toolbar .ntb-right');
      if (!right) return;
      clearInterval(poll);
      const btn = document.createElement('button');
      btn.textContent = 'Limits';
      btn.title = 'Adjust page limits and thresholds';
      btn.addEventListener('click', () => {
        const max = prompt('Max items per page (100-50000)', MAX_ITEMS_PAGE);
        if (max !== null) setPref('ntb:maxitems', clamp(parseInt(max, 10) || MAX_ITEMS_PAGE, 100, 50000));
        const conc = prompt('Scan concurrency (1-16)', SCAN_CONCURRENCY);
        if (conc !== null) setPref('ntb:concurrency', clamp(parseInt(conc, 10) || SCAN_CONCURRENCY, 1, 16));
        const thr = prompt('Intersection threshold (0-1)', IO_THRESHOLD);
        if (thr !== null) setPref('ntb:iothreshold', clamp(parseFloat(thr) || IO_THRESHOLD, 0, 1));
        location.reload();
      });
      right.appendChild(btn);
    }, 500);
  }

  setupLimitControls();

  // Add a toggle to reveal hidden links on the original page (useful on tricky indexes)
  function setupRevealHiddenControl() {
    const REVEAL_STYLE_ID = 'ntb-reveal-hidden-style';
    const enableReveal = () => {
      if (document.getElementById(REVEAL_STYLE_ID)) return;
      const s = document.createElement('style');
      s.id = REVEAL_STYLE_ID;
      s.textContent = `
        /* Force-override common tricks used to hide anchors */
        a[href] {
          display: inline !important;
          visibility: visible !important;
          opacity: 1 !important;
          position: static !important;
          clip: auto !important;
          clip-path: none !important;
          width: auto !important;
          height: auto !important;
          margin: 0 !important;
          padding: 0 !important;
          text-indent: 0 !important;
          overflow: visible !important;
        }
      `;
      document.documentElement.appendChild(s);
    };
    const disableReveal = () => {
      const s = document.getElementById(REVEAL_STYLE_ID);
      if (s) s.remove();
    };

    const poll = setInterval(() => {
      const right = document.querySelector('.ntb-toolbar .ntb-right');
      if (!right) return;
      clearInterval(poll);

      const wrap = document.createElement('label');
      wrap.style.display = 'inline-flex';
      wrap.style.alignItems = 'center';
      wrap.style.gap = '6px';

      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.title = 'Reveal hidden links on this page';
      cb.addEventListener('change', () => {
        if (cb.checked) enableReveal(); else disableReveal();
      });

      const txt = document.createElement('span');
      txt.textContent = 'Reveal hidden links';

      wrap.appendChild(cb);
      wrap.appendChild(txt);
      right.appendChild(wrap);
    }, 500);
  }

  setupRevealHiddenControl();

  // Get file extension
  const getExt = (url) => {
    const filename = url.split('/').pop() || '';
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().toLowerCase() : '';
  };

  // Format date in a user-friendly way
  const formatDate = (date) => {
    if (!date) return '—';
    try {
      const d = new Date(date);
      if (isNaN(d.getTime())) return '—';
      
      // Use relative time for recent items
      const now = new Date();
      const diffMs = now - d;
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
      
      if (diffDays < 1) {
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        if (diffHours < 1) {
          const diffMinutes = Math.floor(diffMs / (1000 * 60));
          return diffMinutes < 1 ? 'Just now' : `${diffMinutes}m ago`;
        }
        return `${diffHours}h ago`;
      } else if (diffDays < 7) {
        return `${diffDays}d ago`;
      }
      
      // Otherwise use date format
      return d.toLocaleDateString();
    } catch (e) {
      return '—';
    }
  };

  // Get folder type based on name (for colorization)
  const getFolderType = (name) => {
    name = name.toLowerCase();
    if (/video|movie|film|tv|show|series/i.test(name)) return 'video';
    if (/audio|sound|music|mp3|wav|flac/i.test(name)) return 'audio';
    if (/photo|image|picture|img|jpg|camera|raw/i.test(name)) return 'photo';
    if (/archive|backup|old|save/i.test(name)) return 'archive';
    if (/document|doc|pdf|txt|report/i.test(name)) return 'document';
    return 'default';
  };

  // Get folder color based on type
  const getFolderColor = (type) => {
    const colors = {
      video: '#ff5a5f',
      audio: '#00d1b2',
      photo: '#3273dc',
      archive: '#9c5fff',
      document: '#ffdd57',
      default: 'var(--ntb-ac)'
    };
    return colors[type] || colors.default;
  };

  // --------------------------- Detection Logic ----------------------------
  function looksLikeAutoIndex(doc = document) {
    const t = (doc.title || '').toLowerCase();
    const hasIndexTitle = t.startsWith('index of ') || t.includes('autoindex') || /directory/i.test(t);
    const hasParentLink = $$('a', doc).some(a => /parent directory/i.test(a.textContent));
    const hasPre = !!$('pre', doc); 
    const hasTable = !!$('table', doc);
    const fileish = $$('a[href]', doc).filter(isFunctionalLink);
    const many = fileish.length >= 3; // small folders too
    
    // More sophisticated pattern detection
    let hasDirectoryPattern = false;
    
    // Look for classic Apache pre pattern
    if (hasPre) {
      const preText = $('pre', doc).textContent;
      // Apache pattern: looks for date patterns followed by size then filename
      hasDirectoryPattern = /\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}\s+\d+(\.\d+)?[KMG]?\s+\S+/i.test(preText) ||
                          /\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2}\s+\d+(\.\d+)?[KMG]?\s+\S+/i.test(preText);
    }
    
    // Look for table pattern (column headers like Name, Last Modified, Size)
    if (hasTable) {
      const headings = $$('th, td:first-child', doc).map(el => el.textContent.trim().toLowerCase());
      hasDirectoryPattern = headings.some(h => /name|last modified|size|description/i.test(h));
    }
    
    return (hasIndexTitle || hasParentLink || hasDirectoryPattern || (hasPre && hasTable)) && many;
  }

  // --------------------------- Metadata Extraction ------------------------
  function extractRowMeta(aEl) {
    // Try table extraction first
    const row = aEl.closest('tr');
    if (row) {
      const cells = Array.from(row.cells || []);
      if (cells.length >= 3) {
        // Common patterns in Apache/Nginx table listings
        let bytes, mtime;
        
        // Last modified date - check multiple date formats
        for (const cell of cells) {
          const text = cell.textContent.trim();
          // Check for YYYY-MM-DD HH:MM format
          const dateMatch1 = text.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          // Check for DD-Mon-YYYY HH:MM format
          const dateMatch2 = text.match(/(\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})/);
          
          if (dateMatch1 || dateMatch2) {
            const dateStr = (dateMatch1 ? dateMatch1[1] : dateMatch2[1]);
            const d = new Date(dateStr.replace(/-/g, ' '));
            if (!isNaN(+d)) mtime = d.toISOString();
            break;
          }
        }
        
        // File size
        for (const cell of cells) {
          const text = cell.textContent.trim();
          // Common size formats: 123K, 45.3MB, 2G, etc.
          const sizeMatch = text.match(/^((?:\d+[.,]?)+)\s*(B|KB|MB|GB|K|M|G)?$/i);
          if (sizeMatch) {
            const n = parseFloat(sizeMatch[1].replace(',', '.'));
            let unit = (sizeMatch[2] || '').toUpperCase();
            // Normalize units
            if (unit === 'K') unit = 'KB';
            if (unit === 'M') unit = 'MB';
            if (unit === 'G') unit = 'GB';
            
            const mult = { 'B': 1, 'KB': 1024, 'MB': 1048576, 'GB': 1073741824 }[unit] || 1;
            bytes = Math.round(n * mult);
            break;
          }
        }
        
        return { bytes, mtime };
      }
    }
    
    // Fallback to pre-formatted text parsing for standard Apache listings
    const pre = $('pre');
    if (pre) {
      const lines = pre.textContent.split('\n');
      const fileName = aEl.textContent.trim();
      const pattern = new RegExp(`\\S+\\s+\\S+\\s+(?:\\S+\\s+)?(?:\\S+\\s+)?(\\d+(?:\\.\\d+)?[KMG]?)\\s+${fileName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
      
      for (const line of lines) {
        if (line.includes(fileName)) {
          // Date extraction (supports multiple formats)
          let mtime;
          const dateMatch1 = line.match(/(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})/);
          const dateMatch2 = line.match(/(\d{2}-[A-Za-z]{3}-\d{4}\s+\d{2}:\d{2})/);
          
          if (dateMatch1 || dateMatch2) {
            const dateStr = (dateMatch1 ? dateMatch1[1] : dateMatch2[1]);
            const d = new Date(dateStr.replace(/-/g, ' '));
            if (!isNaN(+d)) mtime = d.toISOString();
          }
          
          // Size extraction
          let bytes;
          const sizeMatch = line.match(pattern) || line.match(/(\d+(?:\.\d+)?[KMG]?)\s+\S+$/);
          if (sizeMatch) {
            const sizeStr = sizeMatch[1];
            const unit = sizeStr.slice(-1);
            const isUnit = /[KMG]/i.test(unit);
            const num = parseFloat(isUnit ? sizeStr.slice(0, -1) : sizeStr);
            const mult = { 'K': 1024, 'M': 1048576, 'G': 1073741824 }[unit.toUpperCase()] || 1;
            bytes = Math.round(num * mult);
          }
          
          return { bytes, mtime };
        }
      }
    }
    
    return {};
  }

  // Parse full directory listing
  function parseIndex(doc, baseUrl) {
    let anchors = [];
    // Try each selector strategy until we find links
    for (const sel of SELECTORS) {
      anchors = $$(sel, doc);
      if (anchors.length) break;
    }
    
    const dirs = [];
    const images = [];
    const files = [];
    
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      if (!href || href === '../' || href === './' || href === '/') continue;
      
      const url = abs(href, baseUrl);
      if (!isFunctionalLink(a)) continue;
      
      // Extract name, clean up if needed
      let name = (a.textContent || decodeURIComponent(url.split('/').pop() || '')).trim();
      // Remove trailing slash for directory names
      if (name.endsWith('/')) name = name.slice(0, -1);
      if (!name) continue;
      
      // Extract metadata from the page structure
      const meta = extractRowMeta(a);
      
      if (isDirHref(href)) {
        dirs.push({
          kind: 'dir',
          url,
          name,
          type: getFolderType(name)
        });
      } else if (isImgHref(href)) {
        images.push({
          kind: 'img',
          url,
          name,
          ext: getExt(url),
          ...meta
        });
      } else if (isFileHref(href)) {
        files.push({
          kind: 'file',
          url,
          name,
          ext: getExt(url),
          ...meta
        });
      }
      
      if (dirs.length + images.length + files.length >= MAX_ITEMS_PAGE) break;
    }
    
    // Remove duplicates (some servers may have multiple links to same resource)
    const uniq = (arr) => {
      const seen = new Set();
      return arr.filter(x => seen.has(x.url) ? false : (seen.add(x.url), true));
    };
    
    // Sort by name as default
    const byName = (a, b) => nat(a.name, b.name);
    
    return {
      dirs: uniq(dirs).sort(byName),
      images: uniq(images).sort(byName),
      files: uniq(files).sort(byName)
    };
  }

  // --------------------------- Styles -------------------------------------
  const CSS = /* css */`
    /* Base theme variables */
    :root {
      --ntb-gap: 14px;
      --ntb-size: 220px;
      --ntb-label: 14px;
      
      /* Dark theme (default) */
      --ntb-bg: #0b0f14;
      --ntb-card-bg: #0f1722;
      --ntb-fg: #e6eef9;
      --ntb-ac: #00ffc8;
      --ntb-dim: #9bb1c7;
      --ntb-border: #1c2836;
      --ntb-overlay: rgba(5,8,11,0.92);
      --ntb-highlight: rgba(0,255,200,0.15);
      --ntb-folder-icon: rgba(0,255,200,0.8);
      --ntb-shadow: 0 10px 22px rgba(0,0,0,0.35);
      --ntb-toolbar-bg: linear-gradient(180deg, rgba(5,8,11,0.95), rgba(5,8,11,0.85));
    }
    
    /* High contrast theme */
    .ntb-high-contrast {
      --ntb-fg: #ffffff;
      --ntb-dim: #b0c4d8;
      --ntb-ac: #00ffdb;
      --ntb-border: #2a3b4d;
      --ntb-highlight: rgba(0,255,219,0.2);
    }
    
    /* Light theme */
    .ntb-light {
      --ntb-bg: #f0f2f5;
      --ntb-card-bg: #ffffff;
      --ntb-fg: #283142;
      --ntb-ac: #0070f3;
      --ntb-dim: #6b7280;
      --ntb-border: #dde1e7;
      --ntb-overlay: rgba(240,242,245,0.92);
      --ntb-highlight: rgba(0,112,243,0.1);
      --ntb-folder-icon: rgba(0,112,243,0.8);
      --ntb-shadow: 0 10px 25px rgba(0,0,0,0.1);
      --ntb-toolbar-bg: linear-gradient(180deg, rgba(255,255,255,0.95), rgba(255,255,255,0.85));
    }
    
    /* Global styles */
    body { 
      background-color: var(--ntb-bg) !important; 
      color: var(--ntb-fg) !important;
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif;
    }
    
    .ntb-hide-original { 
      display: none !important; 
    }
    
    /* Toolbar */
    .ntb-toolbar { 
      position: sticky; 
      top: 0; 
      z-index: 9999; 
      display: grid; 
      grid-template-columns: 1fr auto; 
      gap: 10px; 
      align-items: center; 
      padding: 12px 16px; 
      background: var(--ntb-toolbar-bg); 
      border-bottom: 1px solid var(--ntb-border); 
      color: var(--ntb-fg); 
      backdrop-filter: blur(8px);
      font: 14px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', sans-serif; 
    }
    
    .ntb-left { 
      display: flex; 
      flex-wrap: wrap; 
      gap: 8px 12px; 
      align-items: center; 
    }
    
    .ntb-right { 
      display: flex; 
      flex-wrap: wrap; 
      gap: 10px; 
      align-items: center; 
    }
    
    .ntb-brand { 
      color: var(--ntb-ac); 
      font-weight: 700; 
      letter-spacing: 0.03em; 
    }
    
    .ntb-bc a { 
      color: var(--ntb-fg); 
      text-decoration: none; 
      opacity: 0.9; 
      transition: color 0.15s ease;
    } 
    
    .ntb-bc a:hover { 
      color: var(--ntb-ac); 
    }
    
    .ntb-crumb-sep { 
      opacity: 0.45; 
      margin: 0 6px; 
    }
    
    .ntb-chip { 
      display: inline-block; 
      padding: 2px 8px; 
      border: 1px solid var(--ntb-border); 
      border-radius: 999px; 
      margin-left: 6px; 
      font-size: 11px; 
      color: var(--ntb-dim); 
      background: var(--ntb-card-bg);
    }
    
    .ntb-badge {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--ntb-highlight);
      color: var(--ntb-ac);
      border-radius: 999px;
      padding: 1px 6px;
      font-size: 10px;
      margin-left: 8px;
      min-width: 18px;
    }
    
    /* Form controls */
    .ntb-toolbar input[type="search"], 
    .ntb-toolbar select, 
    .ntb-toolbar button {
      background: var(--ntb-card-bg); 
      color: var(--ntb-fg); 
      border: 1px solid var(--ntb-border); 
      border-radius: 8px; 
      padding: 8px 12px; 
      font-size: 13px;
      outline: none;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    
    .ntb-toolbar button {
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    
    .ntb-toolbar button:hover {
      border-color: var(--ntb-ac);
    }
    
    .ntb-toolbar button:focus-visible,
    .ntb-toolbar input:focus-visible,
    .ntb-toolbar select:focus-visible {
      border-color: var(--ntb-ac);
      box-shadow: 0 0 0 2px var(--ntb-highlight);
    }
    
    .ntb-toolbar button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    
    .ntb-toolbar button.ntb-active {
      background: var(--ntb-highlight);
      border-color: var(--ntb-ac);
    }
    
    .ntb-toolbar input[type="range"] {
      accent-color: var(--ntb-ac);
    }
    
    .ntb-toolbar .ntb-icon {
      width: 16px;
      height: 16px;
      display: inline-block;
      vertical-align: middle;
    }
    
    /* Grid View */
    .ntb-grid { 
      display: grid; 
      grid-template-columns: repeat(auto-fill, minmax(var(--ntb-size), 1fr)); 
      gap: var(--ntb-gap); 
      padding: 16px; 
    }
    
    .ntb-item { 
      background: var(--ntb-card-bg); 
      border: 1px solid var(--ntb-border); 
      border-radius: 12px; 
      overflow: hidden; 
      transition: transform 0.15s ease, border-color 0.15s ease, box-shadow 0.2s ease; 
    }
    
    .ntb-item:hover { 
      transform: translateY(-2px); 
      border-color: var(--ntb-ac); 
      box-shadow: var(--ntb-shadow);
    }
    
    .ntb-item.dir { 
      display: flex; 
      flex-direction: column;
      padding: 20px; 
      min-height: calc(var(--ntb-size) - 42px); 
      cursor: pointer; 
    }
    
    .ntb-folder-icon { 
      margin-bottom: 14px;
      align-self: center;
      opacity: 0.9;
      width: 64px;
      height: 64px;
    }
    
    .ntb-dirname { 
      font-size: calc(var(--ntb-label) * 1.1); 
      color: var(--ntb-fg); 
      text-align: center;
      overflow: hidden;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      margin-top: auto;
    }
    
    .ntb-dir-meta {
      font-size: 11px;
      color: var(--ntb-dim);
      text-align: center;
      margin-top: 6px;
    }
    
    .ntb-item.img { 
      cursor: zoom-in; 
      display: flex; 
      flex-direction: column;
      position: relative;
    }
    
    .ntb-img-wrap {
      position: relative;
      overflow: hidden;
      aspect-ratio: 1 / 1;
    }
    
    .ntb-img-placeholder {
      position: absolute;
      inset: 0;
      background-color: var(--ntb-card-bg);
      display: flex;
      align-items: center;
      justify-content: center;
      color: var(--ntb-dim);
      font-size: 12px;
    }
    
    .ntb-item.img img { 
      width: 100%; 
      height: 100%; 
      object-fit: cover;
      display: block;
      transition: transform 0.3s ease;
    }
    
    .ntb-item.img:hover img {
      transform: scale(1.03);
    }
    
    .ntb-resolution {
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: rgba(0,0,0,0.6);
      color: #fff;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 4px;
      opacity: 0;
      transition: opacity 0.2s ease;
    }
    
    .ntb-item.img:hover .ntb-resolution {
      opacity: 1;
    }
    
    .ntb-caption { 
      font-size: var(--ntb-label); 
      color: var(--ntb-fg); 
      padding: 10px 12px; 
      white-space: nowrap; 
      overflow: hidden; 
      text-overflow: ellipsis; 
      border-top: 1px solid var(--ntb-border);
    }
    
    .ntb-caption .ntb-dim {
      font-size: 90%;
      color: var(--ntb-dim);
      margin-left: 6px;
    }
    
    /* List View */
    .ntb-list { 
      display: block; 
      padding: 0 16px 60px; 
    }
    
    .ntb-row { 
      display: grid; 
      grid-template-columns: minmax(220px, 1.2fr) 0.4fr 0.4fr 0.6fr 0.6fr; 
      gap: 12px; 
      align-items: center; 
      border-bottom: 1px solid var(--ntb-border); 
      padding: 12px 8px;
      transition: background-color 0.1s ease;
    }
    
    .ntb-row:hover {
      background-color: var(--ntb-highlight);
    }
    
    .ntb-h { 
      position: sticky; 
      top: 57px; 
      background: var(--ntb-bg); 
      z-index: 2; 
      font-weight: 600;
      border-bottom: 2px solid var(--ntb-border);
      padding: 12px 8px;
    }
    
    .ntb-row .ntb-name { 
      display: flex; 
      align-items: center; 
      gap: 12px; 
      min-width: 0; 
    }
    
    .ntb-row .ntb-name .ntb-dirname, 
    .ntb-row .ntb-name .ntb-filename { 
      white-space: nowrap; 
      overflow: hidden; 
      text-overflow: ellipsis; 
    }
    
    .ntb-row .ntb-icon {
      flex-shrink: 0;
      width: 24px;
      height: 24px;
      opacity: 0.9;
    }
    
    .ntb-row .ntb-open { 
      justify-self: end; 
    }
    
    .ntb-type-chip {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 11px;
      background: var(--ntb-highlight);
      color: var(--ntb-ac);
    }
    
    /* Lightbox */
    .ntb-lightbox { 
      position: fixed; 
      inset: 0; 
      z-index: 10000; 
      display: none; 
      align-items: center; 
      justify-content: center; 
      background: var(--ntb-overlay); 
    }
    
    .ntb-lightbox.on { 
      display: flex; 
    }
    
    .ntb-dialog { 
      position: relative; 
      outline: 0; 
    }
    
    .ntb-zoomwrap { 
      max-width: 95vw; 
      max-height: 90vh; 
      overflow: hidden; 
      border: 1px solid var(--ntb-border); 
      border-radius: 12px; 
      background: var(--ntb-bg); 
      touch-action: none; 
    }
    
    .ntb-zoomimg { 
      display: block; 
      will-change: transform; 
      transform-origin: center center; 
    }
    
    .ntb-lbbar { 
      position: fixed; 
      left: 0; 
      right: 0; 
      bottom: 16px; 
      display: flex; 
      gap: 8px; 
      justify-content: center; 
      align-items: center; 
    }
    
    .ntb-lbbar button { 
      background: var(--ntb-card-bg); 
      color: var(--ntb-fg); 
      border: 1px solid var(--ntb-border); 
      border-radius: 8px; 
      padding: 8px 12px;
      font-size: 13px;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    
    .ntb-lbbar button:hover {
      border-color: var(--ntb-ac);
    }
    
    .ntb-close { 
      position: fixed; 
      top: 20px; 
      right: 20px;
      background: var(--ntb-card-bg);
      color: var(--ntb-fg);
      border: 1px solid var(--ntb-border);
      border-radius: 8px;
      width: 36px;
      height: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    
    .ntb-close:hover {
      border-color: var(--ntb-ac);
    }
    
    .ntb-prev, .ntb-next { 
      position: fixed; 
      top: 50%; 
      transform: translateY(-50%);
      background: var(--ntb-card-bg);
      color: var(--ntb-fg);
      border: 1px solid var(--ntb-border);
      border-radius: 8px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 18px;
      cursor: pointer;
      transition: border-color 0.15s ease;
    }
    
    .ntb-prev { left: 20px; }
    .ntb-next { right: 20px; }
    
    .ntb-prev:hover, .ntb-next:hover {
      border-color: var(--ntb-ac);
    }
    
    /* Sitemap */
    .ntb-sitemap { 
      position: fixed; 
      top: 0; 
      left: 0; 
      height: 100vh; 
      width: 400px; 
      transform: translateX(-100%); 
      transition: transform 0.2s ease; 
      z-index: 9999; 
      background: var(--ntb-bg); 
      border-right: 1px solid var(--ntb-border); 
      display: flex; 
      flex-direction: column; 
    }
    
    .ntb-sitemap.open { 
      transform: translateX(0); 
    }
    
    .ntb-scan-head { 
      padding: 14px 16px; 
      border-bottom: 1px solid var(--ntb-border); 
      display: flex; 
      gap: 10px; 
      align-items: center; 
      color: var(--ntb-fg); 
    }
    
    .ntb-scan-body { 
      overflow: auto; 
      padding: 16px; 
      color: var(--ntb-fg); 
    }
    
    .ntb-tree details { 
      margin-left: 16px;
      position: relative;
    }
    
    .ntb-tree details::before {
      content: "";
      position: absolute;
      top: 0;
      bottom: 0;
      left: -12px;
      width: 1px;
      background-color: var(--ntb-border);
    }
    
    .ntb-tree details::after {
      content: "";
      position: absolute;
      top: 10px;
      left: -12px;
      width: 10px;
      height: 1px;
      background-color: var(--ntb-border);
    }
    
    .ntb-tree summary { 
      cursor: pointer;
      margin-bottom: 8px;
      position: relative;
      outline: none;
    }
    
    .ntb-tree summary:hover {
      color: var(--ntb-ac);
    }
    
    .ntb-tree summary:focus-visible {
      outline: 2px solid var(--ntb-ac);
      outline-offset: 2px;
    }
    
    .ntb-tree-actions {
      margin-bottom: 16px;
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
    }
    
    .ntb-tree a {
      color: var(--ntb-fg);
      text-decoration: none;
      transition: color 0.15s ease;
    }
    
    .ntb-tree a:hover {
      color: var(--ntb-ac);
    }
    
    .ntb-file-list {
      margin: 8px 0 12px 18px;
      padding: 0;
      list-style-type: none;
      border-left: 1px dashed var(--ntb-border);
      padding-left: 12px;
    }
    
    .ntb-file-list li {
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    
    .ntb-scan-foot { 
      border-top: 1px solid var(--ntb-border); 
      padding: 14px 16px; 
      display: flex; 
      gap: 10px; 
      align-items: center; 
      margin-top: auto; 
      background: var(--ntb-card-bg); 
    }
    
    /* Responsive adjustments */
    @media (max-width: 768px) {
      .ntb-toolbar {
        padding: 10px;
        grid-template-columns: 1fr;
      }
      
      .ntb-left, .ntb-right {
        justify-content: center;
      }
      
      .ntb-sitemap {
        width: 85%;
      }
      
      .ntb-row {
        grid-template-columns: 1fr auto;
      }
      
      .ntb-row .ntb-date,
      .ntb-row .ntb-size,
      .ntb-row .ntb-type {
        display: none;
      }
      
      .ntb-h .ntb-date,
      .ntb-h .ntb-size,
      .ntb-h .ntb-type {
        display: none;
      }
    }
    
    /* Reduced motion support */
    @media (prefers-reduced-motion: reduce) {
      .ntb-item { 
        transition: none; 
      }
      
      .ntb-item:hover { 
        transform: none; 
      }
      
      .ntb-sitemap {
        transition: none;
      }
      
      .ntb-item.img img {
        transition: none;
      }
      
      .ntb-item.img:hover img {
        transform: none;
      }
    }
  `;

  // --------------------------- SVG Icons ----------------------------------
  const ICONS = {
    folder: (color = 'var(--ntb-folder-icon)') => `<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.5" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" /></svg>`,
    
    folderVideo: (color = '#ff5a5f') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><path d="M12 10v3l2.5 1.5" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    folderAudio: (color = '#00d1b2') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><path d="M14 10.5v3m2-4v5m-6-3v1" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    folderPhoto: (color = '#3273dc') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><circle cx="14.5" cy="10.5" r="1.5" stroke="${color}" stroke-width="1.5"/><path d="M9 16l2-2.5 4 3" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    folderArchive: (color = '#9c5fff') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><path d="M12 10v6m-1.5-4.5h3" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    folderDocument: (color = '#ffdd57') => `<svg viewBox="0 0 24 24" fill="none" class="ntb-folder-icon"><path d="M3 6.5A2.5 2.5 0 0 1 5.5 4h3.6a2.5 2.5 0 0 1 1.77.73l1.42 1.54c.47.5 1.12.78 1.8.78H18.5A2.5 2.5 0 0 1 21 9.5v6A2.5 2.5 0 0 1 18.5 18h-13A2.5 2.5 0 0 1 3 15.5v-9Z" stroke="${color}" stroke-width="1.5"/><path d="M10 10h4m-4 2h4m-4 2h2" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/></svg>`,
    
    grid: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"></path></svg>`,
    
    list: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M3 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 4a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clip-rule="evenodd"></path></svg>`,
    
    home: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z"></path></svg>`,
    
    up: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M5.293 9.707a1 1 0 010-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 7.414V15a1 1 0 11-2 0V7.414L6.707 9.707a1 1 0 01-1.414 0z" clip-rule="evenodd"></path></svg>`,
    
    raw: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 101.414 1.414L15 6.414V9a1 1 0 102 0V4a1 1 0 00-1-1h-5z"></path><path d="M5 5a2 2 0 00-2 2v8a2 2 0 002 2h8a2 2 0 002-2v-3a1 1 0 10-2 0v3H5V7h3a1 1 0 000-2H5z"></path></svg>`,
    
    map: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M12 1.586l-4 4v12.828l4-4V1.586zM3.707 3.293A1 1 0 002 4v10a1 1 0 00.293.707L6 18.414V5.586L3.707 3.293zM17.707 5.293L14 1.586v12.828l2.293 2.293A1 1 0 0018 16V6a1 1 0 00-.293-.707z" clip-rule="evenodd"></path></svg>`,
    
    search: () => `<svg class="ntb-icon" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clip-rule="evenodd"></path></svg>`,
    
    fileIcon: (ext) => {
      // Map extension to icon HTML
      const iconMap = {
        // Images
        jpg: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        jpeg: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        png: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        gif: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        webp: `<svg viewBox="0 0 24 24" fill="none" stroke="#3273dc" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><circle cx="15" cy="10" r="1.5" /><path d="M17 15L14 12L9 17" /></svg>`,
        
        // Videos
        mp4: `<svg viewBox="0 0 24 24" fill="none" stroke="#ff5a5f" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M10 10V14L14 12L10 10Z" /></svg>`,
        mov: `<svg viewBox="0 0 24 24" fill="none" stroke="#ff5a5f" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M10 10V14L14 12L10 10Z" /></svg>`,
        avi: `<svg viewBox="0 0 24 24" fill="none" stroke="#ff5a5f" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M10 10V14L14 12L10 10Z" /></svg>`,
        
        // Audio
        mp3: `<svg viewBox="0 0 24 24" fill="none" stroke="#00d1b2" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M9 15V11M12 16V10M15 15V11" stroke-linecap="round" /></svg>`,
        wav: `<svg viewBox="0 0 24 24" fill="none" stroke="#00d1b2" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M9 15V11M12 16V10M15 15V11" stroke-linecap="round" /></svg>`,
        
        // Documents
        pdf: `<svg viewBox="0 0 24 24" fill="none" stroke="#ffdd57" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M8 12H16M8 15H13" stroke-linecap="round" /></svg>`,
        txt: `<svg viewBox="0 0 24 24" fill="none" stroke="#ffdd57" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M8 12H16M8 15H13" stroke-linecap="round" /></svg>`,
        doc: `<svg viewBox="0 0 24 24" fill="none" stroke="#ffdd57" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M8 12H16M8 15H13" stroke-linecap="round" /></svg>`,
        
        // Archives
        zip: `<svg viewBox="0 0 24 24" fill="none" stroke="#9c5fff" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M12 9V15M10 12H14" stroke-linecap="round" /></svg>`,
        rar: `<svg viewBox="0 0 24 24" fill="none" stroke="#9c5fff" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /><path d="M12 9V15M10 12H14" stroke-linecap="round" /></svg>`,
        
        // Default
        default: `<svg viewBox="0 0 24 24" fill="none" stroke="var(--ntb-dim)" stroke-width="1.5" class="ntb-icon"><path d="M12 4.75H19.25V19.25H4.75V4.75H12ZM12 4.75L8 8.75" /></svg>`
      };
      
      return iconMap[ext.toLowerCase()] || iconMap.default;
    },
    
    // Get folder icon based on type
    folderIcon: (type) => {
      const icons = {
        video: ICONS.folderVideo('#ff5a5f'),
        audio: ICONS.folderAudio('#00d1b2'),
        photo: ICONS.folderPhoto('#3273dc'),
        archive: ICONS.folderArchive('#9c5fff'),
        document: ICONS.folderDocument('#ffdd57'),
        default: ICONS.folder('var(--ntb-folder-icon)')
      };
      return icons[type] || icons.default;
    }
  };

  function injectCSS() {
    let s = document.getElementById('ntb-styles');
    if (!s) {
      s = document.createElement('style');
      s.id = 'ntb-styles';
      document.documentElement.appendChild(s);
    }
    s.textContent = CSS;
  }

  // --------------------------- Metadata Manager ---------------------------
  function createMetadataManager() {
    // Use sessionStorage to persist metadata across page navigation
    const storageKey = 'ntb-metadata-cache';
    const storageExpiry = 'ntb-metadata-expiry';
    
    // Try to load cached data
    let cache = new Map();
    try {
      const now = Date.now();
      const expiry = parseInt(sessionStorage.getItem(storageExpiry) || '0', 10);
      
      // Only use cache if it's still valid
      if (expiry > now) {
        const cachedData = JSON.parse(sessionStorage.getItem(storageKey) || '{}');
        Object.entries(cachedData).forEach(([url, data]) => {
          cache.set(url, data);
        });
        console.log(`[NiceThumbsBuddy] Loaded metadata for ${cache.size} items from cache`);
      } else {
        // Cache expired, clear it
        sessionStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageExpiry);
      }
    } catch (e) {
      console.warn('[NiceThumbsBuddy] Error loading metadata cache:', e);
    }
    
    const inFlight = new Map();
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;

        const url = entry.target.getAttribute('data-url');
        if (!url || cache.has(url) || inFlight.has(url)) continue;

        inFlight.set(url, true);
        fetch(url, { method: 'HEAD' }).then((res) => {
          const size = parseInt(res.headers.get('content-length') || '0', 10);
          const type = res.headers.get('content-type') || '';
          cache.set(url, { size, type });
          saveCache();
        }).catch(() => {
          // Ignore network errors
        }).finally(() => {
          inFlight.delete(url);
        });
      }
    }, { threshold: IO_THRESHOLD });

    function saveCache() {
      try {
        const obj = Object.fromEntries(cache.entries());
        sessionStorage.setItem(storageKey, JSON.stringify(obj));
        sessionStorage.setItem(storageExpiry, String(Date.now() + CACHE_EXPIRY));
      } catch (e) {
        console.warn('[NiceThumbsBuddy] Error saving metadata cache:', e);
      }
    }

    function noteImageSize(url, width, height) {
      const data = cache.get(url) || {};
      if (!data.width || !data.height) {
        cache.set(url, { ...data, width, height });
        saveCache();
      }
    }

    function get(url) {
      return cache.get(url) || {};
    }

    function observe(el) {
      io.observe(el);
    }

    return { noteImageSize, get, observe };
  }

  // --------------------------- Toolbar & Rendering -------------------------
  function buildToolbar(state) {
    const bar = document.createElement('div');
    bar.className = 'ntb-toolbar';

    const left = document.createElement('div');
    left.className = 'ntb-left';
    const right = document.createElement('div');
    right.className = 'ntb-right';

    const brand = document.createElement('span');
    brand.className = 'ntb-brand';
    brand.textContent = 'NiceThumbsBuddy';
    left.appendChild(brand);

    const bc = document.createElement('span');
    bc.className = 'ntb-bc';
    const parts = location.pathname.split('/').filter(Boolean);
    const crumbs = [];
    let build = `${location.protocol}//${location.host}`;
    const rootLink = document.createElement('a');
    rootLink.href = build + '/';
    rootLink.textContent = location.host;
    bc.appendChild(rootLink);
    for (const p of parts) {
      build += `/${p}`;
      const sep = document.createElement('span');
      sep.className = 'ntb-crumb-sep';
      sep.textContent = '›';
      bc.appendChild(sep);
      const a = document.createElement('a');
      a.href = build + '/';
      a.textContent = decodeURIComponent(p);
      bc.appendChild(a);
      crumbs.push(a);
    }
    left.appendChild(bc);

    const search = document.createElement('input');
    search.type = 'search';
    search.placeholder = 'Filter…';
    search.value = state.query;
    search.addEventListener('input', debounce(() => {
      state.query = search.value.trim();
      render(state);
    }, 150));
    left.appendChild(search);

    const sort = document.createElement('select');
    const sortOptions = [
      ['name', 'Name'],
      ['type', 'Type'],
      ['size', 'Size'],
      ['res', 'Resolution'],
      ['date', 'Date'],
      ['rand', 'Random'],
    ];
    for (const [v, t] of sortOptions) {
      const o = document.createElement('option');
      o.value = v; o.textContent = t; sort.appendChild(o);
    }
    sort.value = state.sort;
    sort.addEventListener('change', () => { state.sort = sort.value; setPref(LSK.sort, state.sort); render(state); });
    right.appendChild(sort);

    const viewToggle = document.createElement('div');
    const btnGrid = document.createElement('button');
    btnGrid.textContent = 'Grid';
    const btnList = document.createElement('button');
    btnList.textContent = 'List';
    const setView = (v) => {
      state.view = v; setPref(LSK.view, v);
      btnGrid.classList.toggle('ntb-active', v === 'grid');
      btnList.classList.toggle('ntb-active', v === 'list');
      render(state);
    };
    btnGrid.addEventListener('click', () => setView('grid'));
    btnList.addEventListener('click', () => setView('list'));
    viewToggle.appendChild(btnGrid);
    viewToggle.appendChild(btnList);
    right.appendChild(viewToggle);

    const size = document.createElement('input');
    size.type = 'range'; size.min = '120'; size.max = '420';
    size.value = String(state.size);
    size.title = 'Tile size';
    size.addEventListener('input', throttle(() => { state.size = parseInt(size.value, 10); setPref(LSK.size, state.size); applyVars(state); }, 60));
    right.appendChild(size);

    const gap = document.createElement('input');
    gap.type = 'range'; gap.min = '6'; gap.max = '28';
    gap.value = String(state.gap);
    gap.title = 'Tile gap';
    gap.addEventListener('input', throttle(() => { state.gap = parseInt(gap.value, 10); setPref(LSK.gap, state.gap); applyVars(state); }, 60));
    right.appendChild(gap);

    const label = document.createElement('input');
    label.type = 'range'; label.min = '11'; label.max = '20';
    label.value = String(state.label);
    label.title = 'Label font size';
    label.addEventListener('input', throttle(() => { state.label = parseInt(label.value, 10); setPref(LSK.label, state.label); applyVars(state); }, 60));
    right.appendChild(label);

    // Theme select
    const themeSel = document.createElement('select');
    themeSel.title = 'Theme';
    const themes = [
      ['dark', 'Dark'],
      ['light', 'Light'],
      ['hc', 'High Contrast'],
    ];
    for (const [v, t] of themes) {
      const o = document.createElement('option'); o.value=v; o.textContent=t; themeSel.appendChild(o);
    }
    themeSel.value = state.theme;
    themeSel.addEventListener('change', () => { state.theme = themeSel.value; setPref(LSK.theme, state.theme); applyTheme(state.theme); });
    right.appendChild(themeSel);

    const sitemapBtn = document.createElement('button');
    sitemapBtn.textContent = 'Sitemap';
    sitemapBtn.addEventListener('click', () => toggleSitemap(state));
    right.appendChild(sitemapBtn);

    bar.appendChild(left); bar.appendChild(right);
    return bar;
  }

  function applyVars(state) {
    document.documentElement.style.setProperty('--ntb-size', state.size + 'px');
    document.documentElement.style.setProperty('--ntb-gap', state.gap + 'px');
    document.documentElement.style.setProperty('--ntb-label', state.label + 'px');
  }

  function applyTheme(theme) {
    const root = document.documentElement;
    root.classList.remove('ntb-light', 'ntb-high-contrast');
    if (theme === 'auto') {
      const mql = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)');
      const applySys = () => {
        root.classList.remove('ntb-light', 'ntb-high-contrast');
        if (mql && mql.matches) root.classList.add('ntb-light');
      };
      applySys();
      if (mql && !applyTheme._bound) { mql.addEventListener('change', applySys); applyTheme._bound = true; }
      return;
    }
    if (theme === 'light') root.classList.add('ntb-light');
    else if (theme === 'hc') root.classList.add('ntb-high-contrast');
  }

  function sortItems(state, items) {
    const meta = state.meta;
    const byName = (a, b) => nat(a.name, b.name);
    if (state.sort === 'name') return items.sort(byName);
    if (state.sort === 'type') return items.sort((a,b)=>nat(a.ext||'', b.ext||''));
    if (state.sort === 'size') return items.sort((a,b)=> (meta.get(b.url).size||0) - (meta.get(a.url).size||0));
    if (state.sort === 'res') return items.sort((a,b)=> {
      const mb = (meta.get(b.url).width||0)*(meta.get(b.url).height||0);
      const ma = (meta.get(a.url).width||0)*(meta.get(a.url).height||0);
      return mb - ma;
    });
    if (state.sort === 'date') return items.sort((a,b)=> new Date(b.mtime||0) - new Date(a.mtime||0));
    if (state.sort === 'rand') return shuffle(items);
    return items;
  }

  function render(state) {
    const { root, data } = state;
    const q = (state.query||'').toLowerCase();
    const dirs = data.dirs.filter(x => x.name.toLowerCase().includes(q));
    const images = sortItems(state, data.images.filter(x=> x.name.toLowerCase().includes(q)));
    const files = sortItems(state, data.files.filter(x=> x.name.toLowerCase().includes(q)));
    state.items = { dirs, images, files };
    state.container.innerHTML = '';
    if (state.view === 'grid') renderGrid(state); else renderList(state);
  }

  function renderGrid(state) {
    const grid = document.createElement('div');
    grid.className = 'ntb-grid';
    for (const d of state.items.dirs) grid.appendChild(tileDir(d));
    for (const im of state.items.images) grid.appendChild(tileImage(im, state));
    for (const f of state.items.files) grid.appendChild(tileFile(f, state));
    state.container.appendChild(grid);
  }

  function tileDir(d) {
    const el = document.createElement('a');
    el.href = d.url; el.className = 'ntb-item dir';
    el.innerHTML = `${ICONS.folderIcon(d.type)}<div class="ntb-dirname">${d.name}</div>`;
    el.addEventListener('click', (e)=>{ if (e.metaKey||e.ctrlKey) return; e.preventDefault(); location.href = d.url; });
    return el;
  }

  function tileImage(im, state) {
    const wrap = document.createElement('div'); wrap.className = 'ntb-item img';
    const a = document.createElement('a'); a.href = im.url; a.setAttribute('data-url', im.url);
    const img = document.createElement('img'); img.src = im.url; img.loading='lazy'; img.decoding='async';
    img.addEventListener('load', ()=> state.meta.noteImageSize(im.url, img.naturalWidth, img.naturalHeight));
    a.appendChild(img); wrap.appendChild(a);
    a.addEventListener('click', (e)=>{ e.preventDefault(); openLightbox(state, im.url); });
    state.meta.observe(a);
    return wrap;
  }

  function tileFile(f, state) {
    const el = document.createElement('a'); el.href=f.url; el.className='ntb-item file'; el.setAttribute('data-url', f.url);
    const meta = state.meta.get(f.url) || {};
    const size = meta.size || f.bytes || 0;
    el.innerHTML = `<div style="padding:16px;display:flex;gap:12px;align-items:center"><span aria-hidden="true">${ICONS.fileIcon((f.ext||'').toLowerCase())}</span><div style="flex:1 1 auto"><div style="font-weight:600">${f.name}</div><div style="opacity:.7;font-size:12px">${(f.ext||'').toUpperCase()} • ${fmtBytes(size)}${f.mtime? ' • '+formatDate(f.mtime):''}</div></div></div>`;
    state.meta.observe(el);
    return el;
  }

  function renderList(state) {
    const cont = document.createElement('div');
    cont.className = 'ntb-list';
    const header = document.createElement('div'); header.className='ntb-row ntb-h';
    header.innerHTML = `<div>Name</div><div class="ntb-type">Type</div><div class="ntb-res">Resolution</div><div class="ntb-size">Size</div><div class="ntb-date">Date</div>`;
    cont.appendChild(header);
    const row = (name, extra) => { const r=document.createElement('div'); r.className='ntb-row'; r.innerHTML = name+extra; return r; };
    for (const d of state.items.dirs) {
      const href = `<a href="${d.url}">${d.name}</a>`;
      cont.appendChild(row(`<div>${href}</div>`, `<div class="ntb-type">Folder</div><div class="ntb-res">—</div><div class="ntb-size">—</div><div class="ntb-date">—</div>`));
    }
    for (const im of state.items.images) {
      const m = state.meta.get(im.url) || {};
      const res = m.width && m.height ? `${(m.width*m.height/1e6).toFixed(2)} MP` : '—';
      const href = `<a href="${im.url}" data-url="${im.url}" class="ntb-open">${im.name}</a>`;
      cont.appendChild(row(`<div>${href}</div>`, `<div class="ntb-type">${(im.ext||'').toUpperCase()}</div><div class="ntb-res">${res}</div><div class="ntb-size">${fmtBytes(m.size||im.bytes)}</div><div class="ntb-date">${formatDate(im.mtime)}</div>`));
    }
    for (const f of state.items.files) {
      const m = state.meta.get(f.url) || {};
      const href = `<a href="${f.url}" data-url="${f.url}">${f.name}</a>`;
      cont.appendChild(row(`<div>${href}</div>`, `<div class="ntb-type">${(f.ext||'').toUpperCase()}</div><div class="ntb-res">—</div><div class="ntb-size">${fmtBytes(m.size||f.bytes)}</div><div class="ntb-date">${formatDate(f.mtime)}</div>`));
    }
    cont.addEventListener('click', (e)=>{
      const a = e.target.closest('a.ntb-open'); if (!a) return; e.preventDefault(); openLightbox(state, a.getAttribute('data-url'));
    });
    state.container.appendChild(cont);
  }

  // --------------------------- Lightbox ------------------------------------
  function ensureLightbox() {
    let lb = document.querySelector('.ntb-lightbox');
    if (lb) return lb;
    lb = document.createElement('div'); lb.className='ntb-lightbox'; lb.setAttribute('role','dialog'); lb.setAttribute('aria-modal','true'); lb.tabIndex=-1;
    const dialog = document.createElement('div'); dialog.className='ntb-dialog';
    const zw = document.createElement('div'); zw.className='ntb-zoomwrap';
    const img = document.createElement('img'); img.className='ntb-zoomimg';
    zw.appendChild(img); dialog.appendChild(zw); lb.appendChild(dialog);
    const close = document.createElement('button'); close.className='ntb-close'; close.textContent='×'; close.setAttribute('aria-label','Close');
    const prev = document.createElement('button'); prev.className='ntb-prev'; prev.textContent='‹'; prev.setAttribute('aria-label','Previous');
    const next = document.createElement('button'); next.className='ntb-next'; next.textContent='›'; next.setAttribute('aria-label','Next');
    lb.appendChild(close); lb.appendChild(prev); lb.appendChild(next);
    document.body.appendChild(lb);
    return lb;
  }

  function openLightbox(state, url) {
    const lb = ensureLightbox();
    const img = lb.querySelector('.ntb-zoomimg');
    const focusables = () => Array.from(lb.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')).filter(el=>!el.hasAttribute('disabled'));
    const prevFocus = document.activeElement;
    const idxList = state.items.images.map(x=>x.url);
    let idx = Math.max(0, idxList.indexOf(url));
    let z=1, tx=0, ty=0;
    const apply = ()=>{ img.style.transform = `translate(${tx}px, ${ty}px) scale(${z})`; };
    const load = ()=>{ img.src = idxList[idx]; reset(); };
    const reset = ()=>{ z=1; tx=0; ty=0; apply(); };
    const onKey = (e)=>{
      if (e.key==='Escape') return close();
      if (e.key==='ArrowRight') { idx=(idx+1)%idxList.length; load(); }
      if (e.key==='ArrowLeft') { idx=(idx-1+idxList.length)%idxList.length; load(); }
      if (e.key==='+' || e.key==='=') { z=Math.min(8,z+0.1); apply(); }
      if (e.key==='-' || e.key==='_') { z=Math.max(0.25,z-0.1); apply(); }
      if (e.key==='0') { reset(); }
      if (e.key==='f') { img.style.objectFit = img.style.objectFit==='contain'?'cover':'contain'; }
    };
    const onWheel = (e)=>{ if (!e.ctrlKey && !e.shiftKey) return; e.preventDefault(); const dz = (e.deltaY<0?0.1:-0.1); z=clamp(z+dz,0.25,8); apply(); };
    const onDrag = (()=>{
      let dragging=false, sx=0, sy=0; 
      return {
        down:(e)=>{ dragging=true; sx=e.clientX; sy=e.clientY; },
        move:(e)=>{ if(!dragging) return; tx+=e.clientX-sx; ty+=e.clientY-sy; sx=e.clientX; sy=e.clientY; apply(); },
        up:()=>{ dragging=false; }
      };
    })();
    const close = ()=>{ lb.classList.remove('on'); document.removeEventListener('keydown', onKey); img.removeEventListener('wheel', onWheel, {passive:false}); img.removeEventListener('mousedown', onDrag.down); window.removeEventListener('mousemove', onDrag.move); window.removeEventListener('mouseup', onDrag.up); if (prevFocus && prevFocus.focus) prevFocus.focus(); };
    lb.querySelector('.ntb-close').onclick=close;
    lb.querySelector('.ntb-next').onclick=()=>{ idx=(idx+1)%idxList.length; load(); };
    lb.querySelector('.ntb-prev').onclick=()=>{ idx=(idx-1+idxList.length)%idxList.length; load(); };
    document.addEventListener('keydown', onKey);
    lb.addEventListener('keydown', (e)=>{
      if (e.key !== 'Tab') return;
      const els = focusables(); if (!els.length) return;
      const first = els[0], last = els[els.length-1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });
    img.addEventListener('wheel', onWheel, {passive:false});
    img.addEventListener('mousedown', onDrag.down);
    window.addEventListener('mousemove', onDrag.move);
    window.addEventListener('mouseup', onDrag.up);
    load(); lb.classList.add('on'); (lb.querySelector('.ntb-close')||lb).focus();
  }

  // --------------------------- Sitemap Scanner -----------------------------
  function ensureSitemapPanel() {
    let p = document.querySelector('.ntb-sitemap');
    if (p) return p;
    p = document.createElement('aside'); p.className='ntb-sitemap';
    p.innerHTML = `
      <div class="ntb-scan-head">
        <input type="text" class="ntb-root" placeholder="Root URL" style="flex:1 1 auto" />
        <label><input type="checkbox" class="ntb-include-files" checked /> Files</label>
        <input type="text" class="ntb-exts" placeholder="ext filter (jpg,png,mp4)" style="width:200px" />
        <input type="number" class="ntb-depth" placeholder="depth" min="0" value="3" style="width:80px" />
        <input type="number" class="ntb-pages" placeholder="max pages" min="1" value="500" style="width:100px" />
        <input type="number" class="ntb-concurrency" title="Concurrency" min="1" max="16" value="4" style="width:90px" />
        <button class="ntb-start">Scan</button>
        <button class="ntb-stop" disabled>Stop</button>
      </div>
      <div class="ntb-scan-body">
        <div style="margin-bottom:8px; display:flex; gap:8px; align-items:center" class="ntb-tree-actions">
          <input type="search" class="ntb-find" placeholder="Find in tree" />
          <button class="ntb-export">Export JSON</button>
        </div>
        <div class="ntb-tree"></div>
      </div>
      <div class="ntb-scan-foot">
        <span class="ntb-progress">Idle</span>
      </div>`;
    document.body.appendChild(p);
    return p;
  }

  function toggleSitemap(state) {
    const p = ensureSitemapPanel();
    p.classList.toggle('open');
    const rootInput = p.querySelector('.ntb-root');
    if (!rootInput.value) rootInput.value = location.origin + '/';
    wireSitemap(state, p);
  }

  function wireSitemap(state, panel) {
    if (panel._wired) return; panel._wired = true;
    const startBtn = panel.querySelector('.ntb-start');
    const stopBtn = panel.querySelector('.ntb-stop');
    const tree = panel.querySelector('.ntb-tree');
    const progress = panel.querySelector('.ntb-progress');
    const find = panel.querySelector('.ntb-find');
    const exportBtn = panel.querySelector('.ntb-export');
    let abort = { stop:false };

    startBtn.addEventListener('click', async ()=>{
      abort.stop=false; stopBtn.disabled=false; startBtn.disabled=true; progress.textContent='Scanning…'; tree.innerHTML='';
      const root = new URL(panel.querySelector('.ntb-root').value).href;
      const depthMax = parseInt(panel.querySelector('.ntb-depth').value,10);
      const pagesMax = parseInt(panel.querySelector('.ntb-pages').value,10);
      const includeFiles = panel.querySelector('.ntb-include-files').checked;
      const exts = (panel.querySelector('.ntb-exts').value||'').split(',').map(s=>s.trim().toLowerCase()).filter(Boolean);
      const ccEl = panel.querySelector('.ntb-concurrency');
      const concurrency = clamp(parseInt((ccEl && ccEl.value) || SCAN_CONCURRENCY,10),1,16);
      const res = await crawl({ root, depthMax, pagesMax, includeFiles, exts, abort, progress, concurrency });
      renderTree(tree, res);
      progress.textContent = 'Done'; stopBtn.disabled=true; startBtn.disabled=false;
      panel._lastTree = res;
    });
    stopBtn.addEventListener('click', ()=>{ abort.stop=true; progress.textContent='Stopping…'; });
    find.addEventListener('input', ()=>{
      const q = find.value.toLowerCase();
      for (const el of tree.querySelectorAll('summary, li')) {
        const t = el.textContent.toLowerCase(); el.style.display = t.includes(q)?'':'none';
      }
    });
    exportBtn.addEventListener('click', ()=>{
      const data = panel._lastTree || {};
      const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download = 'sitemap.json'; a.click(); setTimeout(()=>URL.revokeObjectURL(url), 2000);
    });
  }

  async function crawl(opts) {
    const { root, depthMax, pagesMax, includeFiles, exts, abort, progress, concurrency } = opts;
    const seen = new Set();
    const rootNode = { url: root, name: root, kind:'dir', children: [] };
    let pages=0;
    async function fetchIndex(url) {
      const res = await fetch(url, { credentials:'same-origin' });
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      return parseIndex(doc, url);
    }
    async function walk(node, depth) {
      if (abort.stop) return;
      if (depth>depthMax || pages>=pagesMax) return;
      if (seen.has(node.url)) return; seen.add(node.url);
      pages++; progress.textContent = `Scanning ${pages}/${pagesMax}: ${node.url}`;
      let idx;
      try { idx = await fetchIndex(node.url); } catch { return; }
      const children = [];
      for (const d of idx.dirs) children.push({ url:d.url, name:d.name, kind:'dir', children:[] });
      if (includeFiles) {
        const pool = exts.length? idx.images.concat(idx.files).filter(x=> exts.includes((x.ext||'').toLowerCase())) : idx.images.concat(idx.files);
        for (const f of pool) children.push({ url:f.url, name:f.name, kind:'file' });
      }
      node.children = children;
      const tasks = [];
      for (const child of children) if (child.kind==='dir') tasks.push(walk(child, depth+1));
      while (tasks.length) {
        const batch = tasks.splice(0, concurrency || SCAN_CONCURRENCY);
        await Promise.allSettled(batch);
      }
    }
    await walk(rootNode, 0);
    return rootNode;
  }

  function renderTree(host, node) {
    host.innerHTML = '';
    function renderNode(n) {
      if (n.kind==='file') {
        const li = document.createElement('li');
        li.innerHTML = `<a href="${n.url}" target="_blank" rel="noopener">${n.name}</a>`;
        return li;
      }
      const details = document.createElement('details'); details.open = getPref(LSK.expandSitemap, '1')==='1';
      const sum = document.createElement('summary'); sum.innerHTML = `<a href="${n.url}">${n.name}</a>`; details.appendChild(sum);
      const ul = document.createElement('ul'); ul.className='ntb-file-list';
      for (const c of n.children||[]) ul.appendChild(renderNode(c));
      details.appendChild(ul);
      return details;
    }
    host.appendChild(renderNode(node));
  }

  // --------------------------- Init ---------------------------------------
  function init() {
    injectCSS();
    if (!looksLikeAutoIndex(document)) return;
    const meta = createMetadataManager();
    const data = parseIndex(document, location.href);
    const state = {
      size: parseInt(getPref(LSK.size, 220), 10),
      gap: parseInt(getPref(LSK.gap, 14), 10),
      label: parseInt(getPref(LSK.label, 14), 10),
      sort: String(getPref(LSK.sort, 'name')),
      view: String(getPref(LSK.view, 'grid')),
      theme: String(getPref(LSK.theme, 'dark')),
      query: '',
      data,
      meta,
    };
    applyVars(state);
    applyTheme(state.theme);

    const root = document.createElement('div'); root.className='ntb-root';
    const bar = buildToolbar(state);
    const container = document.createElement('div'); state.container = container;
    root.appendChild(bar); root.appendChild(container);

    const hide = document.createElement('style'); hide.textContent = `.ntb-hide-original{display:none!important}`;
    document.documentElement.appendChild(hide);
    const host = document.createElement('div'); host.className='ntb-host';
    while (document.body.firstChild) host.appendChild(document.body.firstChild);
    host.classList.add('ntb-hide-original');
    document.body.appendChild(host);
    document.body.appendChild(root);

    render(state);

    document.addEventListener('keydown', (e)=>{
      if (e.target && (e.target.tagName==='INPUT' || e.target.tagName==='TEXTAREA')) return;
      if (e.key==='g') { setPref(LSK.view, 'grid'); state.view='grid'; render(state); }
      if (e.key==='l') { setPref(LSK.view, 'list'); state.view='list'; render(state); }
      if (e.key==='/') { const s=document.querySelector('.ntb-toolbar input[type="search"]'); if(s){ e.preventDefault(); s.focus(); } }
      if (e.key==='[') { state.size=Math.max(120, state.size-10); setPref(LSK.size,state.size); applyVars(state); }
      if (e.key===']') { state.size=Math.min(420, state.size+10); setPref(LSK.size,state.size); applyVars(state); }
    });
  }

  init();

})();
