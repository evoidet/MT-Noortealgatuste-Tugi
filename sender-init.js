(function (windowObject, documentObject, tagName, source, senderName) {
  windowObject.Sender = senderName;
  windowObject[senderName] =
    windowObject[senderName] ||
    function () {
      (windowObject[senderName].q = windowObject[senderName].q || []).push(
        arguments
      );
    };
  windowObject[senderName].l = Date.now();
  windowObject[senderName].on = function (event, callback) {
    windowObject[senderName].listeners =
      windowObject[senderName].listeners || {};
    (
      windowObject[senderName].listeners[event] =
        windowObject[senderName].listeners[event] || []
    ).push(callback);
  };

  const script = documentObject.createElement(tagName);
  const firstScript = documentObject.getElementsByTagName(tagName)[0];

  script.async = true;
  script.src = source;
  firstScript.parentNode.insertBefore(script, firstScript);
})(
  window,
  document,
  "script",
  "https://cdn.sender.net/accounts_resources/universal.js",
  "sender"
);

sender("2e5cae1b584292");

document.addEventListener("DOMContentLoaded", function () {
  const t = function (key) {
    return window.I18N?.t(key) || "";
  };

  const localizeEmbeddedForm = function (formContainer) {
    const embeddedFrame = formContainer.querySelector("iframe");

    if (embeddedFrame) {
      embeddedFrame.title = t("common.newsletter.embedTitle");
    }
  };

  window.setTimeout(function () {
    document
      .querySelectorAll(".sender-form-field:empty")
      .forEach(function (formContainer) {
        const message = document.createElement("p");
        const emailLink = document.createElement("a");

        message.className = "sender-form-unavailable";
        message.append(t("common.newsletter.unavailable"));

        emailLink.href = "mailto:juhatus@noortetugi.ee";
        emailLink.textContent = "juhatus@noortetugi.ee";
        message.append(emailLink, ".");
        formContainer.appendChild(message);

        const observer = new MutationObserver(function () {
          const senderContent = Array.from(formContainer.children).some(
            function (child) {
              return child !== message;
            }
          );

          if (senderContent) {
            message.remove();
            observer.disconnect();
          }
        });

        observer.observe(formContainer, {
          childList: true,
          subtree: true
        });
        window.setTimeout(function () {
          observer.disconnect();
        }, 30000);
      });
  }, 4000);

  document.querySelectorAll(".sender-form-field").forEach(function (formContainer) {
    localizeEmbeddedForm(formContainer);

    const frameObserver = new MutationObserver(function () {
      localizeEmbeddedForm(formContainer);
    });

    frameObserver.observe(formContainer, {
      childList: true,
      subtree: true
    });

    window.setTimeout(function () {
      localizeEmbeddedForm(formContainer);
      frameObserver.disconnect();
    }, 30000);
  });
});
