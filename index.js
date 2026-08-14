/**
 * index.js — Portfolio interactivity
 *
 *  1. Project cards → case-study overlay (open, close, focus management)
 *  2. Drag-to-scroll on the horizontal projects rail
 *  3. Navbar scroll state
 *  4. Mobile menu dismissal
 */

document.addEventListener('DOMContentLoaded', () => {

    /* ═══ 1. CASE-STUDY OVERLAY ═══════════════════════════════ */

    const backdrop = document.getElementById('projectModal');
    const canvasBody = document.getElementById('modalScroll');
    const closeBtn = document.getElementById('modalClose');
    const panel = backdrop && backdrop.querySelector('.canvas-panel');
    const projectCards = document.querySelectorAll('.project-card');

    if (backdrop && canvasBody && closeBtn && panel) {

        /* Element that had focus before opening, so we can restore it on close. */
        let lastFocused = null;

        const FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

        function openCanvas(card) {
            const data = card.querySelector('.project-modal-data');
            if (!data) return;

            lastFocused = document.activeElement;
            canvasBody.innerHTML = data.innerHTML;
            canvasBody.scrollTop = 0;

            backdrop.hidden = false;
            /* Force a reflow so the opacity transition runs from its start value. */
            void backdrop.offsetWidth;
            backdrop.classList.add('is-open');
            document.body.classList.add('modal-open');

            /* The stylesheet flips visibility with no delay on open, so the
               close button is focusable immediately. */
            closeBtn.focus();
        }

        function closeCanvas() {
            if (!backdrop.classList.contains('is-open')) return;

            backdrop.classList.remove('is-open');
            document.body.classList.remove('modal-open');

            if (lastFocused) lastFocused.focus();

            /* Clear content once the fade-out has finished. */
            window.setTimeout(() => {
                if (!backdrop.classList.contains('is-open')) {
                    backdrop.hidden = true;
                    canvasBody.innerHTML = '';
                }
            }, 320);
        }

        projectCards.forEach(card => {
            card.addEventListener('click', () => openCanvas(card));
            card.addEventListener('keydown', e => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openCanvas(card);
                }
            });
        });

        closeBtn.addEventListener('click', closeCanvas);

        /* Clicking the framing area — anything outside the panel — closes. */
        backdrop.addEventListener('click', e => {
            if (!panel.contains(e.target)) closeCanvas();
        });

        /* Escape closes; Tab is trapped inside the panel while open. */
        document.addEventListener('keydown', e => {
            if (!backdrop.classList.contains('is-open')) return;

            if (e.key === 'Escape') {
                closeCanvas();
                return;
            }

            if (e.key !== 'Tab') return;

            const items = Array.from(panel.querySelectorAll(FOCUSABLE))
                .filter(el => el.offsetParent !== null);
            if (!items.length) return;

            const first = items[0];
            const last = items[items.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        });
    }


    /* ═══ 2. DRAG-TO-SCROLL RAIL ══════════════════════════════ */

    const rail = document.getElementById('projectsScroll');

    if (rail) {
        let isDragging = false;
        let startX = 0;
        let startScroll = 0;
        let dragDistance = 0;

        /* Below this, the gesture counts as a click rather than a drag. */
        const DRAG_THRESHOLD = 6;

        rail.addEventListener('mousedown', e => {
            /* Left button only, and never on an interactive child. */
            if (e.button !== 0 || e.target.closest('a, button')) return;

            isDragging = true;
            dragDistance = 0;
            startX = e.pageX;
            startScroll = rail.scrollLeft;
        });

        window.addEventListener('mousemove', e => {
            if (!isDragging) return;

            const walk = e.pageX - startX;
            dragDistance = Math.abs(walk);

            /* Only claim the gesture once it is clearly a drag, so short
               presses still behave like clicks and text stays selectable. */
            if (dragDistance > DRAG_THRESHOLD) {
                e.preventDefault();
                rail.classList.add('is-dragging');
                rail.scrollLeft = startScroll - walk;
            }
        });

        window.addEventListener('mouseup', () => {
            if (!isDragging) return;
            isDragging = false;
            rail.classList.remove('is-dragging');
        });

        /* Swallow the click that ends a drag, so releasing over a card
           does not also open its case study. */
        rail.addEventListener('click', e => {
            if (dragDistance > DRAG_THRESHOLD) {
                e.stopPropagation();
                e.preventDefault();
                dragDistance = 0;
            }
        }, true);

        /* Keep the native drag-image from appearing when dragging over images. */
        rail.addEventListener('dragstart', e => e.preventDefault());
    }


    /* ═══ 3. NAVBAR SCROLL STATE ══════════════════════════════ */

    const navbar = document.getElementById('navbar');

    if (navbar) {
        const onScroll = () => {
            navbar.classList.toggle('scrolled', window.scrollY > 24);
        };
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
    }


    /* ═══ 4. MOBILE MENU ══════════════════════════════════════ */

    const menuToggle = document.getElementById('menu-toggle');

    if (menuToggle) {
        /* Close the menu after following an in-page link. */
        document.querySelectorAll('.nav-links a').forEach(link => {
            link.addEventListener('click', () => {
                menuToggle.checked = false;
            });
        });
    }

});
