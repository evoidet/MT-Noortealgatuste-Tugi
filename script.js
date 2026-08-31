document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  /* =========================================================
     ÜLDISED ABIFUNKTSIOONID
     ========================================================= */

  const siteConfig = window.SITE_CONFIG || {};
  const t = function (key, variables) {
    return window.I18N?.t(key, variables) || "";
  };
  const currentLanguage = window.I18N?.getLanguage?.() || "et";
  const pluralRules = new Intl.PluralRules(currentLanguage);

  function setText(element, message) {
    if (element) {
      element.textContent = message;
    }
  }

  function getPluralizedText(baseKey, value) {
    const category = pluralRules.select(value);

    return (
      t(`${baseKey}.${category}`) ||
      t(`${baseKey}.other`) ||
      t(baseKey)
    );
  }

  function setCountdownValue(valueElement, value, translationKey) {
    valueElement.textContent = String(value).padStart(2, "0");

    const labelElement = valueElement.nextElementSibling;

    if (labelElement) {
      labelElement.textContent = getPluralizedText(translationKey, value);
    }
  }

  (function initSkipLink() {
    const mainContent = document.querySelector("main");

    if (!mainContent || document.querySelector(".skip-link")) {
      return;
    }

    if (!mainContent.id) {
      mainContent.id = "main-content";
    }

    if (!mainContent.hasAttribute("tabindex")) {
      mainContent.tabIndex = -1;
    }

    const skipLink = document.createElement("a");
    skipLink.className = "skip-link";
    skipLink.href = `#${mainContent.id}`;
    skipLink.textContent = t("common.a11y.skipToContent");

    skipLink.addEventListener("click", function () {
      window.setTimeout(function () {
        mainContent.focus({ preventScroll: true });
      }, 0);
    });

    document.body.prepend(skipLink);
  })();

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
     STAFF AREA ACCESS
     The link reuses the existing server-side Google OAuth flow.
     ========================================================= */

  (function initStaffAccess() {
    const staffConfig = siteConfig.staffArea || {};

    function safeStaffUrl(value, fallback) {
      try {
        const url = new URL(value || fallback, window.location.origin);
        return url.origin === window.location.origin || url.protocol === "https:"
          ? url
          : new URL(fallback, window.location.origin);
      } catch (error) {
        return new URL(fallback, window.location.origin);
      }
    }

    const areaUrl = safeStaffUrl(staffConfig.url, "/admin");
    const loginUrl = safeStaffUrl(staffConfig.loginUrl, "/api/staff/auth/google");
    const returnTo = `${areaUrl.pathname}${areaUrl.search}${areaUrl.hash}`;
    loginUrl.searchParams.set("returnTo", returnTo);
    const label = t("common.nav.staffArea");
    const links = [];

    const navigation = document.querySelector(".header .nav");

    if (navigation && !navigation.querySelector(".nav-staff-access")) {
      const link = document.createElement("a");
      const icon = document.createElement("span");
      const copy = document.createElement("span");

      link.className = "nav-staff-access";
      link.href = loginUrl.href;
      link.setAttribute("aria-label", label);
      link.title = label;
      link.dataset.staffAccess = "true";

      icon.className = "nav-staff-icon";
      icon.setAttribute("aria-hidden", "true");
      icon.innerHTML = [
        '<svg viewBox="0 0 24 24" focusable="false">',
        '<path d="M7.5 10V7.5a4.5 4.5 0 0 1 9 0V10"></path>',
        '<rect x="5" y="10" width="14" height="10" rx="2.5"></rect>',
        '<path d="M12 14v2.5"></path>',
        "</svg>"
      ].join("");

      copy.className = "nav-staff-label";
      copy.textContent = label;
      link.append(icon, copy);
      navigation.appendChild(link);
      links.push(link);
    }

    document.querySelectorAll(".site-footer").forEach(function (footer) {
      const quickLinksHeading = footer.querySelector(
        '[data-i18n="common.footer.quickLinks"]'
      );
      const quickLinks = quickLinksHeading?.closest(".footer-column");

      if (!quickLinks || quickLinks.querySelector(".footer-staff-link")) {
        return;
      }

      const link = document.createElement("a");
      const contactLink = quickLinks.querySelector('a[href^="mailto:"]');

      link.className = "footer-staff-link";
      link.href = loginUrl.href;
      link.textContent = label;
      link.dataset.staffAccess = "true";
      link.setAttribute("aria-label", label);

      if (contactLink) {
        quickLinks.insertBefore(link, contactLink);
      } else {
        quickLinks.appendChild(link);
      }
      links.push(link);
    });

    if (!links.length) {
      return;
    }

    const sessionUrl = new URL("/api/staff/session", areaUrl.origin);

    fetch(sessionUrl.href, {
      method: "GET",
      credentials: "include",
      headers: { Accept: "application/json" }
    })
      .then(function (response) {
        return response.ok ? response.json() : null;
      })
      .then(function (session) {
        let destination = areaUrl.href;

        if (!session?.authenticated) {
          const checkedLoginUrl = safeStaffUrl(
            session?.loginUrl || loginUrl.href,
            loginUrl.href
          );
          checkedLoginUrl.searchParams.set("returnTo", returnTo);
          destination = checkedLoginUrl.href;
        }

        links.forEach(function (link) {
          link.href = destination;
        });
      })
      .catch(function () {
        // Keep the secure login URL when the staff service is temporarily unavailable.
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
        '<svg class="tiktok-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
        '<path fill="currentColor" d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.93-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.72-.02-.5-.03-1-.01-1.48.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07Z"></path>',
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
        const officialWebsiteLabel = document.createElement("span");
        const website = document.createElement("a");
        const websiteStatement = document.createElement("span");
        const email = document.createElement("a");

        name.textContent = "MTÜ Noortealgatuste Tugi";
        officialWebsiteLabel.className = "footer-official-website-label";
        officialWebsiteLabel.textContent = t("common.footer.officialWebsite");
        website.href = "https://www.noortetugi.ee/";
        website.textContent = "noortetugi.ee";
        email.href = "mailto:juhatus@noortetugi.ee";
        email.textContent = "juhatus@noortetugi.ee";

        details.append(name, document.createElement("br"));
        details.append(
          t("common.footer.registrationCode"),
          document.createElement("br")
        );
        details.append(
          t("common.footer.addressLabel") +
            " Maleva tn 35-32, 31025 Kohtla-Järve, Ida-Virumaa, Eesti",
          document.createElement("br")
        );
        details.append(
          officialWebsiteLabel,
          document.createTextNode(" "),
          website,
          document.createElement("br")
        );
        websiteStatement.className = "footer-official-domain-statement";
        websiteStatement.textContent = t(
          "common.footer.officialWebsiteStatement"
        );
        details.append(websiteStatement, document.createElement("br"));
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

    form
      .querySelectorAll("input[required], textarea[required], select[required]")
      .forEach(function (field) {
        field.addEventListener("input", function () {
          field.setCustomValidity("");
        });

        field.addEventListener("invalid", function () {
          field.setCustomValidity("");

          if (field.validity.valueMissing) {
            field.setCustomValidity(t("common.form.required"));
          } else if (
            field instanceof HTMLInputElement &&
            field.type === "email" &&
            field.validity.typeMismatch
          ) {
            field.setCustomValidity(t("common.form.invalidEmail"));
          }
        });
      });

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
      galaCountdown.dataset.eventDate || "2026-10-17T15:00:00+03:00";
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
        setCountdownValue(daysElement, 0, "common.countdown.days");
        setCountdownValue(hoursElement, 0, "common.countdown.hours");
        setCountdownValue(minutesElement, 0, "common.countdown.minutes");
        setCountdownValue(secondsElement, 0, "common.countdown.seconds");
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

      setCountdownValue(daysElement, days, "common.countdown.days");
      setCountdownValue(hoursElement, hours, "common.countdown.hours");
      setCountdownValue(minutesElement, minutes, "common.countdown.minutes");
      setCountdownValue(secondsElement, seconds, "common.countdown.seconds");
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
        setCountdownValue(daysElement, 0, "common.countdown.days");
        setCountdownValue(hoursElement, 0, "common.countdown.hours");
        setCountdownValue(minutesElement, 0, "common.countdown.minutes");
        setCountdownValue(secondsElement, 0, "common.countdown.seconds");
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

      setCountdownValue(daysElement, days, "common.countdown.days");
      setCountdownValue(hoursElement, hours, "common.countdown.hours");
      setCountdownValue(minutesElement, minutes, "common.countdown.minutes");
      setCountdownValue(secondsElement, seconds, "common.countdown.seconds");
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
      menuButton.setAttribute("aria-label", t("common.a11y.closeMenu"));
    }

    function hideMenu(options = {}) {
      menuIsOpen = false;
      navigation.classList.remove("open");
      menuButton.classList.remove("active");
      menuButton.setAttribute("aria-expanded", "false");
      menuButton.setAttribute("aria-label", t("common.a11y.openMenu"));
      document.dispatchEvent(new CustomEvent("navigation:close-projects"));

      if (options.restoreFocus) {
        menuButton.focus();
      }
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
        hideMenu({ restoreFocus: true });
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
