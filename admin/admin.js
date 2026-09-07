/**
 * admin.js — the media desk.
 *
 * A static page that edits data/content.json and the files it points at, then
 * writes the lot to the repository as one commit through the GitHub API.
 * There is no server: the browser talks straight to api.github.com with a
 * token the user pastes in, held in localStorage on this device only.
 *
 *   1. Config and helpers
 *   2. GitHub API
 *   3. State
 *   4. Ingesting files (naming, downscaling)
 *   5. Rendering
 *   6. Editing
 *   7. Publishing
 */

/* ═══ 1. CONFIG AND HELPERS ═══════════════════════════════════ */

const REPO = { owner: 'yr08ii', name: 'Yordine-Salvador-Chimbutane', branch: 'main' };
const MANIFEST = 'data/content.json';
const TOKEN_KEY = 'ysmc.admin.token';

/* Photographs off a phone run to several megabytes. Anything larger than this
   on its long edge is re-encoded before upload — the site never displays one
   bigger, and the repository stays a sensible size. */
const MAX_EDGE = 1600;
const JPEG_QUALITY = 0.82;

const $ = id => document.getElementById(id);

function el(tag, cls, text) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
}

function bytes(n) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function extOf(name) {
    const m = /\.([A-Za-z0-9]+)$/.exec(name || '');
    return m ? m[1].toLowerCase() : '';
}

function baseOf(name) {
    return (name || '').replace(/\.[A-Za-z0-9]+$/, '');
}

/* Filenames end up in a URL on a case-sensitive host, so flatten them. */
function slug(s) {
    return (s || 'file')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'file';
}

function isImageName(name) {
    return /\.(jpe?g|png|gif|webp|avif)$/i.test(name || '');
}

let toastTimer = null;
function toast(msg, bad) {
    const t = $('toast');
    t.innerHTML = '';
    if (msg instanceof Node) t.append(msg); else t.textContent = msg;
    t.classList.toggle('is-bad', !!bad);
    t.hidden = false;
    requestAnimationFrame(() => t.classList.add('is-up'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        t.classList.remove('is-up');
        setTimeout(() => { t.hidden = true; }, 300);
    }, bad ? 9000 : 5000);
}

function stamp() {
    return new Date().toISOString().replace(/\.\d+Z$/, 'Z');
}


/* ═══ 2. GITHUB API ═══════════════════════════════════════════ */

async function api(method, path, body, accept) {
    const res = await fetch(`https://api.github.com/repos/${REPO.owner}/${REPO.name}${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${state.token}`,
            Accept: accept || 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
            ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });

    if (!res.ok) {
        let detail = '';
        try {
            const j = await res.json();
            detail = j.message || '';
            if (j.errors && j.errors.length) {
                detail += ' — ' + j.errors.map(e => e.message || e.code).join('; ');
            }
        } catch { /* a non-JSON error body tells us nothing useful */ }
        const err = new Error(`${res.status} ${detail}`.trim());
        err.status = res.status;
        throw err;
    }

    if (method === 'HEAD') return null;
    if (accept === 'application/vnd.github.raw') return res.text();
    return res.status === 204 ? null : res.json();
}


/* A path can sit in the manifest without ever having been committed — every
   placeholder entry does. Asking Git to delete one of those fails the whole
   commit, so check before queueing it. HEAD keeps a large PDF off the wire. */
async function existsInRepo(path) {
    try {
        await api('HEAD', `/contents/${encodeURI(path)}?ref=${REPO.branch}`, null,
            'application/vnd.github.raw');
        return true;
    } catch (err) {
        if (err.status === 404) return false;
        /* A network or permission failure is not the same as "not there", so
           keep the deletion and let publish report the real error. */
        return true;
    }
}


/* ═══ 3. STATE ════════════════════════════════════════════════ */

const state = {
    token: '',
    content: null,
    /* The manifest exactly as it came off the branch, so an edit can be told
       from a no-op by comparison rather than by tracking every field. */
    original: '',
    /* path → { blob, url, size } for files staged but not yet committed. */
    uploads: new Map(),
    /* Paths to remove from the repository on the next commit. */
    deletes: new Set(),
    busy: false,
};

function manifestJson() {
    return JSON.stringify(state.content, null, 2) + '\n';
}

