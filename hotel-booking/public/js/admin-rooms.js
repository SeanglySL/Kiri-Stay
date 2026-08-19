const formPanel = document.getElementById('room-form-panel');
const form = document.getElementById('room-form');
const formTitle = document.getElementById('form-title');
const formMsg = document.getElementById('form-msg');
const uploadInput = document.getElementById('r-upload');
const uploadPreview = document.getElementById('upload-preview');

// Queued files waiting to be uploaded when the form is submitted.
// Each entry: { id, file, dataUrl }
let queuedFiles = [];

function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function renderUploadPreview() {
  uploadPreview.innerHTML = queuedFiles.map((q) => `
    <div class="upload-thumb" data-qid="${q.id}">
      <img src="${q.dataUrl}" alt="${q.file.name}" />
      <button type="button" class="remove" data-remove="${q.id}" title="Remove">&times;</button>
    </div>
  `).join('');
  uploadPreview.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => {
      queuedFiles = queuedFiles.filter((q) => q.id !== btn.dataset.remove);
      renderUploadPreview();
    });
  });
}

uploadInput.addEventListener('change', async () => {
  const files = Array.from(uploadInput.files || []);
  for (const file of files) {
    if (file.size > 5 * 1024 * 1024) {
      showMsg(formMsg, `"${file.name}" is over 5MB — please pick a smaller photo.`, 'error');
      continue;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      queuedFiles.push({ id: Math.random().toString(36).slice(2), file, dataUrl });
    } catch (e) { /* skip unreadable file */ }
  }
  uploadInput.value = ''; // allow selecting the same file again later
  renderUploadPreview();
});

function openForm(room) {
  formMsg.className = 'msg';
  form.reset();
  queuedFiles = [];
  renderUploadPreview();
  document.getElementById('r-type-i18n').innerHTML = i18nRowsHTML('type', room ? room.type : {});
  document.getElementById('r-desc-i18n').innerHTML = i18nRowsHTML('description', room ? room.description : {}, 'textarea');
  document.getElementById('r-amenities-i18n').innerHTML = i18nRowsHTML('amenities', room ? room.amenities : {});
  if (room) {
    formTitle.textContent = 'Edit ' + room.name;
    document.getElementById('r-id').value = room.id;
    document.getElementById('r-name').value = room.name;
    document.getElementById('r-price').value = room.pricePerNight;
    document.getElementById('r-capacity').value = room.capacity;
    document.getElementById('r-floor').value = room.floor || 1;
    document.getElementById('r-gallery').value = (room.gallery || []).join('\n');
  } else {
    formTitle.textContent = 'New room type';
    document.getElementById('r-id').value = '';
  }
  formPanel.classList.remove('hidden');
  formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeForm() {
  formPanel.classList.add('hidden');
}

document.getElementById('new-room-btn').addEventListener('click', () => openForm(null));
document.getElementById('cancel-form').addEventListener('click', closeForm);

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('r-id').value;
  const submitBtn = form.querySelector('button[type="submit"]');
  const originalLabel = submitBtn.textContent;
  formMsg.className = 'msg';

  try {
    // Upload any queued local photos first, then merge their URLs with
    // whatever the admin typed in the URL textarea. Uploaded photos come
    // first, so a freshly-uploaded shot becomes the thumbnail by default.
    let uploadedUrls = [];
    if (queuedFiles.length) {
      submitBtn.disabled = true;
      submitBtn.textContent = `Uploading photo 1 of ${queuedFiles.length}…`;
      for (let i = 0; i < queuedFiles.length; i++) {
        submitBtn.textContent = `Uploading photo ${i + 1} of ${queuedFiles.length}…`;
        const { url } = await API.post('/api/uploads', { dataUrl: queuedFiles[i].dataUrl });
        uploadedUrls.push(url);
      }
      submitBtn.textContent = 'Saving room…';
    }

    const typedUrls = document.getElementById('r-gallery').value
      .split('\n').map((s) => s.trim()).filter(Boolean);

    const payload = {
      name: document.getElementById('r-name').value.trim(),
      type: readI18nField(document.getElementById('r-type-i18n'), 'type'),
      description: readI18nField(document.getElementById('r-desc-i18n'), 'description'),
      pricePerNight: document.getElementById('r-price').value,
      capacity: document.getElementById('r-capacity').value,
      floor: document.getElementById('r-floor').value,
      amenities: readI18nField(document.getElementById('r-amenities-i18n'), 'amenities'),
      gallery: [...uploadedUrls, ...typedUrls],
    };

    if (id) {
      await API.put('/api/rooms/' + id, payload);
    } else {
      await API.post('/api/rooms', payload);
    }
    queuedFiles = [];
    closeForm();
    loadRooms();
  } catch (err) {
    showMsg(formMsg, err.data?.error || 'Could not save room.', 'error');
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = originalLabel;
  }
});

function roomRow(r) {
  return `
    <tr>
      <td><strong>${r.name}</strong><div class="muted">${localText(r.type)}</div></td>
      <td>Floor ${r.floor || 1}</td>
      <td>${fmtMoney(r.pricePerNight)} / night</td>
      <td>${r.capacity}</td>
      <td>
        <button class="btn btn-outline btn-sm" data-edit="${r.id}">Edit</button>
        <button class="btn btn-danger btn-sm" data-delete="${r.id}">Delete</button>
      </td>
    </tr>`;
}

let ROOMS_CACHE = [];

async function loadRooms() {
  const el = document.getElementById('rooms-table');
  try {
    const { rooms } = await API.get('/api/rooms');
    ROOMS_CACHE = rooms;
    if (!rooms.length) { el.innerHTML = '<p class="muted">No rooms yet — add one above.</p>'; return; }
    el.innerHTML = `
      <div class="table-wrap">
        <table>
          <thead><tr><th>Room</th><th>Floor</th><th>Price</th><th>Capacity</th><th></th></tr></thead>
          <tbody>${rooms.map(roomRow).join('')}</tbody>
        </table>
      </div>`;
    el.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const room = ROOMS_CACHE.find((r) => r.id === Number(btn.dataset.edit));
        openForm(room);
      });
    });
    el.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this room type? This cannot be undone.')) return;
        try {
          await API.del('/api/rooms/' + btn.dataset.delete);
          loadRooms();
        } catch (err) {
          alert(err.data?.error || 'Could not delete room.');
        }
      });
    });
  } catch (e) {
    el.innerHTML = '<p class="muted">Could not load rooms.</p>';
  }
}

document.addEventListener('kiristay:auth-ready', (e) => {
  if (!guardAdmin_(e.detail.user)) return;
  loadRooms();
});

// local copy of the admin guard (kept independent so this file has no load-order dependency)
function guardAdmin_(user) {
  if (!user) { window.location.href = '/login.html?next=/admin/rooms.html'; return false; }
  if (user.role !== 'admin') { window.location.href = '/dashboard.html'; return false; }
  return true;
}
