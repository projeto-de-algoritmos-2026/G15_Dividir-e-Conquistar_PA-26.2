(function () {
  'use strict';
  var links = document.querySelectorAll('.main-nav a');
  links.forEach(function (link) {
    if (link.href === window.location.href) link.setAttribute('aria-current', 'page');
  });
}());
