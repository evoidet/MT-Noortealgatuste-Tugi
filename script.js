document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  /* =========================================================
     ÜLDISED ABIFUNKTSIOONID
     ========================================================= */

  const siteConfig = window.SITE_CONFIG || {};
  const t = function (key, variables) {
    return window.I18N?.t(key, variables) || "";
  };

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
     VÄLISED LINGID
     Keelevalikut haldab i18n.js.
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

  /* =========================================================
     ÜHINE JALUS
     ========================================================= */

  (function initSharedFooter() {
    const socialIconMarkup = {
      facebook: [
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
        '<path fill="currentColor" d="M13.75 22v-8h2.75l.41-3.2h-3.16V8.76c0-.93.26-1.56 1.59-1.56H17V4.34c-.29-.04-1.28-.13-2.45-.13-2.43 0-4.1 1.48-4.1 4.21v2.38H7.7V14h2.75v8h3.3Z"></path>',
        "</svg>"
      ].join(""),
      linkedin: [
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
        '<path fill="currentColor" d="M5.34 3.5a1.84 1.84 0 1 1 0 3.68 1.84 1.84 0 0 1 0-3.68ZM3.75 8.5h3.18V20H3.75V8.5ZM9 8.5h3.05v1.57h.04c.42-.8 1.46-1.65 3-1.65 3.21 0 3.8 2.11 3.8 4.86V20h-3.17v-5.96c0-1.42-.03-3.25-1.98-3.25-1.98 0-2.29 1.55-2.29 3.15V20H9V8.5Z"></path>',
        "</svg>"
      ].join(""),
      tiktok: [
        '<svg class="tiktok-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M13 4v10.5a4.5 4.5 0 1 1-4-4.47"></path>',
        '<path d="M13 4c.67 2.67 2.33 4.33 5 5"></path>',
        "</svg>"
      ].join("")
    };
    const contactIconMarkup = {
      location: [
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '<path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"></path>',
        '<circle cx="12" cy="10" r="2.5"></circle>',
        "</svg>"
      ].join(""),
      email: [
        '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
        '<rect x="3" y="5" width="18" height="14" rx="2"></rect>',
        '<path d="m3 7 9 6 9-6"></path>',
        "</svg>"
      ].join("")
    };

    function setSocialIcon(link, iconName) {
      if (!link || !socialIconMarkup[iconName]) {
        return;
      }

      link.classList.remove("social-text");
      link.innerHTML = socialIconMarkup[iconName];
    }

    function decorateContactItem(element, iconName, leadingIconPattern) {
      if (!element || !contactIconMarkup[iconName]) {
        return;
      }

      const label = element.textContent
        .replace(leadingIconPattern, "")
        .trim();
      const icon = document.createElement("span");

      icon.className = "footer-contact-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = contactIconMarkup[iconName];
      element.replaceChildren(icon, document.createTextNode(label));
    }

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

      if (socials) {
        setSocialIcon(
          socials.querySelector('[data-config-link="facebook"]'),
          "facebook"
        );
        setSocialIcon(
          socials.querySelector('[href*="linkedin.com"]'),
          "linkedin"
        );

        let tiktok = socials.querySelector(
          '[href*="tiktok.com/@noortetugi"]'
        );

        if (!tiktok) {
          tiktok = document.createElement("a");
          tiktok.className = "tiktok-link";
          tiktok.href = "https://www.tiktok.com/@noortetugi";
          tiktok.target = "_blank";
          tiktok.rel = "noopener noreferrer";
          tiktok.setAttribute("aria-label", "TikTok");
          tiktok.title = "TikTok";
          socials.appendChild(tiktok);
        }

        setSocialIcon(tiktok, "tiktok");
      }

      decorateContactItem(
        footer.querySelector(".footer-contact p"),
        "location",
        /^\s*📍\s*/u
      );
      decorateContactItem(
        footer.querySelector('.footer-contact a[href^="mailto:"]'),
        "email",
        /^\s*✉(?:️)?\s*/u
      );

      const legal = footer.querySelector(".footer-legal");

      if (legal) {
        const heading = document.createElement("h4");
        heading.textContent = t("common.footer.officialTitle");

        const details = document.createElement("p");
        const name = document.createElement("strong");
        const email = document.createElement("a");

        name.textContent = "MTÜ Noortealgatuste Tugi";
        email.href = "mailto:juhatus@noortetugi.ee";
        email.textContent = "juhatus@noortetugi.ee";

        details.append(name, document.createElement("br"));
        details.append(
          t("common.footer.registrationCode"),
          document.createElement("br")
        );
        details.append(t("common.footer.emailLabel") + " ", email);

        const donation = document.createElement("div");
        const donationHeading = document.createElement("h5");
        const donationDetails = document.createElement("p");
        const donationRecipient = document.createElement("strong");
        const donationSeparator = document.createElement("span");
        const donationIban = document.createElement("span");

        donation.className = "footer-donation";
        donationHeading.textContent = t("common.footer.donations");
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
        if (!link.getAttribute("href")?.includes("privaatsuspoliitika")) {
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
    button.setAttribute("aria-label", t("common.a11y.backToTop"));
    button.title = t("common.a11y.backToTopTitle");
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
        t("common.form.unconfigured")
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
      console.error("Gala countdown elements are missing.");
      return;
    }

    const dateText =
      galaCountdown.dataset.eventDate || "2026-08-02T23:59:59+03:00";
    const targetDate = Date.parse(dateText);

    if (Number.isNaN(targetDate)) {
      console.error("The gala date is invalid:", dateText);
      finishedElement.textContent = t("gala.countdown.invalid");
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
        finishedElement.textContent = t("gala.countdown.finished");

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
      console.error("Camp countdown elements are missing.");
      return;
    }

    const dateText = countdown.dataset.eventDate;
    const targetDate = Date.parse(dateText);

    if (Number.isNaN(targetDate)) {
      console.error("The camp date is invalid:", dateText);
      finishedElement.textContent = t("camp.countdown.invalid");
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
        finishedElement.textContent = t("camp.countdown.started");

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
