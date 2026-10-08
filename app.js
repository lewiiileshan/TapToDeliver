
const App = (() => {
  const KEY = {
    users: "wd_users",
    orders: "wd_orders",
    session: "wd_session",
    cart: "wd_cart"
  };

  const PRODUCTS = [
    { id: "refill20", name: "20L refill",       price: 100,  image: "images/refill20.png" },
    { id: "bottle20", name: "20L bottle (new)", price: 350,  image: "images/bottle20.png" },
    { id: "refill10", name: "10L refill",       price: 60,   image: "images/refill10.png" },
    { id: "bulk1000", name: "1,000L bulk tank", price: 1500, image: "images/bulk1000.png" }
  ];

  const TIME_SLOTS = [
    "Morning (8am - 12pm)",
    "Afternoon (12pm - 4pm)",
    "Evening (4pm - 7pm)"
  ];

  const NEXT_PAGES = ["order.html", "orders.html", "index.html"];


  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function esc(value) {
    return String(value).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[c]));
  }

  function money(n) {
    return "KES " + Number(n).toLocaleString("en-KE");
  }

  function cleanPhone(phone) {
    return String(phone).replace(/[\s-]/g, "");
  }

  function validPhone(phone) {
    return /^(07|01)\d{8}$/.test(phone) || /^\+254(7|1)\d{8}$/.test(phone);
  }

  function findProduct(id) {
    return PRODUCTS.find((p) => p.id === id);
  }

  function todayString() {
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function prettyDate(iso) {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-GB", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric"
    });
  }

  function currentPageName() {
    return window.location.pathname.split("/").pop() || "index.html";
  }


  function getLocation(onDone) {
    if (!navigator.geolocation) {
      onDone({ ok: false, error: "Your browser does not support location." });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        onDone({
          ok: true,
          coords: {
            lat: Number(pos.coords.latitude.toFixed(6)),
            lng: Number(pos.coords.longitude.toFixed(6))
          }
        });
      },
      function () {
        onDone({
          ok: false,
          error: "Could not get your location. You can still type your address."
        });
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }


  function getCart() {
    return load(KEY.cart, []).filter(function (i) {
      return findProduct(i.productId) && i.qty > 0;
    });
  }

  function setCart(items) {
    save(KEY.cart, items.filter(function (i) { return i.qty > 0; }));
  }

  function clearCart() {
    localStorage.removeItem(KEY.cart);
  }

  function cartTotal() {
    return getCart().reduce(function (sum, i) {
      return sum + findProduct(i.productId).price * i.qty;
    }, 0);
  }


  function register({ name, phone, address, area, coords, password }) {
    const users = load(KEY.users, []);
    phone = cleanPhone(phone);

    if (!validPhone(phone)) {
      return { ok: false, error: "Enter a valid Kenyan phone number, e.g. 0712345678." };
    }
    if (users.some((u) => u.phone === phone)) {
      return { ok: false, error: "That phone number is already registered. Try logging in." };
    }

    const user = {
      id: "U" + Date.now(),
      name: name.trim(),
      phone: phone,
      address: address.trim(),
      area: (area || "").trim(),
      coords: coords || null,
      password: password,
      role: "customer"
    };
    users.push(user);
    save(KEY.users, users);
    save(KEY.session, user.id);
    return { ok: true, user: user };
  }

  function login(phone, password) {
    const users = load(KEY.users, []);
    phone = cleanPhone(phone);
    const user = users.find((u) => u.phone === phone && u.password === password);
    if (!user) {
      return { ok: false, error: "Phone number or password is incorrect." };
    }
    save(KEY.session, user.id);
    return { ok: true, user: user };
  }

  function currentUser() {
    const id = load(KEY.session, null);
    if (!id) return null;
    return load(KEY.users, []).find((u) => u.id === id) || null;
  }

  function logout() {
    localStorage.removeItem(KEY.session);
    window.location.href = "index.html";
  }


  function authUrl(page, next) {
    return page + (next ? "?next=" + encodeURIComponent(next) : "");
  }

  function afterAuthUrl() {
    const next = new URLSearchParams(window.location.search).get("next");
    if (NEXT_PAGES.indexOf(next) !== -1) return next;
    return getCart().length ? "order.html" : "index.html";
  }

  function currentNext() {
    const next = new URLSearchParams(window.location.search).get("next");
    return NEXT_PAGES.indexOf(next) !== -1 ? next : null;
  }

  function requireLogin() {
    const user = currentUser();
    if (!user) {
      window.location.href = authUrl("login.html", currentPageName());
      return null;
    }
    return user;
  }


  function placeOrder({ items, address, area, coords, date, slot, notes }) {
    const user = currentUser();
    if (!user) return { ok: false, error: "Please log in first." };

    const lines = items
      .filter((i) => i.qty > 0)
      .map((i) => {
        const product = findProduct(i.productId);
        return {
          productId: product.id,
          name: product.name,
          unitPrice: product.price,
          qty: i.qty
        };
      });

    if (lines.length === 0) {
      return { ok: false, error: "Add at least one item to your order." };
    }

    const orders = load(KEY.orders, []);
    const total = lines.reduce((sum, l) => sum + l.unitPrice * l.qty, 0);

    const order = {
      id: "WD-" + (1001 + orders.length),
      userId: user.id,
      items: lines,
      total: total,
      address: address.trim(),
      area: (area || "").trim(),
      coords: coords || null,
      date: date,
      slot: slot,
      notes: notes.trim(),
      status: "Pending",
      createdAt: new Date().toISOString()
    };
    orders.push(order);
    save(KEY.orders, orders);
    return { ok: true, order: order };
  }

  function myOrders() {
    const user = currentUser();
    if (!user) return [];
    return load(KEY.orders, [])
      .filter((o) => o.userId === user.id)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  function renderNav(active) {
    const el = document.getElementById("nav");
    if (!el) return;
    const user = currentUser();

    // Load the two fonts once, from any page that shows the header.
    if (!document.getElementById("wd-fonts")) {
      const f = document.createElement("link");
      f.id = "wd-fonts";
      f.rel = "stylesheet";
      f.href = "https://fonts.googleapis.com/css2?family=Anton&family=Oswald:wght@500;600&display=swap";
      document.head.appendChild(f);
    }

    function link(label, href, key) {
      return '<a class="nav-link ' + (active === key ? "active" : "") + '" href="' + href + '">' + label + '</a>';
    }

    let html =
      '<div class="inner">' +
        '<a class="brand" href="index.html">' +
          '<img src="images/logo.png" alt="" onerror="this.remove()">AUABLISS' +
        '</a>' +
        '<nav class="nav-links">' +
         link("Home", "index.html", "home") +
         link("Products", "products.html", "products") +
          (user ? link("My orders", "orders.html", "orders") : "") +
        '</nav>' +
        '<div class="nav-actions">';

    if (user) {
      html +=
        '<span class="nav-user">' + esc(user.name) + '</span>' +
        '<button class="btn ghost small" id="logoutBtn" type="button">Sign Out</button>';
    } else {
      html +=
        '<a class="btn small" href="register.html">Sign Up</a>' +
        '<a class="btn ghost small" href="login.html">Sign In</a>';
    }
    html += '</div></div>';

    el.className = "site-header";
    el.innerHTML = html;

    const btn = document.getElementById("logoutBtn");
    if (btn) btn.addEventListener("click", logout);
  }

  return {
    PRODUCTS, TIME_SLOTS,
    esc, money, prettyDate, todayString, findProduct,
    getLocation,
    getCart, setCart, clearCart, cartTotal,
    register, login, currentUser, logout,
    authUrl, afterAuthUrl, currentNext, requireLogin,
    placeOrder, myOrders,
    renderNav
  };
})();