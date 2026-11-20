// Page motion. story.js owns the 3D scroll story; this file owns Lenis and the content sections.
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
if (window.gsap && window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
window.__scrollTo = y => (window.lenis ? window.lenis.scrollTo(y, { immediate: true }) : scrollTo(0, y));   // screenshot checks

if (window.gsap && window.ScrollTrigger && !reduce) {
  if (window.Lenis) {
    const lenis = window.lenis = new Lenis({ anchors: true, lerp: 0.09 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
  }

  document.querySelectorAll('[data-count]').forEach(el => {
    const o = { v: 0 }, end = +el.dataset.count;
    gsap.to(o, { v: end, duration: 1.6, ease: 'power2.out', onUpdate: () => { el.textContent = Math.round(o.v); },
      scrollTrigger: { trigger: el, start: 'top 90%', once: true } });
  });

  gsap.utils.toArray('.section-head > *, .about-copy > *, .more, .box').forEach(el =>
    gsap.from(el, { y: 36, opacity: 0, duration: .9, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 88%', once: true } }));

  ['.product', '.brands article'].forEach(sel => ScrollTrigger.batch(sel, { start: 'top 92%', once: true,
    onEnter: b => gsap.from(b, { y: 50, opacity: 0, duration: .8, stagger: .07, ease: 'power3.out' }) }));

  gsap.from('.about-media img', { scale: 1.15, ease: 'none', scrollTrigger: { trigger: '.about', start: 'top bottom', end: 'bottom top', scrub: true } });
}
