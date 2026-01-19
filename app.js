"use strict";

/**
 * Player Spec:
 * - choices: variable, single-select
 * - back: discard future history (stack pop)
 * - end: result node (render like normal page, no choices)
 */

let DATA = null;
let PAGES = new Map();

// State
let currentId = null;
let historyStack = []; // visited ids (for back)

// UI refs
const elPageType = document.getElementById("pageType");
const elPageId = document.getElementById("pageId");
const elTitle = document.getElementById("title");
const elText = document.getElementById("text");
const elChoices = document.getElementById("choicesArea");
const elHint = document.getElementById("hint");
const elErrorBox = document.getElementById("errorBox");
const elBreadcrumb = document.getElementById("breadcrumb");

const btnNext = document.getElementById("btnNext");
const btnBack = document.getElementById("btnBack");
const btnRestart = document.getElementById("btnRestart");

function showError(message) {
  elErrorBox.hidden = false;
  elErrorBox.textContent = message;
}

function clearError() {
  elErrorBox.hidden = true;
  elErrorBox.textContent = "";
}

function getPage(id) {
  return PAGES.get(id) || null;
}

function updateBreadcrumb() {
  // trail = 履歴 + 現在
  const trailIds = [...historyStack, currentId].filter(Boolean);

  // タイトルがあればタイトル、なければIDを表示
  const trailLabels = trailIds.map((id) => {
  const p = getPage(id);
  const title = p?.title?.trim();
  return title ? `${title} (${id})` : id;
});


  // 例: 経路: スタート > 雪景色の方向性 > 結果：静かな雪
  elBreadcrumb.textContent = trailLabels.length ? `経路: ${trailLabels.join(" > ")}` : "";
}


function setButtonsEnabled(page) {
  btnBack.disabled = historyStack.length === 0;
  btnRestart.disabled = !DATA || !DATA.startPageId;

  if (!page) {
    btnNext.style.display = "none";
    return;
  }

  if (page.type === "result") {
    btnNext.style.display = "none";   // ← ここ重要
  } else {
    btnNext.style.display = "inline-block";
  }
}


function renderPage(id) {
  clearError();

  
  const page = getPage(id);
  
  if (!page) {
    showError(`ページが見つかりません: ${id}\n(data.json の next 指定が間違っている可能性)`);
    btnNext.disabled = true;
    return;
  }

  currentId = id;
  updateBreadcrumb();

  elPageType.textContent = page.type || "question";
  elPageId.textContent = `ID: ${page.id}`;
  elTitle.textContent = page.title ?? "";
  elText.textContent = page.text ?? "";

  // Clear choices
  elChoices.innerHTML = "";
  elHint.textContent = "";

  if ((page.type || "question") === "result") {
    elHint.textContent = "結果ページです。右上の「最初に戻る」で再スタートできます。";
  } else {
    const choices = Array.isArray(page.choices) ? page.choices : [];
    if (choices.length === 0) {
      elHint.textContent = "選択肢がありません（データ設定を確認してください）。";
    } else {
      elHint.textContent = "1つ選んで「次へ」。";
    }

    const groupName = "choiceGroup";

    choices.forEach((c, idx) => {
      const idFor = `ch_${page.id}_${idx}`;
      const wrap = document.createElement("label");
      wrap.className = "choice";
      wrap.setAttribute("for", idFor);

      const input = document.createElement("input");
      input.type = "radio";
      input.name = groupName;
      input.id = idFor;
      input.value = String(idx);

      const label = document.createElement("div");
      label.textContent = c.label ?? `選択肢 ${idx + 1}`;

      wrap.appendChild(input);
      wrap.appendChild(label);

      // Clicking the card selects the radio
      wrap.addEventListener("click", () => {
        input.checked = true;
      });

      elChoices.appendChild(wrap);
    });
  }
  
  const card = document.querySelector(".card");
  card.classList.toggle("result", page.type === "result");

  setButtonsEnabled(page);
}

function getSelectedChoiceIndex() {
  const checked = elChoices.querySelector('input[type="radio"]:checked');
  if (!checked) return null;
  const n = Number(checked.value);
  return Number.isFinite(n) ? n : null;
}

