// Preset values
const PRESETS = {
  pdf: "A->B, A->C, B->D, C->E, E->F, X->Y, Y->Z, Z->X, P->Q, Q->R, G->H, G->H, G->I, hello, 1->2, A->",
  cycle: "A->B, B->C, C->A, D->E, E->D",
  diamond: "A->D, B->D, A->B, X->Y",
  clear: ""
};

// Event Listeners for Presets
document.getElementById('btn-preset-pdf').addEventListener('click', () => setInput(PRESETS.pdf));
document.getElementById('btn-preset-cycle').addEventListener('click', () => setInput(PRESETS.cycle));
document.getElementById('btn-preset-diamond').addEventListener('click', () => setInput(PRESETS.diamond));
document.getElementById('btn-preset-clear').addEventListener('click', () => setInput(PRESETS.clear));

function setInput(val) {
  const textarea = document.getElementById('node-input');
  textarea.value = val;
  textarea.focus();
}

// Tab Management
function switchTab(tabId) {
  const tabs = ['hierarchies', 'invalid', 'duplicates', 'json'];
  tabs.forEach(id => {
    const btn = document.getElementById(`tab-${id}`);
    const content = document.getElementById(`content-${id}`);
    if (id === tabId) {
      btn.classList.add('active');
      content.classList.add('active');
    } else {
      btn.classList.remove('active');
      content.classList.remove('active');
    }
  });
}

// Form Submission & API Request
document.getElementById('api-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const apiUrl = document.getElementById('api-url').value.trim();
  const rawInput = document.getElementById('node-input').value.trim();
  const submitBtn = document.getElementById('btn-submit');
  const errorAlert = document.getElementById('error-alert');
  const errorMessage = document.getElementById('error-message');
  const emptyState = document.getElementById('empty-state');
  const resultsContent = document.getElementById('results-content');

  // Intelligent parser: handle JSON arrays, JSON objects with 'data', or comma/newline delimited strings
  let dataArray = [];
  if (rawInput.startsWith('[') && rawInput.endsWith(']')) {
    try {
      dataArray = JSON.parse(rawInput);
    } catch (err) {
      // Fallback to splitting
      dataArray = parseDelimited(rawInput);
    }
  } else if (rawInput.startsWith('{') && rawInput.endsWith('}')) {
    try {
      const parsed = JSON.parse(rawInput);
      dataArray = parsed.data || [];
    } catch (err) {
      dataArray = parseDelimited(rawInput);
    }
  } else {
    dataArray = parseDelimited(rawInput);
  }

  // UI State: Loading
  submitBtn.classList.add('loading');
  submitBtn.disabled = true;
  errorAlert.style.display = 'none';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ data: dataArray })
    });

    if (!response.ok) {
      let errText = `HTTP ${response.status} (${response.statusText})`;
      try {
        const errJson = await response.json();
        if (errJson.error) errText = errJson.error;
      } catch (e) {}
      throw new Error(`API returned an error: ${errText}`);
    }

    const responseData = await response.json();

    // Render successful output
    renderResults(responseData);
    emptyState.classList.add('hidden');
    resultsContent.classList.remove('hidden');
  } catch (error) {
    errorMessage.textContent = error.message || "Failed to connect to API. Verify CORS is enabled and server is running.";
    errorAlert.style.display = 'flex';
  } finally {
    submitBtn.classList.remove('loading');
    submitBtn.disabled = false;
  }
});

function parseDelimited(input) {
  return input.split(/,|\n/).map(s => s.trim()).filter(s => s.length > 0);
}

