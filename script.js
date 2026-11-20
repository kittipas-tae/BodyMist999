/* ==========================================================================
   Body Scent — script.js (ใช้ร่วมกันทุกหน้า)
   - product.html : โหลด products.json, แสดงการ์ด, กรองตาม mood
   - order.html   : เติม item/price จาก URL ลงฟอร์ม, ส่งออเดอร์ไป Apps Script
   - admin.html   : ดึง CSV จาก Google Sheets มาแสดงเป็นตาราง
   แต่ละส่วนทำงานเฉพาะเมื่อหน้านั้นมี element ของตัวเอง
   ========================================================================== */
(function () {
  'use strict';

  var PRODUCTS_URL = 'products.json';

  var APPS_SCRIPT_URL =
    'https://script.google.com/macros/s/AKfycbycQnCpjbv4CzMLhjuqhaLHvXPEWye4Ah3FK0toweyel7CuSiNYHFDKHjShn4eYO1uV/exec';

  var ORDERS_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vSOu2z7sPZ4Xf8TR1rWgD9sFrN7YNJI4tzZCdDbt8NewFUMc_gd89zIHQ5k-_GQ-Rwpyl6qLd55n7ZM/pub?gid=0&single=true&output=csv';

  var MOODS = [
    { key: 'all', label: 'ทั้งหมด' },
    { key: 'fresh', label: 'Fresh' },
    { key: 'sweet', label: 'Sweet' },
    { key: 'confident', label: 'Confident' },
    { key: 'romance', label: 'Romance' }
  ];

  /* ---------- helpers ---------- */

  // สร้าง element โดยใช้ textContent เสมอ (กัน XSS จากข้อมูลภายนอก)
  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function formatPrice(n) {
    var num = Number(n);
    return (isNaN(num) ? String(n) : num.toLocaleString('th-TH')) + ' บาท';
  }

  /* ======================================================================
     1) product.html
     ====================================================================== */
  function initProductPage() {
    var filterBar = document.getElementById('filter-bar');
    var list = document.getElementById('product-list');
    if (!filterBar || !list) return;

    var products = [];

    function isValidMood(m) {
      return MOODS.some(function (x) { return x.key === m; });
    }

    function buildOrderUrl(p) {
      // ชื่อที่ส่งไปฟอร์ม = ชื่อสินค้า + ไซส์ (ถ้ามี)
      var item = p.size ? p.name + ' ' + p.size : p.name;
      return 'order.html?item=' + encodeURIComponent(item) +
             '&price=' + encodeURIComponent(p.price);
    }

    function buildCard(p) {
      var card = el('article', 'product-card');
      card.setAttribute('data-mood', p.mood);

      var media = el('div', 'product-card__media');
      var img = el('img');
      img.src = p.image;
      img.alt = p.name;
      img.loading = 'lazy';
      media.appendChild(img);

      var body = el('div', 'product-card__body');

      var mood = el('div', 'mood-label product-card__mood', p.mood);
      var name = el('h3', 'product-card__name', p.name);
      var meta = el('p', 'product-card__meta', p.size ? p.size : 'โรลออน');
      var price = el('p', 'product-card__price', formatPrice(p.price));

      var btn = el('a', 'btn btn--accent btn--sm', 'สั่งซื้อ');
      btn.href = buildOrderUrl(p);

      body.appendChild(mood);
      body.appendChild(name);
      body.appendChild(meta);
      body.appendChild(price);
      body.appendChild(btn);

      card.appendChild(media);
      card.appendChild(body);
      return card;
    }

    function render(mood) {
      list.textContent = '';
      var shown = products.filter(function (p) {
        return mood === 'all' || p.mood === mood;
      });

      if (!shown.length) {
        list.appendChild(el('p', 'text-center text-mute', 'ไม่พบสินค้าในหมวดนี้'));
        return;
      }
      shown.forEach(function (p) { list.appendChild(buildCard(p)); });
    }

    function setActive(mood) {
      var buttons = filterBar.querySelectorAll('.filter__btn');
      Array.prototype.forEach.call(buttons, function (b) {
        b.classList.toggle('is-active', b.getAttribute('data-mood') === mood);
      });
    }

    function applyFilter(mood, updateUrl) {
      setActive(mood);
      render(mood);
      if (updateUrl && window.history && history.replaceState) {
        var url = new URL(window.location.href);
        if (mood === 'all') url.searchParams.delete('mood');
        else url.searchParams.set('mood', mood);
        history.replaceState(null, '', url);
      }
    }

    // สร้างปุ่มกรอง
    filterBar.classList.add('filter');
    filterBar.textContent = '';
    MOODS.forEach(function (m) {
      var b = el('button', 'filter__btn', m.label);
      b.type = 'button';
      b.setAttribute('data-mood', m.key);
      b.addEventListener('click', function () { applyFilter(m.key, true); });
      filterBar.appendChild(b);
    });

    // mood เริ่มต้นจาก ?mood=xxx
    var initial = (new URLSearchParams(window.location.search).get('mood') || 'all').toLowerCase();
    if (!isValidMood(initial)) initial = 'all';

    list.appendChild(el('p', 'text-center text-mute', 'กำลังโหลดสินค้า...'));

    fetch(PRODUCTS_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        products = data;
        applyFilter(initial, false);
      })
      .catch(function (err) {
        console.error(err);
        list.textContent = '';
        list.appendChild(el('p', 'text-center text-mute', 'โหลดข้อมูลสินค้าไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'));
      });
  }

  /* ======================================================================
     2) order.html
     ====================================================================== */
  function initOrderPage() {
    var form = document.getElementById('orderForm');
    if (!form) return;

    var params = new URLSearchParams(window.location.search);
    var item = params.get('item');
    var price = params.get('price');

    // เติมฟอร์มอัตโนมัติ — ทั้งช่อง items และ total
    var itemsInput = document.getElementById('items');
    var totalInput = document.getElementById('total');
    if (itemsInput && item !== null) itemsInput.value = item;
    if (totalInput && price !== null) totalInput.value = price;

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      var payload = {
        customerName: document.getElementById('customerName').value,
        contact: document.getElementById('contact').value,
        items: document.getElementById('items').value,
        total: document.getElementById('total').value,
        note: document.getElementById('note').value
      };

      var submitBtn = form.querySelector('[type="submit"]');
      if (submitBtn) submitBtn.disabled = true; // กันกดซ้ำ

      fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        body: JSON.stringify(payload)
      })
      .then(() => { window.location.href = 'thankyou.html'; })
      .catch(error => {
        console.error(error);
        alert('เกิดข้อผิดพลาด กรุณาลองใหม่อีกครั้ง');
        if (submitBtn) submitBtn.disabled = false;
      });
    });
  }

  /* ======================================================================
     3) admin.html
     ====================================================================== */

  // parse CSV เอง: รองรับ "..." ครอบค่า, "" แทน ", เครื่องหมายคอมมา/ขึ้นบรรทัดใหม่ในค่า, CRLF
  function parseCSV(text) {
    if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // ตัด BOM

    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var c = text[i];

      if (inQuotes) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else {
          field += c;
        }
      } else if (c === '"') {
        inQuotes = true;
      } else if (c === ',') {
        row.push(field); field = '';
      } else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); field = '';
        rows.push(row); row = [];
      } else {
        field += c;
      }
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }

    // ตัดแถวว่าง
    return rows.filter(function (r) {
      return r.some(function (cell) { return cell.trim() !== ''; });
    });
  }

  function initAdminPage() {
    var tbody = document.querySelector('#ordersTable tbody');
    if (!tbody) return;

    function message(text) {
      tbody.textContent = '';
      var tr = el('tr');
      var td = el('td', 'text-center text-mute', text);
      td.colSpan = 6;
      tr.appendChild(td);
      tbody.appendChild(tr);
    }

    message('กำลังโหลดข้อมูล...');

    fetch(ORDERS_CSV_URL)
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      })
      .then(function (text) {
        var rows = parseCSV(text);

        // ถ้าแถวแรกเป็นหัวตาราง (คอลัมน์ "จำนวนเงิน" ไม่มีตัวเลข) ให้ข้าม
        if (rows.length && !/\d/.test(rows[0][4] || '')) rows.shift();

        if (!rows.length) { message('ยังไม่มีรายการสั่งซื้อ'); return; }

        // ชีตเพิ่มแถวต่อท้ายตามลำดับเวลา → กลับด้านให้ล่าสุดขึ้นก่อน
        rows.reverse();

        tbody.textContent = '';
        rows.forEach(function (r) {
          var tr = el('tr');
          // 0=วันเวลา 1=ชื่อลูกค้า 2=เบอร์โทร/Line 3=รายการสินค้า 4=จำนวนเงินรวม 5=หมายเหตุ
          for (var i = 0; i < 6; i++) {
            var val = r[i] !== undefined ? r[i] : '';
            if (i === 4 && val !== '' && !isNaN(Number(val))) val = formatPrice(val);
            tr.appendChild(el('td', null, val));
          }
          tbody.appendChild(tr);
        });
      })
      .catch(function (err) {
        console.error(err);
        message('โหลดข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
      });
  }

  /* ---------- start ---------- */
  function init() {
    initProductPage();
    initOrderPage();
    initAdminPage();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
