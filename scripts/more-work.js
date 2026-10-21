'use strict';

// Build the home gallery from the existing, URL-rewritten More page. This keeps
// original destinations and media tied to the captured project records.
const CATEGORIES = [
  ['all', 'All'],
  ['product', 'Product & web'],
  ['interactive', 'AI & interactive'],
  ['physical', 'Physical'],
  ['film', 'Film & performance'],
  ['visual', 'Visual design'],
];
const LEGACY_CATEGORIES = {
  games: ['interactive'], av: ['film'], physical: ['physical'],
  graphic: ['visual'], ai: ['interactive'], ui: ['product'],
  'ai-film': ['film', 'interactive'],
};
const INITIAL_TITLES = ['Appear', 'Depersonalization', 'Ver Coaching', 'Capybara.AI', 'CYCO', 'Space We Call Home'];
const OMITTED_TITLES = new Set(['Printed Fate', '3050']);
const PROFESSIONAL_SLUGS = ['/projects/ver-coaching', '/projects/capybara-ai', '/projects/cyco'];
const PROFESSIONAL_COPY = {
  '/projects/ver-coaching': ['VR training UX', 'Making first-time VR vision training clearer for athletes.'],
  '/projects/capybara-ai': ['Web design · Front-end', 'A web experience for an AI-driven fintech product.'],
  '/projects/cyco': ['Product design · UX research', 'An app concept for costume rental, reuse, and remade designs.'],
};
const PRESENTATION = {
  Appear: { label: 'Wearable interaction', description: 'Exploring closeness through warmth, pressure, and color-changing fabric.', image: '/_assets/local/appear-hero.webp', size: [1800, 1201] },
  Depersonalization: { label: 'Audiovisual performance', description: 'Digital distraction explored through wearable sensing, waveforms, and light.', image: '/_assets/local/depersonalization-hero.webp', size: [1513, 791] },
  Upload: { label: 'Motion capture', description: 'A motion-capture experiment made with Unreal Engine.', size: [1920, 1080] },
  'Welcome to Hogwarts': { label: 'Interactive game', description: 'Hand-pose interaction, machine learning, and p5.js.', image: '/_assets/local/more-work-hogwarts.webp', size: [600, 332] },
  'NYU Free T-shirt': { label: 'Interface design', description: 'A Figma prototype for the NYU free T-shirt experience.', image: '/_assets/local/more-work-nyu-shirt.webp', size: [640, 480] },
  'Alter Ego': { label: 'Interactive VR installation', description: 'An exploration with Blender, Unreal Engine, and Meta Quest.', size: [600, 332] },
  'Flappy Heart': { label: 'Physical game', description: 'An interactive game connecting Unity and Arduino.', image: '/_assets/local/more-work-flappy-heart.webp', size: [600, 332] },
  'Cinderella has BIG feet?': { label: 'Illustration · Comics', description: 'A comic illustrated in Procreate.', size: [1417, 784] },
  'Unreal Engine Micro Movie': { label: 'Performative avatar', description: 'A short moving-image experiment in Unreal Engine.', image: '/_assets/local/more-work-unreal-movie.webp', size: [600, 332] },
  'Balance Station': { label: 'Product · Interface design', description: 'A material exploration using acrylic, clay, and Blender.', size: [600, 332] },
  'Space We Call Home': { label: 'AI film', description: 'A generative film made with Runway, Midjourney, and Premiere.', image: '/_assets/local/more-work-space-home.webp', size: [600, 332] },
  'Garbage Ninja': { label: 'Physical game', description: 'Garbage classification explored through Arduino and Processing.', size: [1304, 710] },
  'Information Design': { label: 'Data visualization', description: 'A story told through data visualization and scrollytelling.' },
  Typography: { label: 'Editorial design', description: 'Experiments in magazine and booklet design.', size: [1908, 1368] },
  'Yearbook Design': { label: 'Editorial design', description: 'A yearbook created with InDesign, Photoshop, Illustrator, and Procreate.', size: [670, 408] },
  'Stage Costume': { label: 'Costume design', description: 'Costume making and sewing for the stage.', size: [700, 402] },
  'Yaoud Medicine': { label: 'Interface design', description: 'An interface design and troubleshooting project.', size: [1828, 1024] },
  'Jewelery Organizer': { label: 'Digital fabrication', description: 'A jewelry organizer designed in Illustrator and laser-cut.', size: [814, 584] },
  'Happy Christmas': { label: 'Digital fabrication', description: 'A festive object made with laser-cut acrylic.', size: [1410, 980] },
};

