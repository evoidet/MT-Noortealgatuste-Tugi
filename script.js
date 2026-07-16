document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  /* =========================================================
     ÜLDISED ABIFUNKTSIOONID
     ========================================================= */

  const siteConfig = window.SITE_CONFIG || {};

  function setText(element, message) {
    if (element) {
      element.textContent = message;
    }
  }

  function getFocusableElements(container) {
    if (!container) {
      return [];
    }

    return Array.from(
      container.querySelectorAll(
        [
          "a[href]",
          "button:not([disabled])",
          "input:not([disabled])",
          "select:not([disabled])",
          "textarea:not([disabled])",
          '[tabindex]:not([tabindex="-1"])'
        ].join(",")
      )
    ).filter(function (element) {
      return !element.hidden && element.getAttribute("aria-hidden") !== "true";
    });
  }

  function keepFocusInside(event, container) {
    if (event.key !== "Tab") {
      return;
    }

    const focusable = getFocusableElements(container);

    if (!focusable.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  document.addEventListener("keydown", function (event) {
    if (event.key !== "Tab") {
      return;
    }

    const visibleDialogs = Array.from(
      document.querySelectorAll('[role="dialog"]')
    ).filter(function (dialog) {
      return (
        dialog.getAttribute("aria-hidden") !== "true" &&
        dialog.offsetParent !== null
      );
    });

    const activeDialog = visibleDialogs[visibleDialogs.length - 1];

    if (activeDialog) {
      keepFocusInside(event, activeDialog);
    }
  });

  /* =========================================================
     VÄLISED LINGID JA KEELEVALIK
     ========================================================= */

  (function initConfiguredLinks() {
    document.querySelectorAll("[data-config-link]").forEach(function (link) {
      const group = link.dataset.configGroup || "socialUrls";
      const key = link.dataset.configLink;
      const groupConfig = siteConfig[group] || {};
      const url = groupConfig[key];

      if (typeof url === "string" && url.trim()) {
        link.href = url.trim();
        link.hidden = false;
      } else {
        link.hidden = true;
        link.removeAttribute("href");
      }
    });
  })();

  (function initLanguageSwitcher() {
    const languageUrls = siteConfig.languageUrls || {};

    document.querySelectorAll(".lang-button").forEach(function (button) {
      const language = button.dataset.lang;
      const isCurrent = button.classList.contains("is-active");
      const url = languageUrls[language];

      if (isCurrent) {
        button.disabled = false;
        return;
      }

      if (typeof url !== "string" || !url.trim()) {
        button.disabled = true;
        button.setAttribute("aria-disabled", "true");
        button.title = "Tõlge lisatakse peagi";
        return;
      }

      button.disabled = false;
      button.removeAttribute("aria-disabled");
      button.addEventListener("click", function () {
        window.location.assign(url.trim());
      });
    });
  })();

  /* =========================================================
     ÜHINE JALUS
     ========================================================= */

  (function initSharedFooter() {
    document.querySelectorAll(".site-footer").forEach(function (footer) {
      const main = footer.querySelector(".footer-main");

      if (!main) {
        return;
      }

      Array.from(main.children).forEach(function (column) {
        const heading = column.querySelector("h4");

        if (heading?.textContent.trim() === "Tegevused") {
          column.remove();
        }
      });

      const socials = footer.querySelector(".footer-socials");

      if (socials && !socials.querySelector('[href*="tiktok.com/@noortetugi"]')) {
        const tiktok = document.createElement("a");
        tiktok.className = "social-text";
        tiktok.href = "https://www.tiktok.com/@noortetugi";
        tiktok.target = "_blank";
        tiktok.rel = "noopener noreferrer";
        tiktok.setAttribute("aria-label", "TikTok");
        tiktok.title = "TikTok";
        tiktok.textContent = "♪";
        socials.appendChild(tiktok);
      }

      const legal = footer.querySelector(".footer-legal");

      if (legal) {
        const heading = document.createElement("h4");
        heading.textContent = "Ametlik info";

        const details = document.createElement("p");
        const name = document.createElement("strong");
        const email = document.createElement("a");

        name.textContent = "MTÜ Noortealgatuste Tugi";
        email.href = "mailto:juhatus@noortetugi.ee";
        email.textContent = "juhatus@noortetugi.ee";

        details.append(name, document.createElement("br"));
        details.append("Registrikood: 80652930", document.createElement("br"));
        details.append("E-post: ", email);

        // TODO: Lisa annetuse saaja ja IBAN alles pärast pangarekvisiitide kontrollimist.
        legal.replaceChildren(heading, details);
        legal.classList.add("footer-column", "footer-official");
        main.appendChild(legal);
      }

      const bottomLinks = footer.querySelector(".footer-bottom-links");

      bottomLinks?.querySelectorAll("a").forEach(function (link) {
        if (link.textContent.trim() !== "Privaatsuspoliitika") {
          link.remove();
        }
      });
    });
  })();

  /* =========================================================
     TAGASI LEHE ALGUSESSE
     ========================================================= */

  (function initBackToTop() {
    const button = document.createElement("button");
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    button.type = "button";
    button.className = "back-to-top";
    button.setAttribute("aria-label", "Tagasi lehe algusesse");
    button.title = "Tagasi üles";
    button.innerHTML = '<span aria-hidden="true">↑</span>';
    document.body.appendChild(button);

    function updateVisibility() {
      button.classList.toggle("is-visible", window.scrollY > 560);
    }

    button.addEventListener("click", function () {
      window.scrollTo({
        top: 0,
        behavior: reducedMotion.matches ? "auto" : "smooth"
      });
    });

    window.addEventListener("scroll", updateVisibility, { passive: true });
    updateVisibility();
  })();

  /* =========================================================
     KONTAKTVORMI INTEGRATSIOONIPUNKT
     ========================================================= */

  (function initContactForm() {
    const form = document.getElementById("contactForm");
    const status = document.getElementById("contactFormStatus");

    if (!form) {
      return;
    }

    const actionFromConfig =
      typeof siteConfig.contactFormAction === "string"
        ? siteConfig.contactFormAction.trim()
        : "";
    const actionFromMarkup = form.getAttribute("action")?.trim() || "";
    const configuredAction = actionFromConfig || actionFromMarkup;

    if (configuredAction) {
      form.action = configuredAction;

      if (siteConfig.contactSuccessUrl) {
        const successInput = document.createElement("input");
        successInput.type = "hidden";
        successInput.name = "_next";
        successInput.value = siteConfig.contactSuccessUrl;
        form.appendChild(successInput);
      }
    }

    function showUnconfiguredMessage(event) {
      event.preventDefault();
      setText(
        status,
        "Kontaktvorm ei ole veel teenusega ühendatud. Palun kirjuta aadressile juhatus@noortetugi.ee."
      );

      status?.focus();
    }

    if (!configuredAction) {
      form.addEventListener("submit", showUnconfiguredMessage);

      const submitButton = form.querySelector('[type="submit"]');

      submitButton?.addEventListener("click", function (event) {
        if (form.checkValidity()) {
          showUnconfiguredMessage(event);
        }
      });
    }
  })();

  /* =========================================================
     GALA COUNTDOWN
     ========================================================= */

  (function initGalaCountdown() {
    const galaCountdown = document.getElementById("galaCountdown");

    if (!galaCountdown || galaCountdown.dataset.timerStarted === "true") {
      return;
    }

    const daysElement = document.getElementById("countdownDays");
    const hoursElement = document.getElementById("countdownHours");
    const minutesElement = document.getElementById("countdownMinutes");
    const secondsElement = document.getElementById("countdownSeconds");
    const finishedElement = document.getElementById("countdownFinished");

    if (
      !daysElement ||
      !hoursElement ||
      !minutesElement ||
      !secondsElement ||
      !finishedElement
    ) {
      console.error("Не найдены элементы таймера гала");
      return;
    }

    const dateText =
      galaCountdown.dataset.eventDate || "2026-08-02T23:59:59+03:00";
    const targetDate = Date.parse(dateText);

    if (Number.isNaN(targetDate)) {
      console.error("Неправильная дата гала:", dateText);
      finishedElement.textContent = "Kuupäev ei ole õigesti määratud.";
      return;
    }

    galaCountdown.dataset.timerStarted = "true";
    let intervalId = null;

    function updateGalaCountdown() {
      const remainingTime = targetDate - Date.now();

      if (remainingTime <= 0) {
        daysElement.textContent = "00";
        hoursElement.textContent = "00";
        minutesElement.textContent = "00";
        secondsElement.textContent = "00";
        finishedElement.textContent = "Kandidaatide esitamise aeg on läbi!";

        if (intervalId !== null) {
          window.clearInterval(intervalId);
        }
        return;
      }

      const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor(
        (remainingTime % (1000 * 60 * 60)) / (1000 * 60)
      );
      const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

      daysElement.textContent = String(days).padStart(2, "0");
      hoursElement.textContent = String(hours).padStart(2, "0");
      minutesElement.textContent = String(minutes).padStart(2, "0");
      secondsElement.textContent = String(seconds).padStart(2, "0");
    }

    updateGalaCountdown();
    intervalId = window.setInterval(updateGalaCountdown, 1000);
  })();

  /* =========================================================
     LAAGRI COUNTDOWN
     ========================================================= */

  (function initCampCountdown() {
    const countdown = document.getElementById("campCountdown");

    if (!countdown || countdown.dataset.timerStarted === "true") {
      return;
    }

    const daysElement = document.getElementById("campCountdownDays");
    const hoursElement = document.getElementById("campCountdownHours");
    const minutesElement = document.getElementById("campCountdownMinutes");
    const secondsElement = document.getElementById("campCountdownSeconds");
    const finishedElement = document.getElementById("campCountdownFinished");

    if (
      !daysElement ||
      !hoursElement ||
      !minutesElement ||
      !secondsElement ||
      !finishedElement
    ) {
      console.error("Не найдены элементы таймера лагеря");
      return;
    }

    const dateText = countdown.dataset.eventDate;
    const targetDate = Date.parse(dateText);

    if (Number.isNaN(targetDate)) {
      console.error("Неправильная дата лагеря:", dateText);
      finishedElement.textContent = "Laagri kuupäev ei ole õigesti määratud.";
      return;
    }

    countdown.dataset.timerStarted = "true";
    let intervalId = null;

    function updateCampCountdown() {
      const remainingTime = targetDate - Date.now();

      if (remainingTime <= 0) {
        daysElement.textContent = "00";
        hoursElement.textContent = "00";
        minutesElement.textContent = "00";
        secondsElement.textContent = "00";
        finishedElement.textContent = "Laager on alanud!";

        if (intervalId !== null) {
          window.clearInterval(intervalId);
        }
        return;
      }

      const days = Math.floor(remainingTime / (1000 * 60 * 60 * 24));
      const hours = Math.floor(
        (remainingTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)
      );
      const minutes = Math.floor(
        (remainingTime % (1000 * 60 * 60)) / (1000 * 60)
      );
      const seconds = Math.floor((remainingTime % (1000 * 60)) / 1000);

      daysElement.textContent = String(days).padStart(2, "0");
      hoursElement.textContent = String(hours).padStart(2, "0");
      minutesElement.textContent = String(minutes).padStart(2, "0");
      secondsElement.textContent = String(seconds).padStart(2, "0");
    }

    updateCampCountdown();
    intervalId = window.setInterval(updateCampCountdown, 1000);
  })();

  /* =========================================================
     MOBILE MENU
     ========================================================= */

  (function initMobileMenu() {
    const menuButton =
      document.getElementById("menuToggle") ||
      document.querySelector(".menu-toggle");

    const navigation =
      document.getElementById("mainNav") ||
      document.querySelector(".nav");

    if (!menuButton || !navigation) {
      return;
    }

    const mobileQuery = window.matchMedia("(max-width: 1200px)");
    let menuIsOpen = false;

    function showMenu() {
      menuIsOpen = true;
      navigation.classList.add("open");
      menuButton.classList.add("active");
      menuButton.setAttribute("aria-expanded", "true");
    }

    function hideMenu() {
      menuIsOpen = false;
      navigation.classList.remove("open");
      menuButton.classList.remove("active");
      menuButton.setAttribute("aria-expanded", "false");
    }

    menuButton.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (menuIsOpen) {
        hideMenu();
      } else {
        showMenu();
      }
    });

    navigation.addEventListener("click", function (event) {
      event.stopPropagation();
    });

    navigation.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", hideMenu);
    });

    document.addEventListener("click", function () {
      if (menuIsOpen) {
        hideMenu();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && menuIsOpen) {
        hideMenu();
      }
    });

    mobileQuery.addEventListener("change", hideMenu);
    hideMenu();
  })();

  /* =========================================================
     MEESKONNA FOTODE SUJUV LAADIMINE
     ========================================================= */

  document.querySelectorAll(".team-photo").forEach(function (image) {
    if (image.complete) {
      image.classList.add("loaded");
    } else {
      image.addEventListener(
        "load",
        function () {
          image.classList.add("loaded");
        },
        { once: true }
      );
    }
  });
});