function manifestChanged() {
    return state.content && manifestJson() !== state.original;
}

function changeCount() {
    return state.uploads.size + state.deletes.size + (manifestChanged() ? 1 : 0);
}

/* Every path the manifest currently points at — used for naming collisions
   and to decide whether a removed file is still needed elsewhere. */
function referencedPaths() {
    const out = new Set();
    if (!state.content) return out;
    (state.content.projects || []).forEach(p => {
        (p.gallery.items || []).forEach(i => out.add(i.src));
        (p.files.items || []).forEach(i => out.add(i.file));
    });
    (state.content.experiences || []).forEach(e => {
        (e.files.items || []).forEach(i => out.add(i.file));
    });
    if (state.content.resume) out.add(state.content.resume.path);
    return out;
}


/* ═══ 4. INGESTING FILES ══════════════════════════════════════ */

function uniquePath(folder, filename) {
    const taken = new Set([...referencedPaths(), ...state.uploads.keys()]);
    const ext = extOf(filename);
    const base = slug(baseOf(filename));
    let candidate = `${folder}/${base}.${ext}`;
    let n = 2;
    while (taken.has(candidate)) candidate = `${folder}/${base}-${n++}.${ext}`;
    return candidate;
}

/* True when any pixel is not fully opaque — a PNG with transparency has to
   stay a PNG, everything else is better off as JPEG. */
function hasAlpha(ctx, w, h) {
    const { data } = ctx.getImageData(0, 0, w, h);
    for (let i = 3; i < data.length; i += 4 * 37) {
        if (data[i] < 250) return true;
    }
    return false;
}

async function downscale(file) {
    let bitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        /* HEIC and friends: nothing in the browser can decode them. */
        return null;
    }

    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const keepPng = extOf(file.name) === 'png' && hasAlpha(ctx, w, h);
    const type = keepPng ? 'image/png' : 'image/jpeg';

    const blob = await new Promise(res => canvas.toBlob(res, type, JPEG_QUALITY));
    if (!blob) return null;

    /* Re-encoding a small, already-tidy file can make it bigger. */
    if (blob.size >= file.size && scale === 1) return null;

    return { blob, ext: keepPng ? 'png' : 'jpg' };
}

async function ingest(file, folder) {
    const image = isImageName(file.name) || /^image\//.test(file.type);
    let blob = file;
    let name = file.name;

    if (image) {
        const smaller = await downscale(file);
        if (smaller) {
            blob = smaller.blob;
            name = `${baseOf(file.name)}.${smaller.ext}`;
        } else if (/\.hei[cf]$/i.test(file.name)) {
            toast(`${file.name} is HEIC — most browsers cannot display it. Convert it to JPEG first.`, true);
            return null;
        }
    }

    const path = uniquePath(folder, name);
    state.uploads.set(path, {
        blob,
        size: blob.size,
        url: URL.createObjectURL(blob),
        image,
    });
    return { path, image, ext: extOf(name).toUpperCase(), original: file.size, size: blob.size };
}


/* ═══ 5. RENDERING ════════════════════════════════════════════ */

/* Where a row's thumbnail comes from: a staged blob, or the file already on
   the site one directory up from /admin/. */
function previewSrc(path) {
    const up = state.uploads.get(path);
    return up ? up.url : `../${path}`;
}

function sectionsOf() {
    const out = [];
    (state.content.experiences || []).forEach(e => out.push({
        kind: 'experience', key: e.key, title: e.role, sub: e.company, entry: e,
    }));
    (state.content.projects || []).forEach(p => out.push({
        kind: 'project', key: p.key, title: p.title, sub: 'Case study', entry: p,
    }));
    return out;
}

function renderRail() {
    const rail = $('rail');
    rail.replaceChildren();
    rail.append(el('div', 'rail-head', 'Sections'));

    const resumeLink = el('a', null);
    resumeLink.href = '#resumeCard';
    resumeLink.append(el('span', null, 'Résumé'));
    resumeLink.append(el('span', 'n', state.uploads.has(state.content.resume.path) ? '•' : ''));
    rail.append(resumeLink);

    sectionsOf().forEach(s => {
        const a = el('a', null);
        a.href = `#card-${s.key}`;
        a.append(el('span', null, s.title));
        const count = s.kind === 'project'
            ? (s.entry.gallery.items.length + s.entry.files.items.length)
            : s.entry.files.items.length;
        a.append(el('span', 'n', String(count)));
        rail.append(a);
    });
}

