(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  }
  root.Kondate = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const MEAL_SLOTS = ["朝食", "お弁当", "昼食", "夕ご飯", "間食"];
  const MEAL_ORDER = { 朝食: 0, お弁当: 1, 昼食: 2, 夕ご飯: 3, 夕食: 3, 間食: 4 };
  const ALIASES = {
    たまご: "卵",
    玉子: "卵",
    ご飯: "白米",
    ごはん: "白米",
    ヨーグルト: "プレーンヨーグルト",
    りんご: "すりおろしりんご",
    リンゴ: "すりおろしりんご",
    バナナ: "熟したバナナ",
    ささみ: "鶏ささみ",
    むね肉: "鶏むね肉",
    鶏むね: "鶏むね肉",
    納豆: "ひきわり納豆",
    パン: "食パン",
  };
  const STATUS_LABEL = {
    ok: "◎ 使っていい",
    limit: "△ 控えたい",
    avoid: "× 治療中は避ける",
  };

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  function fold(value) {
    return String(value || "").normalize("NFKC").trim();
  }

  function normalizeName(value) {
    return fold(value).replace(/\s+/g, "");
  }

  function splitIngredients(text) {
    return String(text || "")
      .split(/[、,，]/)
      .map(function (part) {
        return part.trim();
      })
      .filter(Boolean);
  }

  function startOfDay(date) {
    const next = new Date(date.getTime());
    next.setHours(0, 0, 0, 0);
    return next;
  }

  function addDays(date, days) {
    const next = startOfDay(date);
    next.setDate(next.getDate() + days);
    return next;
  }

  function toIso(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + d;
  }

  function parseIso(iso) {
    const parts = String(iso || "").split("-");
    if (parts.length !== 3) return null;
    const date = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (Number.isNaN(date.getTime())) return null;
    return startOfDay(date);
  }

  function formatDate(date) {
    const weeks = "日月火水木金土";
    return date.getMonth() + 1 + "月" + date.getDate() + "日（" + weeks[date.getDay()] + "）";
  }

  function mealsOn(meals, iso) {
    return (Array.isArray(meals) ? meals : [])
      .filter(function (meal) {
        return meal && meal.date === iso;
      })
      .slice()
      .sort(function (a, b) {
        const ao = Object.prototype.hasOwnProperty.call(MEAL_ORDER, a.meal) ? MEAL_ORDER[a.meal] : 9;
        const bo = Object.prototype.hasOwnProperty.call(MEAL_ORDER, b.meal) ? MEAL_ORDER[b.meal] : 9;
        return ao - bo;
      });
  }

  function filterFoods(categories, options) {
    const query = fold(options && options.query);
    const categoryId = (options && options.categoryId) || "all";
    const status = (options && options.status) || "all";
    return (Array.isArray(categories) ? categories : [])
      .map(function (category) {
        if (categoryId !== "all" && category.id !== categoryId) return null;
        const items = (category.items || []).filter(function (item) {
          if (status !== "all" && item.status !== status) return false;
          if (query && !fold(item.name).includes(query)) return false;
          return true;
        });
        if (!items.length) return null;
        return {
          id: category.id,
          name: category.name,
          tips: category.tips || [],
          items: items,
        };
      })
      .filter(Boolean);
  }

  function sanitizeList(raw) {
    if (!Array.isArray(raw)) return [];
    return raw
      .filter(function (item) {
        return item && typeof item.name === "string" && item.name.trim();
      })
      .map(function (item) {
        return {
          id: String(item.id || uid()),
          name: item.name.trim(),
          memo: String(item.memo || ""),
          done: Boolean(item.done),
          source: String(item.source || ""),
        };
      });
  }

  function addItems(list, names, source) {
    const current = sanitizeList(list);
    const existing = {};
    current.forEach(function (item) {
      existing[normalizeName(item.name)] = true;
    });
    const added = [];
    const skipped = [];
    names.forEach(function (raw) {
      const name = String(raw || "").trim();
      if (!name) return;
      const key = normalizeName(name);
      if (existing[key]) {
        skipped.push(name);
        return;
      }
      existing[key] = true;
      added.push({
        id: uid(),
        name: name,
        memo: "",
        done: false,
        source: source || "",
      });
    });
    return { list: current.concat(added), added: added, skipped: skipped };
  }

  function addManual(list, name, memo) {
    const result = addItems(list, [name], "手入力");
    if (result.added.length === 1) {
      result.added[0].memo = String(memo || "").trim();
      result.list = result.list.map(function (item) {
        if (item.id !== result.added[0].id) return item;
        return result.added[0];
      });
    }
    return result;
  }

  function toggleItem(list, id, done) {
    return sanitizeList(list).map(function (item) {
      if (item.id !== id) return item;
      return {
        id: item.id,
        name: item.name,
        memo: item.memo,
        done: done,
        source: item.source,
      };
    });
  }

  function removeItem(list, id) {
    return sanitizeList(list).filter(function (item) {
      return item.id !== id;
    });
  }

  function eachFood(categories, visit) {
    (Array.isArray(categories) ? categories : []).forEach(function (category) {
      (category.items || []).forEach(visit);
    });
  }

  function findFood(categories, name) {
    const key = normalizeName(name);
    let found = null;
    eachFood(categories, function (item) {
      if (normalizeName(item.name) === key) found = item;
    });
    return found;
  }

  function suggestFoods(categories, query) {
    const needle = fold(query);
    if (!needle) return [];
    const items = [];
    eachFood(categories, function (item) {
      if (!item || item.status === "avoid") return;
      if (fold(item.name).includes(needle)) items.push(item);
    });
    items.sort(function (a, b) {
      if (a.status !== b.status) return a.status === "ok" ? -1 : 1;
      return a.name.length - b.name.length;
    });
    return items.slice(0, 8);
  }

  function resolveIngredient(categories, query) {
    const text = fold(query);
    if (!text) return null;
    const direct = findFood(categories, text);
    if (direct) return direct;
    const alias = ALIASES[text] || ALIASES[normalizeName(text)];
    if (alias) {
      const aliased = findFood(categories, alias);
      if (aliased) return aliased;
    }
    const hits = suggestFoods(categories, text);
    if (hits.length === 1) return hits[0];
    return null;
  }

  function dayIndex(isoDate, meal, count) {
    const key = String(isoDate || "") + "|" + meal;
    let hash = 0;
    for (let i = 0; i < key.length; i++) {
      hash = (hash * 33 + key.charCodeAt(i)) >>> 0;
    }
    return hash % count;
  }

  function recommendMenus(menus, haveNames, isoDate) {
    const have = {};
    (Array.isArray(haveNames) ? haveNames : []).forEach(function (name) {
      have[normalizeName(name)] = true;
    });
    const grouped = {};
    MEAL_SLOTS.forEach(function (slot) {
      grouped[slot] = [];
    });
    (Array.isArray(menus) ? menus : []).forEach(function (menu) {
      if (!menu || !grouped[menu.meal]) return;
      const uses = Array.isArray(menu.ingredients) ? menu.ingredients : splitIngredients(menu.ingredients);
      const matched = [];
      const missing = [];
      uses.forEach(function (name) {
        if (have[normalizeName(name)]) matched.push(name);
        else missing.push(name);
      });
      if (!matched.length) return;
      grouped[menu.meal].push({
        id: menu.id,
        meal: menu.meal,
        menu: menu.menu,
        ingredients: uses,
        tip: menu.tip || "",
        matched: matched,
        missing: missing,
        score: matched.length * 10 - missing.length,
      });
    });
    return MEAL_SLOTS.map(function (slot) {
      const items = grouped[slot].sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return a.menu < b.menu ? -1 : 1;
      });
      if (!items.length) return { meal: slot, items: [] };
      const best = items[0].score;
      const tied = items.filter(function (item) { return item.score === best; });
      const picked = tied[dayIndex(isoDate, slot, tied.length)];
      return { meal: slot, items: [picked] };
    });
  }

  function mergeMeals(fileMeals, picks) {
    const override = {};
    (Array.isArray(picks) ? picks : []).forEach(function (meal) {
      if (meal && meal.date && meal.meal) override[meal.date + "|" + meal.meal] = true;
    });
    return (Array.isArray(fileMeals) ? fileMeals : []).filter(function (meal) {
      return meal && !override[meal.date + "|" + meal.meal];
    }).concat(Array.isArray(picks) ? picks : []);
  }

  function filterByMemo(list, query) {
    const needle = fold(query);
    return sanitizeList(list).filter(function (item) {
      if (!needle) return true;
      return fold(item.memo).includes(needle);
    });
  }

  return {
    MEAL_SLOTS: MEAL_SLOTS,
    MEAL_ORDER: MEAL_ORDER,
    ALIASES: ALIASES,
    STATUS_LABEL: STATUS_LABEL,
    uid: uid,
    fold: fold,
    normalizeName: normalizeName,
    splitIngredients: splitIngredients,
    startOfDay: startOfDay,
    addDays: addDays,
    toIso: toIso,
    parseIso: parseIso,
    formatDate: formatDate,
    mealsOn: mealsOn,
    filterFoods: filterFoods,
    sanitizeList: sanitizeList,
    addItems: addItems,
    addManual: addManual,
    toggleItem: toggleItem,
    removeItem: removeItem,
    filterByMemo: filterByMemo,
    findFood: findFood,
    suggestFoods: suggestFoods,
    resolveIngredient: resolveIngredient,
    recommendMenus: recommendMenus,
    mergeMeals: mergeMeals,
  };
});