// Render Results to DOM
function renderResults(data) {
  // 1. Identity
  document.getElementById('val-user-id').textContent = data.user_id || '-';
  document.getElementById('val-email').textContent = data.email_id || '-';
  document.getElementById('val-roll').textContent = data.college_roll_number || '-';

  // 2. Summary Stats
  const summary = data.summary || { total_trees: 0, total_cycles: 0, largest_tree_root: null };
  document.getElementById('val-total-trees').textContent = summary.total_trees ?? 0;
  document.getElementById('val-total-cycles').textContent = summary.total_cycles ?? 0;
  document.getElementById('val-largest-root').textContent = summary.largest_tree_root || '-';

  // 3. Tab Badges
  const hierarchies = data.hierarchies || [];
  const invalid = data.invalid_entries || [];
  const duplicates = data.duplicate_edges || [];

  document.getElementById('badge-hierarchies').textContent = hierarchies.length;
  document.getElementById('badge-invalid').textContent = invalid.length;
  document.getElementById('badge-duplicates').textContent = duplicates.length;

  // 4. Raw JSON
  document.getElementById('raw-json-output').textContent = JSON.stringify(data, null, 2);

  // 5. Render Hierarchies
  const hierarchiesList = document.getElementById('hierarchies-list');
  hierarchiesList.innerHTML = '';
  
  if (hierarchies.length === 0) {
    hierarchiesList.innerHTML = '<div class="empty-state">No hierarchies or cyclic groups detected.</div>';
  } else {
    hierarchies.forEach(h => {
      const item = document.createElement('div');
      item.className = 'hierarchy-item';

      let statusBadge = '';
      if (h.has_cycle) {
        statusBadge = `<div class="badge-cycle"><i class="fa-solid fa-rotate"></i> Cyclic Group</div>`;
      } else {
        statusBadge = `<div class="badge-depth"><i class="fa-solid fa-arrow-down-9-1"></i> Depth: ${h.depth}</div>`;
      }

      let bodyHTML = '';
      if (h.has_cycle) {
        bodyHTML = `<div style="color: var(--warning); font-weight: 500;"><i class="fa-solid fa-triangle-exclamation"></i> Cycle detected in this group. Tree structure is empty {}.</div>`;
      } else {
        bodyHTML = renderTreeDOM(h.tree, true);
      }

      item.innerHTML = `
        <div class="hierarchy-header">
          <div class="root-info">
            <div class="node-badge">${h.root || '?'}</div>
            <div style="font-weight: 600; font-size: 1.1rem;">Root Node: ${h.root || '?'}</div>
          </div>
          ${statusBadge}
        </div>
        <div class="hierarchy-body">
          ${bodyHTML}
        </div>
      `;
      hierarchiesList.appendChild(item);
    });
  }

  // 6. Render Invalid Entries
  const invalidList = document.getElementById('invalid-list');
  invalidList.innerHTML = '';
  if (invalid.length === 0) {
    invalidList.innerHTML = '<div style="color: var(--text-muted);">No invalid entries detected in the input.</div>';
  } else {
    invalid.forEach(entry => {
      const tag = document.createElement('div');
      tag.className = 'tag-item tag-invalid';
      tag.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>"${escapeHtml(entry)}"</span>`;
      invalidList.appendChild(tag);
    });
  }

  // 7. Render Duplicate Edges
  const duplicatesList = document.getElementById('duplicates-list');
  duplicatesList.innerHTML = '';
  if (duplicates.length === 0) {
    duplicatesList.innerHTML = '<div style="color: var(--text-muted);">No duplicate edges detected in the input.</div>';
  } else {
    duplicates.forEach(entry => {
      const tag = document.createElement('div');
      tag.className = 'tag-item tag-duplicate';
      tag.innerHTML = `<i class="fa-solid fa-clone"></i> <span>"${escapeHtml(entry)}"</span>`;
      duplicatesList.appendChild(tag);
    });
  }
}

// Recursive function to generate clean HTML for tree nodes
function renderTreeDOM(treeObj, isRoot = false) {
  if (!treeObj || typeof treeObj !== 'object') return '';
  const keys = Object.keys(treeObj);
  if (keys.length === 0) return '';

  let html = '';
  keys.forEach(key => {
    const childrenHTML = renderTreeDOM(treeObj[key], false);
    html += `
      <div class="tree-node ${isRoot ? 'tree-root-level' : ''}">
        <div class="tree-label"><i class="fa-solid fa-angle-right" style="color: var(--primary); margin-right: 0.4rem;"></i> ${escapeHtml(key)}</div>
        ${childrenHTML}
      </div>
    `;
  });
  return html;
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
