console.log("Website is working");

document.addEventListener("DOMContentLoaded", function () {
  "use strict";

  /* =========================================================
     ÜLDISED ABIFUNKTSIOONID
     ========================================================= */

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function setText(element, message) {
    if (element) {
      element.textContent = message;
    }
  }

  function getNewsletterStatus() {
    const params = new URLSearchParams(window.location.search);

    return {
      status: params.get("newsletter"),
      form: params.get("form")
    };
  }

  function clearNewsletterStatusFromUrl() {
    const url = new URL(window.location.href);

    if (!url.searchParams.has("newsletter") && !url.searchParams.has("form")) {
      return;
    }

    url.searchParams.delete("newsletter");
    url.searchParams.delete("form");

    const cleanUrl =
      url.pathname +
      (url.searchParams.toString() ? `?${url.searchParams.toString()}` : "") +
      url.hash;

    window.history.replaceState({}, document.title, cleanUrl);
  }

  function prepareNewsletterSubmit(options) {
    const {
      form,
      emailInput,
      consentInput,
      messageElement,
      showError
    } = options;

    if (!form || !emailInput || !consentInput) {
      return;
    }

    form.addEventListener("submit", function (event) {
      const email = emailInput.value.trim();
      const consent = consentInput.checked;

      if (messageElement) {
        setText(messageElement, "");
      }

      if (!isValidEmail(email)) {
        event.preventDefault();
        showError("Palun sisestage korrektne e-posti aadress.");
        emailInput.focus();
        return;
      }

      if (!consent) {
        event.preventDefault();
        showError("Infokirjaga liitumiseks tuleb anda nõusolek.");
        consentInput.focus();
        return;
      }

      localStorage.setItem("newsletterSubmissionPending", "true");

      const submitButton = form.querySelector(
        'button[type="submit"], input[type="submit"]'
      );

      if (submitButton) {
        submitButton.disabled = true;

        if (submitButton.tagName === "INPUT") {
          submitButton.value = "Saadan...";
        } else {
          submitButton.textContent = "Saadan...";
        }
      }

      if (messageElement) {
        setText(messageElement, "Palun oodake...");
      }

      // Siin EI kasutata event.preventDefault().
      // Brauser saadab vormi otse Smaily avalikku opt-in vormi.
    });
  }

  /* =========================================================
     POPUP INFOKIRI
     ========================================================= */

  const overlay = document.getElementById("newsletterOverlay");
  const closeButton = document.getElementById("newsletterClose");
  const popupForm = document.getElementById("newsletterForm");
  const popupEmail = document.getElementById("newsletterEmail");
  const popupConsent = document.getElementById("newsletterConsent");
  const popupError = document.getElementById("newsletterError");

  function showPopupError(message) {
    if (!popupError) {
      return;
    }

    popupError.textContent = message;
    popupError.classList.add("active");
  }

  function hidePopupError() {
    if (!popupError) {
      return;
    }

    popupError.textContent = "";
    popupError.classList.remove("active");
  }

  function closeNewsletterPopup() {
    if (!overlay) {
      return;
    }

    overlay.classList.remove("active");
    localStorage.setItem("newsletterPopupClosed", "true");
  }

  const newsletterReturn = getNewsletterStatus();

  if (
    overlay &&
    closeButton &&
    popupForm &&
    popupEmail &&
    popupConsent &&
    popupError
  ) {
    const popupWasClosed = localStorage.getItem("newsletterPopupClosed");
    const userSubscribed = localStorage.getItem("newsletterSubscribed");

    if (!popupWasClosed && !userSubscribed && !newsletterReturn.status) {
      window.setTimeout(function () {
        overlay.classList.add("active");
      }, 2000);
    }

    closeButton.addEventListener("click", closeNewsletterPopup);

    overlay.addEventListener("click", function (event) {
      if (event.target === overlay) {
        closeNewsletterPopup();
      }
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") {
        closeNewsletterPopup();
      }
    });

    popupForm.addEventListener("input", hidePopupError);

    prepareNewsletterSubmit({
      form: popupForm,
      emailInput: popupEmail,
      consentInput: popupConsent,
      messageElement: popupError,
      showError: showPopupError
    });
  }

  /* =========================================================
     LEHE ALUMINE INFOKIRJA VORM
     ========================================================= */

  const bottomForm = document.getElementById("bottomNewsletterForm");
  const bottomEmail = document.getElementById("bottomNewsletterEmail");
  const bottomConsent = document.getElementById("bottomNewsletterConsent");
  const bottomMessage = document.getElementById("bottomNewsletterMessage");

  if (bottomForm && bottomEmail && bottomConsent) {
    prepareNewsletterSubmit({
      form: bottomForm,
      emailInput: bottomEmail,
      consentInput: bottomConsent,
      messageElement: bottomMessage,
      showError: function (message) {
        setText(bottomMessage, message);
      }
    });
  }

  /* =========================================================
     SMAILY TAGASISUUNAMISE TULEMUS
     ========================================================= */

  (function handleNewsletterReturn() {
    const { status, form } = newsletterReturn;

    if (!status) {
      return;
    }

    localStorage.removeItem("newsletterSubmissionPending");

    if (status === "success") {
      localStorage.setItem("newsletterSubscribed", "true");
      localStorage.removeItem("newsletterPopupClosed");

      if (bottomEmail) {
        bottomEmail.value = "";
      }

      if (bottomConsent) {
        bottomConsent.checked = false;
      }

      setText(
        bottomMessage,
        "Aitäh! Teie e-posti aadress lisati infokirja saajate hulka."
      );

      if (form === "popup" && overlay && popupForm) {
        overlay.classList.add("active");
        popupForm.innerHTML = `
          <div class="newsletter-success">
            <h3>Aitäh!</h3>
            <p>Teie e-posti aadress lisati infokirja saajate hulka.</p>
          </div>
        `;

        window.setTimeout(function () {
          overlay.classList.remove("active");
        }, 3000);
      }
    } else if (status === "error") {
      localStorage.removeItem("newsletterSubscribed");

      const errorMessage =
        "Liitumine ebaõnnestus. Palun kontrollige aadressi ja proovige uuesti.";

      setText(bottomMessage, errorMessage);

      if (form === "popup") {
        showPopupError(errorMessage);

        if (overlay) {
          overlay.classList.add("active");
        }
      }
    }

    clearNewsletterStatusFromUrl();
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

    let menuIsOpen = false;

    function showMenu() {
      menuIsOpen = true;
      navigation.classList.add("open");
      menuButton.classList.add("active");

      navigation.style.setProperty("display", "flex", "important");
      navigation.style.setProperty("visibility", "visible", "important");
      navigation.style.setProperty("opacity", "1", "important");
      navigation.style.setProperty("pointer-events", "auto", "important");

      menuButton.setAttribute("aria-expanded", "true");
    }

    function hideMenu() {
      menuIsOpen = false;
      navigation.classList.remove("open");
      menuButton.classList.remove("active");

      if (window.innerWidth <= 1100) {
        navigation.style.setProperty("display", "none", "important");
        navigation.style.setProperty("visibility", "hidden", "important");
        navigation.style.setProperty("opacity", "0", "important");
        navigation.style.setProperty("pointer-events", "none", "important");
      }

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

    window.addEventListener("resize", function () {
      if (window.innerWidth > 1100) {
        menuIsOpen = false;
        navigation.classList.remove("open");
        navigation.style.removeProperty("display");
        navigation.style.removeProperty("visibility");
        navigation.style.removeProperty("opacity");
        navigation.style.removeProperty("pointer-events");
        menuButton.classList.remove("active");
        menuButton.setAttribute("aria-expanded", "false");
      } else {
        hideMenu();
      }
    });

    if (window.innerWidth <= 1100) {
      hideMenu();
    }
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