function rowTools(group, index) {
    const tools = el('div', 'row-tools');

    const up = el('button', 'tool', '↑');
    up.type = 'button';
    up.title = 'Move up';
    up.disabled = index === 0;
    up.addEventListener('click', () => move(group, index, -1));

    const down = el('button', 'tool', '↓');
    down.type = 'button';
    down.title = 'Move down';
    down.disabled = index === group.items.length - 1;
    down.addEventListener('click', () => move(group, index, 1));

    const del = el('button', 'tool danger', '✕');
    del.type = 'button';
    del.title = 'Remove';
    del.addEventListener('click', e => askRemove(e.currentTarget, group, index));

    tools.append(up, down, del);
    return tools;
}

function thumbFor(path, isImage, ext) {
    const thumb = el('span', 'row-thumb');
    if (isImage) {
        const img = el('img');
        img.src = previewSrc(path);
        img.alt = '';
        img.loading = 'lazy';
        img.addEventListener('error', () => {
            thumb.classList.add('is-missing');
            thumb.append(ext || '?');
        });
        thumb.append(img);
    } else {
        thumb.classList.add('is-doc');
        thumb.append(ext || 'DOC');
    }
    return thumb;
}

function field(value, placeholder, onInput, cls) {
    const input = el('input', `field-input${cls ? ' ' + cls : ''}`);
    input.type = 'text';
    input.value = value || '';
    input.placeholder = placeholder;
    input.addEventListener('input', () => { onInput(input.value); markDirty(); });
    return input;
}

function area(value, placeholder, onInput) {
    const ta = el('textarea', 'field-input');
    ta.value = value || '';
    ta.placeholder = placeholder;
    ta.rows = 2;
    ta.addEventListener('input', () => { onInput(ta.value); markDirty(); });
    return ta;
}

function renderRow(group, item, index) {
    const path = group.type === 'gallery' ? item.src : item.file;
    const isImage = group.type === 'gallery' || item.kind !== 'pdf';
    const ext = (item.ext || extOf(path).toUpperCase());

    const row = el('div', 'row');
    if (state.uploads.has(path)) row.classList.add('is-new');
    row.append(thumbFor(path, isImage, ext));

    const fields = el('div', 'row-fields');

    if (group.type === 'gallery') {
        fields.append(area(item.alt, 'Describe the photograph for screen readers and search',
            v => { item.alt = v; }));
    } else {
        const line = el('div', 'row-line');
        line.append(field(item.title, 'Title shown on the card and in the viewer',
            v => { item.title = v; }));
        line.append(field(item.label, 'Kind, e.g. Photograph',
            v => { item.label = v; }, 'short'));
        fields.append(line);
        fields.append(area(item.note, 'The paragraph shown beside the file when someone opens it',
            v => { item.note = v; }));
    }

    const meta = el('div', 'row-path');
    meta.append(path);
    if (state.uploads.has(path)) {
        const up = state.uploads.get(path);
        meta.append(' ');
        meta.append(el('span', 'flag', `new · ${bytes(up.size)}`));
    }
    fields.append(meta);

    row.append(fields);
    row.append(rowTools(group, index));
    return row;
}

function renderGroup(group) {
    const wrap = el('div', 'group');

    const head = el('div', 'group-head');
    head.append(el('span', 'group-label', group.label));
    head.append(el('span', 'group-folder', `${group.items.length} · uploads land in ${group.folder}/`));
    wrap.append(head);

    if (!group.items.length) {
        wrap.append(el('div', 'empty', 'Nothing here yet.'));
    } else {
        const rows = el('div', 'rows');
        group.items.forEach((item, i) => rows.append(renderRow(group, item, i)));
        wrap.append(rows);
    }

    wrap.append(renderDrop(group));
    return wrap;
}