function goNext() {
  clearError();

  const page = getPage(currentId);
  if (!page) return;

  if ((page.type || "question") === "result") {
    return;
  }

  const choices = Array.isArray(page.choices) ? page.choices : [];
  if (choices.length === 0) {
    showError("このページには選択肢がありません。data.json を確認してください。");
    return;
  }

  const idx = getSelectedChoiceIndex();
  if (idx === null) {
    showError("選択してください。");
    return;
  }

  const choice = choices[idx];
  const nextId = choice?.next;

  if (!nextId || typeof nextId !== "string") {
    showError("遷移先(next)が設定されていません。data.json を確認してください。");
    return;
  }

  // Push current page to history, then move
  historyStack.push(currentId);

  // (Back behavior) "discard future history" is naturally satisfied by stack model:
  // when you go back we pop, and then taking a new path pushes from that state.
  renderPage(nextId);
}

function goBack() {
  clearError();
  if (historyStack.length === 0) return;
  const prevId = historyStack.pop(); // discard future path
  renderPage(prevId);
}

function restart() {
  clearError();
  historyStack = [];
  renderPage(DATA.startPageId);
}

function validateData(data) {
  const errors = [];
  if (!data || typeof data !== "object") {
    errors.push("data.json がオブジェクトではありません。");
    return errors;
  }
  if (!data.startPageId || typeof data.startPageId !== "string") {
    errors.push("startPageId がありません。");
  }
  if (!Array.isArray(data.pages)) {
    errors.push("pages が配列ではありません。");
    return errors;
  }
  // Build map first
  const ids = new Set();
  for (const p of data.pages) {
    if (!p || typeof p !== "object") continue;
    if (!p.id || typeof p.id !== "string") {
      errors.push("id を持たないページがあります。");
      continue;
    }
    if (ids.has(p.id)) {
      errors.push(`ページIDが重複しています: ${p.id}`);
    }
    ids.add(p.id);
  }

  // Validate links
  for (const p of data.pages) {
    if (!p || typeof p !== "object" || !p.id) continue;
    const type = p.type || "question";

    if (type === "result") {
      if (p.choices && Array.isArray(p.choices) && p.choices.length > 0) {
        errors.push(`resultノードに choices が存在します（ID: ${p.id}）。resultはchoices無し推奨です。`);
      }
      continue;
    }

    const choices = Array.isArray(p.choices) ? p.choices : [];
    if (choices.length === 0) {
      // warning level, but keep as error to prevent silent dead-end
      errors.push(`questionノードに choices がありません（ID: ${p.id}）。`);
    }

    choices.forEach((c, idx) => {
      const next = c?.next;
      if (!next || typeof next !== "string") {
        errors.push(`next が未設定です（ID: ${p.id} / choice#${idx + 1}）。`);
      } else if (!ids.has(next)) {
        errors.push(`遷移先が存在しません: ${p.id} -> ${next}`);
      }
    });
  }

  if (data.startPageId && typeof data.startPageId === "string" && !ids.has(data.startPageId)) {
    errors.push(`startPageId が存在しません: ${data.startPageId}`);
  }

  return errors;
}

async function init() {
  try {
    const res = await fetch("data.json", { cache: "no-store" });
    if (!res.ok) {
      throw new Error(`data.json の読み込み失敗: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();

    const errs = validateData(data);
    if (errs.length) {
      showError("data.json の内容に問題があります:\n- " + errs.join("\n- "));
      // Still try to render start if possible
    }

    DATA = data;
    PAGES = new Map(data.pages.map(p => [p.id, p]));

    const start = data.startPageId || (data.pages[0]?.id ?? null);
    if (!start) {
      showError("開始ページが特定できません。startPageId を設定してください。");
      return;
    }

    // wire events
    btnNext.addEventListener("click", goNext);
    btnBack.addEventListener("click", goBack);
    btnRestart.addEventListener("click", restart);

    // keyboard shortcuts
    window.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        // Enter: next (only if not result)
        const page = getPage(currentId);
        if (page && (page.type || "question") !== "result") goNext();
      }
      if (e.key === "Backspace") {
        // avoid breaking browser backspace behavior in inputs
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
        if (tag !== "input" && tag !== "textarea") {
          e.preventDefault();
          goBack();
        }
      }
    });

    renderPage(start);
  } catch (err) {
    showError(String(err?.message || err));
  }
}

init();



