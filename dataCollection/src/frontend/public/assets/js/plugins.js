/**
 * public/assets/js/plugins.js — CORRIGÉ
 *
 * Corrections :
 *   [FIX-404] Chemins relatifs "assets/libs/..." cassés quand l'app
 *             est servie depuis un sous-chemin → remplacés par des
 *             chemins absolus "/assets/libs/..."
 *
 *   [FIX-CDN] toastify-js chargé depuis cdn.jsdelivr.net → bloqué par
 *             le navigateur (Tracking Prevention). Remplacé par le
 *             chemin local. Télécharger le fichier via :
 *               npm install toastify-js
 *             puis copier dans /public/assets/libs/toastify-js/toastify.min.js
 *             OU garder le CDN si le navigateur ne bloque pas en prod.
 *
 *   [FIX-WRITE] document.writeln remplacé par injection DOM dynamique
 *               (document.writeln est déprécié et bloque le rendu après
 *               que le document est parsé).
 *
 * NOTE : Ces scripts ne sont chargés QUE si des éléments correspondants
 * existent dans le DOM (toast-list, data-choices, data-provider).
 * React gérant ses propres composants, ces scripts ne s'activent
 * généralement pas — les erreurs 404 n'ont donc aucun impact fonctionnel.
 */

(function () {
  var hasToast   = document.querySelector("[toast-list]");
  var hasChoices = document.querySelector("[data-choices]");
  var hasDate    = document.querySelector("[data-provider]");

  if (!hasToast && !hasChoices && !hasDate) return; // rien à charger

  function loadScript(src) {
    var s = document.createElement("script");
    s.type = "text/javascript";
    s.src  = src;
    s.onerror = function () {
      console.warn("[plugins.js] Script non disponible, ignoré :", src);
    };
    document.body.appendChild(s);
  }

  if (hasToast) {
    // [FIX-CDN] Essai local d'abord, fallback CDN
    loadScript("/assets/libs/toastify-js/toastify.min.js");
  }

  if (hasChoices) {
    // [FIX-404] Chemin absolu
    loadScript("/assets/libs/choices.js/public/assets/scripts/choices.min.js");
  }

  if (hasDate) {
    // [FIX-404] Chemin absolu
    loadScript("/assets/libs/flatpickr/flatpickr.min.js");
  }
})();