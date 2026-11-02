(function () {
  'use strict';

  var root = document.documentElement;
  var button = document.getElementById('themeToggle');
  var meta = document.querySelector('meta[name="theme-color"]');

  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function applyTheme(theme, persist) {
    var selected = theme === 'dark' ? 'dark' : 'light';
    root.setAttribute('data-theme', selected);

    if (persist) {
      try {
        localStorage.setItem('sea-algorithm-theme', selected);
      } catch (error) {
        return updateControls(selected);
      }
    }

    updateControls(selected);
  }

  function updateControls(theme) {
    var dark = theme === 'dark';
    if (button) {
      button.textContent = dark ? '☀' : '☾';
      button.setAttribute('aria-pressed', dark ? 'true' : 'false');
      button.setAttribute('aria-label', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
      button.setAttribute('title', dark ? 'Ativar modo claro' : 'Ativar modo escuro');
    }
    if (meta) {
      meta.setAttribute('content', dark ? '#171d19' : '#f2efe7');
    }
  }

  if (button) {
    button.addEventListener('click', function () {
      applyTheme(currentTheme() === 'dark' ? 'light' : 'dark', true);
    });
  }

  window.addEventListener('storage', function (event) {
    if (event.key === 'sea-algorithm-theme') {
      applyTheme(event.newValue === 'dark' ? 'dark' : 'light', false);
    }
  });

  updateControls(currentTheme());
}());