function renderDrop(group) {
    const drop = el('div', 'drop');
    drop.append(el('span', 'drop-text',
        group.type === 'gallery'
            ? 'Drop photographs here, or choose them.'
            : 'Drop photographs and PDFs here, or choose them.'));

    const label = el('label', 'btn btn-ghost', 'Add files');
    const input = el('input');
    input.type = 'file';
    input.multiple = true;
    input.hidden = true;
    input.accept = group.type === 'gallery' ? 'image/*' : 'image/*,application/pdf,.pdf';
    input.addEventListener('change', () => {
        addFiles(group, [...input.files]);
        input.value = '';
    });
    label.append(input);
    drop.append(label);

    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => {
        e.preventDefault();
        drop.classList.add('is-over');
    }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => {
        e.preventDefault();
        drop.classList.remove('is-over');
    }));
    drop.addEventListener('drop', e => {
        const files = [...(e.dataTransfer ? e.dataTransfer.files : [])];
        if (files.length) addFiles(group, files);
    });

    return drop;
}

/* The manifest keeps galleries and file lists in different shapes; this wraps
   each one so the row code can treat them alike. */
function groupsFor(section) {
    if (section.kind === 'experience') {
        return [{
            type: 'files', label: section.entry.files.label || 'Documents & photographs',
            folder: section.entry.files.folder, items: section.entry.files.items,
        }];
    }
    const gallery = {
        type: 'gallery', label: 'Gallery',
        folder: section.entry.gallery.folder, items: section.entry.gallery.items,
    };
    const files = {
        type: 'files', label: section.entry.files.label || 'Production files',
        folder: section.entry.files.folder, items: section.entry.files.items,
    };
    return section.entry.filesFirst ? [files, gallery] : [gallery, files];
}

function renderGroups() {
    const host = $('groups');
    host.replaceChildren();

    sectionsOf().forEach((section, i) => {
        const card = el('section', 'card');
        card.id = `card-${section.key}`;
        card.style.animationDelay = `${Math.min(i, 6) * 40}ms`;

        const head = el('div', 'card-head');
        const left = el('div');
        left.append(el('span', 'card-tag mono', section.kind === 'project' ? 'Project' : 'Experience'));
        left.append(el('h2', 'card-title', section.title));
        left.append(el('p', 'card-sub', section.sub));
        head.append(left);
        card.append(head);

        groupsFor(section).forEach(g => card.append(renderGroup(g)));
        host.append(card);
    });
}

function renderResume() {
    const r = state.content.resume;
    $('resumePath').textContent = r.path;
    $('resumeView').href = `../${r.path}`;

    const staged = state.uploads.get(r.path);
    $('resumeStamp').textContent = staged
        ? `staged · ${bytes(staged.size)}`
        : `last replaced ${(r.updated || '').replace('T', ' ').replace('Z', ' UTC')}`;

    const line = $('resumeStaged');
    line.hidden = !staged;
    if (staged) line.textContent = `New PDF staged — publish to put it live (${bytes(staged.size)}).`;
}

function renderDocket() {
    const n = changeCount();
    const count = $('docketCount');
    count.textContent = n === 0
        ? 'No changes staged'
        : `${n} change${n === 1 ? '' : 's'} staged`;
    count.classList.toggle('is-live', n > 0);

    $('publishBtn').disabled = n === 0 || state.busy;
    $('discardBtn').disabled = n === 0 || state.busy;
    $('docketToggle').hidden = n === 0;

    const list = $('docketList');
    if (!list.hidden) renderDocketList();

    syncDocketHeight();
}

/* The docket is fixed to the foot and changes height — three rows on a phone,
   taller again with the change list open — so the page keeps its bottom
   padding, and the toast its offset, in step with it. */
function syncDocketHeight() {
    const docket = $('docket');
    if (!docket || $('desk').hidden) return;
    document.documentElement.style.setProperty(
        '--docket-h', `${Math.ceil(docket.getBoundingClientRect().height)}px`);
}

function renderDocketList() {
    const list = $('docketList');
    const ul = el('ul');

    state.uploads.forEach((up, path) => {
        const li = el('li');
        li.append(el('span', 'op', 'upload'));
        li.append(el('span', null, `${path} (${bytes(up.size)})`));
        ul.append(li);
    });
    state.deletes.forEach(path => {
        const li = el('li');
        li.append(el('span', 'op del', 'delete'));
        li.append(el('span', null, path));
        ul.append(li);
    });
    if (manifestChanged()) {
        const li = el('li');
        li.append(el('span', 'op', 'edit'));
        li.append(el('span', null, MANIFEST));
        ul.append(li);
    }
    list.replaceChildren(ul);
}

