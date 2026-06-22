/**
 * index.js — Portfolio interactivity
 *
 * Responsibilities:
 *  1. Project cards → floating canvas case-study overlay
 *     · open on click (card or any child)
 *     · close via ✕ button / Escape key / clicking the dark framing backdrop
 *  2. Drag-to-scroll on the horizontal projects track
 *  3. Navbar scroll-state class for future styling hooks
 */

document.addEventListener('DOMContentLoaded', () => {

  /* ─── Element references ───────────────────────────────── */
  const backdrop     = document.getElementById('projectModal');   // .canvas-backdrop
  const canvasBody   = document.getElementById('modalScroll');    // .canvas-body
  const closeBtn     = document.getElementById('modalClose');     // .canvas-close
  const projectCards = document.querySelectorAll('.project-card');
  const scrollTrack  = document.getElementById('projectsScroll'); // .projects-scroll-container

  /* Guard — if essential elements are missing, bail gracefully */
  if (!backdrop || !canvasBody || !closeBtn) return;

  /* ─── 1. CANVAS OPEN / CLOSE ───────────────────────────── */

  /**
   * openCanvas(card)
   * Reads the hidden `.project-modal-data` inside a card,
   * injects its HTML into the canvas body, then reveals the overlay.
   */
  function openCanvas(card) {
    const dataEl = card.querySelector('.project-modal-data');
    if (!dataEl) return;

    // Clone so we never disturb the source DOM
    canvasBody.innerHTML = dataEl.innerHTML;

    // Reveal
    backdrop.classList.add('is-open');
    document.body.classList.add('modal-open');

    // Return focus to close button for accessibility
    closeBtn.focus();
  }

  /**
   * closeCanvas()
   * Hides the overlay. Content is cleared after the CSS transition
   * finishes so there's no flash of empty panel during the fade-out.
   */
  function closeCanvas() {
    backdrop.classList.remove('is-open');
    document.body.classList.remove('modal-open');

    // Wait for opacity transition (350 ms) before clearing content
    setTimeout(() => {
      canvasBody.innerHTML = '';
    }, 380);
  }

  /* Wire up project cards */
  projectCards.forEach(card => {
    card.addEventListener('click', () => openCanvas(card));

    // Keyboard accessibility — open with Enter / Space
    card.setAttribute('tabindex', '0');
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openCanvas(card);
      }
    });
  });

  /* Close button */
  closeBtn.addEventListener('click', closeCanvas);

  /* Escape key */
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && backdrop.classList.contains('is-open')) {
      closeCanvas();
    }
  });

  /**
   * Click on the dark framing backdrop closes the canvas.
   * We must NOT close when the click lands inside .canvas-panel —
   * use the `.canvas-frame` / `.canvas-backdrop::before` as the
   * hit target by checking that the click target is the backdrop
   * itself or its pseudo-element container (the backdrop div).
   *
   * Because ::before is not a real DOM node, any click that
   * bubbles up to .canvas-backdrop without passing through
   * .canvas-panel counts as a backdrop click.
   */
  backdrop.addEventListener('click', e => {
    // If the click originated inside .canvas-panel, ignore it
    const panel = backdrop.querySelector('.canvas-panel');
    if (panel && panel.contains(e.target)) return;
    closeCanvas();
  });


  /* ─── 2. DRAG-TO-SCROLL ────────────────────────────────── */

  if (!scrollTrack) return;

  let isDragging = false;
  let dragStartX = 0;
  let dragScrollLeft = 0;
  /* Track total drag distance to distinguish a click from a drag */
  let dragDistance = 0;
  const DRAG_THRESHOLD = 6; // px — less than this is treated as a click

  scrollTrack.addEventListener('mousedown', e => {
    // Ignore clicks on buttons / links inside cards
    if (e.target.closest('a, button')) return;

    isDragging    = true;
    dragDistance  = 0;
    dragStartX    = e.pageX - scrollTrack.getBoundingClientRect().left;
    dragScrollLeft = scrollTrack.scrollLeft;

    scrollTrack.classList.add('is-dragging');
  });

  window.addEventListener('mousemove', e => {
    if (!isDragging) return;
    e.preventDefault();

    const x    = e.pageX - scrollTrack.getBoundingClientRect().left;
    const walk = x - dragStartX;
    dragDistance = Math.abs(walk);

    scrollTrack.scrollLeft = dragScrollLeft - walk;
  });

  window.addEventListener('mouseup', () => {
    if (!isDragging) return;
    isDragging = false;
    scrollTrack.classList.remove('is-dragging');
  });

  /**
   * Prevent card click from firing when the user was drag-scrolling.
   * We intercept the click event during capture phase on the track;
   * if a meaningful drag occurred we stop propagation.
   */
  scrollTrack.addEventListener('click', e => {
    if (dragDistance > DRAG_THRESHOLD) {
      e.stopPropagation();
      dragDistance = 0;
    }
  }, true /* capture */);


  /* ─── 3. NAVBAR SCROLL STATE ───────────────────────────── */

  const navbar = document.getElementById('navbar');
  if (navbar) {
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
  }

});