function decode(value) {
  return String(value).replace(/&(#x[0-9a-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (_, entity) => {
    if (entity[0] === '#') {
      const number = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
      return number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : '';
    }
    return { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[entity.toLowerCase()];
  });
}
function escape(value) {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}
function attr(tag, name) {
  const match = tag.match(new RegExp('\\b' + name + '\\s*=\\s*(["\'])([\\s\\S]*?)\\1', 'i'));
  return match ? decode(match[2]) : '';
}
function text(html) { return decode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim(); }
function validUrl(value) { return /^(?:https?:\/\/|\/(?!\/))/.test(value); }
function slug(value) { return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); }

function extractCards(html) {
  const cards = [];
  const starts = /<div\b[^>]*class=["'][^"']*\bcollection-item-2\b[^"']*["'][^>]*>/gi;
  let start;
  while ((start = starts.exec(html))) {
    const divs = /<\/?div\b[^>]*>/gi;
    divs.lastIndex = starts.lastIndex;
    let depth = 1;
    let end;
    while (depth && (end = divs.exec(html))) depth += /^<\//.test(end[0]) ? -1 : 1;
    if (depth) throw new Error('More work: an existing gallery card has unbalanced div markup.');
    const card = html.slice(start.index, divs.lastIndex);
    starts.lastIndex = divs.lastIndex;
    const titleMatch = card.match(/<h[1-6]\b[^>]*class=["'][^"']*\bproject-title\b[^"']*["'][^>]*>([\s\S]*?)<\/h[1-6]>/i);
    const link = card.match(/<a\b[^>]*>/i);
    const image = card.match(/<img\b[^>]*>/i);
    const title = titleMatch ? text(titleMatch[1]) : '';
    if (!title || OMITTED_TITLES.has(title) || !link || !image) continue;
    const href = attr(link[0], 'href');
    const originalImage = attr(image[0], 'src');
    if (!validUrl(href) || !validUrl(originalImage)) continue;
    const oldTags = attr(start[0], 'data-tags').split(/\s+/).filter(Boolean);
    const categories = [...new Set(oldTags.flatMap(tag => LEGACY_CATEGORIES[tag] || []))];
    if (!categories.length) throw new Error(`More work: ${title} has no known gallery category. Pass applyMorePagePatches output.`);
    const presentation = PRESENTATION[title] || {};
    const originalDescription = card.match(/<p\b[^>]*class=["'][^"']*\btag\b[^"']*["'][^>]*>([\s\S]*?)<\/p>/i);
    cards.push({ title, href, originalImage, categories,
      image: presentation.image || originalImage,
      alt: attr(image[0], 'alt') || `${title} project preview`,
      external: attr(link[0], 'target') === '_blank',
      label: presentation.label || CATEGORIES.find(([id]) => id === categories[0])[1],
      description: presentation.description || (originalDescription ? text(originalDescription[1]) : ''),
      size: presentation.size,
    });
  }
  if (!cards.length) throw new Error('More work: no usable gallery cards found.');
  return cards;
}

function renderCard(card) {
  const id = `more-work-${slug(card.title)}`;
  const target = card.external ? ' target="_blank" rel="noopener noreferrer"' : '';
  const dimensions = card.size ? ` width="${card.size[0]}" height="${card.size[1]}"` : '';
  const destination = /^(?:\/projects\/|\/mornova|\/scalesocial)/.test(card.href) ? 'Case study' : /youtu(?:be\.com|\.be)|vimeo\.com/.test(card.href) ? 'Watch film' : /figma\.com/.test(card.href) ? 'View prototype' : /drive\.google\.com/.test(card.href) ? 'Project document' : 'Explore project';
  const mediaClass = card.title === 'Depersonalization' ? ' more-work-media-wide' : '';
  return `<article class="more-work-card" data-gallery-category="${escape(card.categories.join(' '))}" data-portfolio-reveal="card" role="listitem">
  <a class="more-work-link" href="${escape(card.href)}" aria-labelledby="${id}"${target}>
    <div class="more-work-media${mediaClass}"><img src="${escape(card.image)}" data-original-media="${escape(card.originalImage)}"${dimensions} alt="${escape(card.alt)}" loading="lazy" decoding="async"></div>
    <div class="more-work-copy"><p class="more-work-kind">${escape(card.label)}</p><div class="more-work-title-row"><h3 id="${id}">${escape(card.title)}</h3><span class="more-work-arrow" aria-hidden="true">${card.external ? '↗' : '→'}</span></div><p class="more-work-description">${escape(card.description)}</p><p class="more-work-format">${destination}${card.external ? ' <span aria-hidden="true">↗</span>' : ''}</p>${card.external ? '<span class="more-work-sr-only">Opens in a new tab.</span>' : ''}</div>
  </a>
</article>`;
}

/**
 * @param {string} patchedMoreHtml URL-rewritten output of applyMorePagePatches.
 * @param {{projects: Array<{slug:string,title:string,img:string}>}} options
 * @returns {string} Complete, progressively enhanced #more-work section.
 */
function renderMoreWork(patchedMoreHtml, { projects = [] } = {}) {
  const legacy = extractCards(patchedMoreHtml);
  const professional = PROFESSIONAL_SLUGS.map(path => {
    const project = projects.find(item => item.slug === path);
    if (!project || !validUrl(project.img || '')) throw new Error(`More work: missing PROJECT_REGISTRY image for ${path}.`);
    const [label, description] = PROFESSIONAL_COPY[path];
    return { title: project.title, href: project.slug, image: project.img, originalImage: project.img,
      alt: `${project.title} project preview`, categories: ['product'], label, description,
      size: path === '/projects/capybara-ai' ? [2000, 1125] : [1920, 1080], external: false };
  });
  const unique = [];
  const seenTitles = new Set();
  const seenUrls = new Set();
  for (const card of [...legacy, ...professional]) {
    const key = card.title.trim().toLowerCase();
    if (seenTitles.has(key) || seenUrls.has(card.href)) continue;
    seenTitles.add(key); seenUrls.add(card.href); unique.push(card);
  }
  const featured = INITIAL_TITLES.map(title => {
    const card = unique.find(item => item.title === title);
    if (!card) throw new Error(`More work: initial gallery card ${title} is missing.`);
    return card;
  });
  const ordered = [...featured, ...unique.filter(card => !INITIAL_TITLES.includes(card.title))];
  const buttons = CATEGORIES.map(([id, label]) => `<button class="more-work-filter" type="button" data-work-filter="${id}" aria-pressed="${id === 'all'}" aria-controls="more-work-grid">${escape(label)}</button>`).join('\n      ');
  return `<section id="more-work" class="more-work" aria-labelledby="more-work-title">
  <div class="more-work-inner w-container">
    <header class="more-work-heading" data-portfolio-reveal><div><p class="more-work-eyebrow">A wider practice</p><h2 id="more-work-title">More work</h2><p class="more-work-intro">Products, playful experiments, and things made by hand.</p></div><p class="more-work-count" role="status" aria-live="polite" aria-atomic="true">${ordered.length} projects</p></header>
    <div class="more-work-controls" hidden><div class="more-work-filters" role="group" aria-label="Filter more work">
      ${buttons}
    </div></div>
    <div id="more-work-grid" class="more-work-grid" role="list">
${ordered.map(renderCard).join('\n')}
    </div>
    <p class="more-work-empty" hidden>No projects in this category yet. Try another category or choose All.</p>
    <div class="more-work-toggle-wrap"><button class="more-work-toggle" type="button" aria-controls="more-work-grid" aria-expanded="true" hidden>Show less</button></div>
  </div>
</section>`;
}

module.exports = { renderMoreWork };