function renderAll() {
    renderRail();
    renderResume();
    renderGroups();
    renderDocket();
}

/* Re-render just the parts that change on an edit, keeping focus where it is
   would be nicer — but a full redraw is simpler and this is a small page, so
   only call it for structural changes (add, remove, reorder). */
function markDirty() {
    renderDocket();
}


/* ═══ 6. EDITING ══════════════════════════════════════════════ */

async function addFiles(group, files) {
    let added = 0;
    for (const file of files) {
        const res = await ingest(file, group.folder);
        if (!res) continue;

        if (group.type === 'gallery') {
            group.items.push({ src: res.path, alt: '' });
        } else {
            group.items.push({
                file: res.path,
                kind: res.image ? 'image' : 'pdf',
                title: baseOf(file.name).replace(/[-_]+/g, ' ').trim() || 'Untitled',
                ext: res.ext === 'JPEG' ? 'JPG' : res.ext,
                label: res.image ? 'Photograph' : 'Document',
                note: '',
            });
        }
        added++;
    }

    if (added) {
        renderAll();
        toast(`${added} file${added === 1 ? '' : 's'} staged. Give them a title and caption, then publish.`);
    }
}

function move(group, index, delta) {
    const to = index + delta;
    if (to < 0 || to >= group.items.length) return;
    const [item] = group.items.splice(index, 1);
    group.items.splice(to, 0, item);
    renderAll();
}

/* Removing is two steps on purpose: taking a file off the page and deleting it
   from the repository are different decisions. */
function askRemove(button, group, index) {
    const row = button.closest('.row');
    if (row.querySelector('.row-confirm')) return;

    const item = group.items[index];
    const path = group.type === 'gallery' ? item.src : item.file;
    const staged = state.uploads.has(path);

    const bar = el('div', 'row-confirm');
    bar.append(el('span', null, staged ? 'Discard this staged file?' : 'Remove this file?'));
    bar.append(el('span', 'spacer'));

    const offPage = el('button', null, staged ? 'Discard' : 'Take off the page');
    offPage.type = 'button';
    offPage.addEventListener('click', () => {
        group.items.splice(index, 1);
        if (staged) {
            URL.revokeObjectURL(state.uploads.get(path).url);
            state.uploads.delete(path);
        }
        renderAll();
    });
    bar.append(offPage);

    if (!staged) {
        const andDelete = el('button', null, 'Remove and delete the file');
        andDelete.type = 'button';
        andDelete.addEventListener('click', async () => {
            andDelete.disabled = true;
            andDelete.textContent = 'Checking…';
            const onDisk = await existsInRepo(path);

            group.items.splice(index, 1);

            if (!onDisk) {
                toast('Removed. That file had never been uploaded, so there was nothing to delete.');
            } else if (referencedPaths().has(path)) {
                toast('Taken off this page. The file is still used elsewhere, so it stays in the repository.');
            } else {
                state.deletes.add(path);
            }
            renderAll();
        });
        bar.append(andDelete);
    }

    const cancel = el('button', null, 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => bar.remove());
    bar.append(cancel);

    row.append(bar);
    offPage.focus();
}

async function stageResume(file) {
    if (extOf(file.name) !== 'pdf') {
        toast('The résumé has to be a PDF.', true);
        return;
    }
    const path = state.content.resume.path;

    const previous = state.uploads.get(path);
    if (previous) URL.revokeObjectURL(previous.url);

    /* Same path every time, so every link on the site keeps working. */
    state.uploads.set(path, {
        blob: file,
        size: file.size,
        url: URL.createObjectURL(file),
        image: false,
    });
    state.content.resume.updated = stamp();

    renderAll();
    toast(`Résumé staged (${bytes(file.size)}). Publish to put it live.`);
}


/* ═══ 7. PUBLISHING ═══════════════════════════════════════════ */

function toBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(',')[1]);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

function progress(done, total) {
    const bar = $('docketProgress');
    bar.hidden = false;
    bar.firstElementChild.style.width = `${Math.round((done / total) * 100)}%`;
}

function setBusy(on) {
    state.busy = on;
    $('publishBtn').textContent = on ? 'Publishing…' : 'Publish';
    renderDocket();
}

