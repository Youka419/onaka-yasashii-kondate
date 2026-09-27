(function () {
  const K = window.Kondate;
  const panel = document.getElementById("panel");
  const badge = document.getElementById("shop-badge");
  const toastEl = document.getElementById("toast");

  const state = {
    tab: "meals",
    focus: K.startOfDay(new Date()),
    categories: [],
    meals: [],
    shopping: [],
    scriptUrl: "",
    offlineCopy: false,
    foodQuery: "",
    foodCategory: "all",
    foodStatus: "all",
    openCategories: {},
    memoFilter: "",
    doneOpen: false,
    touchX: 0,
    touchY: 0,
    swipeOk: false,
    pantry: [],
    pantryQuery: "",
    menus: [],
    picks: [],
  };

  let toastTimer = 0;

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("show");
    }, 2800);
  }

  function storageKey() {
    return "yasashii-kondate-shopping-v1";
  }

  function readShopping() {
    try {
      return K.sanitizeList(JSON.parse(localStorage.getItem(storageKey()) || "[]"));
    } catch (err) {
      return [];
    }
  }

  function writeShopping(list) {
    state.shopping = K.sanitizeList(list);
    localStorage.setItem(storageKey(), JSON.stringify(state.shopping));
    updateBadge();
  }

  async function loadJson(path, cacheKey) {
    try {
      const response = await fetch(path, { cache: "no-cache" });
      if (!response.ok) throw new Error(String(response.status));
      const data = await response.json();
      localStorage.setItem(cacheKey, JSON.stringify(data));
      return data;
    } catch (err) {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) throw err;
      state.offlineCopy = true;
      return JSON.parse(cached);
    }
  }

  async function pullRemote() {
    if (!state.scriptUrl) return;
    const response = await fetch(state.scriptUrl + "?action=list", { cache: "no-store" });
    if (!response.ok) throw new Error(String(response.status));
    const data = await response.json();
    writeShopping(Array.isArray(data) ? data : data.items);
    state.offlineCopy = false;
  }

  async function pushRemote() {
    if (!state.scriptUrl) return;
    const response = await fetch(state.scriptUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ items: state.shopping }),
    });
    if (!response.ok) throw new Error(String(response.status));
    state.offlineCopy = false;
  }

  function updateBadge() {
    const count = state.shopping.filter(function (item) {
      return !item.done;
    }).length;
    badge.hidden = count === 0;
    badge.textContent = String(count);
  }

  function setTab(tab) {
    state.tab = tab;
    const hash = tab === "meals" ? "#meals" : tab === "foods" ? "#foods" : "#shopping";
    if (location.hash !== hash) history.replaceState(null, "", hash);
    document.querySelectorAll(".tab").forEach(function (button) {
      if (button.dataset.tab === tab) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    render();
  }

  function shiftDay(days) {
    state.focus = K.addDays(state.focus, days);
    render();
  }

  function readJsonList(key) {
    try {
      const raw = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch (err) {
      return [];
    }
  }

  function allMeals() {
    return K.mergeMeals(state.meals, state.picks);
  }

  function writePicks() {
    localStorage.setItem("yasashii-kondate-picks-v1", JSON.stringify(state.picks));
  }

  function writePantry() {
    localStorage.setItem("yasashii-kondate-pantry-v1", JSON.stringify(state.pantry));
  }

  function mealSource(date, meal) {
    return "献立（" + K.formatDate(date) + " " + meal + "）";
  }

  function toastAdd(added, skipped) {
    if (!added.length && skipped.length) {
      toast("すでにリストにあります");
      return;
    }
    if (added.length && !skipped.length) {
      toast(added.length === 1 ? added[0].name + "をリストに入れました" : added.length + "件をリストに入れました");
      return;
    }
    toast(added.length + "件を入れました。" + skipped.length + "件はすでにありました");
  }

  function renderMealCard(meal) {
    const names = K.splitIngredients(meal.ingredients);
    const chips = names.map(function (name) {
      return "<li>" + esc(name) + "</li>";
    }).join("");
    const tip = meal.tip ? '<p class="tip">' + esc(meal.tip) + "</p>" : "";
    const button = names.length
      ? '<button type="button" class="primary" data-action="add-meal" data-date="' + esc(meal.date) + '" data-meal="' + esc(meal.meal) + '" data-menu="' + esc(meal.menu) + '">材料を買い物リストへ</button>'
      : "";
    return (
      '<article class="card">' +
      '<span class="pill pill-meal">' + esc(meal.meal || "食事") + "</span>" +
      '<h3 class="menu-name">' + esc(meal.menu || "メニュー名なし") + "</h3>" +
      (names.length ? '<p class="meta">主な食材</p><ul class="chips">' + chips + "</ul>" : "") +
      tip +
      button +
      "</article>"
    );
  }

  function renderDay(date, role) {
    const iso = K.toIso(date);
    const today = K.toIso(K.startOfDay(new Date()));
    const meals = K.mealsOn(allMeals(), iso);
    const body = meals.length
      ? meals.map(function (meal) {
          return renderMealCard(meal);
        }).join("")
      : '<p class="empty">この日の献立はまだありません</p>';
    const badgeHtml = iso === today ? '<span class="pill pill-today">今日</span>' : "";
    return (
      '<section class="day ' + (role === "focus" ? "is-focus" : "is-side") + '">' +
      '<h2 class="day-head"><time datetime="' + iso + '">' + esc(K.formatDate(date)) + "</time>" + badgeHtml + "</h2>" +
      body +
      "</section>"
    );
  }

  function pantrySuggestHtml() {
    const existing = {};
    state.pantry.forEach(function (name) {
      existing[K.normalizeName(name)] = true;
    });
    return K.suggestFoods(state.categories, state.pantryQuery).filter(function (item) {
      return !existing[K.normalizeName(item.name)];
    }).map(function (item) {
      const mark = item.status === "limit" ? "△ " : "";
      return '<button type="button" class="chip" data-action="add-pantry" data-name="' + esc(item.name) + '">' + mark + esc(item.name) + "</button>";
    }).join("");
  }

  function pantryChipsHtml() {
    if (!state.pantry.length) return "";
    return state.pantry.map(function (name) {
      const food = K.findFood(state.categories, name);
      const limit = food && food.status === "limit";
      return '<li class="pantry-chip' + (limit ? " is-limit" : "") + '"><span>' + esc(name) + "</span>" +
        '<button type="button" data-action="remove-pantry" data-name="' + esc(name) + '" aria-label="' + esc(name) + 'を外す">×</button></li>';
    }).join("");
  }

  function recoCard(item) {
    const chips = item.ingredients.map(function (name) {
      const have = item.matched.indexOf(name) !== -1;
      return '<li class="' + (have ? "is-have" : "is-need") + '">' + esc(name) + "</li>";
    }).join("");
    const shop = item.missing.length
      ? '<button type="button" class="ghost" data-action="shop-menu" data-id="' + esc(item.id) + '">足りない食材を買い物へ</button>'
      : "";
    return (
      '<article class="card reco-card">' +
      '<h4 class="menu-name">' + esc(item.menu) + "</h4>" +
      '<ul class="chips">' + chips + "</ul>" +
      (item.tip ? '<p class="tip">' + esc(item.tip) + "</p>" : "") +
      '<button type="button" class="primary" data-action="use-menu" data-id="' + esc(item.id) + '">この日の献立にする</button>' +
      shop +
      "</article>"
    );
  }

  function recoHtml() {
    if (!state.pantry.length) {
      return '<p class="meta">食材を入れると、朝食・お弁当・昼食・夕ご飯・間食のおすすめが出ます。</p>';
    }
    const groups = K.recommendMenus(state.menus, state.pantry);
    const any = groups.some(function (group) { return group.items.length; });
    if (!any) {
      return '<p class="empty">入れた食材では、負担の少ないメニューが見つかりませんでした。キャベツ、大根、豆腐、卵などを入れてみてください。</p>';
    }
    const limited = state.pantry.some(function (name) {
      const food = K.findFood(state.categories, name);
      return food && food.status === "limit";
    });
    const note = limited
      ? '<p class="meta">△の食材はおすすめの中心にしていません。</p>'
      : "";
    return note + '<p class="meta">緑は手元にある食材、うすい色は足りない食材です。</p>' + groups.map(function (group) {
      const body = group.items.length
        ? '<div class="reco-items">' + group.items.map(recoCard).join("") + "</div>"
        : '<p class="empty">この食材を使った' + esc(group.meal) + "はありません</p>";
      return '<section class="reco-slot"><h3>' + esc(group.meal) + "</h3>" + body + "</section>";
    }).join("");
  }

  function renderMeals() {
    const today = K.startOfDay(new Date());
    const focusIso = K.toIso(state.focus);
    const todayIso = K.toIso(today);
    const back = focusIso === todayIso
      ? ""
      : '<button type="button" class="today-link" data-action="today">今日へ戻る</button>';
    panel.innerHTML =
      '<section class="reco">' +
      '<h2 class="reco-title">食材からおすすめ</h2>' +
      '<form id="pantry-form" class="pantry-row">' +
      '<label class="search"><span>使いたい食材</span>' +
      '<input id="pantry-query" type="search" enterkeyhint="done" autocomplete="off" placeholder="例: 大根、卵" value="' + esc(state.pantryQuery) + '"></label>' +
      '<button class="primary" type="submit">入れる</button>' +
      "</form>" +
      '<div id="pantry-suggest" class="suggest">' + pantrySuggestHtml() + "</div>" +
      '<ul id="pantry-chips" class="pantry-chips">' + pantryChipsHtml() + "</ul>" +
      '<div id="reco-results">' + recoHtml() + "</div>" +
      "</section>" +
      '<div class="day-nav">' +
      '<button type="button" data-action="prev-day">前日</button>' +
      '<p class="focus-date">' + esc(K.formatDate(state.focus)) + (focusIso === todayIso ? " 今日" : "") + "</p>" +
      '<button type="button" data-action="next-day">翌日</button>' +
      "</div>" +
      back +
      '<div class="days">' +
      renderDay(K.addDays(state.focus, -1), "side") +
      renderDay(state.focus, "focus") +
      renderDay(K.addDays(state.focus, 1), "side") +
      "</div>";
  }

  function renderFoodItem(item) {
    const label = K.STATUS_LABEL[item.status] || "";
    const tagClass = item.status === "avoid" ? "tag-avoid" : item.status === "limit" ? "tag-limit" : "tag-ok";
    if (item.status === "avoid") {
      return (
        '<article class="item is-avoid">' +
        '<div class="item-head"><span class="tag ' + tagClass + '">' + esc(label) + "</span>" +
        '<span class="item-name">' + esc(item.name) + "</span></div>" +
        (item.point ? "<p>" + esc(item.point) + "</p>" : "") +
        "</article>"
      );
    }
    return (
      '<article class="item">' +
      '<div class="item-head"><span class="tag ' + tagClass + '">' + esc(label) + "</span>" +
      '<span class="item-name">' + esc(item.name) + "</span></div>" +
      (item.point ? '<p><span class="label">ポイント </span>' + esc(item.point) + "</p>" : "") +
      (item.tip ? '<p><span class="label">工夫 </span>' + esc(item.tip) + "</p>" : "") +
      (item.alt ? '<p><span class="label">代わりの目安 </span>' + esc(item.alt) + "</p>" : "") +
      "</article>"
    );
  }

  function foodResultsHtml() {
    const visible = K.filterFoods(state.categories, {
      query: state.foodQuery,
      categoryId: state.foodCategory,
      status: state.foodStatus,
    });
    const searching = K.fold(state.foodQuery).length > 0;
    if (!visible.length) return '<p class="empty">該当する食材はありません</p>';
    return visible.map(function (category) {
      const open = searching || state.openCategories[category.id];
      const tips = category.tips.map(function (tip) {
        return "<li>" + esc(tip) + "</li>";
      }).join("");
      const items = category.items.map(renderFoodItem).join("");
      return (
        '<section class="cat' + (open ? " is-open" : "") + '">' +
        '<button type="button" class="cat-toggle" data-action="toggle-cat" data-id="' + esc(category.id) + '" aria-expanded="' + (open ? "true" : "false") + '">' +
        "<span><span class=\"cat-name\">" + esc(category.name) + "</span>" +
        '<span class="cat-count">' + category.items.length + "品</span></span>" +
        '<span class="chevron" aria-hidden="true"></span></button>' +
        (open ? '<div class="cat-body"><ul class="tips">' + tips + '</ul><div class="items">' + items + "</div></div>" : "") +
        "</section>"
      );
    }).join("");
  }

  function renderFoods() {
    const categoryChips = [{ id: "all", name: "すべて" }].concat(state.categories).map(function (category) {
      const pressed = state.foodCategory === category.id;
      return '<button type="button" class="chip" data-action="food-cat" data-id="' + esc(category.id) + '" aria-pressed="' + pressed + '">' + esc(category.name) + "</button>";
    }).join("");
    const statuses = [
      ["all", "すべて"],
      ["ok", "◎ 使っていい"],
      ["limit", "△ 控えたい"],
      ["avoid", "× 治療中は避ける"],
    ].map(function (pair) {
      const pressed = state.foodStatus === pair[0];
      return '<button type="button" class="chip" data-action="food-status" data-id="' + pair[0] + '" aria-pressed="' + pressed + '">' + pair[1] + "</button>";
    }).join("");

    const query = esc(state.foodQuery);
    panel.innerHTML =
      '<div class="banner"><p>料理のメモです。食事の制限は医師・薬剤師の指示が優先です。</p>' +
      '<p class="sub">△は禁止ではありません。調理の工夫と一緒に見てください。</p></div>' +
      '<label class="search"><span>食材名で探す</span>' +
      '<input id="food-query" type="search" enterkeyhint="search" value="' + query + '" placeholder="例: 大根、から揚げ"></label>' +
      '<p class="filter-label">分類</p>' +
      '<div class="filters" role="group" aria-label="分類">' + categoryChips + "</div>" +
      '<p class="filter-label">区分</p>' +
      '<div class="filters" role="group" aria-label="区分">' + statuses + "</div>" +
      '<div id="food-results">' + foodResultsHtml() + "</div>";
  }

  function shopRow(item) {
    return (
      '<li class="shop-row">' +
      '<label class="shop-check">' +
      '<input type="checkbox" data-id="' + esc(item.id) + '"' + (item.done ? " checked" : "") + ">" +
      '<span class="box" aria-hidden="true"></span>' +
      "<span><span class=\"shop-name\">" + esc(item.name) + "</span>" +
      (item.memo ? '<span class="shop-memo">' + esc(item.memo) + "</span>" : "") +
      (item.source ? '<span class="shop-source">' + esc(item.source) + "</span>" : "") +
      "</span></label>" +
      '<button type="button" class="shop-delete" data-action="delete" data-id="' + esc(item.id) + '">削除</button>' +
      "</li>"
    );
  }

  function shopResultsHtml() {
    const filtered = K.filterByMemo(state.shopping, state.memoFilter);
    const open = filtered.filter(function (item) { return !item.done; });
    const done = filtered.filter(function (item) { return item.done; });
    const openHtml = open.length
      ? '<ul class="shop-list">' + open.map(shopRow).join("") + "</ul>"
      : '<p class="empty">' + (K.fold(state.memoFilter) ? "この担当の未購入はありません" : "買うものはまだありません") + "</p>";
    const doneHtml = done.length
      ? '<button type="button" class="done-toggle" data-action="toggle-done" aria-expanded="' + (state.doneOpen ? "true" : "false") + '">買ったもの ' + done.length + "件</button>" +
        (state.doneOpen ? '<ul class="shop-list done-list">' + done.map(shopRow).join("") + "</ul>" : "")
      : "";
    return openHtml + doneHtml;
  }

  function renderShopping() {
    const share = state.scriptUrl
      ? (state.offlineCopy
        ? "通信できないため、この端末に残っているリストを表示しています。"
        : "家族で同じリストを共有しています。")
      : "この端末に保存しています。家族で共有するには、あとからスプレッドシートにつなぎます。";

    panel.innerHTML =
      '<p class="shop-note">' + esc(share) + "</p>" +
      '<form id="shop-form">' +
      '<label class="field"><span>品名</span><input name="name" type="text" required placeholder="例: キャベツ" autocomplete="off"></label>' +
      '<label class="field"><span>担当・メモ</span><input name="memo" type="text" placeholder="例: パパが買う、2個" autocomplete="off"></label>' +
      '<button class="primary" type="submit">リストに追加</button>' +
      "</form>" +
      '<label class="field filter-field"><span>担当で絞る</span><input id="memo-filter" type="search" value="' + esc(state.memoFilter) + '" placeholder="例: パパ"></label>' +
      '<div id="shop-results">' + shopResultsHtml() + "</div>";
  }

  function render() {
    if (state.tab === "foods") renderFoods();
    else if (state.tab === "shopping") renderShopping();
    else renderMeals();
  }

  async function commitShopping(list) {
    writeShopping(list);
    if (!state.scriptUrl) return;
    try {
      await pushRemote();
    } catch (err) {
      state.offlineCopy = true;
      toast("通信できないため、この端末に保存しました");
    }
  }

  function refreshPantry() {
    writePantry();
    const suggest = document.getElementById("pantry-suggest");
    const chips = document.getElementById("pantry-chips");
    const reco = document.getElementById("reco-results");
    const input = document.getElementById("pantry-query");
    if (!suggest || !chips || !reco) {
      renderMeals();
      return;
    }
    if (input) input.value = state.pantryQuery;
    suggest.innerHTML = pantrySuggestHtml();
    chips.innerHTML = pantryChipsHtml();
    reco.innerHTML = recoHtml();
  }

  function addPantryText(text) {
    const parts = K.splitIngredients(text);
    if (!parts.length) {
      toast("食材名を入れてください");
      return;
    }
    let added = 0;
    let blocked = false;
    let missed = false;
    parts.forEach(function (part) {
      const direct = K.findFood(state.categories, part);
      if (direct && direct.status === "avoid") {
        blocked = true;
        return;
      }
      const item = K.resolveIngredient(state.categories, part);
      if (!item || item.status === "avoid") {
        missed = true;
        return;
      }
      if (state.pantry.some(function (name) { return K.normalizeName(name) === K.normalizeName(item.name); })) return;
      state.pantry.push(item.name);
      added += 1;
    });
    if (!added) {
      toast(blocked ? "治療中は避ける食材なので、おすすめには使いません" : "ガイドにある食材名で入れてください");
      return;
    }
    state.pantryQuery = "";
    refreshPantry();
    if (missed) toast("ガイドにある食材だけ入れました");
  }

  function findMenu(id) {
    return state.menus.find(function (menu) { return menu.id === id; });
  }

  panel.addEventListener("click", function (event) {
    const target = event.target.closest("[data-action]");
    if (!target) return;
    const action = target.dataset.action;
    if (action === "prev-day") shiftDay(-1);
    if (action === "next-day") shiftDay(1);
    if (action === "today") {
      state.focus = K.startOfDay(new Date());
      render();
    }
    if (action === "toggle-cat") {
      if (K.fold(state.foodQuery)) return;
      const id = target.dataset.id;
      state.openCategories[id] = !state.openCategories[id];
      const box = document.getElementById("food-results");
      if (box) box.innerHTML = foodResultsHtml();
      else renderFoods();
    }
    if (action === "food-cat") {
      state.foodCategory = target.dataset.id;
      if (state.foodCategory !== "all") state.openCategories[state.foodCategory] = true;
      renderFoods();
    }
    if (action === "food-status") {
      state.foodStatus = target.dataset.id;
      if (state.foodStatus !== "all") {
        state.categories.forEach(function (category) {
          state.openCategories[category.id] = true;
        });
      }
      renderFoods();
    }
    if (action === "add-pantry") {
      addPantryText(target.dataset.name || "");
    }
    if (action === "remove-pantry") {
      const key = K.normalizeName(target.dataset.name);
      state.pantry = state.pantry.filter(function (name) {
        return K.normalizeName(name) !== key;
      });
      refreshPantry();
    }
    if (action === "use-menu") {
      const menu = findMenu(target.dataset.id);
      if (!menu) return;
      const date = K.toIso(state.focus);
      state.picks = state.picks.filter(function (meal) {
        return !(meal.date === date && meal.meal === menu.meal);
      });
      state.picks.push({
        date: date,
        meal: menu.meal,
        menu: menu.menu,
        ingredients: menu.ingredients.join("、"),
        tip: menu.tip,
      });
      writePicks();
      toast(K.formatDate(state.focus) + "の" + menu.meal + "に入れました");
      render();
    }
    if (action === "shop-menu") {
      const menu = findMenu(target.dataset.id);
      if (!menu) return;
      const names = menu.ingredients.filter(function (name) {
        return !state.pantry.some(function (have) {
          return K.normalizeName(have) === K.normalizeName(name);
        });
      });
      if (!names.length) {
        toast("手元の食材で足ります");
        return;
      }
      const result = K.addItems(state.shopping, names, "おすすめ（" + menu.meal + " " + menu.menu + "）");
      commitShopping(result.list);
      toastAdd(result.added, result.skipped);
    }
    if (action === "add-meal") {
      const found = allMeals().find(function (meal) {
        return meal.date === target.dataset.date && meal.meal === target.dataset.meal && meal.menu === target.dataset.menu;
      });
      if (!found) return;
      const names = K.splitIngredients(found.ingredients);
      const date = K.parseIso(found.date) || state.focus;
      const result = K.addItems(state.shopping, names, mealSource(date, found.meal));
      commitShopping(result.list);
      toastAdd(result.added, result.skipped);
      render();
    }
    if (action === "toggle-done") {
      state.doneOpen = !state.doneOpen;
      const box = document.getElementById("shop-results");
      if (box) box.innerHTML = shopResultsHtml();
      else renderShopping();
    }
    if (action === "delete") {
      commitShopping(K.removeItem(state.shopping, target.dataset.id));
      const box = document.getElementById("shop-results");
      if (box) box.innerHTML = shopResultsHtml();
      else renderShopping();
    }
  });

  panel.addEventListener("input", function (event) {
    if (event.target.id === "food-query") {
      state.foodQuery = event.target.value;
      const box = document.getElementById("food-results");
      if (box) box.innerHTML = foodResultsHtml();
      else renderFoods();
    }
    if (event.target.id === "pantry-query") {
      state.pantryQuery = event.target.value;
      const box = document.getElementById("pantry-suggest");
      if (box) box.innerHTML = pantrySuggestHtml();
    }
    if (event.target.id === "memo-filter") {
      state.memoFilter = event.target.value;
      const box = document.getElementById("shop-results");
      if (box) box.innerHTML = shopResultsHtml();
      else renderShopping();
    }
  });

  panel.addEventListener("change", function (event) {
    if (!event.target.matches(".shop-check input")) return;
    commitShopping(K.toggleItem(state.shopping, event.target.dataset.id, event.target.checked));
    const box = document.getElementById("shop-results");
    if (box) box.innerHTML = shopResultsHtml();
    else renderShopping();
  });

  panel.addEventListener("submit", function (event) {
    if (event.target.id === "pantry-form") {
      event.preventDefault();
      addPantryText(state.pantryQuery);
      return;
    }
    if (event.target.id !== "shop-form") return;
    event.preventDefault();
    const data = new FormData(event.target);
    const name = String(data.get("name") || "").trim();
    if (!name) {
      toast("品名を入れてください");
      return;
    }
    const result = K.addManual(state.shopping, name, data.get("memo"));
    if (!result.added.length) {
      toast("すでにリストにあります");
      return;
    }
    commitShopping(result.list);
    toastAdd(result.added, result.skipped);
    renderShopping();
  });

  panel.addEventListener("touchstart", function (event) {
    if (state.tab !== "meals" || !event.touches[0]) return;
    state.swipeOk = !!event.target.closest(".day-nav, .days");
    if (!state.swipeOk) return;
    state.touchX = event.touches[0].clientX;
    state.touchY = event.touches[0].clientY;
  }, { passive: true });

  panel.addEventListener("touchend", function (event) {
    if (state.tab !== "meals" || !state.swipeOk || !event.changedTouches[0]) return;
    const dx = event.changedTouches[0].clientX - state.touchX;
    const dy = event.changedTouches[0].clientY - state.touchY;
    if (Math.abs(dx) < 56 || Math.abs(dx) < Math.abs(dy)) return;
    shiftDay(dx < 0 ? 1 : -1);
  }, { passive: true });

  document.querySelector(".tabs").addEventListener("click", function (event) {
    const button = event.target.closest(".tab");
    if (!button) return;
    setTab(button.dataset.tab);
  });

  window.addEventListener("hashchange", function () {
    const hash = location.hash.replace("#", "");
    if (hash === "foods" || hash === "shopping" || hash === "meals") setTab(hash);
  });

  async function init() {
    state.shopping = readShopping();
    state.pantry = readJsonList("yasashii-kondate-pantry-v1").filter(function (name) {
      return typeof name === "string" && name.trim();
    });
    state.picks = readJsonList("yasashii-kondate-picks-v1").filter(function (meal) {
      return meal && meal.date && meal.meal && meal.menu;
    });
    updateBadge();
    const hash = location.hash.replace("#", "");
    if (hash === "foods" || hash === "shopping") state.tab = hash;
    try {
      const foods = await loadJson("./data/foods.json", "yasashii-kondate-foods-v1");
      const meals = await loadJson("./data/meals.json", "yasashii-kondate-meals-v1");
      const menus = await loadJson("./data/menus.json", "yasashii-kondate-menus-v1");
      const sync = await loadJson("./data/sync.json", "yasashii-kondate-sync-v1");
      state.categories = foods.categories || [];
      state.categories.forEach(function (category) {
        state.openCategories[category.id] = true;
      });
      state.meals = Array.isArray(meals) ? meals : [];
      state.menus = Array.isArray(menus) ? menus : [];
      state.scriptUrl = sync && typeof sync.scriptUrl === "string" ? sync.scriptUrl.trim() : "";
      if (state.scriptUrl) {
        try {
          await pullRemote();
        } catch (err) {
          state.offlineCopy = true;
        }
      }
    } catch (err) {
      panel.innerHTML = '<p class="empty">データを読み込めませんでした。通信できる場所でもう一度開いてください。</p>';
      return;
    }
    document.querySelectorAll(".tab").forEach(function (button) {
      if (button.dataset.tab === state.tab) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    render();
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("./sw.js").catch(function () {});
    }
  }

  init();
})();
