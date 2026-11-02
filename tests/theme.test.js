'use strict';

var assert = require('assert');
var fs = require('fs');
var vm = require('vm');
var code = fs.readFileSync(__dirname + '/../js/theme.js', 'utf8');
var values = {};
var handlers = {};
var button = {
  textContent: '',
  attributes: {},
  listeners: {},
  setAttribute: function (key, value) { this.attributes[key] = value; },
  addEventListener: function (key, handler) { this.listeners[key] = handler; }
};
var meta = { attributes: {}, setAttribute: function (key, value) { this.attributes[key] = value; } };
var root = {
  attributes: { 'data-theme': 'light' },
  getAttribute: function (key) { return this.attributes[key] || null; },
  setAttribute: function (key, value) { this.attributes[key] = value; }
};
var document = {
  documentElement: root,
  getElementById: function (id) { return id === 'themeToggle' ? button : null; },
  querySelector: function (selector) { return selector === 'meta[name="theme-color"]' ? meta : null; }
};
var localStorage = {
  getItem: function (key) { return values[key] || null; },
  setItem: function (key, value) { values[key] = value; }
};
var window = { addEventListener: function (key, handler) { handlers[key] = handler; } };

vm.runInNewContext(code, { document: document, window: window, localStorage: localStorage });
assert.strictEqual(button.textContent, '☾');
assert.strictEqual(button.attributes['aria-pressed'], 'false');
button.listeners.click();
assert.strictEqual(root.attributes['data-theme'], 'dark');
assert.strictEqual(values['sea-algorithm-theme'], 'dark');
assert.strictEqual(button.textContent, '☀');
assert.strictEqual(meta.attributes.content, '#171d19');
handlers.storage({ key: 'sea-algorithm-theme', newValue: 'light' });
assert.strictEqual(root.attributes['data-theme'], 'light');
assert.strictEqual(button.textContent, '☾');
assert.strictEqual(meta.attributes.content, '#f2efe7');
console.log('PASS: alternância, persistência, rótulos acessíveis e sincronização de tema validados.');