async function publish() {
    if (!changeCount() || state.busy) return;
    setBusy(true);

    const uploads = [...state.uploads.entries()];
    /* One step per blob, plus ref, base commit, tree, commit, ref update. */
    const total = uploads.length + 5;
    let done = 0;
    const tick = () => progress(++done, total);

    try {
        /* Blobs first — they are the slow part and nothing is visible until
           the ref moves at the end, so a failure here changes nothing. */
        const blobs = [];
        for (const [path, up] of uploads) {
            const sha = (await api('POST', '/git/blobs', {
                content: await toBase64(up.blob),
                encoding: 'base64',
            })).sha;
            blobs.push({ path, sha });
            tick();
        }

        const ref = await api('GET', `/git/ref/heads/${REPO.branch}`);
        const baseSha = ref.object.sha;
        tick();

        const baseCommit = await api('GET', `/git/commits/${baseSha}`);
        tick();

        const tree = blobs.map(b => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha }));

        /* Re-check the deletions: one may have been queued against a file that
           another commit has since removed, and a stale delete fails the lot. */
        for (const path of state.deletes) {
            if (await existsInRepo(path)) {
                tree.push({ path, mode: '100644', type: 'blob', sha: null });
            }
        }

        state.content.updated = stamp();
        tree.push({ path: MANIFEST, mode: '100644', type: 'blob', content: manifestJson() });

        const newTree = await api('POST', '/git/trees', { base_tree: baseCommit.tree.sha, tree });
        tick();

        const message = ($('commitMsg').value || '').trim() || defaultMessage();
        const commit = await api('POST', '/git/commits', {
            message,
            tree: newTree.sha,
            parents: [baseSha],
        });
        tick();

        await api('PATCH', `/git/refs/heads/${REPO.branch}`, { sha: commit.sha });
        tick();

        /* Committed: clear the staging area and take the new manifest as the
           baseline so the desk reads as clean. */
        state.uploads.forEach(up => URL.revokeObjectURL(up.url));
        state.uploads.clear();
        state.deletes.clear();
        state.original = manifestJson();
        $('commitMsg').value = '';

        renderAll();

        const msg = document.createDocumentFragment();
        msg.append('Published. GitHub Pages usually redeploys within a minute. ');
        const a = el('a', null, 'View the commit ↗');
        a.href = commit.html_url ||
            `https://github.com/${REPO.owner}/${REPO.name}/commit/${commit.sha}`;
        a.target = '_blank';
        a.rel = 'noopener';
        msg.append(a);
        toast(msg);
    } catch (err) {
        if (err.status === 409 || err.status === 422) {
            toast(`Could not publish — the branch moved since this page loaded. ` +
                `Reload the desk and stage the changes again. (${err.message})`, true);
        } else if (err.status === 403 || err.status === 401) {
            toast(`GitHub refused the write: ${err.message}. Check the token still exists and ` +
                `has Contents: Read and write on this repository.`, true);
        } else {
            toast(`Publish failed: ${err.message}`, true);
        }
    } finally {
        setBusy(false);
        setTimeout(() => { $('docketProgress').hidden = true; }, 600);
    }
}

function defaultMessage() {
    const bits = [];
    if (state.uploads.size) bits.push(`add ${state.uploads.size} file${state.uploads.size === 1 ? '' : 's'}`);
    if (state.deletes.size) bits.push(`remove ${state.deletes.size}`);
    if (manifestChanged()) bits.push('update media manifest');
    return `content: ${bits.join(', ')}`;
}

function discard() {
    if (!confirm('Throw away every staged change? Nothing has been published yet, so this cannot be undone.')) return;
    state.uploads.forEach(up => URL.revokeObjectURL(up.url));
    state.uploads.clear();
    state.deletes.clear();
    state.content = JSON.parse(state.original);
    $('commitMsg').value = '';
    renderAll();
    toast('Staged changes discarded.');
}


/* ═══ BOOT ════════════════════════════════════════════════════ */

