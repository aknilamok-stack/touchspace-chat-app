(function () {
  if (window.TouchSpaceChatWidget) {
    return;
  }

  var currentScript = document.currentScript;
  var scriptUrl = currentScript && currentScript.src ? new URL(currentScript.src) : null;
  var defaultBaseUrl = scriptUrl ? scriptUrl.origin : window.location.origin;
  var config = window.TouchSpaceChatConfig || {};
  var baseUrl = (config.baseUrl || defaultBaseUrl || "").replace(/\/$/, "");

  function readText(selector) {
    if (!selector) {
      return "";
    }

    try {
      var element = document.querySelector(selector);
      return element && element.textContent ? element.textContent.trim() : "";
    } catch (_) {
      return "";
    }
  }

  function cleanValue(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function pickFirst() {
    for (var i = 0; i < arguments.length; i += 1) {
      var value = arguments[i];
      if (typeof value === "string" && value.trim()) {
        return value.trim();
      }
    }

    return "";
  }

  var fallbackTradePointName = pickFirst(
    cleanValue(config.tradePointName),
    cleanValue(config.name),
    readText(".pane__list-value span"),
    readText(".pane__list-value"),
    readText(".sidebar__title"),
    readText(".account__title span"),
    readText(".account__title")
  );

  var fallbackTradePointId = pickFirst(
    cleanValue(config.tradePointId),
    cleanValue(config.userToken),
    cleanValue(config.clientId),
    fallbackTradePointName
  );

  var fallbackUserName = pickFirst(
    cleanValue(config.userName),
    cleanValue(config.contactName),
    cleanValue(config.name)
  );

  var fallbackUserId = pickFirst(
    cleanValue(config.userId),
    cleanValue(config.platformUserId),
    fallbackTradePointId
  );

  if (!baseUrl) {
    console.error("[TouchSpace Widget] Не удалось определить baseUrl.");
    return;
  }

  var iframeUrl = new URL("/client", baseUrl);
  iframeUrl.searchParams.set("embed", "1");

  if (fallbackTradePointId) iframeUrl.searchParams.set("tradePointId", String(fallbackTradePointId));
  if (fallbackTradePointName) iframeUrl.searchParams.set("tradePointName", String(fallbackTradePointName));
  if (fallbackUserId) iframeUrl.searchParams.set("userId", String(fallbackUserId));
  if (fallbackUserName) iframeUrl.searchParams.set("userName", String(fallbackUserName));
  if (config.email) iframeUrl.searchParams.set("email", String(config.email));
  if (config.platform) iframeUrl.searchParams.set("platform", String(config.platform));

  var style = document.createElement("style");
  style.textContent = [
    ".touchspace-widget-root{position:fixed;right:24px;bottom:24px;z-index:2147483000;font-family:Montserrat,ui-sans-serif,system-ui,sans-serif;}",
    ".touchspace-widget-launcher{position:relative;display:inline-flex;align-items:center;justify-content:center;height:85px;width:85px;border:none;border-radius:9999px;background:transparent;cursor:pointer;}",
    ".touchspace-widget-launcher img{display:block;height:85px;width:85px;object-fit:contain;filter:drop-shadow(0 18px 34px rgba(10,132,255,.28));}",
    ".touchspace-widget-launcher.is-pulsing img{animation:touchspace-widget-pulse 1.8s ease-in-out infinite;}",
    ".touchspace-widget-badge{position:absolute;right:6px;top:2px;display:none;min-width:24px;height:24px;padding:0 7px;border-radius:9999px;background:#ff453a;color:#fff;font:600 12px/24px Montserrat,ui-sans-serif,system-ui,sans-serif;box-shadow:0 10px 20px rgba(255,69,58,.35);}",
    ".touchspace-widget-badge.is-visible{display:inline-block;}",
    ".touchspace-widget-panel{display:none;position:absolute;right:0;bottom:0;width:336px;height:496px;border:1px solid #dce3f0;border-radius:22px;overflow:hidden;background:#fff;box-shadow:0 20px 60px rgba(0,0,0,.18);}",
    ".touchspace-widget-panel.is-open{display:block;}",
    ".touchspace-widget-panel iframe{width:100%;height:100%;border:0;background:#fff;}",
    ".touchspace-widget-close{position:absolute;left:14px;top:14px;z-index:3;display:flex;align-items:center;justify-content:center;width:34px;height:34px;border:none;border-radius:9999px;background:rgba(255,255,255,.16);color:#fff;font:400 22px/1 Arial,sans-serif;cursor:pointer;backdrop-filter:blur(3px);box-shadow:0 8px 18px rgba(0,0,0,.14);}",
    ".touchspace-widget-close:hover{background:rgba(255,255,255,.24);}",
    "@keyframes touchspace-widget-pulse{0%{transform:scale(1)}50%{transform:scale(1.08)}100%{transform:scale(1)}}",
    "@media (max-width: 640px){.touchspace-widget-root{right:12px;bottom:12px;left:12px}.touchspace-widget-panel{width:min(336px,100%);height:min(496px,78vh)}.touchspace-widget-launcher{margin-left:auto;display:flex;align-items:center;justify-content:center;}}"
  ].join("");
  document.head.appendChild(style);

  var root = document.createElement("div");
  root.className = "touchspace-widget-root";

  var panel = document.createElement("div");
  panel.className = "touchspace-widget-panel";

  var iframe = document.createElement("iframe");
  iframe.src = iframeUrl.toString();
  iframe.title = "TouchSpace Chat Widget";
  iframe.allow = "clipboard-read; clipboard-write";

  var panelClose = document.createElement("button");
  panelClose.type = "button";
  panelClose.className = "touchspace-widget-close";
  panelClose.setAttribute("aria-label", "Закрыть чат");
  panelClose.textContent = "×";

  var launcher = document.createElement("button");
  launcher.type = "button";
  launcher.className = "touchspace-widget-launcher";
  launcher.setAttribute("aria-label", "Открыть чат TouchSpace");

  var launcherImage = document.createElement("img");
  launcherImage.alt = "TouchSpace Chat";
  launcherImage.src = baseUrl + "/icons/robot.svg";

  var badge = document.createElement("span");
  badge.className = "touchspace-widget-badge";

  launcher.appendChild(launcherImage);
  launcher.appendChild(badge);

  function setUnreadCount(count) {
    var normalized = Number(count) > 0 ? Number(count) : 0;

    if (normalized > 0) {
      badge.textContent = normalized > 99 ? "99+" : String(normalized);
      badge.classList.add("is-visible");
      launcher.classList.add("is-pulsing");
      return;
    }

    badge.textContent = "";
    badge.classList.remove("is-visible");
    launcher.classList.remove("is-pulsing");
  }

  function postVisibilityState() {
    if (!iframe.contentWindow) {
      return;
    }

    iframe.contentWindow.postMessage(
      {
        type: "touchspace-widget-visibility",
        open: panel.classList.contains("is-open"),
      },
      iframeUrl.origin
    );
  }

  function openWidget() {
    panel.classList.add("is-open");
    launcher.style.display = "none";
    setUnreadCount(0);
    postVisibilityState();
  }

  function closeWidget() {
    panel.classList.remove("is-open");
    launcher.style.display = "inline-flex";
    postVisibilityState();
  }

  launcher.addEventListener("click", openWidget);
  iframe.addEventListener("load", postVisibilityState);
  panelClose.addEventListener("click", function (event) {
    event.preventDefault();
    event.stopPropagation();
    closeWidget();
  });

  panel.appendChild(panelClose);
  panel.appendChild(iframe);
  root.appendChild(panel);
  root.appendChild(launcher);
  document.body.appendChild(root);

  window.addEventListener("message", function (event) {
    if (
      event.source !== iframe.contentWindow &&
      event.origin !== iframeUrl.origin
    ) {
      return;
    }

    if (event.data && event.data.type === "touchspace-widget-close") {
      closeWidget();
      return;
    }

    if (event.data && event.data.type === "touchspace-widget-unread") {
      if (!panel.classList.contains("is-open")) {
        setUnreadCount(event.data.unreadCount);
      }
    }
  });

  if (config.autoOpen) {
    openWidget();
  }

  window.TouchSpaceChatWidget = {
    open: openWidget,
    close: closeWidget,
    toggle: function () {
      if (panel.classList.contains("is-open")) {
        closeWidget();
      } else {
        openWidget();
      }
    },
    destroy: function () {
      root.remove();
      style.remove();
      delete window.TouchSpaceChatWidget;
    },
  };
})();
