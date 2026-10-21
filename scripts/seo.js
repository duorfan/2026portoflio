// SEO is applied after snapshot URL rewriting so canonical and sharing URLs stay absolute.
const fs = require('fs');
const path = require('path');
const ORIGIN = 'https://www.duorfan.com';
const PORTRAIT = '/_assets/local/duorfan-profile-pic.jpg';
const PAGES = {
  '/': {
    title: 'Duorfan Fan | AI Product Designer & Builder',
    description: 'Duorfan (Ningyu) Fan designs and builds human-centered AI products. Explore product design, UX research, interactive experiences, and creative technology.',
  },
  '/about-me': {
    title: 'About Duorfan Fan | AI Product Designer & Builder',
    description: 'Meet Duorfan (Ningyu) Fan, an AI product designer and builder with degrees from Duke and NYU Tisch, creating thoughtful digital and physical experiences.',
  },
  '/more-projects-gallery': {
    title: 'Creative Technology & Experiments | Duorfan Fan',
    description: 'Explore creative experiments by Duorfan Fan across AI films, games, physical computing, interactive art, graphic design, and creative technology.',
  },
  '/mornova': {
    title: 'Mornova: AI Morning Assistant | Duorfan Fan',
    description: 'Mornova is an AI morning assistant by Duorfan Fan, combining weather, calendar updates, ambient lighting, and voice prompts in a working prototype.',
    image: '/_assets/cdn.prod.website-files.com/643754b8d27d2714812a10b5/692fe937530f1ae410a0f92c_Mornova_20Final_20Pre.jpg',
  },
  '/scalesocial': {
    title: 'Scale Social: AI UGC Platform | Duorfan Fan',
    description: 'UX research and product design by Duorfan Fan for an AI UGC platform, exploring how automation can support authentic brand content. Access on request.',
    // This case study already asks visitors to request access; keep it out of search.
    noindex: true,
  },
  '/projects/schego': {
    title: 'ScheGo: Campus Transit UX Case Study | Duorfan Fan',
    description: 'A UX research and product design case study by Duorfan Fan: integrating shuttle and subway information to improve commutes between NYU campuses.',
  },
  '/projects/cyco': {
    title: 'CYCO: Costume Rental & Reuse App | Duorfan Fan',
    description: 'Explore CYCO, a product design and UX research project by Duorfan Fan that helps costume lovers recycle worn costumes and rent remade designs.',
  },
  '/projects/ver-coaching': {
    title: 'Ver Coaching: VR Training UX | Duorfan Fan',
    description: 'A UX design case study by Duorfan Fan for VR vision training, making first-time sessions clearer and exploring ways to motivate athletes to return.',
  },
  '/projects/capybara-ai': {
    title: 'Capybara.AI: Fintech Web Design | Duorfan Fan',
    description: 'Web design and front-end development by Duorfan Fan for Capybara.AI, translating an AI-driven fintech product into a clear and engaging web experience.',
  },
  '/projects/self-coded-website': {
    title: 'Web Roots: Front-End Development | Duorfan Fan',
    description: 'Explore Duorfan Fan\'s early web development work, building interactive websites with HTML, CSS, JavaScript, and API integrations.',
  },
  '/projects/chat-itp': {
    title: 'ChatITP: AI Conversation Design | Duorfan Fan',
    description: 'ChatITP is an early conversational interface experiment by Duorfan Fan, exploring natural-language interactions and the OpenAI API.',
  },
};
function escape(value) {
  return value.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function attributes(tag) {
  const attrs = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
    attrs[m[1].toLowerCase()] = m[2] ?? m[3];
  }
  return attrs;
}
function applySeo(html, rel) {
  if (rel.startsWith('_assets/')) return html;
  const route = rel === 'index.html' ? '/' : '/' + rel.replace(/\/index\.html$/, '');
  const page = PAGES[route];
  if (!page) throw new Error(`Missing SEO configuration: ${rel}`);
  const url = ORIGIN + route;
  return html.replace(/<head\b[^>]*>[\s\S]*?<\/head>/i, head => {
    // Retain each case study's original preview image, but make its URL absolute.
    let image = page.image;
    if (!image) {
      for (const tag of head.match(/<meta\b[^>]*>/gi) || []) {
        const attrs = attributes(tag);
        if (attrs.property === 'og:image' && attrs.content) image = attrs.content;
      }
    }
    image = new URL(image || PORTRAIT, ORIGIN).href;
    head = head.replace(/<!-- portfolio-seo:start -->[\s\S]*?<!-- portfolio-seo:end -->\n?/g, '')
      .replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, '')
      .replace(/<meta\b[^>]*>/gi, tag => {
        const attrs = attributes(tag);
        const key = (attrs.name || attrs.property || '').toLowerCase();
        return ['description', 'robots', 'author'].includes(key) || /^(og:|twitter:)/.test(key) ? '' : tag;
      })
      .replace(/<link\b[^>]*>/gi, tag => attributes(tag).rel === 'canonical' ? '' : tag)
      .replace(/<script\b[^>]*id="portfolio-schema"[^>]*>[\s\S]*?<\/script>/gi, '');
    const meta = (key, value, property = false) => `<meta ${property ? 'property' : 'name'}="${key}" content="${escape(value)}">`;
    const tags = [
      `<title>${escape(page.title)}</title>`,
      meta('description', page.description),
      meta('author', 'Duorfan (Ningyu) Fan'),
      meta('robots', page.noindex ? 'noindex, follow' : 'index, follow, max-image-preview:large'),
      `<link rel="canonical" href="${url}">`,
      meta('og:type', 'website', true), meta('og:site_name', 'Duorfan Fan', true),
      meta('og:locale', 'en_US', true), meta('og:url', url, true),
      meta('og:title', page.title, true), meta('og:description', page.description, true),
      meta('og:image', image, true),
      meta('og:image:alt', image === ORIGIN + PORTRAIT ? 'Duorfan Fan' : page.title, true),
      meta('twitter:card', 'summary_large_image'), meta('twitter:title', page.title),
      meta('twitter:description', page.description), meta('twitter:image', image),
      meta('twitter:image:alt', image === ORIGIN + PORTRAIT ? 'Duorfan Fan' : page.title),
    ];
    if (route === '/' || route === '/about-me') {
      const person = {
        '@type': 'Person', '@id': ORIGIN + '/#person', name: 'Duorfan Fan',
        alternateName: 'Ningyu Fan', url: ORIGIN + '/about-me',
        image: ORIGIN + PORTRAIT, jobTitle: 'AI Product Designer & Builder',
        alumniOf: [{ '@type': 'CollegeOrUniversity', name: 'Duke University' }, { '@type': 'CollegeOrUniversity', name: 'New York University' }],
      };
      const schema = { '@context': 'https://schema.org', '@graph': [person, {
        '@type': route === '/' ? 'WebSite' : 'AboutPage', '@id': url + '#page',
        url, name: page.title, description: page.description,
        ...(route === '/' ? { author: { '@id': person['@id'] } } : { mainEntity: { '@id': person['@id'] } }),
      }] };
      tags.push(`<script type="application/ld+json" id="portfolio-schema">${JSON.stringify(schema).replace(/</g, '\\u003c')}</script>`);
    }
    return head.replace(/[ \t]+$/gm, '').replace(/<\/head>/i, '<!-- portfolio-seo:start -->\n' + tags.join('\n') + '\n<!-- portfolio-seo:end -->\n</head>');
  });
}
function writeCrawlFiles(siteDir) {
  const urls = Object.entries(PAGES).filter(([, page]) => !page.noindex)
    .map(([route]) => `  <url><loc>${ORIGIN + route}</loc></url>`).join('\n');
  fs.writeFileSync(path.join(siteDir, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`);
  // Allow crawling of Scale Social so crawlers can see its noindex directive.
  fs.writeFileSync(path.join(siteDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${ORIGIN}/sitemap.xml\n`);
}
module.exports = { applySeo, writeCrawlFiles, PAGES };