async function loadContent() {
    let raw;
    try {
        raw = await api('GET', `/contents/${MANIFEST}?ref=${REPO.branch}`, null,
            'application/vnd.github.raw');
    } catch (err) {
        if (err.status === 404) {
            /* The desk reads the manifest off the branch, not off disk, so it
               cannot start until that file has been pushed. */
            throw Object.assign(new Error(
                `${MANIFEST} is not on ${REPO.branch} yet. Commit and push it, ` +
                `then reload this page.`), { status: 404, manifest: true });
        }
        throw err;
    }
    state.content = JSON.parse(raw);
    state.original = manifestJson();
}

async function openDesk(token) {
    state.token = token;

    const repo = await api('GET', '');
    if (repo.permissions && repo.permissions.push === false) {
        throw Object.assign(
            new Error('This token can read the repository but not write to it. ' +
                'Give it Contents: Read and write.'),
            { status: 403 });
    }

    await loadContent();

    $('repoLabel').textContent = `${REPO.owner}/${REPO.name} · ${REPO.branch}`;
    $('gate').hidden = true;
    $('desk').hidden = false;
    renderAll();
    syncDocketHeight();
}

document.addEventListener('DOMContentLoaded', () => {

    /* ─── Gate ─── */
    const form = $('gateForm');
    const error = $('gateError');

    form.addEventListener('submit', async e => {
        e.preventDefault();
        const token = $('tokenInput').value.trim();
        if (!token) return;

        error.hidden = true;
        $('gateSubmit').disabled = true;
        $('gateSubmit').textContent = 'Checking…';

        try {
            await openDesk(token);
            if ($('rememberToken').checked) localStorage.setItem(TOKEN_KEY, token);
            else localStorage.removeItem(TOKEN_KEY);
        } catch (err) {
            state.token = '';
            error.hidden = false;
            error.textContent = err.status === 401
                ? 'GitHub did not accept that token. Check it was copied whole and has not expired.'
                : err.manifest
                    ? err.message
                    : err.status === 404
                        ? 'Token accepted, but it cannot see this repository. Check it grants access to ' +
                          `${REPO.owner}/${REPO.name}.`
                        : err.message;
        } finally {
            $('gateSubmit').disabled = false;
            $('gateSubmit').textContent = 'Open the desk';
        }
    });

    /* A remembered token opens the desk straight away; if it has expired we
       fall back to the gate with the reason shown. */
    const saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
        $('rememberToken').checked = true;
        openDesk(saved).catch(err => {
            localStorage.removeItem(TOKEN_KEY);
            error.hidden = false;
            error.textContent = `The saved token no longer works (${err.message}). Paste a new one.`;
        });
    }

    /* ─── Masthead ─── */
    $('signOutBtn').addEventListener('click', () => {
        if (changeCount() && !confirm('There are unpublished changes. Sign out anyway?')) return;
        localStorage.removeItem(TOKEN_KEY);
        location.reload();
    });

    $('reloadBtn').addEventListener('click', async () => {
        if (changeCount() && !confirm('Reloading throws away the staged changes. Continue?')) return;
        state.uploads.forEach(up => URL.revokeObjectURL(up.url));
        state.uploads.clear();
        state.deletes.clear();
        try {
            await loadContent();
            renderAll();
            toast('Reloaded from GitHub.');
        } catch (err) {
            toast(`Could not reload: ${err.message}`, true);
        }
    });

    /* ─── Résumé ─── */
    $('resumeInput').addEventListener('change', e => {
        const file = e.target.files[0];
        if (file) stageResume(file);
        e.target.value = '';
    });

    /* ─── Docket ─── */
    $('publishBtn').addEventListener('click', publish);
    $('discardBtn').addEventListener('click', discard);
    $('docketToggle').addEventListener('click', () => {
        const list = $('docketList');
        list.hidden = !list.hidden;
        $('docketToggle').textContent = list.hidden ? 'Show list' : 'Hide list';
        if (!list.hidden) renderDocketList();
        /* Synchronous on purpose: reading the box forces layout, so this is
           right straight away and does not wait on a frame — the page may be
           in a background tab, where frames stop. */
        syncDocketHeight();
    });

    /* Catch height changes that no state change causes — the window being
       resized, or a font landing late. */
    new ResizeObserver(syncDocketHeight).observe($('docket'));
    window.addEventListener('resize', syncDocketHeight);

    window.addEventListener('beforeunload', e => {
        if (changeCount() && !state.busy) e.preventDefault();
    });
});
