'use strict';

const specimen = document.querySelector('#specimen');
const swatches = document.querySelector('#swatches');
const feedback = document.querySelector('#kit-feedback');
const paletteButtons = Array.from(document.querySelectorAll('[data-palette]'));
const tokens = [
  ['brand-red', 'Фирменный красный'], ['primary', 'Действия'], ['violet', 'Фиолетовый из референса'],
  ['lavender', 'Лавандовый'], ['lilac', 'Лиловый'], ['ice', 'Ледяной голубой'],
  ['danger', 'P1 и просрочка'], ['warning', 'SLA под риском'], ['green', 'Решён'],
  ['ink', 'Текст'], ['canvas', 'Фон'], ['surface', 'Карточки']
];

function showPalette(theme) {
  specimen.dataset.theme = theme;
  const styles = getComputedStyle(specimen);
  swatches.innerHTML = tokens.map(([token, label]) => {
    const color = styles.getPropertyValue('--' + token).trim().toUpperCase();
    return `<div class="swatch"><i style="background:var(--${token})"></i><strong>${label}</strong><code>${escapeHtml(color)}</code></div>`;
  }).join('');
  paletteButtons.forEach(button => button.setAttribute('aria-pressed', button.dataset.palette === theme));
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (button?.dataset.palette) showPalette(button.dataset.palette);
  if (button?.dataset.feedback) feedback.textContent = button.dataset.feedback;
});

showPalette('lilac');
