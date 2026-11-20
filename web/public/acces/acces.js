/**
 * Page d'accès au site réservé aux invités.
 * Lien direct possible : /acces/?code=MOTDEPASSE (par exemple dans un QR code sur le faire-part).
 */
'use strict';

(() => {
  const params = new URLSearchParams(location.search);
  // Retour vers la page demandée (chemin interne uniquement)
  const r = params.get('r') || '/';
  const target = /^\/(?!\/)/.test(r) && !r.startsWith('/acces') ? r : '/';

  async function post(password) {
    const res = await fetch('/api/access/login', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const form = document.getElementById('access-form');
    const error = document.getElementById('access-error');
    const btn = form.querySelector('button');

    const submit = async (password) => {
      error.textContent = '';
      btn.disabled = true;
      try {
        await post(password);
        location.replace(target);
      } catch (err) {
        error.textContent = err.message;
        btn.disabled = false;
      }
    };

    // Accès libre ou déjà connecté : directement au site
    try {
      const st = await (await fetch('/api/access/status', { credentials: 'same-origin' })).json();
      if (st.granted) { location.replace(target); return; }
    } catch { /* on affiche le formulaire */ }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      submit(form.elements.password.value);
    });

    const code = params.get('code');
    if (code) {
      history.replaceState(null, '', location.pathname + (params.get('r') ? '?r=' + encodeURIComponent(params.get('r')) : ''));
      form.elements.password.value = code;
      submit(code);
    }
  });
})();
