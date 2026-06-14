console.log("Website is working");

document.addEventListener("DOMContentLoaded", function () {
  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  /* ========================= */
  /* POPUP NEWSLETTER */
  /* ========================= */

  const overlay = document.getElementById("newsletterOverlay");
  const closeButton = document.getElementById("newsletterClose");
  const form = document.getElementById("newsletterForm");
  const emailInput = document.getElementById("newsletterEmail");
  const consentInput = document.getElementById("newsletterConsent");
  const errorBox = document.getElementById("newsletterError");

  if (overlay && closeButton && form && emailInput && consentInput && errorBox) {
    const popupWasClosed = localStorage.getItem("newsletterPopupClosed");
    const userSubscribed = localStorage.getItem("newsletterSubscribed");

    if (!popupWasClosed && !userSubscribed) {
      setTimeout(function () {
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

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const email = emailInput.value.trim();
      const consent = consentInput.checked;

      hideError();

      if (!isValidEmail(email)) {
        showError("Palun sisestage korrektne e-posti aadress.");
        return;
      }

      if (!consent) {
        showError("Infokirjaga liitumiseks tuleb anda nõusolek.");
        return;
      }

      localStorage.setItem("newsletterSubscribed", "true");

      form.innerHTML = `
        <div class="newsletter-success">
          <h3>Aitäh!</h3>
          <p>Teie e-posti aadress on vastu võetud.</p>
        </div>
      `;

      setTimeout(function () {
        overlay.classList.remove("active");
      }, 2500);
    });

    function closeNewsletterPopup() {
      overlay.classList.remove("active");
      localStorage.setItem("newsletterPopupClosed", "true");
    }

    function showError(message) {
      errorBox.textContent = message;
      errorBox.classList.add("active");
    }

    function hideError() {
      errorBox.textContent = "";
      errorBox.classList.remove("active");
    }
  }

  /* ========================= */
  /* BOTTOM NEWSLETTER */
  /* ========================= */

  const bottomForm = document.getElementById("bottomNewsletterForm");
  const bottomEmail = document.getElementById("bottomNewsletterEmail");
  const bottomConsent = document.getElementById("bottomNewsletterConsent");
  const bottomMessage = document.getElementById("bottomNewsletterMessage");

  if (bottomForm && bottomEmail && bottomConsent && bottomMessage) {
    bottomForm.addEventListener("submit", function (event) {
      event.preventDefault();

      const email = bottomEmail.value.trim();
      const consent = bottomConsent.checked;

      bottomMessage.textContent = "";

      if (!isValidEmail(email)) {
        bottomMessage.textContent =
          "Palun sisestage korrektne e-posti aadress.";
        return;
      }

      if (!consent) {
        bottomMessage.textContent =
          "Infokirjaga liitumiseks tuleb anda nõusolek.";
        return;
      }

      localStorage.setItem("newsletterSubscribed", "true");

      bottomMessage.textContent =
        "Aitäh! Teie e-posti aadress on vastu võetud.";

      bottomEmail.value = "";
      bottomConsent.checked = false;
    });
  }

  /* ========================= */
  /* GALA COUNTDOWN */
  /* ========================= */

  const countdown = document.getElementById("galaCountdown");

  if (countdown) {
    const targetDate = new Date(
      countdown.dataset.eventDate
    ).getTime();

    const daysElement = document.getElementById("countdownDays");
    const hoursElement = document.getElementById("countdownHours");
    const minutesElement = document.getElementById("countdownMinutes");
    const secondsElement = document.getElementById("countdownSeconds");
    const finishedElement = document.getElementById("countdownFinished");

    if (
      daysElement &&
      hoursElement &&
      minutesElement &&
      secondsElement &&
      finishedElement
    ) {
      let timerId = null;

      function updateCountdown() {
        if (Number.isNaN(targetDate)) {
          finishedElement.textContent =
            "Sündmuse kuupäev ei ole õigesti määratud.";

          console.error(
            "Incorrect event date:",
            countdown.dataset.eventDate
          );

          return;
        }

        const remainingTime = targetDate - Date.now();

        if (remainingTime <= 0) {
          daysElement.textContent = "00";
          hoursElement.textContent = "00";
          minutesElement.textContent = "00";
          secondsElement.textContent = "00";

          finishedElement.textContent =
            "Kandidaatide esitamise aeg on läbi!";

          if (timerId !== null) {
            clearInterval(timerId);
          }

          return;
        }

        const days = Math.floor(
          remainingTime / (1000 * 60 * 60 * 24)
        );

        const hours = Math.floor(
          (remainingTime % (1000 * 60 * 60 * 24)) /
            (1000 * 60 * 60)
        );

        const minutes = Math.floor(
          (remainingTime % (1000 * 60 * 60)) /
            (1000 * 60)
        );

        const seconds = Math.floor(
          (remainingTime % (1000 * 60)) / 1000
        );

        daysElement.textContent = String(days).padStart(2, "0");
        hoursElement.textContent = String(hours).padStart(2, "0");
        minutesElement.textContent = String(minutes).padStart(2, "0");
        secondsElement.textContent = String(seconds).padStart(2, "0");
      }

      updateCountdown();

      if (!Number.isNaN(targetDate) && targetDate > Date.now()) {
        timerId = setInterval(updateCountdown, 1000);
      }
    } else {
      console.error("Countdown elements were not found in HTML.");
    }
  }
});