(() => {
  'use strict';
  const make = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text) node.textContent = text;
    return node;
  };
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const write = (key, value) => { try { localStorage.setItem(key, value); } catch { /* Works without browser storage. */ } };
  const pageName = document.body.dataset.page || (/\/research(?:\.html)?\/?$/.test(location.pathname) ? 'research' : 'index');
  const pageTitles = { index: 'Onboarding', research: 'Research', hub: 'Dashboard / HUB' };
  const sections = [...document.querySelectorAll('main section')];
  const header = document.querySelector('header');
  const main = document.querySelector('main');
  main.id = 'main-content';
  const skip = make('a', 'skip-link', 'Skip to content');
  skip.href = '#main-content';
  const sidebar = make('aside', 'sidebar');
  const brand = make('a', 'brand');
  brand.href = '/index.html';
  brand.append(make('span', 'brand-mark', 'b'), make('span', '', 'Bambou'));
  const menu = make('button', 'menu-toggle', 'Contents');
  menu.type = 'button';
  menu.setAttribute('aria-expanded', 'false');
  menu.setAttribute('aria-controls', 'sidebar-content');
  const sidebarBody = make('div', 'sidebar-body');
  sidebarBody.id = 'sidebar-content';
  const pageNav = document.querySelector('body > nav, body > .pages');
  pageNav.className = 'page-nav';
  pageNav.setAttribute('aria-label', 'Guide pages');
  if (pageNav.tagName !== 'NAV') pageNav.setAttribute('role', 'navigation');
  pageNav.querySelectorAll('a').forEach(link => {
    if (new URL(link.href).pathname.replace(/^\//, '').replace(/\.html$/, '') === pageName) link.setAttribute('aria-current', 'page');
  });
  sidebarBody.append(make('p', 'sidebar-caption', 'Project handbook'), pageNav);
  let toc = document.querySelector('body > nav');
  if (!toc) {
    toc = make('nav');
    sections.forEach((section, i) => {
      if (!section.id) section.id = `${pageName}-${i + 1}`;
      const link = make('a', '', section.querySelector('h2').textContent);
      link.href = `#${section.id}`;
      toc.append(link);
    });
  }
  toc.className = 'toc';
  toc.setAttribute('aria-label', 'On this page');
  sidebarBody.append(make('p', 'sidebar-caption', 'On this page'), toc);
  sidebar.append(brand, menu, sidebarBody, make('div', 'sidebar-note', 'Bambou / Developer guide'));
  menu.addEventListener('click', () => {
    const open = sidebar.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
  });
  toc.addEventListener('click', event => {
    if (event.target.closest('a')) {
      sidebar.classList.remove('open');
      menu.setAttribute('aria-expanded', 'false');
    }
  });
  const doc = make('div', 'document');
  const toolbar = make('div', 'toolbar');
  const searchWrap = make('div', 'search-wrap');
  const search = make('input');
  search.type = 'search';
  search.placeholder = 'Search this page…';
  search.setAttribute('aria-label', 'Search guide sections');
  search.setAttribute('aria-controls', 'main-content');
  searchWrap.append(search);
  const theme = make('button', '', 'Dark mode');
  theme.type = 'button';
  const themeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const setTheme = value => {
    document.documentElement.dataset.theme = value;
    theme.textContent = value === 'dark' ? 'Light mode' : 'Dark mode';
    theme.setAttribute('aria-label', `Switch to ${value === 'dark' ? 'light' : 'dark'} mode`);
  };
  setTheme(read('bambou-guide-theme') || (themeQuery.matches ? 'dark' : 'light'));
  theme.addEventListener('click', () => {
    const value = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    setTheme(value);
    write('bambou-guide-theme', value);
  });
  themeQuery.addEventListener('change', event => {
    if (!read('bambou-guide-theme')) setTheme(event.matches ? 'dark' : 'light');
  });
  const print = make('button', 'print-button', 'Print / PDF');
  print.type = 'button';
  print.addEventListener('click', () => window.print());
  toolbar.append(searchWrap, theme, print);
  header.prepend(make('div', 'eyebrow', `Developer guide / ${pageTitles[pageName] || 'Documentation'}`));
  const status = make('p', 'search-status');
  status.setAttribute('role', 'status');
  status.hidden = true;
  const footer = document.querySelector('footer');
  doc.append(toolbar, header, status, main, footer);
  const back = make('a', 'back-top', 'Back to top ↑');
  header.id = 'top';
  back.href = '#top';
  footer.append(make('br'), back);
  const progress = make('div', 'progress');
  progress.setAttribute('aria-hidden', 'true');
  document.body.prepend(skip, progress, sidebar, doc);
  document.body.classList.add('enhanced');
  const texts = sections.map(section => section.textContent.toLocaleLowerCase());
  sections.forEach((section, i) => {
    section.prepend(make('span', 'section-kicker', `Section ${String(i + 1).padStart(2, '0')}`));
    const heading = section.querySelector('h2');
    const anchor = make('a', 'section-anchor', '#');
    anchor.href = `#${section.id}`;
    anchor.setAttribute('aria-label', `Link to ${heading.textContent}`);
    heading.prepend(anchor);
  });
  search.addEventListener('input', () => {
    const words = search.value.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    let count = 0;
    sections.forEach((section, i) => {
      section.hidden = !words.every(word => texts[i].includes(word));
      if (!section.hidden) count++;
    });
    status.hidden = words.length === 0;
    status.textContent = count ? `${count} of ${sections.length} sections match. Clear search to show all.` : 'No matching sections. Try another search.';
  });
  search.addEventListener('keydown', event => {
    if (event.key === 'Escape') { search.value = ''; search.dispatchEvent(new Event('input')); search.blur(); }
  });
  // Following a deep link should always reveal its section, even during a search.
  window.addEventListener('hashchange', () => {
    if (search.value) { search.value = ''; search.dispatchEvent(new Event('input')); }
  });
  const tocLinks = [...toc.querySelectorAll('a')];
  const updateScroll = () => {
    const height = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.transform = `scaleX(${height > 0 ? Math.min(1, window.scrollY / height) : 0})`;
    const visible = sections.filter(section => !section.hidden);
    let current = visible[0];
    for (const section of visible) if (section.getBoundingClientRect().top <= 160) current = section;
    tocLinks.forEach(link => {
      if (current && link.hash === `#${current.id}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  };
  let scheduled = false;
  window.addEventListener('scroll', () => {
    if (!scheduled) { scheduled = true; requestAnimationFrame(() => { updateScroll(); scheduled = false; }); }
  }, { passive: true });
  window.addEventListener('resize', updateScroll);
  const checklist = document.querySelector('.checklist');
  if (checklist) {
    const tools = make('div', 'checklist-tools');
    const counter = make('span');
    counter.setAttribute('role', 'status');
    const reset = make('button', '', 'Reset checklist');
    reset.type = 'button';
    const inputs = [];
    const update = () => { counter.textContent = `${inputs.filter(input => input.checked).length} / ${inputs.length} complete · Saved on this device`; };
    checklist.querySelectorAll('li').forEach((item, i) => {
      const label = make('label');
      const input = make('input');
      input.type = 'checkbox';
      input.checked = read(`bambou-guide-check-${i}`) === 'true';
      const text = make('span');
      while (item.firstChild) text.append(item.firstChild);
      label.append(input, text);
      item.append(label);
      inputs.push(input);
      input.addEventListener('change', () => { write(`bambou-guide-check-${i}`, String(input.checked)); update(); });
    });
    reset.addEventListener('click', () => {
      inputs.forEach((input, i) => { input.checked = false; write(`bambou-guide-check-${i}`, 'false'); });
      update();
    });
    tools.append(counter, reset);
    checklist.after(tools);
    update();
  }
  updateScroll();
})();
