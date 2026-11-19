
/* Presentation only. Authentication and public data actions remain in index.html. */
(function () {
  'use strict';
  if (window.Chart?.defaults?.font) {
    window.Chart.defaults.font.family="'Urbanist', system-ui, sans-serif";
  }
  const root = document.getElementById('lw');
  const access = document.getElementById('gateway-access');
  const forms = document.getElementById('gateway-forms');
  const panels = {admin:document.getElementById('l-admin'), ahli:document.getElementById('l-ahli')};
  if (!root || !access || !forms || root.dataset.gatewayBound) return;
  root.dataset.gatewayBound = 'true';
  let active = 'admin';
  let trigger = null;

  function resetErrors() {
    ['l-err-a','l-err-b'].forEach(id => {
      const element = document.getElementById(id);
      if (element) { element.textContent=''; element.style.display='none'; }
    });
  }

  function showGateway(restoreFocus) {
    showForm('admin',null,false);
    ['lp','l-ahli-p'].forEach(id=>{
      const input=document.getElementById(id);
      input.value='';
      input.type='password';
    });
    root.querySelectorAll('[data-password-toggle]').forEach(button=>{
      button.textContent='Papar';
      button.setAttribute('aria-pressed','false');
      button.setAttribute('aria-label','Papar kata laluan');
    });
    resetErrors();
    if (restoreFocus && trigger) trigger.focus();
  }

  function showForm(kind, button, focus = true) {
    if (!panels[kind]) return;
    trigger = button || document.getElementById(kind==='admin'?'login-admin-tab':'gateway-member');
    active = kind;
    access.hidden = false;
    forms.hidden = false;
    root.classList.add('gateway-login-open');
    Object.entries(panels).forEach(([name,panel])=>{
      panel.hidden=name!==kind;
      panel.style.display=name===kind?'':'none';
    });
    access.querySelectorAll('[data-gateway-action]').forEach(tab=>{
      const selected=tab.dataset.gatewayAction===kind;
      tab.setAttribute('aria-selected',String(selected));
      tab.setAttribute('tabindex',selected?'0':'-1');
    });
    resetErrors();
    if (focus) {
      panels[kind].querySelector('input').focus({preventScroll:true});
      forms.scrollIntoView({block:'nearest',behavior:'instant'});
    }
  }

  // Legacy callers, including the existing LIBRA robot, use this same navigation.
  window.swLogin = function (kind, button) {
    if (kind==='opac') return window.masukOPAC();
    showForm(kind, button);
  };
  window.swL = window.swLogin;
  const previousShowLogin = window.showLogin;
  window.showLogin = function () {
    if (typeof previousShowLogin==='function') previousShowLogin.apply(this,arguments);
    showGateway(false);
  };

  root.addEventListener('click', event=>{
    const button=event.target.closest('[data-gateway-action]');
    if (button) {
      const action=button.dataset.gatewayAction;
      if (action==='admin' || action==='ahli') showForm(action,button);
      else if (action==='opac') window.masukOPAC();
      else if (action==='tempahan') window.bukaTempahanAwam();
    }
    if (event.target.closest('[data-gateway-back]')) showGateway(true);
    const toggle=event.target.closest('[data-password-toggle]');
    if (toggle) {
      const input=document.getElementById(toggle.dataset.passwordToggle);
      const visible=input.type==='password';
      input.type=visible?'text':'password';
      toggle.textContent=visible?'Sembunyi':'Papar';
      toggle.setAttribute('aria-pressed',String(visible));
      toggle.setAttribute('aria-label',(visible?'Sembunyi':'Papar')+' kata laluan');
    }
  });
  Object.entries(panels).forEach(([kind,panel])=>{
    panel.addEventListener('submit', event=>{
      event.preventDefault();
      window.doLogin(kind);
    });
  });
  root.addEventListener('keydown', event=>{
    if (event.target.getAttribute('role')==='tab' && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) {
      event.preventDefault();
      const kind=event.key==='Home'?'admin':event.key==='End'?'ahli':active==='admin'?'ahli':'admin';
      showForm(kind,null,false);
      access.querySelector('[data-gateway-action="'+kind+'"]').focus();
    }
    if (event.key==='Escape' && active) {event.preventDefault();showGateway(true);}
  });
  showGateway(false);
})();
