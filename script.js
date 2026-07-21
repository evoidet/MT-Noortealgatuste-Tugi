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
        const iconNamespace = "http://www.w3.org/2000/svg";
        const tiktokIcon = document.createElementNS(iconNamespace, "svg");
        const tiktokPath = document.createElementNS(iconNamespace, "path");

        tiktok.className = "tiktok-link";
        tiktok.href = "https://www.tiktok.com/@noortetugi";
        tiktok.target = "_blank";
        tiktok.rel = "noopener noreferrer";
        tiktok.setAttribute("aria-label", "TikTok");
        tiktok.title = "TikTok";

        tiktokIcon.setAttribute("class", "tiktok-icon");
        tiktokIcon.setAttribute("viewBox", "0 0 24 24");
        tiktokIcon.setAttribute("aria-hidden", "true");
        tiktokIcon.setAttribute("focusable", "false");
        tiktokPath.setAttribute(
          "d",
          "M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.72-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"
        );
        tiktokPath.setAttribute("fill", "currentColor");
        tiktokIcon.appendChild(tiktokPath);
        tiktok.appendChild(tiktokIcon);
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

        const donation = document.createElement("div");
        const donationHeading = document.createElement("h5");
        const donationDetails = document.createElement("p");
        const donationRecipient = document.createElement("strong");
        const donationSeparator = document.createElement("span");
        const donationIban = document.createElement("span");

        donation.className = "footer-donation";
        donationHeading.textContent = "Annetused";
        donationDetails.className = "footer-donation-details";
        donationRecipient.className = "footer-donation-recipient";
        donationRecipient.textContent = "MTÜ Noortealgatuste Tugi";
        donationSeparator.className = "footer-donation-separator";
        donationSeparator.setAttribute("aria-hidden", "true");
        donationSeparator.textContent = "•";
        donationIban.className = "footer-donation-iban";
        donationIban.textContent = "EE077700771011606476";

        donationDetails.append(
          donationRecipient,
          donationSeparator,
          donationIban
        );
        donation.append(donationHeading, donationDetails);

        legal.replaceChildren(heading, details, donation);
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
     PROJECTS DROPDOWN
     ========================================================= */

  (function initProjectsDropdown() {
    const projectsNavigation = document.querySelector(".nav-projects");
    const toggle = projectsNavigation?.querySelector(".nav-projects-toggle");
    const menu = projectsNavigation?.querySelector(".nav-projects-menu");

    if (!projectsNavigation || !toggle || !menu) {
      return;
    }

    function openProjectsMenu() {
      projectsNavigation.classList.add("is-open");
      toggle.setAttribute("aria-expanded", "true");
    }

    function closeProjectsMenu(options = {}) {
      const wasOpen = projectsNavigation.classList.contains("is-open");

      projectsNavigation.classList.remove("is-open");
      toggle.setAttribute("aria-expanded", "false");

      if (wasOpen && options.restoreFocus) {
        toggle.focus({ preventScroll: true });
      }
    }

    toggle.addEventListener("click", function (event) {
      event.preventDefault();
      event.stopPropagation();

      if (projectsNavigation.classList.contains("is-open")) {
        closeProjectsMenu();
      } else {
        openProjectsMenu();
      }
    });

    menu.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () {
        closeProjectsMenu();
      });
    });

    document.addEventListener("click", function (event) {
      if (!projectsNavigation.contains(event.target)) {
        closeProjectsMenu();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (
        event.key === "Escape" &&
        projectsNavigation.classList.contains("is-open")
      ) {
        closeProjectsMenu({ restoreFocus: true });
      }
    });

    document.addEventListener("navigation:close-projects", function () {
      closeProjectsMenu();
    });
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
      document.dispatchEvent(new CustomEvent("navigation:close-projects"));
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
