/**
 * index.js — Portfolio interactivity
 *
 *  0. Media rendered from data/content.json
 *  1. Project cards → case-study overlay (open, close, focus management)
 *  2. Drag-to-scroll on the horizontal projects rail
 *  3. Navbar scroll state
 *  4. Mobile menu dismissal
 *  5. Attachment cards → file viewer (images and PDFs)
 *  6. Missing-thumbnail fallback
 *
 *  Section 0 renders every gallery and attachment drawer from
 *  data/content.json, which the admin page at /admin/ writes.
 */

document.addEventListener('DOMContentLoaded', () => {

    /* Set by section 5. The case-study overlay reads it so that Escape and Tab
       go to whichever layer is on top. */
    let viewerIsOpen = false;

    /* ═══ 0. MEDIA FROM THE MANIFEST ══════════════════════════ */
    /* Galleries, attachment drawers and the résumé link are described in
       data/content.json and rendered here, so the admin page at /admin/ can
       change them without anyone editing markup. Prose stays in index.html.
       If the fetch fails the page still reads — it just carries no media. */

    const MANIFEST = 'data/content.json';

    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text != null) n.textContent = text;
        return n;
    }

    function buildAttachment(item) {
        const btn = el('button', 'attachment');
        btn.type = 'button';
        btn.dataset.file = item.file;
        btn.dataset.kind = item.kind === 'pdf' ? 'pdf' : 'image';
        btn.dataset.title = item.title || '';

        if (btn.dataset.kind === 'image') {
            const thumb = el('span', 'attachment-thumb');
            const img = el('img');
            img.src = item.file;
            img.alt = '';
            img.loading = 'lazy';
            thumb.append(img);
            btn.append(thumb);
        } else {
            const thumb = el('span', 'attachment-thumb attachment-thumb-doc',
                (item.ext || 'PDF').toUpperCase().slice(0, 4));
            thumb.setAttribute('aria-hidden', 'true');
            btn.append(thumb);
        }

        const meta = el('span', 'attachment-meta');
        meta.append(el('span', 'attachment-name', item.title || ''));
        meta.append(el('span', 'attachment-kind mono',
            [item.ext, item.label].filter(Boolean).join(' · ')));
        btn.append(meta);

        const note = el('span', 'attachment-note');
        note.hidden = true;
        /* Plain text, deliberately: the manifest is edited in a textarea on the
           admin page, so what is typed there is exactly what shows here. */
        note.textContent = item.note || '';
        btn.append(note);

        return btn;
    }

    function buildDrawer(group) {
        const items = (group && group.items) || [];
        if (!items.length) return null;

        const details = el('details', 'file-drawer');
        const summary = document.createElement('summary');

        const chev = el('span', 'drawer-chevron');
        chev.setAttribute('aria-hidden', 'true');
        summary.append(chev);
        summary.append(el('span', 'drawer-label', group.label || 'Files'));
        summary.append(el('span', 'drawer-hint',
            `${items.length} item${items.length === 1 ? '' : 's'} · click to expand`));
        details.append(summary);

        const grid = el('div', 'attachments');
        items.forEach(item => grid.append(buildAttachment(item)));
        details.append(grid);

        return details;
    }

    function buildGallery(group) {
        const items = (group && group.items) || [];
        if (!items.length) return null;

        const wrap = el('div', 'case-gallery');
        const head = el('div', 'case-gallery-head');
        head.append(el('h4', null, 'Gallery'));
        /* Counted here rather than stored, so it cannot drift out of step with
           the list when a photograph is added or removed. */
        head.append(el('span', 'case-gallery-count mono',
            `${items.length} photograph${items.length === 1 ? '' : 's'} · scroll →`));
        wrap.append(head);

        const strip = el('div', 'gallery-strip');
        items.forEach(item => {
            const fig = document.createElement('figure');
            const img = el('img');
            img.src = item.src;
            img.alt = item.alt || '';
            img.loading = 'lazy';
            fig.append(img);
            strip.append(fig);
        });
        wrap.append(strip);

        return wrap;
    }

    function renderMedia(data) {
        const byKey = {};
        (data.projects || []).forEach(p => { byKey[p.key] = p; });
        (data.experiences || []).forEach(e => { byKey[e.key] = e; });

        document.querySelectorAll('[data-media]').forEach(mount => {
            const entry = byKey[mount.dataset.key];
            if (!entry) return;
            const node = mount.dataset.media === 'gallery'
                ? buildGallery(entry.gallery)
                : buildDrawer(entry.files);
            mount.replaceChildren();
            if (node) mount.append(node);
        });

        /* A new résumé keeps the same filename, so stamp the link to get past
           any cached copy in a visitor's browser. */
        const resume = data.resume;
        if (resume && resume.path) {
            const stamp = encodeURIComponent(resume.updated || String(Date.now()));
            document.querySelectorAll('[data-resume-link]').forEach(a => {
                a.href = `${resume.path}?v=${stamp}`;
            });
        }
    }

    fetch(MANIFEST, { cache: 'no-cache' })
        .then(res => res.ok ? res.json() : Promise.reject(new Error(res.status)))
        .then(renderMedia)
        .catch(err => console.warn('Media manifest unavailable:', err));


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
            /* The file viewer sits above this one and runs its own handler. */
            if (viewerIsOpen) return;

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


    /* ═══ 5. FILE VIEWER ══════════════════════════════════════ */
    /* Attachment cards live in two places — the experience timeline, and the
       "Production files" drawers that get cloned into the case-study overlay.
       The listener is delegated from the document so it covers the clones. */

    const viewer = document.getElementById('fileViewer');
    const viewerPanel = viewer && viewer.querySelector('.viewer-panel');
    const viewerStage = document.getElementById('viewerStage');
    const viewerTitle = document.getElementById('viewerTitle');
    const viewerKind = document.getElementById('viewerKind');
    const viewerNote = document.getElementById('viewerNote');
    const viewerFoot = document.getElementById('viewerFoot');
    const viewerOpen = document.getElementById('viewerOpen');
    const viewerClose = document.getElementById('viewerClose');

    if (viewer && viewerPanel && viewerStage) {

        /* An embedded PDF is unreliable on phones — several mobile browsers
           refuse to render one in a frame — so there we go straight to the
           browser's own reader instead of showing an empty box. */
        const narrow = window.matchMedia('(max-width: 700px)');

        let viewerLastFocused = null;

        /* Nothing is at that path yet — the markup was written before the file
           was dropped into assets/. */
        function showMissing() {
            viewerStage.innerHTML = '';
            viewerOpen.hidden = true;
            const p = document.createElement('p');
            p.className = 'viewer-fallback';
            p.textContent = 'This file has not been added to the site yet.';
            viewerStage.append(p);
        }

        function embedPdf(file, title, exists) {
            /* Guard against a slow HEAD landing after the viewer moved on. */
            if (viewerOpen.getAttribute('href') !== file) return;
            if (!exists) return showMissing();

            viewerStage.innerHTML = '';

            /* Several mobile browsers refuse to render a PDF in a frame, so
               there we point at the browser's own reader instead of showing
               an empty box. */
            if (narrow.matches) {
                const p = document.createElement('p');
                p.className = 'viewer-fallback';
                p.textContent = 'Open the document to read it in your browser\u2019s PDF reader.';
                viewerStage.append(p);
                return;
            }

            const frame = document.createElement('iframe');
            frame.src = file;
            frame.title = title;
            viewerStage.append(frame);
        }

        function showFile(card) {
            const file = card.dataset.file;
            if (!file) return;

            const kind = card.dataset.kind === 'pdf' ? 'pdf' : 'image';
            const title = card.dataset.title || 'File';
            const kindEl = card.querySelector('.attachment-kind');
            const noteEl = card.querySelector('.attachment-note');

            viewerLastFocused = document.activeElement;

            viewerTitle.textContent = title;
            viewerKind.textContent = kindEl ? kindEl.textContent.trim() : '';
            viewerNote.textContent = noteEl ? noteEl.textContent.trim() : '';
            /* No caption written for this file yet — drop the whole footer
               rather than leaving a rule under an empty block. */
            viewerFoot.hidden = !viewerNote.textContent;
            viewerOpen.href = file;

            viewerStage.innerHTML = '';
            viewerOpen.hidden = false;

            if (kind === 'pdf') {
                /* An embedded PDF cannot report a 404 to us, and a server error
                   page inside the frame looks worse than saying so plainly.
                   Ask first; if the check itself is unavailable (opened over
                   file://, say) go ahead and embed. */
                fetch(file, { method: 'HEAD' })
                    .then(res => embedPdf(file, title, res.ok))
                    .catch(() => embedPdf(file, title, true));
            } else {
                const img = document.createElement('img');
                img.src = file;
                /* The title already names the file in the heading above, so the
                   image itself is decorative here. */
                img.alt = '';
                img.addEventListener('error', () => showMissing());
                viewerStage.append(img);
            }

            viewer.hidden = false;
            void viewer.offsetWidth;
            viewer.classList.add('is-open');
            viewerIsOpen = true;
            document.body.classList.add('modal-open');

            viewerClose.focus();
        }

        function hideFile() {
            if (!viewer.classList.contains('is-open')) return;

            viewer.classList.remove('is-open');
            viewerIsOpen = false;

            /* Only release the page scroll if the case study underneath is
               closed too — otherwise the page scrolls behind the overlay. */
            const caseStudyOpen = backdrop && backdrop.classList.contains('is-open');
            if (!caseStudyOpen) document.body.classList.remove('modal-open');

            if (viewerLastFocused) viewerLastFocused.focus();

            window.setTimeout(() => {
                if (!viewer.classList.contains('is-open')) {
                    viewer.hidden = true;
                    /* Dropping the iframe stops the embedded reader. */
                    viewerStage.innerHTML = '';
                }
            }, 280);
        }

        document.addEventListener('click', e => {
            const card = e.target.closest('.attachment');
            if (!card) return;
            e.preventDefault();
            showFile(card);
        });

        viewerClose.addEventListener('click', hideFile);

        viewer.addEventListener('click', e => {
            if (!viewerPanel.contains(e.target)) hideFile();
        });

        document.addEventListener('keydown', e => {
            if (!viewer.classList.contains('is-open')) return;

            if (e.key === 'Escape') {
                e.stopPropagation();
                hideFile();
                return;
            }

            if (e.key !== 'Tab') return;

            const items = Array.from(
                viewerPanel.querySelectorAll('a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])')
            ).filter(el => el.offsetParent !== null);
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


    /* ═══ 6. MISSING-THUMBNAIL FALLBACK ═══════════════════════ */
    /* Attachment markup can be written before the file is dropped into
       assets/. Swap a failed thumbnail for a lettered tile rather than
       letting the browser paint a broken-image icon. */

    document.addEventListener('error', e => {
        const img = e.target;
        if (!(img instanceof HTMLImageElement)) return;

        const thumb = img.closest('.attachment-thumb');
        if (!thumb || thumb.classList.contains('is-missing')) return;

        thumb.classList.add('is-missing');
        const ext = (img.getAttribute('src') || '').split('.').pop().slice(0, 4);
        thumb.append(ext.toUpperCase());
    }, true); /* `error` does not bubble, so listen on the way down. */

});
